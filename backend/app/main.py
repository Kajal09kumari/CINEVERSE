"""
CINEVERSE FastAPI Application Entry Point

Configures the FastAPI instance, CORS middleware, Watchmode lifecycle,
and provider-neutral API routers.
"""

from collections import defaultdict, deque
from contextlib import asynccontextmanager
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.analytics import router as analytics_router
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

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    """Apply sliding-window rate limiting and standard security headers."""
    limit = max(1, int(settings.rate_limit_per_minute))
    if request.method != "OPTIONS" and request.url.path != "/health":
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = _rate_buckets[client_ip]
        while bucket and now - bucket[0] > 60.0:
            bucket.popleft()
        if len(bucket) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please retry shortly."},
                headers={"Retry-After": "60"},
            )
        bucket.append(now)

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    """Prevent internal stack traces or secrets from leaking to API clients."""
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )


app.include_router(health_router, tags=["Health"])
app.include_router(content_router)
app.include_router(library_router)
app.include_router(recommendations_router)
app.include_router(mira_router)
app.include_router(analytics_router)
app.include_router(movies_router, deprecated=True)
