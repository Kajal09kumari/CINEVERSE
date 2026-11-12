"""
Health endpoint tests.

These tests verify that the API root and health check routes
respond correctly. They use FastAPI's TestClient which runs
requests in-process — no server needs to be running.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """GET / should return welcome message and running status."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Welcome to CINEVERSE API"
    assert data["status"] == "running"


def test_health_endpoint():
    """GET /health should return ok status and service identifier."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "cineverse-backend"
