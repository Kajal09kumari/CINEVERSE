"""
Compatibility tests verifying `/api/movies/*` delegates cleanly to WatchmodeService
with zero runtime calls to TMDB.
"""

from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes.content import get_watchmode_service
from app.main import app
from tests.test_watchmode import (
    SAMPLE_MOVIE_DETAILS,
    SAMPLE_TITLE_SUMMARY,
    make_watchmode_test_service,
)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_legacy_movies_routes_delegate_to_watchmode(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/list-titles":
            return httpx.Response(
                200,
                json={
                    "titles": [SAMPLE_TITLE_SUMMARY],
                    "page": 1,
                    "total_pages": 1,
                    "total_results": 1,
                },
            )
        if request.url.path == "/v1/title/1419130/details":
            return httpx.Response(200, json=SAMPLE_MOVIE_DETAILS)
        if request.url.path == "/v1/genres":
            return httpx.Response(200, json=[{"id": 15, "name": "Science Fiction"}, {"id": 6, "name": "Documentary"}])
        return httpx.Response(404)

    service = make_watchmode_test_service(handler, tmp_path)
    app.dependency_overrides[get_watchmode_service] = lambda: service
    client = TestClient(app)

    trending = client.get("/api/movies/trending")
    assert trending.status_code == 200
    assert trending.json()["source"] == "watchmode"
    assert trending.json()["results"][0]["title"] == "Interstellar"

    genres = client.get("/api/movies/genres")
    assert genres.status_code == 200
    assert {"id": 6, "name": "Documentary"} in genres.json()["genres"]

    assert client.get("/api/movies/search?query=%20%20").status_code == 400
    assert client.get("/api/movies/discover?min_rating=15").status_code == 422
