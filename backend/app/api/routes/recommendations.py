"""
Hybrid ML Recommendations & Feedback API Routes
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request

from app.db.database import DatabaseManager, get_db_manager
from app.schemas.recommendations import (
    AdaptiveHomepageResponse,
    FeedbackPayload,
    FeedbackRecordOut,
    FeedbackResponse,
    InteractionOut,
    InteractionPayload,
    OnboardingPayload,
    RecommendationResponse,
    TasteDnaProfile,
)
from app.services.recommendation_service import RecommendationService
from app.services.taste_dna_service import TasteDnaService
from app.services.watchmode_service import WatchmodeService
from ml.models.hybrid_recommender import HybridRecommender

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


def get_hybrid_recommender(request: Request) -> HybridRecommender:
    rec = getattr(request.app.state, "hybrid_recommender", None)
    if rec is None:
        rec = HybridRecommender.load_or_train(force_retrain=False, sync_db=False)
        request.app.state.hybrid_recommender = rec
    return rec


def get_taste_dna_service(request: Request) -> TasteDnaService:
    svc = getattr(request.app.state, "taste_dna_service", None)
    if svc is None:
        svc = TasteDnaService(recommender=get_hybrid_recommender(request))
        request.app.state.taste_dna_service = svc
    return svc


def get_recommendation_service(request: Request) -> RecommendationService:
    svc = getattr(request.app.state, "recommendation_service", None)
    if svc is None:
        wm = getattr(request.app.state, "watchmode_service", None)
        if wm is None:
            wm = WatchmodeService()
            request.app.state.watchmode_service = wm
        rec = get_hybrid_recommender(request)
        taste = get_taste_dna_service(request)
        svc = RecommendationService(
            recommender=rec,
            watchmode_service=wm,
            taste_dna_service=taste,
        )
        request.app.state.recommendation_service = svc
    return svc


def get_db() -> DatabaseManager:
    return get_db_manager()


@router.get("/personalized", response_model=RecommendationResponse)
async def get_personalized_recommendations(
    user_id: str = Query(default="local-default", max_length=100),
    region: str | None = Query(default=None, min_length=2, max_length=2),
    top_k: int = Query(default=10, ge=1, le=20),
    content_type: str | None = Query(default=None),
    service: RecommendationService = Depends(get_recommendation_service),
) -> RecommendationResponse:
    return await service.get_personalized_recommendations(
        user_id=user_id,
        region=region,
        top_k=top_k,
        content_type=content_type,
    )


@router.get("/similar/{content_id}", response_model=RecommendationResponse)
async def get_similar_recommendations(
    content_id: int = Path(..., ge=1),
    user_id: str = Query(default="local-default", max_length=100),
    region: str | None = Query(default=None, min_length=2, max_length=2),
    top_k: int = Query(default=8, ge=1, le=20),
    service: RecommendationService = Depends(get_recommendation_service),
) -> RecommendationResponse:
    return await service.get_similar_recommendations(
        content_id=content_id,
        user_id=user_id,
        region=region,
        top_k=top_k,
    )


@router.get("/metrics")
async def get_model_metrics(
    recommender: HybridRecommender = Depends(get_hybrid_recommender),
) -> dict[str, object]:
    return {
        "model": "TF-IDF Content + TruncatedSVD Collaborative Hybrid",
        "dataset": recommender.dataset_stats,
        "evaluation": recommender.eval_metrics,
    }


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackPayload,
    db: DatabaseManager = Depends(get_db),
    recommender: HybridRecommender = Depends(get_hybrid_recommender),
    service: RecommendationService = Depends(get_recommendation_service),
) -> FeedbackResponse:
    ml_id = payload.movielens_movie_id
    if ml_id is None and (payload.content_id is not None or payload.title):
        ml_id = db.get_movielens_id_for_content(
            content_id=payload.content_id,
            title=payload.title,
        ) or recommender.resolve_movielens_id(title=payload.title)

    saved = db.add_user_feedback(
        user_id=payload.user_id,
        feedback_type=payload.feedback_type,
        content_id=payload.content_id,
        movielens_movie_id=ml_id,
        title=payload.title,
        reason=payload.reason,
    )
    service.invalidate_user_cache(payload.user_id)
    notes = {
        "like": "Recorded positive preference signal without overriding saved genre filters.",
        "dislike": "Dampened similar tone/item weighting and excluded from future picks.",
        "not_interested": "Hidden from upcoming recommendations while keeping your taste profile intact.",
        "already_watched": "Marked as watched so MIRA avoids re-suggesting it.",
        "more_like_this": "Prioritizing similar items to this title in upcoming suggestions.",
        "less_like_this": "Reduced affinity for this tone/style without erasing your saved preferences.",
    }
    return FeedbackResponse(
        recorded=FeedbackRecordOut(**saved),
        profile_note=notes.get(payload.feedback_type, "Feedback recorded."),
    )


@router.get("/feedback", response_model=list[FeedbackRecordOut])
async def list_feedback(
    user_id: str = Query(default="local-default", max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    db: DatabaseManager = Depends(get_db),
) -> list[FeedbackRecordOut]:
    rows = db.list_user_feedback(user_id=user_id, limit=limit)
    return [FeedbackRecordOut(**r) for r in rows]


@router.get("/taste-dna", response_model=TasteDnaProfile)
async def get_taste_dna(
    user_id: str = Query(default="local-default", max_length=100),
    taste_dna: TasteDnaService = Depends(get_taste_dna_service),
) -> TasteDnaProfile:
    return taste_dna.get_profile(user_id=user_id)


@router.post("/onboarding", response_model=TasteDnaProfile)
async def submit_onboarding(
    payload: OnboardingPayload,
    db: DatabaseManager = Depends(get_db),
    taste_dna: TasteDnaService = Depends(get_taste_dna_service),
    service: RecommendationService = Depends(get_recommendation_service),
) -> TasteDnaProfile:
    db.upsert_user_preferences(
        user_id=payload.user_id,
        preferred_genres=payload.preferred_genres,
        disliked_genres=payload.disliked_genres,
        preferred_types=payload.preferred_types,
        preferred_languages=payload.preferred_languages,
        favorite_themes=payload.favorite_themes,
        preferred_era=payload.preferred_era,
        min_rating=payload.min_rating,
        onboarding_completed=True,
        discovery_openness=payload.discovery_openness,
    )
    service.invalidate_user_cache(payload.user_id)
    return taste_dna.get_profile(user_id=payload.user_id, force_refresh=True)


@router.post("/interaction", response_model=InteractionOut)
async def record_interaction(
    payload: InteractionPayload,
    db: DatabaseManager = Depends(get_db),
    service: RecommendationService = Depends(get_recommendation_service),
) -> InteractionOut:
    saved = db.record_interaction(
        user_id=payload.user_id,
        content_id=payload.content_id,
        movielens_movie_id=payload.movielens_movie_id,
        title=payload.title,
        content_type=payload.content_type,
        genres=payload.genres,
        interaction_type=payload.interaction_type,
        progress_pct=payload.progress_pct,
    )
    service.invalidate_user_cache(payload.user_id)
    return InteractionOut(**saved)


@router.get("/interactions", response_model=list[InteractionOut])
async def list_interactions(
    user_id: str = Query(default="local-default", max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    db: DatabaseManager = Depends(get_db),
) -> list[InteractionOut]:
    rows = db.list_interactions(user_id=user_id, limit=limit)
    return [InteractionOut(**r) for r in rows]


@router.get("/home-sections", response_model=AdaptiveHomepageResponse)
async def get_adaptive_home_sections(
    user_id: str = Query(default="local-default", max_length=100),
    region: str | None = Query(default=None, min_length=2, max_length=2),
    per_section_k: int = Query(default=8, ge=2, le=12),
    service: RecommendationService = Depends(get_recommendation_service),
) -> AdaptiveHomepageResponse:
    return await service.get_adaptive_homepage_sections(
        user_id=user_id,
        region=region,
        per_section_k=per_section_k,
    )


@router.post("/reset")
async def reset_personalization_profile(
    user_id: str = Query(default="local-default", max_length=100),
    db: DatabaseManager = Depends(get_db),
    service: RecommendationService = Depends(get_recommendation_service),
) -> dict[str, object]:
    cleared = db.reset_user_personalization(user_id=user_id)
    service.invalidate_user_cache(user_id)
    return {"user_id": user_id, "reset": True, "cleared": cleared}
