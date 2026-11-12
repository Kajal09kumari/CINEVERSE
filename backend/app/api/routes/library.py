"""
Library, Watchlist, Collections, User Ratings & Preferences API Routes
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db.database import DatabaseManager, get_db_manager
from app.schemas.recommendations import (
    CollectionCreatePayload,
    CollectionItemAddPayload,
    CollectionListResponse,
    CollectionOut,
    PreferencesOut,
    PreferencesPayload,
    RatingEntryOut,
    RatingPayload,
    WatchlistBulkSyncPayload,
    WatchlistItemOut,
    WatchlistItemPayload,
    WatchlistResponse,
)

router = APIRouter(prefix="/api/library", tags=["Library"])


def get_db() -> DatabaseManager:
    return get_db_manager()


# ---------------------------------------------------------------------------
# Watchlist
# ---------------------------------------------------------------------------


@router.get("/watchlist", response_model=WatchlistResponse)
async def list_watchlist(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> WatchlistResponse:
    rows = db.list_watchlist(user_id)
    items = [WatchlistItemOut(**r) for r in rows]
    return WatchlistResponse(user_id=user_id, total=len(items), items=items)


@router.post("/watchlist", response_model=WatchlistItemOut, status_code=status.HTTP_200_OK)
async def add_to_watchlist(
    payload: WatchlistItemPayload,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> WatchlistItemOut:
    saved = db.upsert_watchlist_item(
        user_id=user_id,
        content_id=payload.content_id,
        title=payload.title,
        content_type=payload.content_type.value,
        poster_url=payload.poster_url,
        release_year=payload.release_year,
        rating=payload.rating,
        legacy_tmdb_id=payload.legacy_tmdb_id,
    )
    return WatchlistItemOut(**saved)


@router.post("/watchlist/sync", response_model=WatchlistResponse)
async def sync_watchlist(
    payload: WatchlistBulkSyncPayload,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> WatchlistResponse:
    for entry in payload.items:
        db.upsert_watchlist_item(
            user_id=user_id,
            content_id=entry.content_id,
            title=entry.title,
            content_type=entry.content_type.value,
            poster_url=entry.poster_url,
            release_year=entry.release_year,
            rating=entry.rating,
            legacy_tmdb_id=entry.legacy_tmdb_id,
        )
    rows = db.list_watchlist(user_id)
    items = [WatchlistItemOut(**r) for r in rows]
    return WatchlistResponse(user_id=user_id, total=len(items), items=items)


@router.delete("/watchlist/{content_id}")
async def remove_from_watchlist(
    content_id: int,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, bool]:
    removed = db.remove_watchlist_item(user_id=user_id, content_id=content_id)
    return {"removed": removed}


@router.delete("/watchlist")
async def clear_watchlist(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, int]:
    deleted = db.clear_watchlist(user_id=user_id)
    return {"deleted": deleted}


# ---------------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------------


@router.get("/collections", response_model=CollectionListResponse)
async def list_collections(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> CollectionListResponse:
    cols = [CollectionOut(**c) for c in db.list_collections_with_items(user_id)]
    return CollectionListResponse(user_id=user_id, collections=cols)


@router.post("/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
async def create_collection(
    payload: CollectionCreatePayload,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> CollectionOut:
    created = db.create_collection(user_id=user_id, name=payload.name, description=payload.description)
    return CollectionOut(**created)


@router.delete("/collections/{collection_id}")
async def delete_collection(
    collection_id: int,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, bool]:
    deleted = db.delete_collection(user_id=user_id, collection_id=collection_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    return {"deleted": True}


@router.post("/collections/{collection_id}/items")
async def add_collection_item(
    collection_id: int,
    payload: CollectionItemAddPayload,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, bool]:
    ok = db.add_collection_item(
        user_id=user_id,
        collection_id=collection_id,
        content_id=payload.content_id,
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    return {"added": True}


@router.delete("/collections/{collection_id}/items/{content_id}")
async def remove_collection_item(
    collection_id: int,
    content_id: int,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, bool]:
    removed = db.remove_collection_item(
        user_id=user_id,
        collection_id=collection_id,
        content_id=content_id,
    )
    return {"removed": removed}


# ---------------------------------------------------------------------------
# Ratings & Preferences
# ---------------------------------------------------------------------------


@router.get("/ratings", response_model=list[RatingEntryOut])
async def list_ratings(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> list[RatingEntryOut]:
    return [RatingEntryOut(**r) for r in db.list_user_ratings(user_id)]


@router.post("/ratings", response_model=RatingEntryOut)
async def upsert_rating(
    payload: RatingPayload,
    request: Request,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> RatingEntryOut:
    row = db.upsert_user_rating(user_id=user_id, content_id=payload.content_id, rating=payload.rating)
    rec_svc = getattr(request.app.state, "recommendation_service", None)
    if rec_svc is not None:
        rec_svc.invalidate_user_cache(user_id)
    return RatingEntryOut(**row)


@router.delete("/ratings/{content_id}")
async def delete_rating(
    content_id: int,
    request: Request,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> dict[str, bool]:
    deleted = db.delete_user_rating(user_id=user_id, content_id=content_id)
    rec_svc = getattr(request.app.state, "recommendation_service", None)
    if rec_svc is not None:
        rec_svc.invalidate_user_cache(user_id)
    return {"deleted": deleted}


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> PreferencesOut:
    return PreferencesOut(**db.get_user_preferences(user_id))


@router.put("/preferences", response_model=PreferencesOut)
async def update_preferences(
    payload: PreferencesPayload,
    request: Request,
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
) -> PreferencesOut:
    updated = db.upsert_user_preferences(
        user_id=user_id,
        preferred_genres=payload.preferred_genres,
        disliked_genres=payload.disliked_genres,
        preferred_types=payload.preferred_types,
        preferred_languages=payload.preferred_languages,
        min_rating=payload.min_rating,
        favorite_themes=payload.favorite_themes,
        preferred_era=payload.preferred_era,
        onboarding_completed=payload.onboarding_completed,
        discovery_openness=payload.discovery_openness,
    )
    rec_svc = getattr(request.app.state, "recommendation_service", None)
    if rec_svc is not None:
        rec_svc.invalidate_user_cache(user_id)
    return PreferencesOut(**updated)
