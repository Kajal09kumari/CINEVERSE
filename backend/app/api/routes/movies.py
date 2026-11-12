"""
Backwards-compatible `/api/movies/*` routes now backed by WatchmodeService.

Preserves compatibility for existing consumers during migration while
routing zero requests to TMDB. New features should call `/api/content/*`.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.routes.content import _handle_watchmode_call, get_watchmode_service
from app.schemas.content import ContentDetail, ContentListResponse, ContentSummary, SortByParam as ContentSortBy
from app.schemas.movie import (
    Genre,
    GenreListResponse,
    MovieDetail,
    MovieListResponse,
    MovieSummary,
    SortByParam,
)
from app.services.watchmode_service import WatchmodeService

router = APIRouter(prefix="/api/movies", tags=["Movies (Legacy Compatibility)"])

LEGACY_SORT_TO_CONTENT_SORT: dict[SortByParam, ContentSortBy] = {
    SortByParam.POPULARITY: ContentSortBy.POPULARITY_DESC,
    SortByParam.POPULARITY_DESC: ContentSortBy.POPULARITY_DESC,
    SortByParam.POPULARITY_ASC: ContentSortBy.POPULARITY_ASC,
    SortByParam.RATING: ContentSortBy.RATING_DESC,
    SortByParam.VOTE_AVERAGE_DESC: ContentSortBy.RATING_DESC,
    SortByParam.VOTE_AVERAGE_ASC: ContentSortBy.POPULARITY_ASC,
    SortByParam.RELEASE_DATE: ContentSortBy.RELEASE_DATE_DESC,
    SortByParam.RELEASE_DATE_DESC: ContentSortBy.RELEASE_DATE_DESC,
    SortByParam.RELEASE_DATE_ASC: ContentSortBy.RELEASE_DATE_ASC,
    SortByParam.TITLE: ContentSortBy.TITLE_ASC,
    SortByParam.TITLE_ASC: ContentSortBy.TITLE_ASC,
    SortByParam.TITLE_DESC: ContentSortBy.TITLE_DESC,
}


def _to_movie_summary(item: ContentSummary) -> MovieSummary:
    return MovieSummary(
        id=item.id,
        title=item.title,
        overview=item.description or "",
        poster_path=item.poster_url,
        backdrop_path=item.backdrop_url,
        release_date=item.release_date or (f"{item.release_year}-01-01" if item.release_year else ""),
        vote_average=item.rating or 0.0,
        vote_count=0,
        genre_ids=item.genre_ids,
        genres=item.genres,
        original_language=item.language or "",
        popularity=item.popularity or 0.0,
    )


def _to_movie_list(res: ContentListResponse) -> MovieListResponse:
    return MovieListResponse(
        page=res.page,
        results=[_to_movie_summary(item) for item in res.results],
        total_pages=res.total_pages,
        total_results=res.total_results,
        source=res.source,
    )


def _to_movie_detail(item: ContentDetail) -> MovieDetail:
    return MovieDetail(
        id=item.id,
        title=item.title,
        overview=item.description or "",
        tagline="",
        poster_path=item.poster_url,
        backdrop_path=item.backdrop_url,
        release_date=item.release_date or (f"{item.release_year}-01-01" if item.release_year else ""),
        runtime=item.runtime,
        vote_average=item.rating or 0.0,
        vote_count=0,
        original_language=item.language or "",
        popularity=item.popularity or 0.0,
        status="",
        budget=0,
        revenue=0,
        homepage=None,
        imdb_id=item.imdb_id,
        genres=[Genre(id=idx, name=name) for idx, name in enumerate(item.genres, start=1)],
    )


@router.get("/trending", response_model=MovieListResponse)
async def get_trending_movies(
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    res = await _handle_watchmode_call(lambda: wm.get_trending(page=page))
    return _to_movie_list(res)


@router.get("/popular", response_model=MovieListResponse)
async def get_popular_movies(
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    res = await _handle_watchmode_call(lambda: wm.get_popular(page=page))
    return _to_movie_list(res)


@router.get("/search", response_model=MovieListResponse)
async def search_movies(
    query: str = Query(..., min_length=1, max_length=200),
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    cleaned = query.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query must not be empty.",
        )
    res = await _handle_watchmode_call(lambda: wm.search_content(query=cleaned, page=page))
    return _to_movie_list(res)


@router.get("/genres", response_model=GenreListResponse)
async def get_movie_genres(
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> GenreListResponse:
    res = await _handle_watchmode_call(lambda: wm.get_genres())
    return GenreListResponse(genres=[Genre(id=g.id, name=g.name) for g in res.genres])


@router.get("/discover", response_model=MovieListResponse)
async def discover_movies(
    genre: str | None = Query(None, max_length=100, pattern=r"^[0-9,|]+$"),
    language: str | None = Query(None, min_length=2, max_length=5, pattern=r"^[a-zA-Z]+$"),
    year: int | None = Query(None, ge=1888, le=2035),
    min_rating: float | None = Query(None, ge=0.0, le=10.0),
    min_votes: int | None = Query(None, ge=0, le=100000),
    max_votes: int | None = Query(None, ge=1, le=1000000),
    sort_by: SortByParam = Query(SortByParam.POPULARITY_DESC),
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    if min_votes is not None and max_votes is not None and min_votes > max_votes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_votes cannot exceed max_votes.",
        )
    normalized_genres = genre.replace("|", ",") if genre else None
    res = await _handle_watchmode_call(
        lambda: wm.discover_content(
            genres=normalized_genres,
            language=language,
            year=year,
            min_rating=min_rating,
            sort_by=LEGACY_SORT_TO_CONTENT_SORT[sort_by],
            page=page,
        )
    )
    return _to_movie_list(res)


@router.get("/genre/{genre_id}", response_model=MovieListResponse)
async def get_movies_by_genre(
    genre_id: int = Path(..., gt=0),
    page: int = Query(1, ge=1, le=50),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    res = await _handle_watchmode_call(
        lambda: wm.discover_content(genres=str(genre_id), page=page)
    )
    return _to_movie_list(res)


@router.get("/{movie_id}", response_model=MovieDetail)
async def get_movie_details(
    movie_id: int = Path(..., gt=0),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieDetail:
    detail = await _handle_watchmode_call(lambda: wm.get_content_details(movie_id))
    return _to_movie_detail(detail)


@router.get("/{movie_id}/similar", response_model=MovieListResponse)
async def get_similar_movies(
    movie_id: int = Path(..., gt=0),
    page: int = Query(1, ge=1, le=10),
    wm: WatchmodeService = Depends(get_watchmode_service),
) -> MovieListResponse:
    res = await _handle_watchmode_call(lambda: wm.get_similar_content(movie_id, page=page))
    return _to_movie_list(res)
