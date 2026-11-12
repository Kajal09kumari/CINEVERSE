"""
MIRA — Movie Intelligence & Recommendation Assistant Service

Provides:
1. Natural-language constraint & intent extraction (hard constraints vs soft mood cues)
2. Multi-turn conversational state merging persisted in SQLite (`chat_sessions`, `chat_messages`)
3. Explainable recommendations powered by RecommendationService (MovieLens Hybrid ML + Watchmode)
4. Safe optional LLM conversational phrasing ONLY if `LLM_API_KEY` is configured
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.core.config import Settings, settings
from app.db.database import DatabaseManager, get_db_manager
from app.schemas.recommendations import (
    MiraChatRequest,
    MiraChatResponse,
    MiraMessageOut,
    MiraParsedConstraints,
    MiraSessionHistoryResponse,
    RecommendedTitleCard,
)
from app.services.recommendation_service import RecommendationService

logger = logging.getLogger(__name__)

# Genre keyword mapping -> canonical Genre strings compatible with MovieLens & Watchmode
GENRE_KEYWORDS: dict[str, list[str]] = {
    "Thriller": ["thriller", "thrillers", "suspense", "psychological", "tense", "gripping"],
    "Sci-Fi": ["sci-fi", "scifi", "sci fi", "science fiction", "space", "cyberpunk", "time travel", "alien", "futuristic"],
    "Drama": ["drama", "dramas", "emotional", "moving", "touching", "poignant", "character study", "character-driven"],
    "Comedy": ["comedy", "comedies", "funny", "hilarious", "humorous", "laugh", "lighthearted", "cozy", "feel-good", "feel good"],
    "Mystery": ["mystery", "mysteries", "whodunit", "detective", "puzzle", "twist", "mind-bending", "mind bending"],
    "Action": ["action", "heist", "spy", "martial arts", "adrenaline", "adventure"],
    "Crime": ["crime", "noir", "neo-noir", "gangster", "mafia", "investigation"],
    "Horror": ["horror", "scary", "terrifying", "slasher", "ghost", "supernatural horror"],
    "Romance": ["romance", "romantic", "love story", "romcom", "rom-com"],
    "Animation": ["animation", "animated", "anime", "pixar", "ghibli"],
    "Fantasy": ["fantasy", "magical", "mythology"],
    "War": ["war", "wartime", "military"],
    "Adventure": ["adventure", "expedition", "journey", "survival"],
}

LANGUAGE_KEYWORDS: dict[str, str] = {
    "korean": "ko",
    "k-drama": "ko",
    "kdrama": "ko",
    "japanese": "ja",
    "hindi": "hi",
    "bollywood": "hi",
    "indian": "hi",
    "french": "fr",
    "spanish": "es",
    "german": "de",
    "italian": "it",
    "english": "en",
}

REGION_KEYWORDS: dict[str, str] = {
    "in india": "IN",
    "india": "IN",
    "in us": "US",
    "in usa": "US",
    "united states": "US",
    "in uk": "GB",
    "in britain": "GB",
    "in canada": "CA",
    "in australia": "AU",
}

REFINEMENT_TRIGGERS = (
    "less ",
    "more ",
    "instead",
    "shorter",
    "too long",
    "too violent",
    "not too",
    "avoid",
    "without ",
    "no horror",
    "newer",
    "older",
    "higher rated",
    "better rated",
    "make it",
    "what about",
    "how about",
    "another",
    "different ones",
    "else",
    "number ",
    "#1",
    "#2",
    "#3",
    "first one",
    "second one",
)

RESET_TRIGGERS = (
    "start over",
    "reset",
    "new search",
    "forget previous",
    "clear context",
    "something completely new",
)

STOP_TOPIC_WORDS = {
    "something", "anything", "watch", "movie", "movies", "film", "films", "series", "show", "shows",
    "documentary", "documentaries", "tonight", "today", "please", "recommend", "suggest", "suggestion",
    "recommendations", "looking", "want", "need", "find", "give", "like", "similar", "good", "great",
    "best", "top", "highly", "rated", "short", "less", "more", "very", "really", "with", "without",
    "about", "from", "into", "that", "this", "what", "should", "could", "would", "based", "watchlist",
    "different", "usual", "preferences", "underrated", "hidden", "gem", "gems", "mira", "violent",
}


class MiraService:
    """Conversational AI assistant service for CINEVERSE."""

    def __init__(
        self,
        *,
        recommendation_service: RecommendationService,
        db: DatabaseManager | None = None,
        config: Settings | None = None,
        taste_dna_service: Any | None = None,
    ) -> None:
        self._recs = recommendation_service
        self._db = db or get_db_manager()
        self._settings = config or settings
        self._taste_dna = taste_dna_service

    def _extract_seed_titles(self, text: str, last_recs: list[dict[str, Any]]) -> list[str]:
        seeds: list[str] = []
        low = text.lower()

        # Check ordinal references against previous turn ("more like #1", "like the first one", "number 2")
        ordinal_map = [
            (r"(?:#1|first one|number 1|1st one)", 0),
            (r"(?:#2|second one|number 2|2nd one)", 1),
            (r"(?:#3|third one|number 3|3rd one)", 2),
        ]
        for pattern, idx in ordinal_map:
            if re.search(pattern, low) and idx < len(last_recs):
                title = last_recs[idx].get("title")
                if title and title not in seeds:
                    seeds.append(str(title))

        # Quoted titles
        for quoted in re.findall(r'["\']([^"\']{2,60})["\']', text):
            if quoted.strip() and quoted.strip() not in seeds:
                seeds.append(quoted.strip())

        # "like X" / "similar to X" / "love X"
        patterns = [
            r"(?:similar to|like|resembling|reminds me of|loved|enjoyed)\s+([A-Za-z0-9][A-Za-z0-9\s:&'\-]{1,50}?)(?=\s+(?:but|without|under|with|that|in\s|for\s|and\s+rated|movies|films|series|shows)|[,.!?]|$)",
        ]
        for pat in patterns:
            for match in re.findall(pat, text, flags=re.IGNORECASE):
                candidate = match.strip()
                cand_low = candidate.lower()
                # Ignore generic phrases like "like my watchlist" or "like the first one"
                if any(
                    skip in cand_low
                    for skip in ("watchlist", "first one", "second one", "third one", "this", "that", "#")
                ):
                    continue
                if len(candidate) >= 2 and candidate not in seeds:
                    seeds.append(candidate)
        return seeds[:3]

    def parse_message(
        self,
        message: str,
        *,
        previous_state: dict[str, Any] | None = None,
        request_region: str | None = None,
    ) -> MiraParsedConstraints:
        """
        Deterministically extract intent and hard/soft constraints from natural language,
        merging across conversational refinement turns when appropriate.
        """
        prev = previous_state or {}
        prev_constraints_raw = prev.get("constraints") or {}
        last_recs = prev.get("last_recommended") or []

        text = message.strip()
        low = text.lower()

        is_reset = any(trig in low for trig in RESET_TRIGGERS)
        has_new_seed_phrase = bool(
            re.search(r"\b(?:like|similar to)\s+(?!my\b|the first\b|the second\b|#)[a-z0-9]", low)
        )
        is_refinement = bool(prev_constraints_raw) and not is_reset and (
            any(trig in low for trig in REFINEMENT_TRIGGERS)
            or (len(low.split()) <= 7 and not any(g in low for g in ("what should i watch", "recommend", "suggest")))
        )
        if has_new_seed_phrase and "more like" not in low:
            is_refinement = False

        base = (
            MiraParsedConstraints(**prev_constraints_raw)
            if is_refinement
            else MiraParsedConstraints(region=request_region)
        )
        if request_region:
            base.region = request_region

        # Detect explicit reset or pure greeting
        if any(phrase in low for phrase in ("what should i watch", "surprise me", "help me pick", "anything good")):
            base.intent = "tonight_pick"
        if any(phrase in low for phrase in ("based on my watchlist", "from my watchlist", "my watchlist")):
            base.use_watchlist = True
            base.intent = "watchlist_based"
        if any(
            phrase in low
            for phrase in (
                "different from my usual",
                "outside my comfort zone",
                "break my pattern",
                "surprise me",
                "something totally different",
            )
        ):
            base.surprise_different = True
            base.intent = "surprise_discovery"

        # Content type detection
        if any(w in low for w in ("documentary", "documentaries", "docuseries", "non-fiction", "nonfiction")):
            base.content_type = "DOCUMENTARY"
            base.intent = "documentary_discovery"
        elif any(w in low for w in ("tv series", "tv show", "tv shows", "series", "miniseries", "web series", "binge")):
            base.content_type = "TV_SERIES"
            base.intent = "series_discovery"
        elif any(w in low for w in ("movie", "movies", "film", "films")):
            base.content_type = "MOVIE"

        # Seed titles
        seeds = self._extract_seed_titles(text, last_recs)
        if seeds:
            base.seed_titles = seeds
            base.intent = "similar_to_title"

        # Genre & Negative constraint extraction
        detected_genres: list[str] = []
        detected_excludes: list[str] = list(base.exclude_genres)

        for genre_name, triggers in GENRE_KEYWORDS.items():
            for kw in triggers:
                if base.content_type == "DOCUMENTARY" and genre_name == "Sci-Fi" and kw == "space":
                    continue
                # Check negation before keyword ("no horror", "not horror", "without horror", "less horror", "avoid thriller")
                if re.search(rf"\b(?:no|not|without|avoid|skip|less)\s+(?:too\s+)?{re.escape(kw)}\b", low):
                    if genre_name not in detected_excludes:
                        detected_excludes.append(genre_name)
                elif re.search(rf"\b{re.escape(kw)}\b", low):
                    if genre_name not in detected_genres:
                        detected_genres.append(genre_name)

        # Tone/violence soft-to-hard exclusion ("less violent", "not violent", "nothing bloody/scary")
        if any(phrase in low for phrase in ("less violent", "not violent", "non-violent", "nonviolent", "less gore", "no gore", "lighter tone", "not too dark", "less scary", "not scary")):
            for g in ("Horror", "War"):
                if g not in detected_excludes:
                    detected_excludes.append(g)
            if "less violent" in low or "not violent" in low:
                # Avoid slasher/crime gore without dropping Thriller/Drama
                if "Crime" not in detected_excludes and "crime" not in low:
                    detected_excludes.append("Crime")
            base.intent = "refine_constraints"

        if detected_genres:
            if is_refinement and not any(w in low for w in ("instead", "switch to", "only ")):
                merged_g = list(dict.fromkeys([*base.genres, *detected_genres]))
                base.genres = [g for g in merged_g if g not in detected_excludes]
            else:
                base.genres = [g for g in detected_genres if g not in detected_excludes]
        elif detected_excludes:
            base.genres = [g for g in base.genres if g not in detected_excludes]

        base.exclude_genres = detected_excludes

        # Underrated / hidden gem
        if any(w in low for w in ("underrated", "hidden gem", "hidden gems", "overlooked", "underappreciated", "lesser known")):
            base.underrated = True

        # Rating threshold
        rating_match = re.search(r"(?:rated|rating|score)?\s*(?:above|over|at least|>=|>)?\s*([6-9](?:\.\d)?)\s*(?:\+|/10)?", low)
        if any(w in low for w in ("highly rated", "top rated", "high rated", "acclaimed", "critically acclaimed", "masterpiece")):
            base.min_rating = max(base.min_rating or 0.0, 7.5)
        elif rating_match and any(k in low for k in ("rat", "score", "/10", "above", "over", "at least")):
            base.min_rating = float(rating_match.group(1))

        # Runtime ("short", "under 2 hours", "under 100 minutes", "quick")
        min_match = re.search(r"(?:under|less than|max|shorter than|below)\s*(\d{2,3})\s*(?:min|mins|minutes)", low)
        hr_match = re.search(r"(?:under|less than|max|shorter than|below)\s*(\d(?:\.\d)?)\s*(?:hr|hrs|hour|hours)", low)
        if min_match:
            base.max_runtime = int(min_match.group(1))
        elif hr_match:
            base.max_runtime = int(float(hr_match.group(1)) * 60)
        elif any(w in low for w in ("short", "shorter", "quick watch", "brief", "under two hours")):
            base.max_runtime = 105

        # Era / release year filters
        if "90s" in low or "1990s" in low:
            base.year_min, base.year_max = 1990, 1999
        elif "80s" in low or "1980s" in low:
            base.year_min, base.year_max = 1980, 1989
        elif "2000s" in low:
            base.year_min, base.year_max = 2000, 2009
        elif "2010s" in low:
            base.year_min, base.year_max = 2010, 2019
        elif any(w in low for w in ("recent", "modern", "newer", "latest", "new releases")):
            base.year_min = 2018
            base.year_max = None
        elif any(w in low for w in ("classic", "vintage", "older")):
            base.year_max = 2000

        after_yr = re.search(r"(?:after|since|from)\s+(19\d\d|20\d\d)", low)
        before_yr = re.search(r"(?:before|until|pre-)\s*(19\d\d|20\d\d)", low)
        if after_yr:
            base.year_min = int(after_yr.group(1))
        if before_yr:
            base.year_max = int(before_yr.group(1))

        # Language & Region
        for lang_kw, iso in LANGUAGE_KEYWORDS.items():
            if re.search(rf"\b{re.escape(lang_kw)}\b", low):
                base.language = iso
                break
        for reg_kw, reg_code in REGION_KEYWORDS.items():
            if reg_kw in low:
                base.region = reg_code
                break

        # Topic keywords ("about space", "about ai", "heist", etc.)
        about_match = re.findall(r"(?:about|involving|theme of|themes of)\s+([a-zA-Z0-9\s\-]{3,40}?)(?=[,.!?]|$|\s+(?:with|and|under|in|that))", low)
        extra_kws: list[str] = []
        for phrase in about_match:
            for tok in phrase.split():
                if len(tok) >= 3 and tok not in STOP_TOPIC_WORDS and tok not in extra_kws:
                    extra_kws.append(tok)

        # Meaningful content words for TF-IDF query
        if not about_match and not seeds:
            for tok in re.findall(r"[a-z]{4,}", low):
                if tok not in STOP_TOPIC_WORDS and tok not in extra_kws:
                    # Do not add genre names themselves as free-text unless topic-like
                    is_plain_genre = any(tok in triggers for triggers in GENRE_KEYWORDS.values())
                    if not is_plain_genre:
                        extra_kws.append(tok)
        if extra_kws:
            base.keywords = extra_kws[:5]

        if base.intent == "general_discovery" and base.genres:
            base.intent = "genre_mood_discovery"

        return base

    def _build_reply_and_followups(
        self,
        constraints: MiraParsedConstraints,
        cards: list[RecommendedTitleCard],
        taste_dna: Any | None = None,
    ) -> tuple[str, str | None, list[str]]:
        if not cards:
            return (
                "I couldn't find exact catalog matches with all of those simultaneous constraints. "
                "Try relaxing the runtime, year range, or switching format and I'll refine immediately.",
                "Would you like me to broaden the year range or include both movies and series?",
                ["Broaden constraints", "Surprise me with top picks", "Try underrated thrillers"],
            )

        summary_bits: list[str] = []
        if constraints.seed_titles:
            summary_bits.append(f"inspired by {', '.join(constraints.seed_titles)}")
        if constraints.use_watchlist:
            summary_bits.append("tailored from your watchlist")
        if constraints.surprise_different:
            if taste_dna is not None and getattr(taste_dna, "top_genres", None):
                usual = ", ".join(taste_dna.top_genres[:3])
                summary_bits.append(f"deliberately outside your usual {usual} Taste DNA")
            else:
                summary_bits.append("fresh exploratory picks (no prior genre history recorded yet)")
        if constraints.underrated:
            summary_bits.append("underrated hidden gems")
        if constraints.genres:
            summary_bits.append(" & ".join(constraints.genres))
        ct_label = {
            "MOVIE": "movies",
            "TV_SERIES": "TV series",
            "DOCUMENTARY": "documentaries",
            "ALL": "titles",
        }.get(constraints.content_type, "titles")

        if constraints.exclude_genres:
            summary_bits.append(f"excluding {', '.join(constraints.exclude_genres)}")
        if constraints.max_runtime:
            summary_bits.append(f"under {constraints.max_runtime} min")
        if constraints.min_rating:
            summary_bits.append(f"rated {constraints.min_rating:.1f}+/10")

        if not summary_bits and taste_dna is not None and getattr(taste_dna, "has_sufficient_data", False):
            if getattr(taste_dna, "top_genres", None):
                summary_bits.append(f"aligned with your Taste DNA ({', '.join(taste_dna.top_genres[:3])})")

        desc = ", ".join(summary_bits) if summary_bits else "personalized for your taste profile"
        lead_titles = ", ".join(f"{c.title}" for c in cards[:3])
        reply = f"Here are {len(cards)} {ct_label} ({desc}), led by {lead_titles}."

        # Helpful contextual follow-up
        if constraints.intent == "tonight_pick" and not constraints.genres:
            follow_up = "Any particular mood tonight — tense psychological mystery, short feel-good comedy, or deep sci-fi?"
            chips = ["Underrated psychological thriller", "Short & emotional", "Documentaries about space", "TV series with mystery"]
        elif constraints.content_type == "TV_SERIES":
            follow_up = "Want me to narrow these series by mood, lighter tone, or a different genre?"
            chips = ["Make it less violent", "More mystery & twists", "Switch to movies instead"]
        elif constraints.exclude_genres:
            follow_up = "Do these hit the lighter balance you wanted, or should we lean warmer or more suspenseful?"
            chips = ["More like #1", "Make it even shorter", "Highly rated classics (before 2005)"]
        else:
            follow_up = "Want to refine these — e.g. less violent, shorter runtime, or more like #1?"
            chips = ["Something less violent", "Under 105 minutes", "More like #1", "Different from my usual preferences"]

        return reply, follow_up, chips

    async def _optional_llm_polish(
        self,
        user_message: str,
        constraints: MiraParsedConstraints,
        cards: list[RecommendedTitleCard],
        deterministic_reply: str,
    ) -> tuple[str, bool]:
        """
        Optional conversational phrasing layer when LLM_API_KEY is explicitly configured.
        Strictly grounded in `cards` titles/ratings so no facts are fabricated.
        """
        api_key = (self._settings.llm_api_key or "").strip()
        if not api_key or api_key.startswith("your_") or not cards:
            return deterministic_reply, False

        facts = [
            f"- {c.title} ({c.release_year or 'Year unknown'}, genres: {', '.join(c.genres)}, rating: {c.rating or 'N/A'}) — {c.explanation}"
            for c in cards[:4]
        ]
        prompt = (
            "You are MIRA, CINEVERSE's concise movie concierge. Rewrite a warm 2-sentence reply "
            "grounded strictly in these returned titles (do NOT invent ratings, years, or platforms):\n"
            f"User said: {user_message}\nConstraints: {constraints.model_dump()}\n"
            + "\n".join(facts)
        )
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 140,
                        "temperature": 0.4,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                        .strip()
                    )
                    if content:
                        return content, True
        except httpx.HTTPError as exc:
            logger.debug("Optional LLM polish fallback to deterministic MIRA: %s", exc)
        return deterministic_reply, False

    async def chat(self, payload: MiraChatRequest) -> MiraChatResponse:
        session = self._db.get_chat_session(payload.session_id, user_id=payload.user_id)
        prev_state = session.get("state") or {}
        eff_region = (payload.region or self._settings.watchmode_region or "IN").upper()

        self._db.append_chat_message(
            session_id=payload.session_id,
            role="user",
            content=payload.message,
            user_id=payload.user_id,
        )

        constraints = self.parse_message(
            payload.message,
            previous_state=prev_state,
            request_region=eff_region,
        )

        shown_ml_ids = [int(x) for x in (prev_state.get("shown_ml_ids") or [])][-24:]
        low_msg = payload.message.lower()
        ask_fresh = any(p in low_msg for p in ("other", "else", "different ones", "more options", "new picks"))
        extra_exclusions = shown_ml_ids if ask_fresh else []

        cards = await self._recs.recommend_for_constraints(
            user_id=payload.user_id,
            content_type=constraints.content_type,
            genres=constraints.genres,
            exclude_genres=constraints.exclude_genres,
            keywords=constraints.keywords,
            seed_titles=constraints.seed_titles,
            min_rating=constraints.min_rating,
            year_min=constraints.year_min,
            year_max=constraints.year_max,
            max_runtime=constraints.max_runtime,
            language=constraints.language,
            underrated=constraints.underrated,
            surprise_different=constraints.surprise_different,
            use_watchlist=constraints.use_watchlist,
            extra_excluded_ml_ids=extra_exclusions,
            region=constraints.region or eff_region,
            top_k=payload.top_k,
        )

        taste_dna = self._taste_dna.get_profile(payload.user_id) if self._taste_dna is not None else None
        det_reply, follow_up, chips = self._build_reply_and_followups(constraints, cards, taste_dna=taste_dna)
        reply_text, used_llm = await self._optional_llm_polish(
            payload.message, constraints, cards, det_reply
        )

        new_shown = list(
            dict.fromkeys([*shown_ml_ids, *(int(c.movielens_id) for c in cards if c.movielens_id is not None)])
        )[-36:]
        new_state = {
            "constraints": constraints.model_dump(),
            "last_recommended": [
                {"content_id": c.content_id, "movielens_id": c.movielens_id, "title": c.title}
                for c in cards
            ],
            "shown_ml_ids": new_shown,
        }
        self._db.save_chat_session_state(payload.session_id, new_state, user_id=payload.user_id)
        self._recs.invalidate_user_cache(payload.user_id)

        self._db.append_chat_message(
            session_id=payload.session_id,
            role="assistant",
            content=reply_text,
            metadata={
                "constraints": constraints.model_dump(),
                "recommendations": [c.model_dump() for c in cards],
                "follow_up_question": follow_up,
                "quick_refinements": chips,
            },
            user_id=payload.user_id,
        )

        from app.services.analytics_service import track_product_event_safe

        if not prev_state:
            track_product_event_safe(
                event_type="mira_conversation_started",
                user_id=payload.user_id,
                session_id=payload.session_id,
                source_surface="mira_chat",
                dedupe_key=f"mira_start:{payload.session_id}",
                metadata={"intent": constraints.intent},
            )
        if cards:
            track_product_event_safe(
                event_type="recommendation_displayed",
                user_id=payload.user_id,
                session_id=payload.session_id,
                source_surface="mira_chat",
                metadata={"count": len(cards), "intent": constraints.intent},
            )

        return MiraChatResponse(
            session_id=payload.session_id,
            reply=reply_text,
            follow_up_question=follow_up,
            quick_refinements=chips,
            constraints=constraints,
            recommendations=cards,
            used_llm=used_llm,
        )

    def get_history(self, session_id: str, user_id: str = "local-default") -> MiraSessionHistoryResponse:
        session = self._db.get_chat_session(session_id, user_id=user_id)
        raw_msgs = self._db.list_chat_messages(session_id, limit=50)
        messages: list[MiraMessageOut] = []
        for m in raw_msgs:
            meta = m.get("metadata") or {}
            recs = [RecommendedTitleCard(**r) for r in (meta.get("recommendations") or [])]
            messages.append(
                MiraMessageOut(
                    id=m.get("id"),
                    role="assistant" if m.get("role") == "assistant" else "user",
                    content=m["content"],
                    created_at=m["created_at"],
                    constraints=meta.get("constraints"),
                    recommendations=recs,
                    follow_up_question=meta.get("follow_up_question"),
                    quick_refinements=list(meta.get("quick_refinements") or []),
                )
            )
        return MiraSessionHistoryResponse(
            session_id=session["session_id"],
            user_id=session["user_id"],
            state=session.get("state") or {},
            messages=messages,
        )

    def clear_history(self, session_id: str, user_id: str = "local-default") -> None:
        self._db.clear_chat_session(session_id, user_id=user_id)
