"""Service layer for privacy-safe analytics tracking and admin dashboard aggregation."""

from __future__ import annotations

from typing import Any

from app.db.database import get_db_manager

ALLOWED_ANALYTICS_EVENTS = frozenset(
    {
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
    }
)


def track_product_event(
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    content_id: int | None = None,
    title: str | None = None,
    source_surface: str = "",
    dedupe_key: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Record a single validated analytics event in SQLite."""
    if event_type not in ALLOWED_ANALYTICS_EVENTS:
        raise ValueError(f"Unsupported analytics event_type: {event_type}")
    db = get_db_manager()
    return db.record_analytics_event(
        event_type=event_type,
        user_id=user_id,
        session_id=session_id,
        content_id=content_id,
        title=title,
        source_surface=source_surface,
        dedupe_key=dedupe_key,
        metadata=metadata,
    )


def track_product_event_safe(
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    content_id: int | None = None,
    title: str | None = None,
    source_surface: str = "",
    dedupe_key: str = "",
    metadata: dict[str, Any] | None = None,
) -> None:
    """Best-effort event recording so analytics errors never break user flows."""
    try:
        track_product_event(
            event_type=event_type,
            user_id=user_id,
            session_id=session_id,
            content_id=content_id,
            title=title,
            source_surface=source_surface,
            dedupe_key=dedupe_key,
            metadata=metadata,
        )
    except Exception:
        return


def get_admin_analytics_summary(range_key: str = "7d") -> dict[str, Any]:
    """Return real database-backed analytics summary for the requested window."""
    range_map: dict[str, int | None] = {
        "24h": 1,
        "7d": 7,
        "30d": 30,
        "all": None,
    }
    normalized = (range_key or "7d").strip().lower()
    days = range_map.get(normalized, 7)
    db = get_db_manager()
    summary = db.get_admin_analytics(days=days)
    summary["range"] = normalized if normalized in range_map else "7d"
    return summary
