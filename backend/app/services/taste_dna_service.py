"""
CINEVERSE Day 5 — Taste DNA User Entertainment Profile Service

Builds a dynamic, strictly data-grounded entertainment profile (`TasteDnaProfile`)
per isolated `user_id` by aggregating:
- Explicit saved preferences & onboarding choices
- Ratings (`user_ratings`)
- Watchlist activity (`watchlist_items`)
- Conversational & card feedback (`like`, `dislike`, `not_interested`, `already_watched`,
  `more_like_this`, `less_like_this`)
- Interaction & watch-progress history (`interaction_history`)
- Recent MIRA conversational constraints (`chat_sessions`)
- Cached `content_items` metadata (cast, directors, language, release year, genres)
- MovieLens `movies_df` community tags & metadata

Uses bounded `tanh` affinity scoring to prevent single-interaction overfitting and
maintains a per-user TTL cache invalidated immediately on profile writes or resets.
"""

from __future__ import annotations

import math
import threading
import time
from collections import Counter, defaultdict
from typing import Any

from app.db.database import DatabaseManager, get_db_manager
from app.schemas.recommendations import (
    GenreAffinityItem,
    LanguageShareItem,
    PersonAffinityItem,
    ReleaseYearPreference,
    TasteDnaProfile,
)
from ml.models.hybrid_recommender import HybridRecommender


def _extract_person_names(raw_people: list[Any], limit: int = 8) -> list[str]:
    names: list[str] = []
    for entry in raw_people[:limit]:
        if isinstance(entry, dict):
            name = str(entry.get("name") or entry.get("full_name") or "").strip()
        else:
            name = str(entry or "").strip()
        if name and name not in names:
            names.append(name)
    return names


