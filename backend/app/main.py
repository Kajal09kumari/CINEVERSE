"""
CINEVERSE FastAPI Application Entry Point

This file creates and configures the FastAPI app instance.
All routers, middleware, and startup logic are registered here.

Design decision: We keep main.py focused on app wiring.
Business logic lives in services/, ML code in ml/.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.core.config import settings

# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Intelligent movie discovery and recommendation platform.",
    # Disable the auto-generated docs in production (debug=False)
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
# We explicitly list the allowed origin instead of using "*" because:
# 1. Wildcard origins cannot be used with credentials (cookies, auth headers).
# 2. Restricting origins is a security best practice.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(health_router, tags=["Health"])

# ---------------------------------------------------------------------------
# Startup / shutdown events
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def on_startup() -> None:
    """Runs once when the server starts. Good place to warm up ML models."""
    print(f"\n🎬  {settings.app_name} v{settings.app_version} is running.")
    print(f"    Frontend origin: {settings.frontend_origin}")
    print(f"    Debug mode:      {settings.debug}\n")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Runs once when the server shuts down cleanly."""
    print("\n👋  CINEVERSE API shutting down.")
