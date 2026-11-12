"""Pydantic schemas for CINEVERSE product and admin analytics."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AnalyticsEventType = Literal[
    "content_viewed",
    "content_searched",
    "search_result_clicked",
    "watchlist_added",
    "watchlist_removed",
    "collection_created",
    "recommendation_displayed",
    "recommendation_clicked",
    "recommendation_feedback",
    "mira_conversation_started",
    "discover_filters_used",
    "streaming_availability_checked",
]


class AnalyticsEventRequest(BaseModel):
    event_type: AnalyticsEventType
    user_id: str | None = Field(default=None, max_length=100)
    session_id: str | None = Field(default=None, max_length=100)
    content_id: int | None = None
    title: str | None = Field(default=None, max_length=200)
    source_surface: str = Field(default="", max_length=80)
    dedupe_key: str = Field(default="", max_length=180)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalyticsBatchRequest(BaseModel):
    events: list[AnalyticsEventRequest] = Field(..., min_length=1, max_length=25)


class AnalyticsEventResponse(BaseModel):
    recorded: bool
    deduped: bool
    event_id: int | None = None
