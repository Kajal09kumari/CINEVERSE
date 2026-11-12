"""
Watchmode API Integration Service

Verified against Watchmode OpenAPI v1.10.1 (`https://api.watchmode.com/v1`):
- Authenticates via `X-API-Key` header (never query params, never logged).
- Deduplicates concurrent identical requests.
- Retries transient upstream failures with exponential backoff.
- Caches responses in-memory and in SQLite (max 24h, respecting 30-day Watchmode free plan limits).
- Tracks credit spend and exposes `/status` quota inspection (0 credits).
- Normalizes Watchmode movies, TV series, and documentaries into canonical CINEVERSE schemas.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from app.core.config import Settings, settings
from app.db.database import DatabaseManager, get_db_manager
from app.schemas.content import (
    AvailabilityResponse,
    CastMember,
    ContentDetail,
    ContentFilterType,
    ContentListResponse,
    ContentSummary,
    ContentType,
    EpisodeInfo,
    GenreItem,
    GenreListResponse,
    QuotaStatusResponse,
    SeasonInfo,
    SortByParam,
    StreamingSource,
    WATCHMODE_SORT_MAP,
)

logger = logging.getLogger(__name__)

# Known Watchmode Documentary genre ID (verified via /genres; dynamically refreshed when /genres is called)
DEFAULT_DOCUMENTARY_GENRE_ID = 6


class WatchmodeConfigError(Exception):
    """Raised when WATCHMODE_API_KEY is missing or placeholder."""


class WatchmodeAuthError(Exception):
    """Raised when Watchmode rejects the API key (401/403)."""


class WatchmodeQuotaError(Exception):
    """Raised when Watchmode rate limit or monthly credit quota is exceeded (429 / 402)."""


class WatchmodeNotFoundError(Exception):
    """Raised when the requested title or resource is not found on Watchmode."""


class WatchmodeTimeoutError(Exception):
    """Raised when Watchmode upstream request exceeds timeout."""


class WatchmodeAPIError(Exception):
    """Raised for unexpected Watchmode HTTP or transport errors."""


class _TTLCache:
    """Simple bounded in-memory TTL cache."""

    def __init__(self, max_entries: int = 256) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._max_entries = max_entries

    def get(self, key: str) -> Any | None:
        item = self._store.get(key)
        if item is None:
            return None
        expires_at, value = item
        if time.monotonic() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        if len(self._store) >= self._max_entries:
            oldest = next(iter(self._store))
            self._store.pop(oldest, None)
        self._store[key] = (time.monotonic() + ttl_seconds, value)


def _safe_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_year(release_date: str | None, fallback_year: Any = None) -> int | None:
    year = _safe_int(fallback_year)
    if year is not None:
        return year
    if release_date and len(release_date) >= 4 and release_date[:4].isdigit():
        return int(release_date[:4])
    return None


def _classify_content_type(
    watchmode_type: str | None,
    genre_names: list[str],
    genre_ids: list[int],
    doc_genre_ids: set[int],
) -> tuple[ContentType, bool]:
    """
    Classify into MOVIE, TV_SERIES, or DOCUMENTARY.

    Watchmode does not have a dedicated documentary title type; documentaries
    arrive as `movie`, `tv_series`, `tv_miniseries`, etc. with Documentary genre metadata.
    Preserves `watchmode_type` separately so documentary films vs series stay distinct.
    """
    is_doc = any(g.strip().lower() == "documentary" for g in genre_names) or bool(
        set(genre_ids) & doc_genre_ids
    )
    if is_doc:
        return ContentType.DOCUMENTARY, True

    wt = (watchmode_type or "").lower()
    if wt.startswith("tv_") and wt != "tv_movie":
        return ContentType.TV_SERIES, False
    return ContentType.MOVIE, False


class WatchmodeService:
    """Async Watchmode API v1 client with caching, credit optimization, and normalization."""

    def __init__(
        self,
        config: Settings | None = None,
        client: httpx.AsyncClient | None = None,
        db: DatabaseManager | None = None,
    ) -> None:
        self._settings = config or settings
        self._db = db or get_db_manager()
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self._settings.watchmode_base_url.rstrip("/"),
            timeout=httpx.Timeout(self._settings.watchmode_timeout_seconds, connect=5.0),
        )
        self._cache = _TTLCache(max_entries=256)
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._doc_genre_ids: set[int] = {DEFAULT_DOCUMENTARY_GENRE_ID}

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _require_key(self) -> str:
        key = (self._settings.watchmode_api_key or "").strip()
        if not key or key == "your_watchmode_api_key":
            raise WatchmodeConfigError(
                "WATCHMODE_API_KEY is not configured. Set WATCHMODE_API_KEY in backend/.env."
            )
        return key

    async def _request(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        credit_cost: int = 1,
    ) -> Any:
        """
        Execute an authenticated GET request against Watchmode v1.
        Includes concurrent deduplication and exponential backoff on transient failures.
        """
        api_key = self._require_key()
        clean_params = {
            k: v for k, v in (params or {}).items() if v is not None and v != ""
        }
        dedupe_key = f"{path}?{sorted(clean_params.items())}"

        if dedupe_key in self._inflight:
            return await self._inflight[dedupe_key]

        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        future.add_done_callback(lambda f: f.exception() if not f.cancelled() else None)
        self._inflight[dedupe_key] = future

        try:
            result = await self._execute_with_retry(
                path=path,
                params=clean_params,
                api_key=api_key,
                credit_cost=credit_cost,
            )
            if not future.done():
                future.set_result(result)
            return result
        except Exception as exc:
            if not future.done():
                future.set_exception(exc)
            raise
        finally:
            self._inflight.pop(dedupe_key, None)

    async def _execute_with_retry(
        self,
        *,
        path: str,
        params: dict[str, Any],
        api_key: str,
        credit_cost: int,
    ) -> Any:
        headers = {
            "X-API-Key": api_key,
            "Accept": "application/json",
        }
        max_attempts = max(1, self._settings.watchmode_max_retries + 1)
        last_exc: Exception | None = None

        for attempt in range(max_attempts):
            try:
                logger.info("Watchmode request: GET %s (attempt %s)", path, attempt + 1)
                response = await self._client.get(path, params=params, headers=headers)
            except httpx.TimeoutException as exc:
                last_exc = WatchmodeTimeoutError(
                    "Watchmode API request timed out. Please try again."
                )
                if attempt + 1 < max_attempts:
                    await asyncio.sleep(0.4 * (2**attempt))
                    continue
                raise last_exc from exc
            except httpx.RequestError as exc:
                last_exc = WatchmodeAPIError(
                    f"Unable to reach Watchmode API ({type(exc).__name__})."
                )
                if attempt + 1 < max_attempts:
                    await asyncio.sleep(0.4 * (2**attempt))
                    continue
                raise last_exc from exc

            if response.status_code == 404:
                raise WatchmodeNotFoundError(
                    "Requested title or resource was not found on Watchmode."
                )
            if response.status_code in (401, 403):
                logger.error("Watchmode rejected API key (%s)", response.status_code)
                raise WatchmodeAuthError(
                    "Watchmode authentication failed. Verify WATCHMODE_API_KEY in backend/.env."
                )
            if response.status_code in (402, 429):
                if attempt + 1 < max_attempts and response.status_code == 429:
                    retry_after = _safe_float(response.headers.get("Retry-After"))
                    delay = min(retry_after or (0.6 * (2**attempt)), 3.0)
                    await asyncio.sleep(delay)
                    continue
                raise WatchmodeQuotaError(
                    "Watchmode API rate limit or monthly credit quota reached. Please try again later."
                )
            if response.status_code >= 500:
                last_exc = WatchmodeAPIError(
                    f"Watchmode upstream error (HTTP {response.status_code})."
                )
                if attempt + 1 < max_attempts:
                    await asyncio.sleep(0.4 * (2**attempt))
                    continue
                raise last_exc

            if response.status_code >= 400:
                raise WatchmodeAPIError(
                    f"Watchmode request failed (HTTP {response.status_code})."
                )

            if credit_cost > 0:
                self._db.record_credit_usage(path, credit_cost)

            try:
                return response.json()
            except ValueError as exc:
                raise WatchmodeAPIError("Received invalid JSON response from Watchmode.") from exc

        raise last_exc or WatchmodeAPIError("Watchmode request failed.")

    # ── Normalization Helpers ──────────────────────────────────────────────

    def _normalize_summary_and_persist(
        self,
        raw: dict[str, Any],
        *,
        full_details: bool = False,
    ) -> ContentSummary:
        watchmode_id = _safe_int(raw.get("id"))
        genre_names = [str(g) for g in (raw.get("genre_names") or []) if g]
        genre_ids = [int(g) for g in (raw.get("genres") or []) if _safe_int(g) is not None]
        watchmode_type = raw.get("type")
        content_type, is_doc = _classify_content_type(
            watchmode_type, genre_names, genre_ids, self._doc_genre_ids
        )
        release_date = raw.get("release_date")
        release_year = _parse_year(release_date, raw.get("year"))
        rating = _safe_float(raw.get("user_rating"))
        rating_source = "watchmode_user" if rating is not None else None
        if rating is None and raw.get("critic_score") is not None:
            critic = _safe_float(raw.get("critic_score"))
            if critic is not None:
                rating = round(critic / 10.0, 1)
                rating_source = "watchmode_critic"

        poster_url = (
            raw.get("posterLarge")
            or raw.get("poster")
            or raw.get("posterMedium")
            or raw.get("image_url")
        )
        popularity = _safe_float(
            raw.get("popularity_percentile") or raw.get("relevance_percentile") or raw.get("relevance")
        )
        legacy_tmdb_id = _safe_int(raw.get("tmdb_id"))

        record: dict[str, Any] = {
            "watchmode_id": watchmode_id,
            "imdb_id": raw.get("imdb_id"),
            "legacy_tmdb_id": legacy_tmdb_id,
            "title": raw.get("title") or raw.get("name") or "Untitled",
            "original_title": raw.get("original_title"),
            "content_type": content_type.value,
            "watchmode_type": watchmode_type,
            "is_documentary": is_doc,
            "release_year": release_year,
            "release_date": release_date,
            "description": raw.get("plot_overview"),
            "poster_url": poster_url,
            "backdrop_url": raw.get("backdrop"),
            "genres": genre_names,
            "genre_ids": genre_ids,
            "runtime": _safe_int(raw.get("runtime_minutes")),
            "rating": rating,
            "rating_source": rating_source,
            "popularity": popularity,
            "language": raw.get("original_language"),
            "country": None,
        }

        if full_details:
            cast_list, directors = self._extract_cast_and_directors(raw.get("cast") or [])
            sources_list = self._extract_sources(raw.get("sources") or [])
            seasons_list = self._extract_seasons(raw.get("seasons") or [])
            episodes_list = self._extract_episodes(raw.get("episodes") or [])
            record.update(
                {
                    "cast": [c.model_dump() for c in cast_list],
                    "directors": directors,
                    "streaming_sources": [s.model_dump() for s in sources_list],
                    "seasons": [s.model_dump() for s in seasons_list],
                    "episodes": [e.model_dump() for e in episodes_list],
                    "similar_title_ids": [
                        int(x) for x in (raw.get("similar_titles") or []) if _safe_int(x) is not None
                    ],
                    "trailer_url": raw.get("trailer"),
                }
            )

        canonical_id = self._db.upsert_content_item(record, full_details=full_details)
        stored = self._db.get_content_by_any_id(canonical_id)
        if stored is not None:
            return self._dict_to_summary(stored)

        return ContentSummary(
            id=canonical_id,
            **{k: v for k, v in record.items() if k != "content_type"},
            content_type=content_type,
        )

    @staticmethod
    def _extract_cast_and_directors(raw_cast: list[dict[str, Any]]) -> tuple[list[CastMember], list[str]]:
        cast_members: list[CastMember] = []
        directors: list[str] = []
        for entry in raw_cast[:30]:
            full_name = entry.get("full_name") or ""
            if not full_name:
                continue
            role = entry.get("role")
            member_type = entry.get("type") or "Cast"
            if member_type.lower() == "crew" and role and "director" in role.lower():
                if full_name not in directors:
                    directors.append(full_name)
            cast_members.append(
                CastMember(
                    person_id=_safe_int(entry.get("person_id")),
                    type=member_type,
                    full_name=full_name,
                    role=role,
                    order=_safe_int(entry.get("order")),
                    headshot_url=entry.get("headshot_url"),
                )
            )
        return cast_members, directors

    @staticmethod
    def _extract_sources(raw_sources: list[dict[str, Any]]) -> list[StreamingSource]:
        items: list[StreamingSource] = []
        seen: set[tuple[int, str, str]] = set()
        for src in raw_sources:
            sid = _safe_int(src.get("source_id"))
            name = src.get("name") or ""
            stype = src.get("type") or ""
            region = src.get("region") or ""
            if sid is None or not name:
                continue
            key = (sid, stype, region)
            if key in seen:
                continue
            seen.add(key)
            items.append(
                StreamingSource(
                    source_id=sid,
                    name=name,
                    type=stype,
                    region=region,
                    web_url=src.get("web_url"),
                    ios_url=src.get("ios_url"),
                    android_url=src.get("android_url"),
                    format=src.get("format"),
                    price=_safe_float(src.get("price")),
                )
            )
        return items

    @staticmethod
    def _extract_seasons(raw_seasons: list[dict[str, Any]]) -> list[SeasonInfo]:
        out: list[SeasonInfo] = []
        for s in raw_seasons:
            sid = _safe_int(s.get("id"))
            if sid is None:
                continue
            out.append(
                SeasonInfo(
                    id=sid,
                    number=_safe_int(s.get("number")),
                    name=s.get("name"),
                    overview=s.get("overview"),
                    air_date=s.get("air_date"),
                    episode_count=_safe_int(s.get("episode_count")),
                    poster_url=s.get("poster_url"),
                )
            )
        return out

    @staticmethod
    def _extract_episodes(raw_episodes: list[dict[str, Any]]) -> list[EpisodeInfo]:
        out: list[EpisodeInfo] = []
        for ep in raw_episodes[:50]:
            eid = _safe_int(ep.get("id"))
            if eid is None:
                continue
            out.append(
                EpisodeInfo(
                    id=eid,
                    name=ep.get("name"),
                    season_number=_safe_int(ep.get("season_number")),
                    episode_number=_safe_int(ep.get("episode_number")),
                    release_date=ep.get("release_date"),
                    runtime_minutes=_safe_int(ep.get("runtime_minutes")),
                    overview=ep.get("overview"),
                    thumbnail_url=ep.get("thumbnail_url"),
                    sources=WatchmodeService._extract_sources(ep.get("sources") or []),
                )
            )
        return out

    @staticmethod
    def _dict_to_summary(data: dict[str, Any]) -> ContentSummary:
        return ContentSummary(
            id=data["id"],
            watchmode_id=data.get("watchmode_id"),
            imdb_id=data.get("imdb_id"),
            legacy_tmdb_id=data.get("legacy_tmdb_id"),
            title=data["title"],
            original_title=data.get("original_title"),
            content_type=ContentType(data.get("content_type", "MOVIE")),
            watchmode_type=data.get("watchmode_type"),
            is_documentary=bool(data.get("is_documentary")),
            release_year=data.get("release_year"),
            release_date=data.get("release_date"),
            description=data.get("description"),
            poster_url=data.get("poster_url"),
            backdrop_url=data.get("backdrop_url"),
            genres=data.get("genres") or [],
            genre_ids=data.get("genre_ids") or [],
            runtime=data.get("runtime"),
            rating=data.get("rating"),
            rating_source=data.get("rating_source"),
            popularity=data.get("popularity"),
            language=data.get("language"),
            country=data.get("country"),
            last_synced_at=data.get("last_synced_at"),
        )

    @staticmethod
    def _dict_to_detail(data: dict[str, Any]) -> ContentDetail:
        return ContentDetail(
            **WatchmodeService._dict_to_summary(data).model_dump(),
            cast=[CastMember(**c) for c in (data.get("cast") or [])],
            directors=data.get("directors") or [],
            streaming_sources=[StreamingSource(**s) for s in (data.get("streaming_sources") or [])],
            seasons=[SeasonInfo(**s) for s in (data.get("seasons") or [])],
            episodes=[EpisodeInfo(**e) for e in (data.get("episodes") or [])],
            similar_title_ids=data.get("similar_title_ids") or [],
            trailer_url=data.get("trailer_url"),
        )

    # ── Public API Methods ─────────────────────────────────────────────────

    async def get_quota_status(self) -> QuotaStatusResponse:
        """Check Watchmode monthly quota via /status (costs 0 credits)."""
        local_credits = self._db.get_total_recorded_credits()
        if not self._settings.has_watchmode_key:
            return QuotaStatusResponse(
                configured=False,
                local_credits_recorded=local_credits,
                cache_enabled=self._settings.cineverse_cache_enabled,
            )
        data = await self._request("/status", credit_cost=0)
        return QuotaStatusResponse(
            configured=True,
            quota=_safe_int(data.get("quota")),
            quota_used=_safe_int(data.get("quotaUsed")),
            local_credits_recorded=local_credits,
            cache_enabled=self._settings.cineverse_cache_enabled,
        )

    async def get_genres(self) -> GenreListResponse:
        """Fetch Watchmode genre dictionary (cached 24 hours)."""
        cache_key = "watchmode:genres"
        if self._settings.cineverse_cache_enabled:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        payload = await self._request("/genres", credit_cost=1)
        if not isinstance(payload, list):
            raise WatchmodeAPIError("Unexpected Watchmode /genres payload.")

        genres: list[GenreItem] = []
        doc_ids: set[int] = set()
        for row in payload:
            gid = _safe_int(row.get("id"))
            name = (row.get("name") or "").strip()
            if gid is not None and name:
                genres.append(GenreItem(id=gid, name=name))
                if name.lower() == "documentary":
                    doc_ids.add(gid)

        if doc_ids:
            self._doc_genre_ids = doc_ids

        res = GenreListResponse(genres=genres)
        if self._settings.cineverse_cache_enabled:
            self._cache.set(cache_key, res, ttl_seconds=86400)
        return res

    async def _enrich_missing_summaries(
        self,
        summaries: list[ContentSummary],
        *,
        max_enrich: int = 6,
    ) -> list[ContentSummary]:
        """
        Selectively hydrate missing posters/ratings/descriptions for top uncached items.
        Respects Watchmode free credit limits by skipping already-cached items and capping
        live detail lookups per discovery page.
        """
        enriched: list[ContentSummary] = []
        live_calls = 0

        for item in summaries:
            if item.poster_url and item.rating is not None:
                enriched.append(item)
                continue
            if item.watchmode_id is None or live_calls >= max_enrich:
                enriched.append(item)
                continue

            cached_detail = self._db.get_fresh_full_detail_by_watchmode_id(item.watchmode_id)
            if cached_detail is not None:
                enriched.append(self._dict_to_summary(cached_detail))
                continue

            try:
                live_calls += 1
                detail = await self.get_content_details(
                    item.watchmode_id, include_extras=False
                )
                enriched.append(ContentSummary(**detail.model_dump(include=set(ContentSummary.model_fields))))
            except (WatchmodeQuotaError, WatchmodeTimeoutError, WatchmodeAPIError):
                enriched.append(item)

        return enriched

    async def discover_content(
        self,
        *,
        content_type: ContentFilterType = ContentFilterType.ALL,
        genres: str | None = None,
        language: str | None = None,
        year: int | None = None,
        min_rating: float | None = None,
        sort_by: SortByParam = SortByParam.POPULARITY_DESC,
        region: str | None = None,
        page: int = 1,
        limit: int = 20,
        enrich_top: int = 6,
    ) -> ContentListResponse:
        """Query Watchmode /list-titles with full filter normalization."""
        effective_region = (region or self._settings.watchmode_region or "IN").upper()
        cache_key = (
            f"discover:ct={content_type.value}:g={genres}:l={language}:y={year}"
            f":r={min_rating}:s={sort_by.value}:reg={effective_region}:p={page}:lim={limit}"
        )
        if self._settings.cineverse_cache_enabled:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached.model_copy(update={"cached": True})

        wm_types = None
        wm_genres = genres
        if content_type == ContentFilterType.MOVIE:
            wm_types = "movie"
        elif content_type == ContentFilterType.TV_SERIES:
            wm_types = "tv_series,tv_miniseries"
        elif content_type == ContentFilterType.DOCUMENTARY:
            doc_str = ",".join(str(x) for x in sorted(self._doc_genre_ids))
            wm_genres = f"{genres},{doc_str}" if genres else doc_str

        params: dict[str, Any] = {
            "types": wm_types,
            "regions": effective_region,
            "genres": wm_genres,
            "languages": language.lower() if language else None,
            "sort_by": WATCHMODE_SORT_MAP[sort_by],
            "page": page,
            "limit": limit,
        }
        if year is not None:
            params["release_date_start"] = int(f"{year}0101")
            params["release_date_end"] = int(f"{year}1231")
        if min_rating is not None:
            params["user_rating_low"] = min_rating

        payload = await self._request("/list-titles", params=params, credit_cost=1)
        if not isinstance(payload, dict):
            raise WatchmodeAPIError("Unexpected Watchmode /list-titles payload.")

        raw_titles = payload.get("titles") or []
        summaries = [
            self._normalize_summary_and_persist(row, full_details=False)
            for row in raw_titles
            if isinstance(row, dict)
        ]

        if enrich_top > 0 and summaries:
            summaries = await self._enrich_missing_summaries(summaries, max_enrich=enrich_top)

        if content_type == ContentFilterType.DOCUMENTARY:
            for item in summaries:
                item.content_type = ContentType.DOCUMENTARY
                item.is_documentary = True

        if sort_by == SortByParam.RATING_DESC:
            summaries.sort(key=lambda m: (m.rating is not None, m.rating or 0.0), reverse=True)

        result = ContentListResponse(
            page=_safe_int(payload.get("page")) or page,
            results=summaries,
            total_pages=max(1, _safe_int(payload.get("total_pages")) or 1),
            total_results=_safe_int(payload.get("total_results")) or len(summaries),
            source="watchmode",
            cached=False,
        )
        if self._settings.cineverse_cache_enabled:
            self._cache.set(cache_key, result, ttl_seconds=900)
        return result

    async def get_trending(
        self,
        *,
        page: int = 1,
        content_type: ContentFilterType = ContentFilterType.ALL,
        region: str | None = None,
    ) -> ContentListResponse:
        """Watchmode popularity-ranked discovery used for Trending Now."""
        return await self.discover_content(
            content_type=content_type,
            sort_by=SortByParam.POPULARITY_DESC,
            region=region,
            page=page,
            limit=20,
            enrich_top=8,
        )

    async def get_popular(
        self,
        *,
        page: int = 1,
        content_type: ContentFilterType = ContentFilterType.MOVIE,
        region: str | None = None,
    ) -> ContentListResponse:
        """Watchmode popular films discovery filtered to high-rated/popular releases."""
        return await self.discover_content(
            content_type=content_type,
            min_rating=6.5,
            sort_by=SortByParam.POPULARITY_DESC,
            region=region,
            page=page,
            limit=20,
            enrich_top=8,
        )

    async def search_content(
        self,
        *,
        query: str,
        content_type: ContentFilterType = ContentFilterType.ALL,
        page: int = 1,
    ) -> ContentListResponse:
        """
        Search Watchmode titles via `/autocomplete-search` (1 credit, includes poster thumbnails).
        """
        cleaned = query.strip()
        if not cleaned:
            return ContentListResponse(page=1, results=[], total_pages=0, total_results=0)

        cache_key = f"search:q={cleaned.lower()}:ct={content_type.value}:p={page}"
        if self._settings.cineverse_cache_enabled:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached.model_copy(update={"cached": True})

        search_type = 2  # Titles only
        if content_type == ContentFilterType.MOVIE:
            search_type = 3
        elif content_type == ContentFilterType.TV_SERIES:
            search_type = 4

        payload = await self._request(
            "/autocomplete-search",
            params={"search_value": cleaned, "search_type": search_type},
            credit_cost=1,
        )
        raw_results = payload.get("results") if isinstance(payload, dict) else []
        summaries: list[ContentSummary] = []
        for row in raw_results or []:
            if not isinstance(row, dict):
                continue
            item = self._normalize_summary_and_persist(row, full_details=False)
            if content_type == ContentFilterType.DOCUMENTARY and not item.is_documentary:
                continue
            summaries.append(item)

        per_page = 20
        start = (page - 1) * per_page
        paged = summaries[start : start + per_page]
        total_pages = max(1, (len(summaries) + per_page - 1) // per_page) if summaries else 0

        res = ContentListResponse(
            page=page,
            results=paged,
            total_pages=total_pages,
            total_results=len(summaries),
            source="watchmode",
            cached=False,
        )
        if self._settings.cineverse_cache_enabled:
            self._cache.set(cache_key, res, ttl_seconds=600)
        return res

    async def get_content_details(
        self,
        content_or_watchmode_id: int,
        *,
        region: str | None = None,
        include_extras: bool = True,
    ) -> ContentDetail:
        """
        Fetch full title details using either canonical internal ID or Watchmode ID.
        Uses SQLite 24-hour cache first to avoid spending duplicate credits.
        """
        existing = self._db.get_content_by_any_id(content_or_watchmode_id)
        watchmode_id = (
            existing["watchmode_id"]
            if existing and existing.get("watchmode_id")
            else content_or_watchmode_id
        )

        cached_full = self._db.get_fresh_full_detail_by_watchmode_id(watchmode_id)
        if cached_full is not None:
            return self._dict_to_detail(cached_full)

        effective_region = (region or self._settings.watchmode_region or "IN").upper()
        params: dict[str, Any] = {"language": "en"}
        credit_cost = 1
        if include_extras:
            params["append_to_response"] = "sources,cast"
            params["regions"] = effective_region
            credit_cost = 3  # 1 base + 1 sources + 1 cast

        payload = await self._request(
            f"/title/{watchmode_id}/details",
            params=params,
            credit_cost=credit_cost,
        )
        if not isinstance(payload, dict) or not payload.get("id"):
            raise WatchmodeNotFoundError("Requested title was not found on Watchmode.")

        # Fetch seasons lazily if TV series/miniseries
        wm_type = (payload.get("type") or "").lower()
        if include_extras and wm_type.startswith("tv_") and wm_type != "tv_movie":
            try:
                seasons_raw = await self._request(
                    f"/title/{watchmode_id}/seasons",
                    credit_cost=1,
                )
                if isinstance(seasons_raw, list):
                    payload["seasons"] = seasons_raw
            except (WatchmodeAPIError, WatchmodeQuotaError, WatchmodeTimeoutError):
                payload["seasons"] = []

        summary = self._normalize_summary_and_persist(payload, full_details=include_extras)
        stored = self._db.get_content_by_any_id(summary.id)
        if stored is not None:
            return self._dict_to_detail(stored)
        return ContentDetail(**summary.model_dump())

    async def get_availability(
        self,
        content_or_watchmode_id: int,
        *,
        region: str | None = None,
    ) -> AvailabilityResponse:
        """Fetch streaming availability for a title in the requested region."""
        effective_region = (region or self._settings.watchmode_region or "IN").upper()
        detail = await self.get_content_details(
            content_or_watchmode_id,
            region=effective_region,
            include_extras=True,
        )
        watchmode_id = detail.watchmode_id or content_or_watchmode_id
        filtered = [
            s for s in detail.streaming_sources if not s.region or s.region.upper() == effective_region
        ]
        if not filtered and detail.streaming_sources:
            filtered = detail.streaming_sources
        elif not filtered:
            raw_sources = await self._request(
                f"/title/{watchmode_id}/sources",
                params={"regions": effective_region},
                credit_cost=1,
            )
            if isinstance(raw_sources, list):
                filtered = self._extract_sources(raw_sources)

        return AvailabilityResponse(
            content_id=detail.id,
            watchmode_id=watchmode_id,
            region=effective_region,
            sources=filtered,
        )

    async def get_seasons(self, content_or_watchmode_id: int) -> list[SeasonInfo]:
        existing = self._db.get_content_by_any_id(content_or_watchmode_id)
        watchmode_id = (
            existing["watchmode_id"]
            if existing and existing.get("watchmode_id")
            else content_or_watchmode_id
        )
        raw = await self._request(f"/title/{watchmode_id}/seasons", credit_cost=1)
        if not isinstance(raw, list):
            return []
        return self._extract_seasons(raw)

    async def get_episodes(
        self,
        content_or_watchmode_id: int,
        *,
        season: int | None = None,
        limit: int = 25,
        offset: int = 0,
    ) -> list[EpisodeInfo]:
        existing = self._db.get_content_by_any_id(content_or_watchmode_id)
        watchmode_id = (
            existing["watchmode_id"]
            if existing and existing.get("watchmode_id")
            else content_or_watchmode_id
        )
        params: dict[str, Any] = {
            "include_sources": "false",
            "limit": limit,
            "offset": offset,
        }
        if season is not None:
            params["season"] = season
        raw = await self._request(
            f"/title/{watchmode_id}/episodes",
            params=params,
            credit_cost=1,
        )
        if not isinstance(raw, list):
            return []
        return self._extract_episodes(raw)

    async def get_similar_content(
        self,
        content_or_watchmode_id: int,
        *,
        page: int = 1,
    ) -> ContentListResponse:
        """
        Return metadata-similar titles from Watchmode `similar_titles`,
        hydrating cached/minimal cards efficiently.
        """
        detail = await self.get_content_details(content_or_watchmode_id, include_extras=False)
        sim_ids = detail.similar_title_ids[:8]
        results: list[ContentSummary] = []

        for wm_id in sim_ids:
            try:
                sim_detail = await self.get_content_details(wm_id, include_extras=False)
                results.append(
                    ContentSummary(**sim_detail.model_dump(include=set(ContentSummary.model_fields)))
                )
            except (WatchmodeNotFoundError, WatchmodeQuotaError, WatchmodeAPIError, WatchmodeTimeoutError):
                continue

        return ContentListResponse(
            page=page,
            results=results,
            total_pages=1 if results else 0,
            total_results=len(results),
            source="watchmode_similar",
        )

    async def resolve_legacy_tmdb_id(
        self,
        tmdb_id: int,
        *,
        media_type: str = "movie",
    ) -> ContentSummary:
        """
        Bridge legacy TMDB IDs (bookmarks, `/movie/{id}` URLs) to canonical CINEVERSE IDs
        using local DB cache first, then Watchmode `/search` (`tmdb_movie_id` / `tmdb_tv_id`).
        """
        cached = self._db.get_by_legacy_tmdb_id(tmdb_id)
        if cached is not None:
            return self._dict_to_summary(cached)

        search_field = "tmdb_tv_id" if media_type == "tv" else "tmdb_movie_id"
        payload = await self._request(
            "/search",
            params={"search_field": search_field, "search_value": str(tmdb_id)},
            credit_cost=1,
        )
        matches = (payload.get("title_results") or []) if isinstance(payload, dict) else []
        if not matches:
            raise WatchmodeNotFoundError(
                f"No Watchmode title matched legacy TMDB ID {tmdb_id}."
            )

        first = matches[0]
        first["tmdb_id"] = first.get("tmdb_id") or tmdb_id
        wm_id = _safe_int(first.get("id"))
        if wm_id is not None:
            detail = await self.get_content_details(wm_id, include_extras=False)
            return ContentSummary(**detail.model_dump(include=set(ContentSummary.model_fields)))
        return self._normalize_summary_and_persist(first, full_details=False)
