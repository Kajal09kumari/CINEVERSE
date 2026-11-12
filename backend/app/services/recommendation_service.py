"""
Hybrid Recommendation Orchestration Service

Combines:
1. MovieLens TF-IDF + TruncatedSVD HybridRecommender
2. SQLite Watchmode catalog cache + optional live IMDb-to-Watchmode hydration
3. User preferences, ratings, watchlist, and dampened feedback signals
4. TV Series & regional Watchmode discovery fallback when MovieLens lacks TV coverage
"""

from __future__ import annotations

import logging
import math
import threading
import time
from typing import Any

from app.db.database import DatabaseManager, get_db_manager
from app.schemas.content import ContentFilterType, ContentType, SortByParam
from app.schemas.recommendations import (
    AdaptiveHomepageResponse,
    HomeSectionItem,
    RecommendationResponse,
    RecommendedTitleCard,
)
from app.services.taste_dna_service import TasteDnaService
from app.services.watchmode_service import (
    WatchmodeAPIError,
    WatchmodeConfigError,
    WatchmodeQuotaError,
    WatchmodeService,
    WatchmodeTimeoutError,
)
from ml.models.hybrid_recommender import HybridRecommender, RecommendationQuery

logger = logging.getLogger(__name__)


class RecommendationService:
    """Service bridging ML hybrid recommendations with Watchmode catalog & SQLite user state."""

    def __init__(
        self,
        *,
        recommender: HybridRecommender,
        watchmode_service: WatchmodeService | None = None,
        db: DatabaseManager | None = None,
        taste_dna_service: TasteDnaService | None = None,
    ) -> None:
        self._recommender = recommender
        self._wm = watchmode_service
        self._db = db or get_db_manager()
        self._taste_dna = taste_dna_service or TasteDnaService(recommender=recommender, db=self._db)
        self._home_cache: dict[tuple[str, str], tuple[float, AdaptiveHomepageResponse]] = {}
        self._home_lock = threading.Lock()
        self._home_ttl = 45.0

    def invalidate_user_cache(self, user_id: str) -> None:
        self._taste_dna.invalidate_user(user_id)
        with self._home_lock:
            keys = [k for k in self._home_cache if k[0] == user_id]
            for k in keys:
                self._home_cache.pop(k, None)

    def _collect_user_signals(self, user_id: str) -> dict[str, Any]:
        prefs = self._db.get_user_preferences(user_id)
        watchlist = self._db.list_watchlist(user_id)
        ratings = self._db.list_user_ratings(user_id)
        feedback = self._db.list_user_feedback(user_id, limit=250)
        interactions = self._db.list_interactions(user_id, limit=150)

        watchlist_ml_ids: list[int] = []
        excluded_content_ids: set[int] = set()
        for item in watchlist:
            cid = item.get("content_id")
            if cid is not None:
                excluded_content_ids.add(int(cid))
            ml_id = self._resolve_ml_id(
                content_id=cid,
                imdb_id=item.get("imdb_id"),
                legacy_tmdb_id=item.get("legacy_tmdb_id"),
                title=item.get("title"),
            )
            if ml_id is not None and ml_id not in watchlist_ml_ids:
                watchlist_ml_ids.append(ml_id)

        rated_items_ml: dict[int, float] = {}
        for r in ratings:
            cid = r.get("content_id")
            if cid is not None:
                excluded_content_ids.add(int(cid))
            ml_id = self._resolve_ml_id(
                content_id=cid,
                imdb_id=r.get("imdb_id"),
                legacy_tmdb_id=r.get("legacy_tmdb_id"),
                title=r.get("title"),
            )
            if ml_id is not None:
                # HybridRecommender expects 0.5..10.0 rating scale centered at 6.0
                rated_items_ml[ml_id] = max(0.5, min(10.0, float(r["rating"])))

        # Collapse explicit feedback per item chronologically (newest wins for status toggles)
        liked_ml_ids: list[int] = []
        disliked_ml_ids: list[int] = []
        excluded_ml_ids: list[int] = list(rated_items_ml.keys())
        more_like_seed_ids: list[int] = []

        seen_ml_status: set[int] = set()
        for fb in feedback:
            ftype = fb.get("feedback_type")
            cid = fb.get("content_id")
            ml_id = fb.get("movielens_movie_id") or self._resolve_ml_id(
                content_id=cid,
                title=fb.get("title"),
            )
            if cid is not None and ftype in ("dislike", "not_interested", "already_watched", "less_like_this"):
                excluded_content_ids.add(int(cid))
            if ml_id is None:
                continue
            ml_int = int(ml_id)
            if ftype == "more_like_this":
                if ml_int not in more_like_seed_ids and len(more_like_seed_ids) < 3:
                    more_like_seed_ids.append(ml_int)
                continue
            if ml_int in seen_ml_status:
                continue
            seen_ml_status.add(ml_int)
            if ftype == "like":
                liked_ml_ids.append(ml_int)
            elif ftype in ("dislike", "not_interested", "less_like_this"):
                disliked_ml_ids.append(ml_int)
                if ml_int not in excluded_ml_ids:
                    excluded_ml_ids.append(ml_int)
            elif ftype == "already_watched":
                if ml_int not in excluded_ml_ids:
                    excluded_ml_ids.append(ml_int)

        # Exclude titles marked >= 95% watched in interaction history
        for inter in interactions:
            if inter.get("interaction_type") == "progress" and float(inter.get("progress_pct") or 0.0) >= 95.0:
                if inter.get("content_id") is not None:
                    excluded_content_ids.add(int(inter["content_id"]))
                if inter.get("movielens_movie_id") is not None:
                    ml_int = int(inter["movielens_movie_id"])
                    if ml_int not in excluded_ml_ids:
                        excluded_ml_ids.append(ml_int)

        is_cold_start = (
            not rated_items_ml
            and not watchlist_ml_ids
            and not liked_ml_ids
            and not prefs.get("preferred_genres")
            and not prefs.get("onboarding_completed")
            and not prefs.get("favorite_themes")
        )

        return {
            "prefs": prefs,
            "watchlist": watchlist,
            "watchlist_ml_ids": watchlist_ml_ids,
            "rated_items_ml": rated_items_ml,
            "liked_ml_ids": liked_ml_ids,
            "disliked_ml_ids": disliked_ml_ids,
            "excluded_ml_ids": excluded_ml_ids,
            "excluded_content_ids": excluded_content_ids,
            "more_like_seed_ids": more_like_seed_ids,
            "is_cold_start": is_cold_start,
        }

    def _resolve_ml_id(
        self,
        *,
        content_id: int | None = None,
        imdb_id: str | None = None,
        legacy_tmdb_id: int | None = None,
        title: str | None = None,
    ) -> int | None:
        ml_id = self._db.get_movielens_id_for_content(
            content_id=content_id,
            imdb_id=imdb_id,
            legacy_tmdb_id=legacy_tmdb_id,
            title=title,
        )
        if ml_id is not None:
            return ml_id
        return self._recommender.resolve_movielens_id(imdb_id=imdb_id, title=title)

    async def _hydrate_ml_candidates(
        self,
        ml_results: list[dict[str, Any]],
        *,
        region: str | None = None,
        max_live_hydrations: int = 3,
        max_runtime: int | None = None,
        top_k: int = 10,
    ) -> list[RecommendedTitleCard]:
        ml_ids = [int(item["movielens_id"]) for item in ml_results if item.get("movielens_id") is not None]
        mappings = self._db.list_mapping_entries_by_movielens_ids(ml_ids)
        live_left = max_live_hydrations
        cards: list[RecommendedTitleCard] = []

        for item in ml_results:
            if len(cards) >= top_k:
                break
            ml_id = int(item["movielens_id"])
            mapping = mappings.get(ml_id, {})
            canonical_id = mapping.get("canonical_content_id")
            imdb_id = item.get("imdb_id") or mapping.get("imdb_id")
            legacy_tmdb_id = item.get("legacy_tmdb_id") or mapping.get("legacy_tmdb_id")

            cached_row: dict[str, Any] | None = None
            if canonical_id is not None:
                cached_row = self._db.get_content_by_any_id(int(canonical_id))
            if cached_row is None and imdb_id:
                cached_row = self._db.get_content_by_imdb_id(imdb_id)
            if cached_row is None and legacy_tmdb_id is not None:
                cached_row = self._db.get_by_legacy_tmdb_id(int(legacy_tmdb_id))
            if cached_row is None:
                cached_row = self._db.get_content_by_title(
                    item["title"], release_year=item.get("release_year")
                )

            if cached_row is None and self._wm is not None and live_left > 0 and imdb_id:
                try:
                    summary = await self._wm.resolve_imdb_id(
                        imdb_id,
                        legacy_tmdb_id=legacy_tmdb_id,
                        region=region,
                    )
                    live_left -= 1
                    if summary is not None:
                        cached_row = self._db.get_content_by_any_id(summary.id)
                except (
                    WatchmodeConfigError,
                    WatchmodeQuotaError,
                    WatchmodeTimeoutError,
                    WatchmodeAPIError,
                ) as exc:
                    logger.debug("Watchmode hydration skipped for %s: %s", imdb_id, exc)
                    live_left = 0

            if cached_row is not None:
                self._db.link_mapping_canonical_id(
                    ml_id,
                    int(cached_row["id"]),
                    watchmode_id=cached_row.get("watchmode_id"),
                )

            runtime = cached_row.get("runtime") if cached_row else None
            if max_runtime is not None and runtime is not None and int(runtime) > max_runtime:
                continue

            platforms: list[str] = []
            if cached_row and cached_row.get("streaming_sources"):
                seen_p: set[str] = set()
                eff_region = (region or "").upper()
                for src in cached_row["streaming_sources"]:
                    s_reg = (src.get("region") or "").upper()
                    if eff_region and s_reg and s_reg != eff_region:
                        continue
                    name = (src.get("name") or "").strip()
                    if name and name not in seen_p:
                        seen_p.add(name)
                        platforms.append(name)

            raw_ct = (cached_row.get("content_type") if cached_row else item.get("content_type")) or "MOVIE"
            try:
                ct_enum = ContentType(raw_ct)
            except ValueError:
                ct_enum = ContentType.DOCUMENTARY if item.get("is_documentary") else ContentType.MOVIE

            rating_val = cached_row.get("rating") if cached_row and cached_row.get("rating") is not None else item.get("rating")
            rating_source = (
                cached_row.get("rating_source")
                if cached_row and cached_row.get("rating") is not None
                else "MovieLens community ratings (normalized /10)"
            )

            cards.append(
                RecommendedTitleCard(
                    content_id=int(cached_row["id"]) if cached_row else None,
                    movielens_id=ml_id,
                    imdb_id=imdb_id,
                    title=(cached_row.get("title") if cached_row else None) or item["title"],
                    content_type=ct_enum,
                    is_documentary=bool(
                        (cached_row.get("is_documentary") if cached_row else False)
                        or item.get("is_documentary")
                    ),
                    release_year=(cached_row.get("release_year") if cached_row else None) or item.get("release_year"),
                    poster_url=cached_row.get("poster_url") if cached_row else None,
                    description=cached_row.get("description") if cached_row else None,
                    genres=(cached_row.get("genres") if cached_row and cached_row.get("genres") else None)
                    or item.get("genres", []),
                    rating=float(rating_val) if rating_val is not None else None,
                    rating_source=rating_source,
                    runtime=int(runtime) if runtime is not None else None,
                    streaming_platforms=platforms[:4],
                    hybrid_score=float(item.get("hybrid_score") or 0.0),
                    explanation=item["explanation"],
                    source="movielens_hybrid",
                    community_tags=list(item.get("community_tags") or []),
                )
            )
        return cards

    async def _recommend_from_watchmode_catalog(
        self,
        *,
        content_type: str,
        genres: list[str],
        exclude_genres: list[str],
        keywords: list[str],
        min_rating: float | None,
        year_min: int | None,
        year_max: int | None,
        max_runtime: int | None,
        language: str | None,
        region: str | None,
        excluded_content_ids: set[int],
        top_k: int,
    ) -> list[RecommendedTitleCard]:
        """
        Provide genuine Watchmode-backed recommendations for TV_SERIES, language-specific,
        or runtime-constrained searches where MovieLens movie-only rows do not apply.
        """
        primary_genre = genres[0] if genres else None
        query_text = " ".join(keywords) if keywords else None

        rows = self._db.search_local_content(
            query=query_text,
            content_type=content_type,
            genre=primary_genre,
            exclude_genres=exclude_genres,
            min_rating=min_rating,
            year_min=year_min,
            year_max=year_max,
            max_runtime=max_runtime,
            language=language,
            limit=max(24, top_k * 3),
        )

        # If local cache has few matches and Watchmode API is available, query Watchmode discover or search
        if len(rows) < top_k and self._wm is not None:
            try:
                ct_filter = ContentFilterType.ALL
                if content_type in ("MOVIE", "TV_SERIES", "DOCUMENTARY"):
                    ct_filter = ContentFilterType(content_type)

                if query_text and not genres:
                    resp = await self._wm.search_content(query=query_text, content_type=ct_filter, page=1)
                else:
                    genre_param: str | None = None
                    if primary_genre:
                        g_resp = await self._wm.get_genres()
                        matched = [
                            str(g.id)
                            for g in g_resp.genres
                            if g.name.lower() in {x.lower() for x in genres}
                        ]
                        if matched:
                            genre_param = ",".join(matched[:3])
                    resp = await self._wm.discover_content(
                        content_type=ct_filter,
                        genres=genre_param,
                        language=language,
                        min_rating=min_rating,
                        sort_by=SortByParam.POPULARITY_DESC,
                        region=region,
                        page=1,
                        limit=20,
                        enrich_top=min(top_k, 4),
                    )
                for item in resp.results:
                    row = self._db.get_content_by_any_id(item.id)
                    if row is not None and all(r["id"] != row["id"] for r in rows):
                        rows.append(row)
            except (
                WatchmodeConfigError,
                WatchmodeQuotaError,
                WatchmodeTimeoutError,
                WatchmodeAPIError,
            ) as exc:
                logger.debug("Watchmode discovery fallback skipped: %s", exc)

        # Relax keywords if too strict while keeping content_type & excluded genres
        if not rows:
            rows = self._db.search_local_content(
                query=None,
                content_type=content_type,
                genre=primary_genre,
                exclude_genres=exclude_genres,
                min_rating=min_rating,
                year_min=year_min,
                year_max=year_max,
                max_runtime=max_runtime,
                language=language,
                limit=max(16, top_k * 2),
            )

        req_genres_low = {g.lower() for g in genres}
        ex_genres_low = {g.lower() for g in exclude_genres}
        kw_low = [k.lower() for k in keywords if len(k) >= 3]

        scored: list[tuple[float, dict[str, Any], list[str]]] = []
        for row in rows:
            cid = int(row["id"])
            if cid in excluded_content_ids:
                continue
            r_genres = [str(g) for g in (row.get("genres") or [])]
            r_genres_low = {g.lower() for g in r_genres}
            if ex_genres_low and (ex_genres_low & r_genres_low):
                continue
            if req_genres_low and not (req_genres_low & r_genres_low):
                continue
            if max_runtime is not None and row.get("runtime") and int(row["runtime"]) > max_runtime:
                continue

            rating_norm = float(row.get("rating") or 6.0) / 10.0
            pop = float(row.get("popularity") or 10.0)
            pop_norm = min(1.0, math.log1p(max(0.0, pop)) / 6.0)
            text_blob = f"{row.get('title', '')} {row.get('description', '')}".lower()
            kw_hits = [k for k in kw_low if k in text_blob]
            kw_bonus = 0.25 * min(2, len(kw_hits))
            genre_bonus = 0.2 if (req_genres_low & r_genres_low) else 0.0
            score = round(0.45 * rating_norm + 0.25 * pop_norm + genre_bonus + kw_bonus, 4)

            reasons: list[str] = []
            if req_genres_low & r_genres_low:
                matched_g = ", ".join(g for g in r_genres if g.lower() in req_genres_low)
                reasons.append(f"matches {matched_g}")
            if kw_hits:
                reasons.append(f"relevant to {', '.join(kw_hits[:2])}")
            if row.get("rating") is not None:
                reasons.append(f"rated {float(row['rating']):.1f}/10")
            if max_runtime is not None and row.get("runtime"):
                reasons.append(f"{int(row['runtime'])} min runtime")
            explanation = (
                f"{'; '.join(reasons[:3]).capitalize()}."
                if reasons
                else f"Top {content_type.replace('_', ' ').lower()} catalog pick matching your request."
            )
            scored.append((score, row, [explanation]))

        scored.sort(key=lambda x: x[0], reverse=True)
        cards: list[RecommendedTitleCard] = []
        eff_region = (region or "").upper()
        for score, row, exp_list in scored[:top_k]:
            platforms: list[str] = []
            seen_p: set[str] = set()
            for src in row.get("streaming_sources") or []:
                s_reg = (src.get("region") or "").upper()
                if eff_region and s_reg and s_reg != eff_region:
                    continue
                name = (src.get("name") or "").strip()
                if name and name not in seen_p:
                    seen_p.add(name)
                    platforms.append(name)
            try:
                ct_enum = ContentType(row.get("content_type") or "MOVIE")
            except ValueError:
                ct_enum = ContentType.MOVIE
            cards.append(
                RecommendedTitleCard(
                    content_id=int(row["id"]),
                    movielens_id=None,
                    imdb_id=row.get("imdb_id"),
                    title=row["title"],
                    content_type=ct_enum,
                    is_documentary=bool(row.get("is_documentary")),
                    release_year=row.get("release_year"),
                    poster_url=row.get("poster_url"),
                    description=row.get("description"),
                    genres=list(row.get("genres") or []),
                    rating=float(row["rating"]) if row.get("rating") is not None else None,
                    rating_source=row.get("rating_source") or "Watchmode",
                    runtime=int(row["runtime"]) if row.get("runtime") is not None else None,
                    streaming_platforms=platforms[:4],
                    hybrid_score=score,
                    explanation=exp_list[0],
                    source="watchmode_hybrid",
                    community_tags=[],
                )
            )
        return cards

    async def get_personalized_recommendations(
        self,
        *,
        user_id: str = "local-default",
        region: str | None = None,
        top_k: int = 10,
        content_type: str | None = None,
    ) -> RecommendationResponse:
        signals = self._collect_user_signals(user_id)
        prefs = signals["prefs"]

        target_ct = content_type
        if not target_ct:
            ptypes = prefs.get("preferred_types") or []
            if len(ptypes) == 1:
                target_ct = ptypes[0]

        if target_ct == "TV_SERIES":
            cards = await self._recommend_from_watchmode_catalog(
                content_type="TV_SERIES",
                genres=list(prefs.get("preferred_genres") or []),
                exclude_genres=list(prefs.get("disliked_genres") or []),
                keywords=[],
                min_rating=prefs.get("min_rating"),
                year_min=None,
                year_max=None,
                max_runtime=None,
                language=(prefs.get("preferred_languages") or [None])[0],
                region=region,
                excluded_content_ids=signals["excluded_content_ids"],
                top_k=top_k,
            )
            return RecommendationResponse(
                mode="cold_start" if signals["is_cold_start"] else "personalized",
                is_cold_start=signals["is_cold_start"],
                dataset_stats=self._recommender.dataset_stats,
                evaluation_metrics=self._recommender.eval_metrics,
                results=cards,
            )

        query = RecommendationQuery(
            seed_movielens_ids=signals["more_like_seed_ids"],
            content_type=target_ct,
            min_rating_10=prefs.get("min_rating"),
            top_k=top_k,
            preferred_genres=list(prefs.get("preferred_genres") or []),
            disliked_genres=list(prefs.get("disliked_genres") or []),
            rated_items_ml=signals["rated_items_ml"],
            watchlist_ml_ids=signals["watchlist_ml_ids"],
            liked_ml_ids=signals["liked_ml_ids"],
            disliked_ml_ids=signals["disliked_ml_ids"],
            excluded_ml_ids=signals["excluded_ml_ids"],
        )
        ml_results = self._recommender.recommend(query)
        cards = await self._hydrate_ml_candidates(
            ml_results,
            region=region,
            max_live_hydrations=min(4, top_k),
            top_k=top_k,
        )
        mode = "cold_start" if signals["is_cold_start"] else "personalized"
        return RecommendationResponse(
            mode=mode,
            is_cold_start=signals["is_cold_start"],
            dataset_stats=self._recommender.dataset_stats,
            evaluation_metrics=self._recommender.eval_metrics,
            results=cards,
        )

    async def get_similar_recommendations(
        self,
        *,
        content_id: int,
        user_id: str = "local-default",
        region: str | None = None,
        top_k: int = 8,
    ) -> RecommendationResponse:
        signals = self._collect_user_signals(user_id)
        item = self._db.get_content_by_any_id(content_id)
        if item is None and self._wm is not None:
            try:
                detail = await self._wm.get_content_details(content_id, region=region, include_extras=False)
                item = self._db.get_content_by_any_id(detail.id)
            except (WatchmodeConfigError, WatchmodeAPIError, WatchmodeQuotaError, WatchmodeTimeoutError):
                item = None

        ml_seed = self._resolve_ml_id(
            content_id=item["id"] if item else content_id,
            imdb_id=item.get("imdb_id") if item else None,
            legacy_tmdb_id=item.get("legacy_tmdb_id") if item else None,
            title=item.get("title") if item else None,
        )

        # If TV series or unmapped to MovieLens, try Watchmode similar + local genre similarity
        if item is not None and (item.get("content_type") == "TV_SERIES" or ml_seed is None):
            cards = await self._recommend_from_watchmode_catalog(
                content_type=item.get("content_type") or "ALL",
                genres=list(item.get("genres") or [])[:2],
                exclude_genres=list(signals["prefs"].get("disliked_genres") or []),
                keywords=[],
                min_rating=6.0,
                year_min=None,
                year_max=None,
                max_runtime=None,
                language=None,
                region=region,
                excluded_content_ids=signals["excluded_content_ids"] | {int(item["id"])},
                top_k=top_k,
            )
            return RecommendationResponse(
                mode="similar",
                is_cold_start=False,
                dataset_stats=self._recommender.dataset_stats,
                evaluation_metrics=self._recommender.eval_metrics,
                results=cards,
            )

        excluded = list(signals["excluded_ml_ids"])
        if ml_seed is not None and ml_seed not in excluded:
            excluded.append(ml_seed)

        query = RecommendationQuery(
            seed_movielens_ids=[ml_seed] if ml_seed is not None else [],
            seed_titles=[item["title"]] if (ml_seed is None and item) else [],
            genres=list(item.get("genres") or [])[:3] if (ml_seed is None and item) else [],
            top_k=top_k,
            preferred_genres=list(signals["prefs"].get("preferred_genres") or []),
            disliked_genres=list(signals["prefs"].get("disliked_genres") or []),
            disliked_ml_ids=signals["disliked_ml_ids"],
            excluded_ml_ids=excluded,
        )
        ml_results = self._recommender.recommend(query)
        cards = await self._hydrate_ml_candidates(
            ml_results,
            region=region,
            max_live_hydrations=min(3, top_k),
            top_k=top_k,
        )
        return RecommendationResponse(
            mode="similar",
            is_cold_start=False,
            dataset_stats=self._recommender.dataset_stats,
            evaluation_metrics=self._recommender.eval_metrics,
            results=cards,
        )

    async def recommend_for_constraints(
        self,
        *,
        user_id: str,
        content_type: str = "ALL",
        genres: list[str] | None = None,
        exclude_genres: list[str] | None = None,
        keywords: list[str] | None = None,
        seed_titles: list[str] | None = None,
        min_rating: float | None = None,
        year_min: int | None = None,
        year_max: int | None = None,
        max_runtime: int | None = None,
        language: str | None = None,
        underrated: bool = False,
        surprise_different: bool = False,
        use_watchlist: bool = False,
        extra_excluded_ml_ids: list[int] | None = None,
        region: str | None = None,
        top_k: int = 6,
    ) -> list[RecommendedTitleCard]:
        signals = self._collect_user_signals(user_id)
        prefs = signals["prefs"]

        # Merge disliked genres with explicit turn exclusions
        merged_exclude = list(
            dict.fromkeys([*(prefs.get("disliked_genres") or []), *(exclude_genres or [])])
        )
        eff_min_rating = min_rating
        eff_max_runtime = max_runtime

        # When TV Series, specific non-English language, or strict short-runtime requested,
        # prioritize Watchmode catalog/discovery where TV & runtime metadata live.
        if content_type == "TV_SERIES" or (language and language.lower() != "en"):
            wm_cards = await self._recommend_from_watchmode_catalog(
                content_type=content_type,
                genres=genres or [],
                exclude_genres=merged_exclude,
                keywords=keywords or [],
                min_rating=eff_min_rating,
                year_min=year_min,
                year_max=year_max,
                max_runtime=eff_max_runtime,
                language=language,
                region=region,
                excluded_content_ids=signals["excluded_content_ids"],
                top_k=top_k,
            )
            if wm_cards:
                return wm_cards

        # Resolve any conversational seed titles (check Watchmode local DB -> MovieLens index)
        resolved_seed_ids: list[int] = []
        unresolved_titles: list[str] = []
        for t in seed_titles or []:
            ml_id = self._recommender.resolve_movielens_id(title=t)
            if ml_id is not None:
                resolved_seed_ids.append(ml_id)
            else:
                local_row = self._db.get_content_by_title(t)
                if local_row and local_row.get("imdb_id"):
                    ml_id = self._recommender.resolve_movielens_id(imdb_id=local_row["imdb_id"], title=t)
                    if ml_id is not None:
                        resolved_seed_ids.append(ml_id)
                        continue
                unresolved_titles.append(t)

        watchlist_ids = signals["watchlist_ml_ids"]
        if use_watchlist and not watchlist_ids:
            # Watchlist has titles only on Watchmode without MovieLens mapping — fall back cleanly
            wl_genres = list(
                dict.fromkeys(
                    g
                    for item in signals["watchlist"]
                    for g in (item.get("genres") or [])
                )
            )[:3]
            if wl_genres and not genres:
                genres = wl_genres

        all_excluded_ml = list(
            dict.fromkeys([*signals["excluded_ml_ids"], *(extra_excluded_ml_ids or []), *resolved_seed_ids])
        )
        ml_ct = content_type if content_type in ("MOVIE", "DOCUMENTARY") else None

        # Ask ML engine for extra candidates when runtime filtering applies post-hydration
        ml_top_k = top_k * 2 if eff_max_runtime is not None else top_k

        query = RecommendationQuery(
            seed_movielens_ids=resolved_seed_ids,
            seed_titles=unresolved_titles,
            text_query=" ".join(keywords or []) or None,
            genres=genres or [],
            exclude_genres=merged_exclude,
            content_type=ml_ct,
            min_rating_10=eff_min_rating,
            year_min=year_min,
            year_max=year_max,
            underrated=underrated,
            surprise_different=surprise_different,
            top_k=ml_top_k,
            preferred_genres=[] if surprise_different else list(prefs.get("preferred_genres") or []),
            disliked_genres=merged_exclude,
            rated_items_ml={} if surprise_different else signals["rated_items_ml"],
            watchlist_ml_ids=set(watchlist_ids) if (use_watchlist or not surprise_different) else set(),
            liked_ml_ids=set() if surprise_different else set(signals["liked_ml_ids"]),
            disliked_ml_ids=set(signals["disliked_ml_ids"]),
            excluded_ml_ids=set(all_excluded_ml),
        )
        ml_results = self._recommender.recommend(query)
        if not ml_results and ml_ct == "DOCUMENTARY" and query.genres:
            query.genres = []
            ml_results = self._recommender.recommend(query)
        cards = await self._hydrate_ml_candidates(
            ml_results,
            region=region,
            max_live_hydrations=min(3, top_k),
            max_runtime=eff_max_runtime,
            top_k=top_k,
        )

        # If Documentary or runtime-constrained MovieLens hydration filtered out everything,
        # blend in Watchmode local catalog matches
        if len(cards) < min(3, top_k) and (content_type == "DOCUMENTARY" or eff_max_runtime is not None):
            wm_extra = await self._recommend_from_watchmode_catalog(
                content_type=content_type,
                genres=genres or [],
                exclude_genres=merged_exclude,
                keywords=keywords or [],
                min_rating=eff_min_rating,
                year_min=year_min,
                year_max=year_max,
                max_runtime=eff_max_runtime,
                language=language,
                region=region,
                excluded_content_ids=signals["excluded_content_ids"]
                | {c.content_id for c in cards if c.content_id is not None},
                top_k=top_k - len(cards),
            )
            cards.extend(wm_extra)

        return cards[:top_k]

    async def get_adaptive_homepage_sections(
        self,
        *,
        user_id: str = "local-default",
        region: str | None = None,
        per_section_k: int = 8,
    ) -> AdaptiveHomepageResponse:
        """
        Build personalized homepage sections strictly from real Taste DNA signals.
        Returns empty sections + `show_onboarding=True` for brand-new users (no fake picks).
        """
        cache_key = (user_id, region or "ALL")
        now = time.monotonic()
        with self._home_lock:
            cached = self._home_cache.get(cache_key)
            if cached is not None and (now - cached[0]) < self._home_ttl:
                return cached[1]

        profile = self._taste_dna.get_profile(user_id)
        continue_items = self._db.list_continue_exploring(user_id=user_id, limit=8)

        if not profile.has_sufficient_data:
            resp = AdaptiveHomepageResponse(
                user_id=user_id,
                has_sufficient_data=False,
                show_onboarding=True,
                taste_dna_summary=profile.preference_summary,
                top_genres=[],
                sections=[],
                continue_exploring=continue_items,
            )
            with self._home_lock:
                self._home_cache[cache_key] = (now, resp)
            return resp

        signals = self._collect_user_signals(user_id)
        seen_ml_ids: set[int] = set(signals["excluded_ml_ids"])
        seen_titles: set[str] = set()

        def _dedupe(cards: list[RecommendedTitleCard]) -> list[RecommendedTitleCard]:
            unique: list[RecommendedTitleCard] = []
            for c in cards:
                tkey = c.title.strip().lower()
                if c.movielens_id is not None and int(c.movielens_id) in seen_ml_ids:
                    continue
                if tkey and tkey in seen_titles:
                    continue
                if c.movielens_id is not None:
                    seen_ml_ids.add(int(c.movielens_id))
                if tkey:
                    seen_titles.add(tkey)
                unique.append(c)
                if len(unique) >= per_section_k:
                    break
            return unique

        sections: list[HomeSectionItem] = []

        # 1. Recommended For You (core personalized hybrid)
        rec_for_you = await self.get_personalized_recommendations(
            user_id=user_id,
            region=region,
            top_k=per_section_k + 4,
        )
        items_1 = _dedupe(rec_for_you.results)
        if items_1:
            sections.append(
                HomeSectionItem(
                    section_id="recommended_for_you",
                    title="Recommended For You",
                    subtitle=profile.preference_summary,
                    items=items_1,
                )
            )

        # 2. Because You Love <Top Genre>
        if profile.top_genres:
            top_genre = profile.top_genres[0]
            because_cards = await self.recommend_for_constraints(
                user_id=user_id,
                genres=[top_genre],
                exclude_genres=profile.disliked_genres,
                extra_excluded_ml_ids=list(seen_ml_ids),
                region=region,
                top_k=per_section_k + 4,
            )
            items_2 = _dedupe(because_cards)
            if items_2:
                sections.append(
                    HomeSectionItem(
                        section_id="because_you_love",
                        title=f"Because You Love {top_genre}",
                        subtitle=f"Tailored from your {top_genre} affinity and ratings.",
                        items=items_2,
                    )
                )

        # 3. Based on Your Taste DNA (themes + top genres)
        if len(profile.top_genres) >= 1 or profile.favorite_themes:
            dna_cards = await self.recommend_for_constraints(
                user_id=user_id,
                genres=profile.top_genres[:2],
                exclude_genres=profile.disliked_genres,
                keywords=profile.favorite_themes[:3],
                extra_excluded_ml_ids=list(seen_ml_ids),
                region=region,
                top_k=per_section_k + 4,
            )
            items_3 = _dedupe(dna_cards)
            if items_3:
                theme_note = (
                    f"Themes: {', '.join(profile.favorite_themes[:3])}"
                    if profile.favorite_themes
                    else f"Genres: {', '.join(profile.top_genres[:3])}"
                )
                sections.append(
                    HomeSectionItem(
                        section_id="based_on_taste_dna",
                        title="Based on Your Taste DNA",
                        subtitle=theme_note,
                        items=items_3,
                    )
                )

        # 4. Hidden Gems For You
        gems_cards = await self.recommend_for_constraints(
            user_id=user_id,
            genres=profile.top_genres[:2],
            exclude_genres=profile.disliked_genres,
            underrated=True,
            extra_excluded_ml_ids=list(seen_ml_ids),
            region=region,
            top_k=per_section_k + 4,
        )
        items_4 = _dedupe(gems_cards)
        if items_4:
            sections.append(
                HomeSectionItem(
                    section_id="hidden_gems_for_you",
                    title="Hidden Gems For You",
                    subtitle="Under-the-radar acclaimed titles aligned with your taste.",
                    items=items_4,
                )
            )

        # 5. Discover Something Different
        diff_cards = await self.recommend_for_constraints(
            user_id=user_id,
            exclude_genres=profile.disliked_genres,
            surprise_different=True,
            extra_excluded_ml_ids=list(seen_ml_ids),
            region=region,
            top_k=per_section_k + 4,
        )
        items_5 = _dedupe(diff_cards)
        if items_5:
            sections.append(
                HomeSectionItem(
                    section_id="discover_something_different",
                    title="Discover Something Different",
                    subtitle="Curated stretch picks outside your top genres to keep discovery fresh.",
                    items=items_5,
                )
            )

        # 6. Your Preferred Genres (multi-genre blend when 2+ genres exist)
        if len(profile.top_genres) >= 2:
            pref_cards = await self.recommend_for_constraints(
                user_id=user_id,
                genres=profile.top_genres[1:3],
                exclude_genres=profile.disliked_genres,
                extra_excluded_ml_ids=list(seen_ml_ids),
                region=region,
                top_k=per_section_k + 4,
            )
            items_6 = _dedupe(pref_cards)
            if items_6:
                sections.append(
                    HomeSectionItem(
                        section_id="your_preferred_genres",
                        title="Your Preferred Genres",
                        subtitle=f"Exploring {', '.join(profile.top_genres[:3])}.",
                        items=items_6,
                    )
                )

        resp = AdaptiveHomepageResponse(
            user_id=user_id,
            has_sufficient_data=True,
            show_onboarding=not profile.onboarding_completed and len(profile.top_genres) == 0,
            taste_dna_summary=profile.preference_summary,
            top_genres=profile.top_genres,
            sections=sections,
            continue_exploring=continue_items,
        )
        with self._home_lock:
            self._home_cache[cache_key] = (now, resp)
        return resp

