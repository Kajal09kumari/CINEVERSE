"""
CINEVERSE FastAPI Application Entry Point

Configures the FastAPI instance, CORS middleware, Watchmode lifecycle,
and provider-neutral API routers.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.content import router as content_router
from app.api.routes.health import router as health_router
from app.api.routes.library import router as library_router
from app.api.routes.mira import router as mira_router
from app.api.routes.movies import router as movies_router
from app.api.routes.recommendations import router as recommendations_router
from app.core.config import settings
from app.services.mira_service import MiraService
from app.services.recommendation_service import RecommendationService
from app.services.taste_dna_service import TasteDnaService
from app.services.watchmode_service import WatchmodeService
from ml.models.hybrid_recommender import HybridRecommender


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Manage startup initialization and clean async resource teardown."""
    wm = WatchmodeService()
    recommender = HybridRecommender.load_or_train(force_retrain=False, sync_db=False)
    taste_dna_service = TasteDnaService(recommender=recommender)
    rec_service = RecommendationService(
        recommender=recommender,
        watchmode_service=wm,
        taste_dna_service=taste_dna_service,
    )
    mira_service = MiraService(
        recommendation_service=rec_service,
        taste_dna_service=taste_dna_service,
    )

    application.state.watchmode_service = wm
    application.state.hybrid_recommender = recommender
    application.state.taste_dna_service = taste_dna_service
    application.state.recommendation_service = rec_service
    application.state.mira_service = mira_service
    print(f"\n🎬  {settings.app_name} v{settings.app_version} is running.")
    print(f"    Frontend origin:     {settings.frontend_origin}")
    print(f"    Watchmode key set:   {settings.has_watchmode_key}")
    print(f"    Watchmode region:    {settings.watchmode_region}")
    print(f"    Cache enabled:       {settings.cineverse_cache_enabled}")
    print(f"    Debug mode:          {settings.debug}\n")
    try:
        yield
    finally:
        service = getattr(application.state, "watchmode_service", None)
        if service is not None:
            await service.aclose()
        print("\n👋  CINEVERSE API shutting down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Intelligent movie, TV series, and documentary discovery platform.",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router, tags=["Health"])
app.include_router(content_router)
app.include_router(library_router)
app.include_router(recommendations_router)
app.include_router(mira_router)
app.include_router(movies_router, deprecated=True)
