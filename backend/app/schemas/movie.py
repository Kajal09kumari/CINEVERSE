"""
Pydantic schemas for movie discovery endpoints.

Defines clean, validated request parameters and response models
for TMDB-backed movie routes.
"""

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class SortByParam(str, Enum):
    """Supported sort options for movie discovery."""

    POPULARITY = "popularity"
    POPULARITY_DESC = "popularity.desc"
    POPULARITY_ASC = "popularity.asc"
    RATING = "rating"
    VOTE_AVERAGE_DESC = "vote_average.desc"
    VOTE_AVERAGE_ASC = "vote_average.asc"
    RELEASE_DATE = "release_date"
    RELEASE_DATE_DESC = "primary_release_date.desc"
    RELEASE_DATE_ASC = "primary_release_date.asc"
    TITLE = "title"
    TITLE_ASC = "title.asc"
    TITLE_DESC = "title.desc"


SORT_BY_MAP: dict[SortByParam, str] = {
    SortByParam.POPULARITY: "popularity.desc",
    SortByParam.POPULARITY_DESC: "popularity.desc",
    SortByParam.POPULARITY_ASC: "popularity.asc",
    SortByParam.RATING: "vote_average.desc",
    SortByParam.VOTE_AVERAGE_DESC: "vote_average.desc",
    SortByParam.VOTE_AVERAGE_ASC: "vote_average.asc",
    SortByParam.RELEASE_DATE: "primary_release_date.desc",
    SortByParam.RELEASE_DATE_DESC: "primary_release_date.desc",
    SortByParam.RELEASE_DATE_ASC: "primary_release_date.asc",
    SortByParam.TITLE: "title.asc",
    SortByParam.TITLE_ASC: "title.asc",
    SortByParam.TITLE_DESC: "title.desc",
}


class Genre(BaseModel):
    """TMDB genre object."""

    id: int
    name: str


class MovieSummary(BaseModel):
    """Normalized movie summary returned by trending, popular, search, and discover endpoints."""

    id: int
    title: str
    overview: str = ""
    poster_path: str | None = None
    backdrop_path: str | None = None
    release_date: str = ""
    vote_average: float = 0.0
    vote_count: int = 0
    genre_ids: list[int] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    original_language: str = ""
    popularity: float = 0.0
    adult: bool = False


class MovieDetail(BaseModel):
    """Full movie metadata returned by GET /api/movies/{movie_id}."""

    id: int
    title: str
    overview: str = ""
    tagline: str = ""
    poster_path: str | None = None
    backdrop_path: str | None = None
    release_date: str = ""
    runtime: int | None = None
    vote_average: float = 0.0
    vote_count: int = 0
    original_language: str = ""
    popularity: float = 0.0
    status: str = ""
    budget: int = 0
    revenue: int = 0
    homepage: str | None = None
    imdb_id: str | None = None
    genres: list[Genre] = Field(default_factory=list)
    production_countries: list[dict[str, Any]] = Field(default_factory=list)
    spoken_languages: list[dict[str, Any]] = Field(default_factory=list)


class MovieListResponse(BaseModel):
    """Paginated movie collection response."""

    page: int = 1
    results: list[MovieSummary] = Field(default_factory=list)
    total_pages: int = 1
    total_results: int = 0
    source: str = "tmdb"


class GenreListResponse(BaseModel):
    """List of official TMDB movie genres."""

    genres: list[Genre] = Field(default_factory=list)