class TasteDnaService:
    """Computes and caches per-user Taste DNA profiles strictly from real user signals."""

    def __init__(
        self,
        *,
        recommender: HybridRecommender,
        db: DatabaseManager | None = None,
        ttl_seconds: float = 60.0,
    ) -> None:
        self._recommender = recommender
        self._db = db or get_db_manager()
        self._ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[float, TasteDnaProfile]] = {}
        self._lock = threading.Lock()

        # Pre-index MovieLens movieId -> row dict for fast O(1) enrichment
        self._ml_by_id: dict[int, dict[str, Any]] = {}
        if self._recommender.movies_df is not None and not self._recommender.movies_df.empty:
            for row in self._recommender.movies_df.to_dict(orient="records"):
                try:
                    self._ml_by_id[int(row["movieId"])] = row
                except (KeyError, TypeError, ValueError):
                    continue

    def invalidate_user(self, user_id: str) -> None:
        with self._lock:
            self._cache.pop(user_id, None)

    def clear_all(self) -> None:
        with self._lock:
            self._cache.clear()

    def get_profile(self, user_id: str = "local-default", *, force_refresh: bool = False) -> TasteDnaProfile:
        now = time.monotonic()
        if not force_refresh:
            with self._lock:
                cached = self._cache.get(user_id)
                if cached is not None and (now - cached[0]) < self._ttl_seconds:
                    return cached[1]

        profile = self._compute_profile(user_id)
        with self._lock:
            self._cache[user_id] = (now, profile)
        return profile

    def _resolve_item_metadata(
        self,
        *,
        content_id: int | None = None,
        movielens_id: int | None = None,
        title: str | None = None,
        fallback_genres: list[str] | None = None,
        fallback_type: str | None = None,
    ) -> dict[str, Any]:
        content_row = self._db.get_content_by_any_id(content_id) if content_id is not None else None
        if content_row is None and title:
            content_row = self._db.get_content_by_title(title)

        ml_id = movielens_id
        if ml_id is None and content_id is not None:
            ml_id = self._db.get_movielens_id_for_content(content_id=content_id, title=title)
        if ml_id is None and title:
            ml_id = self._recommender.resolve_movielens_id(title=title)
        ml_row = self._ml_by_id.get(int(ml_id)) if ml_id is not None else None

        genres: list[str] = []
        if content_row and content_row.get("genres"):
            genres = [str(g).strip() for g in content_row["genres"] if str(g).strip()]
        elif ml_row and ml_row.get("genres_list"):
            genres = [str(g).strip() for g in ml_row["genres_list"] if str(g).strip()]
        elif fallback_genres:
            genres = [str(g).strip() for g in fallback_genres if str(g).strip()]

        ctype = (
            (content_row.get("content_type") if content_row else None)
            or fallback_type
            or ("DOCUMENTARY" if "Documentary" in genres else "MOVIE" if ml_row else "")
        )
        year = (content_row.get("release_year") if content_row else None) or (
            int(ml_row["release_year"]) if ml_row and ml_row.get("release_year") else None
        )
        language = (content_row.get("language") if content_row else None) or ""
        directors = _extract_person_names(content_row.get("directors") or [], limit=4) if content_row else []
        cast = _extract_person_names(content_row.get("cast") or [], limit=6) if content_row else []

        tags: list[str] = []
        if ml_row and ml_row.get("tag_text"):
            for tok in str(ml_row["tag_text"]).split():
                clean = tok.strip().lower()
                if len(clean) >= 4 and clean not in tags:
                    tags.append(clean)
                if len(tags) >= 6:
                    break

        return {
            "title": (content_row.get("title") if content_row else None) or title or "",
            "genres": genres,
            "content_type": ctype,
            "release_year": year,
            "language": language,
            "directors": directors,
            "cast": cast,
            "tags": tags,
        }

    def _compute_profile(self, user_id: str) -> TasteDnaProfile:
        prefs = self._db.get_user_preferences(user_id)
        watchlist = self._db.list_watchlist(user_id)
        ratings = self._db.list_user_ratings(user_id)
        feedback = self._db.list_user_feedback(user_id, limit=250)
        interactions = self._db.list_interactions(user_id, limit=200)
        mira_sessions = self._db.list_recent_mira_constraints(user_id, limit=10)

        genre_weights: defaultdict[str, float] = defaultdict(float)
        genre_counts: Counter[str] = Counter()
        type_counts: Counter[str] = Counter()
        language_counts: Counter[str] = Counter()
        director_scores: defaultdict[str, float] = defaultdict(float)
        director_titles: defaultdict[str, list[str]] = defaultdict(list)
        actor_scores: defaultdict[str, float] = defaultdict(float)
        actor_titles: defaultdict[str, list[str]] = defaultdict(list)
        theme_counts: Counter[str] = Counter()
        years_weighted: list[tuple[int, float]] = []

        # 1. Explicit Preferences & Onboarding
        for g in prefs.get("preferred_genres") or []:
            genre_weights[g] += 2.6
            genre_counts[g] += 1
        for g in prefs.get("disliked_genres") or []:
            genre_weights[g] -= 3.0
        for lang in prefs.get("preferred_languages") or []:
            language_counts[lang.upper()] += 2
        for theme in prefs.get("favorite_themes") or []:
            clean_t = str(theme).strip().lower()
            if clean_t:
                theme_counts[clean_t] += 3

        # 2. Ratings (0.5 .. 10.0)
        rating_values: list[float] = []
        for r in ratings:
            val = float(r.get("rating") or 0.0)
            rating_values.append(val)
            meta = self._resolve_item_metadata(
                content_id=r.get("content_id"),
                title=r.get("title"),
                fallback_genres=r.get("genres"),
                fallback_type=r.get("content_type"),
            )
            # Centered at 6.0, capped so 1 rating gives at most +1.6 or -1.4
            weight = max(-1.4, min(1.6, (val - 6.0) / 2.5))
            for g in meta["genres"]:
                genre_weights[g] += weight
                if weight > 0:
                    genre_counts[g] += 1
            if meta["content_type"] and weight >= 0:
                type_counts[meta["content_type"]] += 1
            if meta["language"] and weight >= 0:
                language_counts[meta["language"].upper()] += 1
            if meta["release_year"] and weight > 0:
                years_weighted.append((int(meta["release_year"]), 1.0 + weight))
            if weight > 0.2:
                title_lbl = meta["title"] or r.get("title") or ""
                for d in meta["directors"]:
                    director_scores[d] += weight
                    if title_lbl and title_lbl not in director_titles[d]:
                        director_titles[d].append(title_lbl)
                for a in meta["cast"]:
                    actor_scores[a] += weight * 0.75
                    if title_lbl and title_lbl not in actor_titles[a]:
                        actor_titles[a].append(title_lbl)
                for tag in meta["tags"]:
                    theme_counts[tag] += 1

        # 3. Watchlist activity
        for w in watchlist:
            meta = self._resolve_item_metadata(
                content_id=w.get("content_id"),
                title=w.get("title"),
                fallback_genres=w.get("genres"),
                fallback_type=w.get("content_type"),
            )
            for g in meta["genres"]:
                genre_weights[g] += 1.0
                genre_counts[g] += 1
            if meta["content_type"]:
                type_counts[meta["content_type"]] += 1
            if meta["language"]:
                language_counts[meta["language"].upper()] += 1
            if meta["release_year"]:
                years_weighted.append((int(meta["release_year"]), 1.0))
            title_lbl = meta["title"] or w.get("title") or ""
            for d in meta["directors"]:
                director_scores[d] += 0.85
                if title_lbl and title_lbl not in director_titles[d]:
                    director_titles[d].append(title_lbl)
            for a in meta["cast"]:
                actor_scores[a] += 0.6
                if title_lbl and title_lbl not in actor_titles[a]:
                    actor_titles[a].append(title_lbl)
            for tag in meta["tags"]:
                theme_counts[tag] += 1

        # 4. Feedback (bounded weights so single feedback never overfits)
        fb_weights = {
            "like": 1.15,
            "more_like_this": 1.35,
            "already_watched": 0.4,
            "less_like_this": -0.95,
            "not_interested": -1.1,
            "dislike": -1.35,
        }
        for fb in feedback:
            ftype = str(fb.get("feedback_type") or "")
            w = fb_weights.get(ftype, 0.0)
            if w == 0.0:
                continue
            meta = self._resolve_item_metadata(
                content_id=fb.get("content_id"),
                movielens_id=fb.get("movielens_movie_id"),
                title=fb.get("title"),
            )
            for g in meta["genres"]:
                genre_weights[g] += w
                if w > 0:
                    genre_counts[g] += 1
            if meta["content_type"] and w > 0:
                type_counts[meta["content_type"]] += 1
            if meta["release_year"] and w > 0:
                years_weighted.append((int(meta["release_year"]), 0.8))
            if w > 0:
                title_lbl = meta["title"] or fb.get("title") or ""
                for d in meta["directors"]:
                    director_scores[d] += w * 0.8
                    if title_lbl and title_lbl not in director_titles[d]:
                        director_titles[d].append(title_lbl)
                for a in meta["cast"]:
                    actor_scores[a] += w * 0.55
                    if title_lbl and title_lbl not in actor_titles[a]:
                        actor_titles[a].append(title_lbl)
                for tag in meta["tags"]:
                    theme_counts[tag] += 1

        # 5. Interaction History (light signal)
        for inter in interactions[:60]:
            meta = self._resolve_item_metadata(
                content_id=inter.get("content_id"),
                movielens_id=inter.get("movielens_movie_id"),
                title=inter.get("title"),
                fallback_genres=inter.get("genres"),
                fallback_type=inter.get("content_type"),
            )
            progress = float(inter.get("progress_pct") or 0.0)
            w = 0.55 if progress >= 50.0 else 0.35
            for g in meta["genres"]:
                genre_weights[g] += w
                genre_counts[g] += 1
            if meta["content_type"]:
                type_counts[meta["content_type"]] += 1
            if meta["language"]:
                language_counts[meta["language"].upper()] += 1
            if meta["release_year"]:
                years_weighted.append((int(meta["release_year"]), 0.4))

        # 6. MIRA conversational preferences (explicit genres & themes)
        for sess in mira_sessions:
            state = sess.get("state") or {}
            for g in state.get("genres") or []:
                genre_weights[g] += 0.55
                genre_counts[g] += 1
            for ex in state.get("exclude_genres") or []:
                genre_weights[ex] -= 0.65
            for kw in state.get("keywords") or []:
                clean_kw = str(kw).strip().lower()
                if len(clean_kw) >= 4:
                    theme_counts[clean_kw] += 1
            if state.get("language"):
                language_counts[str(state["language"]).upper()] += 1

        # Determine whether real user signals exist
        has_sufficient_data = bool(
            prefs.get("onboarding_completed")
            or prefs.get("preferred_genres")
            or prefs.get("favorite_themes")
            or ratings
            or watchlist
            or feedback
            or interactions
        )

        # Bounded affinity scores (0..100) using tanh to prevent single-interaction overfitting
        affinity_items: list[GenreAffinityItem] = []
        for genre, raw_score in genre_weights.items():
            if raw_score <= 0.15:
                continue
            bounded = round(100.0 * math.tanh(raw_score / 5.5), 1)
            affinity_items.append(
                GenreAffinityItem(
                    genre=genre,
                    score=bounded,
                    signal_count=int(genre_counts.get(genre, 0)),
                )
            )
        affinity_items.sort(key=lambda x: (-x.score, -x.signal_count, x.genre))
        top_genres = [item.genre for item in affinity_items[:5]]

        # Content types: observed counts first, then explicit preferred_types if sufficient data
        if type_counts:
            preferred_types = [ct for ct, _ in type_counts.most_common()]
        elif has_sufficient_data:
            preferred_types = list(prefs.get("preferred_types") or [])
        else:
            preferred_types = []

        language_breakdown = [
            LanguageShareItem(language=lang, count=cnt)
            for lang, cnt in language_counts.most_common(6)
        ]
        preferred_languages = [item.language for item in language_breakdown]

        favorite_directors = [
            PersonAffinityItem(
                name=name,
                role="director",
                score=round(score, 2),
                titles=director_titles[name][:3],
            )
            for name, score in sorted(director_scores.items(), key=lambda kv: -kv[1])[:5]
            if score > 0.3
        ]
        favorite_actors = [
            PersonAffinityItem(
                name=name,
                role="actor",
                score=round(score, 2),
                titles=actor_titles[name][:4],
            )
            for name, score in sorted(actor_scores.items(), key=lambda kv: -kv[1])[:6]
            if score > 0.3
        ]

        favorite_themes = [t for t, _ in theme_counts.most_common(8)]

        # Release year preference
        if years_weighted:
            total_w = sum(w for _, w in years_weighted)
            avg_y = round(sum(y * w for y, w in years_weighted) / max(total_w, 1e-6))
            min_y = min(y for y, _ in years_weighted)
            max_y = max(y for y, _ in years_weighted)
            decade = (avg_y // 10) * 10
            era_label = f"{decade}s focus (avg {avg_y})"
            year_pref = ReleaseYearPreference(
                average_year=avg_y,
                min_year=min_y,
                max_year=max_y,
                label=era_label,
            )
        elif prefs.get("preferred_era"):
            year_pref = ReleaseYearPreference(label=str(prefs["preferred_era"]))
        else:
            year_pref = ReleaseYearPreference(label="Not enough data")

        avg_rating = round(sum(rating_values) / len(rating_values), 2) if rating_values else None

        # Factual discovery patterns (strictly derived from real counts)
        patterns: list[str] = []
        if ratings:
            patterns.append(f"Rated {len(ratings)} title(s) with a {avg_rating:.1f}/10 average")
        if watchlist:
            patterns.append(f"Saved {len(watchlist)} title(s) to watchlist")
        if feedback:
            pos_fb = sum(1 for f in feedback if f.get("feedback_type") in ("like", "more_like_this"))
            neg_fb = sum(1 for f in feedback if f.get("feedback_type") in ("dislike", "not_interested", "less_like_this"))
            patterns.append(f"Provided {pos_fb} positive and {neg_fb} refinement/negative feedback signals")
        if interactions:
            patterns.append(f"Explored {len(interactions)} title interaction(s)")
        if prefs.get("discovery_openness", 0.35) >= 0.55:
            patterns.append("High openness to outside-the-box & hidden-gem picks")
        elif has_sufficient_data:
            patterns.append("Balanced taste refinement between core favorites and new finds")

        if not has_sufficient_data:
            summary = (
                "No viewing, rating, or preference signals recorded yet. "
                "Complete onboarding or rate/save titles to build your live Taste DNA."
            )
        else:
            parts: list[str] = []
            if top_genres:
                parts.append(f"Strongest affinity for {', '.join(top_genres[:3])}")
            if preferred_types:
                parts.append(f"drawn to {', '.join(t.replace('_', ' ').title() for t in preferred_types[:2])}")
            if favorite_themes:
                parts.append(f"themes around {', '.join(favorite_themes[:3])}")
            if avg_rating is not None:
                parts.append(f"averaging {avg_rating:.1f}/10 across {len(ratings)} rating(s)")
            summary = "; ".join(parts) + "." if parts else "Active preference profile recorded."

        return TasteDnaProfile(
            user_id=user_id,
            has_sufficient_data=has_sufficient_data,
            onboarding_completed=bool(prefs.get("onboarding_completed")),
            signal_summary={
                "ratings": len(ratings),
                "watchlist": len(watchlist),
                "feedback": len(feedback),
                "interactions": len(interactions),
                "mira_sessions": len(mira_sessions),
            },
            top_genres=top_genres,
            genre_affinity_scores=affinity_items[:10],
            disliked_genres=list(prefs.get("disliked_genres") or []),
            preferred_content_types=preferred_types,
            content_type_breakdown=dict(type_counts),
            preferred_languages=preferred_languages,
            language_breakdown=language_breakdown,
            favorite_actors=favorite_actors,
            favorite_directors=favorite_directors,
            favorite_themes=favorite_themes,
            release_year_preference=year_pref,
            average_user_rating=avg_rating,
            discovery_patterns=patterns,
            preference_summary=summary,
            exploration_openness=float(prefs.get("discovery_openness") or 0.35),
            updated_at=prefs.get("updated_at"),
        )
