"""Public analytics ingestion routes and admin-protected dashboard routes."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.config import settings
from app.schemas.analytics import (
    AnalyticsBatchRequest,
    AnalyticsEventRequest,
    AnalyticsEventResponse,
)
from app.services.analytics_service import (
    get_admin_analytics_summary,
    track_product_event,
)

router = APIRouter()


def verify_admin_api_key(
    x_admin_key: Annotated[str | None, Header(alias="X-Admin-Key")] = None,
) -> str:
    """Fail-closed admin authentication using constant-time key comparison."""
    if not settings.has_admin_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin analytics access is not configured on the server.",
        )
    if not x_admin_key or not secrets.compare_digest(
        x_admin_key.strip(), settings.admin_api_key.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin credentials.",
        )
    return "admin"


@router.post("/api/analytics/event", response_model=AnalyticsEventResponse)
async def ingest_analytics_event(payload: AnalyticsEventRequest) -> AnalyticsEventResponse:
    """Record a single privacy-safe product analytics event."""
    result = track_product_event(
        event_type=payload.event_type,
        user_id=payload.user_id,
        session_id=payload.session_id,
        content_id=payload.content_id,
        title=payload.title,
        source_surface=payload.source_surface,
        dedupe_key=payload.dedupe_key,
        metadata=payload.metadata,
    )
    return AnalyticsEventResponse(**result)


@router.post("/api/analytics/events/batch")
async def ingest_analytics_batch(payload: AnalyticsBatchRequest) -> dict:
    """Record a batch of product analytics events."""
    recorded = 0
    deduped = 0
    for event in payload.events:
        res = track_product_event(
            event_type=event.event_type,
            user_id=event.user_id,
            session_id=event.session_id,
            content_id=event.content_id,
            title=event.title,
            source_surface=event.source_surface,
            dedupe_key=event.dedupe_key,
            metadata=event.metadata,
        )
        if res.get("recorded"):
            recorded += 1
        elif res.get("deduped"):
            deduped += 1
    return {"recorded": recorded, "deduped": deduped, "total": len(payload.events)}


@router.get("/api/admin/analytics")
async def get_admin_analytics(
    range: str = Query(default="7d", pattern="^(24h|7d|30d|all)$"),
    _admin: str = Depends(verify_admin_api_key),
) -> dict:
    """Return real database-backed platform, content, recommendation, and MIRA analytics."""
    return get_admin_analytics_summary(range_key=range)
