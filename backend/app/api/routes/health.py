"""
Health check routes.

These endpoints let external systems (monitoring tools, the frontend)
verify that the API server is alive and responding.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def root() -> dict:
    """Root endpoint. Confirms the API is reachable."""
    return {"message": "Welcome to CINEVERSE API", "status": "running"}


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint used by monitoring and the frontend connection check."""
    return {"status": "healthy", "project": "CINEVERSE"}
