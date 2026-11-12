"""
Schemas for CINEVERSE Library, Preferences, Feedback, ML Recommendations, and MIRA AI.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.content import ContentType

FeedbackType = Literal[
    "like",
    "dislike",
    "not_interested",
    "already_watched",
    "more_like_this",
    "less_like_this",
]


# ---------------------------------------------------------------------------
# Watchlist & Collections
# ---------------------------------------------------------------------------


class WatchlistItemPayload(BaseModel):
    content_id: int
    title: str = Field(..., min_length=1, max_length=250)
    content_type: ContentType = ContentType.MOVIE
    poster_url: str | None = None
    release_year: int | None = None
    rating: float | None = None
    legacy_tmdb_id: int | None = None


class WatchlistBulkSyncPayload(BaseModel):
    items: list[WatchlistItemPayload] = Field(default_factory=list)


class WatchlistItemOut(BaseModel):
    id: int | None = None
    content_id: int
    title: str
    content_type: ContentType = ContentType.MOVIE
    poster_url: str | None = None
    release_year: int | None = None
    rating: float | None = None
    genres: list[str] = Field(default_factory=list)
    is_documentary: bool = False
    added_at: str | None = None


class WatchlistResponse(BaseModel):
    user_id: str
    total: int
    items: list[WatchlistItemOut]


class CollectionCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class CollectionItemAddPayload(BaseModel):
    content_id: int


class CollectionItemOut(BaseModel):
    content_id: int
    title: str
    content_type: ContentType = ContentType.MOVIE
    poster_url: str | None = None
    release_year: int | None = None
    rating: float | None = None
    genres: list[str] = Field(default_factory=list)
    is_documentary: bool = False
    added_at: str | None = None


class CollectionOut(BaseModel):
    id: int
    name: str
    description: str = ""
    created_at: str
    item_count: int
    items: list[CollectionItemOut] = Field(default_factory=list)


class CollectionListResponse(BaseModel):
    user_id: str
    collections: list[CollectionOut]


# ---------------------------------------------------------------------------
# Ratings, Preferences & Feedback
# ---------------------------------------------------------------------------


class RatingPayload(BaseModel):
    content_id: int
    rating: float = Field(..., ge=0.5, le=10.0)


class RatingEntryOut(BaseModel):
    content_id: int
    rating: float
    rated_at: str
    title: str | None = None
    content_type: str | None = None
    poster_url: str | None = None
    release_year: int | None = None
    genres: list[str] = Field(default_factory=list)


class PreferencesPayload(BaseModel):
    preferred_genres: list[str] | None = None
    disliked_genres: list[str] | None = None
    preferred_types: list[str] | None = None
    preferred_languages: list[str] | None = None
    min_rating: float | None = Field(default=None, ge=0.0, le=10.0)
    favorite_themes: list[str] | None = None
    preferred_era: str | None = None
    onboarding_completed: bool | None = None
    discovery_openness: float | None = Field(default=None, ge=0.0, le=1.0)


class PreferencesOut(BaseModel):
    user_id: str
    preferred_genres: list[str]
    disliked_genres: list[str]
    preferred_types: list[str]
    preferred_languages: list[str]
    min_rating: float | None = None
    favorite_themes: list[str] = Field(default_factory=list)
    preferred_era: str = ""
    onboarding_completed: bool = False
    discovery_openness: float = 0.35
    updated_at: str | None = None


class FeedbackPayload(BaseModel):
    feedback_type: FeedbackType
    content_id: int | None = None
    movielens_movie_id: int | None = None
    title: str = Field(default="", max_length=250)
    reason: str = Field(default="", max_length=300)
    session_id: str | None = None
    user_id: str = Field(default="local-default", max_length=100)


class FeedbackRecordOut(BaseModel):
    id: int
    feedback_type: str
    content_id: int | None = None
    movielens_movie_id: int | None = None
    title: str = ""
    reason: str = ""
    created_at: str


class FeedbackResponse(BaseModel):
    recorded: FeedbackRecordOut
    profile_note: str


# ---------------------------------------------------------------------------
# Hybrid ML Recommendations
# ---------------------------------------------------------------------------


class RecommendedTitleCard(BaseModel):
    content_id: int | None = None
    movielens_id: int | None = None
    imdb_id: str | None = None
    title: str
    content_type: ContentType = ContentType.MOVIE
    is_documentary: bool = False
    release_year: int | None = None
    poster_url: str | None = None
    description: str | None = None
    genres: list[str] = Field(default_factory=list)
    rating: float | None = None
    rating_source: str | None = None
    runtime: int | None = None
    streaming_platforms: list[str] = Field(default_factory=list)
    hybrid_score: float = 0.0
    explanation: str
    source: str = "movielens_hybrid"
    community_tags: list[str] = Field(default_factory=list)


class RecommendationResponse(BaseModel):
    mode: str
    is_cold_start: bool = False
    dataset_stats: dict[str, Any] = Field(default_factory=dict)
    evaluation_metrics: dict[str, Any] = Field(default_factory=dict)
    results: list[RecommendedTitleCard]


# ---------------------------------------------------------------------------
# MIRA Conversational Assistant
# ---------------------------------------------------------------------------


class MiraParsedConstraints(BaseModel):
    intent: str = "general_discovery"
    content_type: str = "ALL"
    genres: list[str] = Field(default_factory=list)
    exclude_genres: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    seed_titles: list[str] = Field(default_factory=list)
    min_rating: float | None = None
    year_min: int | None = None
    year_max: int | None = None
    max_runtime: int | None = None
    language: str | None = None
    underrated: bool = False
    surprise_different: bool = False
    use_watchlist: bool = False
    region: str | None = None


class MiraChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1200)
    session_id: str = Field(default="default-mira-session", max_length=100)
    user_id: str = Field(default="local-default", max_length=100)
    region: str | None = None
    top_k: int = Field(default=6, ge=1, le=12)


class MiraChatResponse(BaseModel):
    session_id: str
    reply: str
    follow_up_question: str | None = None
    quick_refinements: list[str] = Field(default_factory=list)
    constraints: MiraParsedConstraints
    recommendations: list[RecommendedTitleCard] = Field(default_factory=list)
    used_llm: bool = False


class MiraMessageOut(BaseModel):
    id: int | None = None
    role: Literal["user", "assistant"]
    content: str
    created_at: str
    constraints: dict[str, Any] | None = None
    recommendations: list[RecommendedTitleCard] = Field(default_factory=list)
    follow_up_question: str | None = None
    quick_refinements: list[str] = Field(default_factory=list)


class MiraSessionHistoryResponse(BaseModel):
    session_id: str
    user_id: str
    state: dict[str, Any]
    messages: list[MiraMessageOut]


# ---------------------------------------------------------------------------
# Day 5: Taste DNA, Interaction History, Onboarding & Adaptive Homepage
# ---------------------------------------------------------------------------


InteractionType = Literal["viewed", "progress", "mira_clicked"]


class InteractionPayload(BaseModel):
    user_id: str = Field(default="local-default", max_length=100)
    content_id: int | None = None
    movielens_movie_id: int | None = None
    title: str = Field(default="", max_length=250)
    content_type: str = Field(default="", max_length=40)
    genres: list[str] = Field(default_factory=list)
    interaction_type: InteractionType = "viewed"
    progress_pct: float = Field(default=0.0, ge=0.0, le=100.0)


class InteractionOut(BaseModel):
    id: int | None = None
    user_id: str
    content_id: int | None = None
    movielens_movie_id: int | None = None
    title: str = ""
    content_type: str = ""
    genres: list[str] = Field(default_factory=list)
    interaction_type: str = "viewed"
    progress_pct: float = 0.0
    created_at: str = ""


class OnboardingPayload(BaseModel):
    user_id: str = Field(default="local-default", max_length=100)
    preferred_genres: list[str] = Field(default_factory=list)
    disliked_genres: list[str] = Field(default_factory=list)
    preferred_types: list[str] = Field(default_factory=lambda: ["MOVIE", "TV_SERIES", "DOCUMENTARY"])
    preferred_languages: list[str] = Field(default_factory=list)
    favorite_themes: list[str] = Field(default_factory=list)
    preferred_era: str = ""
    min_rating: float = Field(default=6.5, ge=0.0, le=10.0)
    discovery_openness: float = Field(default=0.35, ge=0.0, le=1.0)


class GenreAffinityItem(BaseModel):
    genre: str
    score: float = Field(..., ge=0.0, le=100.0)
    signal_count: int = 0


class PersonAffinityItem(BaseModel):
    name: str
    role: Literal["director", "actor"]
    score: float = 0.0
    titles: list[str] = Field(default_factory=list)


class LanguageShareItem(BaseModel):
    language: str
    count: int


class ReleaseYearPreference(BaseModel):
    average_year: int | None = None
    min_year: int | None = None
    max_year: int | None = None
    label: str = "Not enough data"


class TasteDnaProfile(BaseModel):
    user_id: str
    has_sufficient_data: bool = False
    onboarding_completed: bool = False
    signal_summary: dict[str, int] = Field(default_factory=dict)
    top_genres: list[str] = Field(default_factory=list)
    genre_affinity_scores: list[GenreAffinityItem] = Field(default_factory=list)
    disliked_genres: list[str] = Field(default_factory=list)
    preferred_content_types: list[str] = Field(default_factory=list)
    content_type_breakdown: dict[str, int] = Field(default_factory=dict)
    preferred_languages: list[str] = Field(default_factory=list)
    language_breakdown: list[LanguageShareItem] = Field(default_factory=list)
    favorite_actors: list[PersonAffinityItem] = Field(default_factory=list)
    favorite_directors: list[PersonAffinityItem] = Field(default_factory=list)
    favorite_themes: list[str] = Field(default_factory=list)
    release_year_preference: ReleaseYearPreference = Field(default_factory=ReleaseYearPreference)
    average_user_rating: float | None = None
    discovery_patterns: list[str] = Field(default_factory=list)
    preference_summary: str = ""
    exploration_openness: float = 0.35
    updated_at: str | None = None


class HomeSectionItem(BaseModel):
    section_id: str
    title: str
    subtitle: str
    items: list[RecommendedTitleCard] = Field(default_factory=list)


class AdaptiveHomepageResponse(BaseModel):
    user_id: str
    has_sufficient_data: bool = False
    show_onboarding: bool = True
    taste_dna_summary: str = ""
    top_genres: list[str] = Field(default_factory=list)
    sections: list[HomeSectionItem] = Field(default_factory=list)
    continue_exploring: list[dict[str, Any]] = Field(default_factory=list)

