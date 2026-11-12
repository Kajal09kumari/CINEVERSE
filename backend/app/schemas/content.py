"""
Provider-neutral Pydantic schemas for CINEVERSE content discovery.

Frontend components depend only on these canonical models — never on raw
Watchmode or legacy TMDB payload shapes.
"""

from enum import Enum
from pydantic import BaseModel, Field


class ContentType(str, Enum):
    """Application-level content classification."""

    MOVIE = "MOVIE"
    TV_SERIES = "TV_SERIES"
    DOCUMENTARY = "DOCUMENTARY"


class ContentFilterType(str, Enum):
    """Filter parameter supporting All, Movies, TV Series, or Documentaries."""

    ALL = "ALL"
    MOVIE = "MOVIE"
    TV_SERIES = "TV_SERIES"
    DOCUMENTARY = "DOCUMENTARY"


class SortByParam(str, Enum):
    """Supported sort orders mapped to Watchmode /list-titles & local enrichment."""

    POPULARITY_DESC = "popularity_desc"
    POPULARITY_ASC = "popularity_asc"
    RELEASE_DATE_DESC = "release_date_desc"
    RELEASE_DATE_ASC = "release_date_asc"
    TITLE_ASC = "title_asc"
    TITLE_DESC = "title_desc"
    RELEVANCE_DESC = "relevance_desc"
    RATING_DESC = "rating_desc"


WATCHMODE_SORT_MAP: dict[SortByParam, str] = {
    SortByParam.POPULARITY_DESC: "popularity_desc",
    SortByParam.POPULARITY_ASC: "popularity_asc",
    SortByParam.RELEASE_DATE_DESC: "release_date_desc",
    SortByParam.RELEASE_DATE_ASC: "release_date_asc",
    SortByParam.TITLE_ASC: "title_asc",
    SortByParam.TITLE_DESC: "title_desc",
    SortByParam.RELEVANCE_DESC: "relevance_desc",
    SortByParam.RATING_DESC: "popularity_desc",
}


class GenreItem(BaseModel):
    """Normalized content genre."""

    id: int
    name: str


class GenreListResponse(BaseModel):
    """Supported genres returned by Watchmode /genres."""

    genres: list[GenreItem] = Field(default_factory=list)


class StreamingSource(BaseModel):
    """Streaming availability entry for a region."""

    source_id: int
    name: str
    type: str = ""  # sub | rent | buy | free | tve
    region: str = ""
    web_url: str | None = None
    ios_url: str | None = None
    android_url: str | None = None
    format: str | None = None
    price: float | None = None


class CastMember(BaseModel):
    """Cast or crew credit entry."""

    person_id: int | None = None
    type: str = "Cast"
    full_name: str
    role: str | None = None
    order: int | None = None
    headshot_url: str | None = None


class SeasonInfo(BaseModel):
    """TV series season summary."""

    id: int
    number: int | None = None
    name: str | None = None
    overview: str | None = None
    air_date: str | None = None
    episode_count: int | None = None
    poster_url: str | None = None


class EpisodeInfo(BaseModel):
    """TV series episode summary."""

    id: int
    name: str | None = None
    season_number: int | None = None
    episode_number: int | None = None
    release_date: str | None = None
    runtime_minutes: int | None = None
    overview: str | None = None
    thumbnail_url: str | None = None
    sources: list[StreamingSource] = Field(default_factory=list)


class ContentSummary(BaseModel):
    """Canonical normalized summary for movies, TV series, and documentaries."""

    id: int
    watchmode_id: int | None = None
    imdb_id: str | None = None
    legacy_tmdb_id: int | None = None
    title: str
    original_title: str | None = None
    content_type: ContentType = ContentType.MOVIE
    watchmode_type: str | None = None
    is_documentary: bool = False
    release_year: int | None = None
    release_date: str | None = None
    description: str | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    genres: list[str] = Field(default_factory=list)
    genre_ids: list[int] = Field(default_factory=list)
    runtime: int | None = None
    rating: float | None = None
    rating_source: str | None = None
    popularity: float | None = None
    language: str | None = None
    country: str | None = None
    last_synced_at: str | None = None


class ContentDetail(ContentSummary):
    """Full canonical content details including cast, availability, and series seasons."""

    cast: list[CastMember] = Field(default_factory=list)
    directors: list[str] = Field(default_factory=list)
    streaming_sources: list[StreamingSource] = Field(default_factory=list)
    seasons: list[SeasonInfo] = Field(default_factory=list)
    episodes: list[EpisodeInfo] = Field(default_factory=list)
    similar_title_ids: list[int] = Field(default_factory=list)
    trailer_url: str | None = None
    attribution: str = "Streaming availability & title metadata powered by Watchmode.com"


class ContentListResponse(BaseModel):
    """Paginated normalized content response."""

    page: int = 1
    results: list[ContentSummary] = Field(default_factory=list)
    total_pages: int = 1
    total_results: int = 0
    source: str = "watchmode"
    attribution: str = "Powered by Watchmode.com"
    cached: bool = False


class AvailabilityResponse(BaseModel):
    """Region-filtered streaming sources for a title."""

    content_id: int
    watchmode_id: int
    region: str
    sources: list[StreamingSource] = Field(default_factory=list)
    attribution: str = "Streaming availability powered by Watchmode.com"


class QuotaStatusResponse(BaseModel):
    """Watchmode API monthly quota and local session usage."""

    configured: bool
    quota: int | None = None
    quota_used: int | None = None
    local_credits_recorded: int = 0
    cache_enabled: bool = True
