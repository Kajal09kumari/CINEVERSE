"""
Provider-neutral content discovery routes (`/api/content/*`) backed by WatchmodeService.
"""

from collections.abc import Awaitable, Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status

from app.schemas.content import (
    AvailabilityResponse,
    ContentDetail,
    ContentFilterType,
    ContentListResponse,
    EpisodeInfo,
    GenreListResponse,
    QuotaStatusResponse,
    SeasonInfo,
    SortByParam,
    ContentSummary,
)
from app.services.watchmode_service import (
    WatchmodeAPIError,
    WatchmodeAuthError,
    WatchmodeConfigError,
    WatchmodeNotFoundError,
    WatchmodeQuotaError,
    WatchmodeService,
    WatchmodeTimeoutError,
)

router = APIRouter(prefix="/api/content", tags=["Content"])

T = TypeVar("T")


def get_watchmode_service(request: Request) -> WatchmodeService:
    """Provide the shared WatchmodeService instance from app state."""
    service = getattr(request.app.state, "watchmode_service", None)
    if service is None:
        service = WatchmodeService()
        request.app.state.watchmode_service = service
    return service


async def _handle_watchmode_call(call: Callable[[], Awaitable[T]]) -> T:
    """Translate domain Watchmode exceptions into clear, sanitized HTTP responses."""
    try:
        return await call()
    except WatchmodeConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except WatchmodeAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except WatchmodeQuotaError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except WatchmodeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except WatchmodeTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except WatchmodeAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@router.get("/quota", response_model=QuotaStatusResponse)
async def get_quota_status(
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> QuotaStatusResponse:
    """Inspect Watchmode monthly quota status (0 credits) and local session usage."""
    return await _handle_watchmode_call(lambda: wm.get_quota_status())


@router.get("/genres", response_model=GenreListResponse)
async def list_genres(
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> GenreListResponse:
    """Fetch official Watchmode content genres (cached 24 hours)."""
    return await _handle_watchmode_call(lambda: wm.get_genres())


@router.get("/trending", response_model=ContentListResponse)
async def get_trending_content(
    page: int = Query(1, ge=1, le=50),
    content_type: ContentFilterType = Query(ContentFilterType.ALL),
    region: str | None = Query(None, min_length=2, max_length=2),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Fetch popularity-ranked titles from Watchmode."""
    return await _handle_watchmode_call(
        lambda: wm.get_trending(page=page, content_type=content_type, region=region)
    )


@router.get("/popular", response_model=ContentListResponse)
async def get_popular_content(
    page: int = Query(1, ge=1, le=50),
    content_type: ContentFilterType = Query(ContentFilterType.MOVIE),
    region: str | None = Query(None, min_length=2, max_length=2),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Fetch popular highly rated films or series from Watchmode."""
    return await _handle_watchmode_call(
        lambda: wm.get_popular(page=page, content_type=content_type, region=region)
    )


@router.get("/search", response_model=ContentListResponse)
async def search_content(
    query: str = Query(..., min_length=1, max_length=120),
    content_type: ContentFilterType = Query(ContentFilterType.ALL),
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Search Watchmode titles by query string."""
    cleaned = query.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query must not be empty.",
        )
    return await _handle_watchmode_call(
        lambda: wm.search_content(query=cleaned, content_type=content_type, page=page)
    )


@router.get("/discover", response_model=ContentListResponse)
async def discover_content(
    content_type: ContentFilterType = Query(ContentFilterType.ALL),
    genre: str | None = Query(None, pattern=r"^[\d,]+$"),
    language: str | None = Query(None, min_length=2, max_length=5, pattern=r"^[a-zA-Z]+$"),
    year: int | None = Query(None, ge=1900, le=2030),
    min_rating: float | None = Query(None, ge=0.0, le=10.0),
    sort_by: SortByParam = Query(SortByParam.POPULARITY_DESC),
    region: str | None = Query(None, min_length=2, max_length=2),
    page: int = Query(1, ge=1, le=50),
    limit: int = Query(20, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Discover movies, TV series, and documentaries with combined filters."""
    return await _handle_watchmode_call(
        lambda: wm.discover_content(
            content_type=content_type,
            genres=genre,
            language=language,
            year=year,
            min_rating=min_rating,
            sort_by=sort_by,
            region=region,
            page=page,
            limit=limit,
        )
    )


@router.get("/genre/{genre_id}", response_model=ContentListResponse)
async def get_by_genre(
    genre_id: int = Path(..., gt=0),
    content_type: ContentFilterType = Query(ContentFilterType.ALL),
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Discover content filtered by a Watchmode genre ID."""
    return await _handle_watchmode_call(
        lambda: wm.discover_content(
            content_type=content_type,
            genres=str(genre_id),
            page=page,
        )
    )


@router.get("/resolve-legacy/tmdb/{tmdb_id}", response_model=ContentSummary)
async def resolve_legacy_tmdb(
    tmdb_id: int = Path(..., gt=0),
    media_type: str = Query("movie", pattern=r"^(movie|tv)$"),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentSummary:
    """Bridge legacy TMDB IDs to canonical CINEVERSE content records."""
    return await _handle_watchmode_call(
        lambda: wm.resolve_legacy_tmdb_id(tmdb_id, media_type=media_type)
    )


@router.get("/{content_id}", response_model=ContentDetail)
async def get_content_details(
    content_id: int = Path(..., gt=0),
    region: str | None = Query(None, min_length=2, max_length=2),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentDetail:
    """Fetch unified movie/TV/documentary details by canonical or Watchmode ID."""
    return await _handle_watchmode_call(
        lambda: wm.get_content_details(content_id, region=region, include_extras=True)
    )


@router.get("/{content_id}/similar", response_model=ContentListResponse)
async def get_similar_content(
    content_id: int = Path(..., gt=0),
    page: int = Query(1, ge=1, le=10),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> ContentListResponse:
    """Fetch Watchmode metadata-similar titles."""
    return await _handle_watchmode_call(
        lambda: wm.get_similar_content(content_id, page=page)
    )


@router.get("/{content_id}/availability", response_model=AvailabilityResponse)
async def get_content_availability(
    content_id: int = Path(..., gt=0),
    region: str | None = Query(None, min_length=2, max_length=2),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> AvailabilityResponse:
    """Fetch region-filtered streaming availability sources."""
    return await _handle_watchmode_call(
        lambda: wm.get_availability(content_id, region=region)
    )


@router.get("/{content_id}/seasons", response_model=list[SeasonInfo])
async def get_content_seasons(
    content_id: int = Path(..., gt=0),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> list[SeasonInfo]:
    """Fetch seasons for a TV series or miniseries."""
    return await _handle_watchmode_call(lambda: wm.get_seasons(content_id))


@router.get("/{content_id}/episodes", response_model=list[EpisodeInfo])
async def get_content_episodes(
    content_id: int = Path(..., gt=0),
    season: int | None = Query(None, ge=0),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> list[EpisodeInfo]:
    """Fetch episodes for a TV series or miniseries."""
    return await _handle_watchmode_call(
        lambda: wm.get_episodes(content_id, season=season, limit=limit, offset=offset)
    )
