"""
Automated tests for Watchmode API integration & provider-neutral `/api/content/*` routes.

Uses `httpx.MockTransport` and an isolated temporary SQLite database per test
so all tests are deterministic and never spend real Watchmode API credits.
"""

from pathlib import Path
import json
import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes.content import get_watchmode_service
from app.core.config import Settings
from app.db.database import DatabaseManager
from app.main import app
from app.services.watchmode_service import WatchmodeService


SAMPLE_TITLE_SUMMARY = {
    "id": 1419130,
    "title": "Interstellar",
    "year": 2014,
    "imdb_id": "tt0816692",
    "tmdb_id": 157336,
    "tmdb_type": "movie",
    "type": "movie",
    "popularity_percentile": 99.4,
}

SAMPLE_MOVIE_DETAILS = {
    "id": 1419130,
    "title": "Interstellar",
    "original_title": "Interstellar",
    "plot_overview": "Explorers travel through a wormhole in space.",
    "type": "movie",
    "runtime_minutes": 169,
    "year": 2014,
    "release_date": "2014-11-05",
    "imdb_id": "tt0816692",
    "tmdb_id": 157336,
    "tmdb_type": "movie",
    "genres": [15, 7],
    "genre_names": ["Science Fiction", "Drama"],
    "user_rating": 8.6,
    "critic_score": 73,
    "poster": "https://cdn.watchmode.com/posters/01419130_poster_w185.jpg",
    "posterLarge": "https://cdn.watchmode.com/posters/01419130_poster_w780.jpg",
    "backdrop": "https://cdn.watchmode.com/backdrops/01419130_bd_w780.jpg",
    "original_language": "en",
    "similar_titles": [1419131],
    "trailer": "https://www.youtube.com/watch?v=zSWdZVtXT7E",
    "sources": [
        {
            "source_id": 203,
            "name": "Netflix",
            "type": "sub",
            "region": "IN",
            "web_url": "https://www.netflix.com/title/70305903",
            "format": "4K",
        }
    ],
    "cast": [
        {"person_id": 101, "type": "Cast", "full_name": "Matthew McConaughey", "role": "Cooper", "order": 1},
        {"person_id": 102, "type": "Crew", "full_name": "Christopher Nolan", "role": "Director", "order": 1},
    ],
}

SAMPLE_DOC_SERIES_DETAILS = {
    "id": 3179999,
    "title": "Planet Earth II",
    "original_title": "Planet Earth II",
    "plot_overview": "Wildlife documentary series.",
    "type": "tv_miniseries",
    "runtime_minutes": 50,
    "year": 2016,
    "release_date": "2016-11-06",
    "imdb_id": "tt5491994",
    "tmdb_id": 68595,
    "genres": [6],
    "genre_names": ["Documentary"],
    "user_rating": 9.5,
    "posterLarge": "https://cdn.watchmode.com/posters/03179999_poster_w780.jpg",
    "original_language": "en",
    "sources": [],
    "cast": [],
}


def make_watchmode_test_service(
    handler,
    tmp_path: Path,
    *,
    api_key: str = "test-watchmode-key",
    cache_enabled: bool = True,
) -> WatchmodeService:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://api.watchmode.com/v1",
    )
    cfg = Settings(
        watchmode_api_key=api_key,
        watchmode_base_url="https://api.watchmode.com/v1",
        watchmode_region="IN",
        watchmode_max_retries=1,
        cineverse_cache_enabled=cache_enabled,
    )
    db = DatabaseManager(db_path=tmp_path / "test_cineverse.db")
    return WatchmodeService(config=cfg, client=client, db=db)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_discover_uses_x_api_key_header_and_caches(tmp_path: Path):
    calls: dict[str, int] = {"list": 0, "details": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("X-API-Key") == "test-watchmode-key"
        assert "apiKey" not in str(request.url)
        if request.url.path == "/v1/list-titles":
            calls["list"] += 1
            assert request.url.params.get("regions") == "IN"
            assert request.url.params.get("types") == "movie"
            return httpx.Response(
                200,
                json={
                    "titles": [SAMPLE_TITLE_SUMMARY],
                    "page": 1,
                    "total_pages": 3,
                    "total_results": 45,
                },
            )
        if request.url.path == "/v1/title/1419130/details":
            calls["details"] += 1
            return httpx.Response(200, json=SAMPLE_MOVIE_DETAILS)
        return httpx.Response(404)

    service = make_watchmode_test_service(handler, tmp_path)
    app.dependency_overrides[get_watchmode_service] = lambda: service
    client = TestClient(app)

    resp = client.get("/api/content/discover?content_type=MOVIE&page=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "watchmode"
    assert "Watchmode" in body["attribution"]
    assert body["results"][0]["title"] == "Interstellar"
    assert body["results"][0]["content_type"] == "MOVIE"
    assert body["results"][0]["watchmode_id"] == 1419130
    assert body["results"][0]["legacy_tmdb_id"] == 157336
    assert body["results"][0]["poster_url"] == SAMPLE_MOVIE_DETAILS["posterLarge"]

    # Second identical call hits TTL cache and spends 0 additional credits
    resp2 = client.get("/api/content/discover?content_type=MOVIE&page=1")
    assert resp2.status_code == 200
    assert resp2.json()["cached"] is True
    assert calls["list"] == 1
    assert calls["details"] == 1


def test_documentary_classification_preserves_film_vs_series(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/title/3179999/details":
            return httpx.Response(200, json=SAMPLE_DOC_SERIES_DETAILS)
        if request.url.path == "/v1/title/3179999/seasons":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 9001,
                        "number": 1,
                        "name": "Season 1",
                        "episode_count": 6,
                        "air_date": "2016-11-06",
                    }
                ],
            )
        if request.url.path == "/v1/list-titles":
            assert request.url.params.get("genres") == "6"
            return httpx.Response(
                200,
                json={
                    "titles": [
                        {
                            "id": 3179999,
                            "title": "Planet Earth II",
                            "year": 2016,
                            "imdb_id": "tt5491994",
                            "type": "tv_miniseries",
                        }
                    ],
                    "page": 1,
                    "total_pages": 1,
                    "total_results": 1,
                },
            )
        return httpx.Response(404)

    service = make_watchmode_test_service(handler, tmp_path)
    app.dependency_overrides[get_watchmode_service] = lambda: service
    client = TestClient(app)

    disc = client.get("/api/content/discover?content_type=DOCUMENTARY")
    assert disc.status_code == 200
    item = disc.json()["results"][0]
    assert item["content_type"] == "DOCUMENTARY"
    assert item["is_documentary"] is True
    assert item["watchmode_type"] == "tv_miniseries"

    detail = client.get(f"/api/content/{item['id']}")
    assert detail.status_code == 200
    assert detail.json()["seasons"][0]["episode_count"] == 6


def test_search_autocomplete_and_availability_and_episodes(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/autocomplete-search":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "id": 1419130,
                            "name": "Interstellar",
                            "type": "movie",
                            "year": 2014,
                            "imdb_id": "tt0816692",
                            "tmdb_id": 157336,
                            "relevance": 98.2,
                            "image_url": "https://cdn.watchmode.com/posters/01419130_poster_w185.jpg",
                        }
                    ]
                },
            )
        if request.url.path == "/v1/title/1419130/details":
            return httpx.Response(200, json=SAMPLE_MOVIE_DETAILS)
        if request.url.path == "/v1/title/1419130/episodes":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 555,
                        "name": "Pilot",
                        "season_number": 1,
                        "episode_number": 1,
                        "runtime_minutes": 48,
                    }
                ],
            )
        return httpx.Response(404)

    service = make_watchmode_test_service(handler, tmp_path)
    app.dependency_overrides[get_watchmode_service] = lambda: service
    client = TestClient(app)

    search_resp = client.get("/api/content/search?query=interstellar")
    assert search_resp.status_code == 200
    assert search_resp.json()["results"][0]["title"] == "Interstellar"
    canonical_id = search_resp.json()["results"][0]["id"]

    avail = client.get(f"/api/content/{canonical_id}/availability?region=IN")
    assert avail.status_code == 200
    assert avail.json()["sources"][0]["name"] == "Netflix"

    eps = client.get(f"/api/content/{canonical_id}/episodes?season=1")
    assert eps.status_code == 200
    assert eps.json()[0]["name"] == "Pilot"


def test_legacy_tmdb_resolution_and_error_states_never_leak_key(tmp_path: Path):
    secret = "wm_super_secret_key_should_not_leak"

    def missing_handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("HTTP request must not be sent when WATCHMODE_API_KEY is missing")

    missing_svc = make_watchmode_test_service(missing_handler, tmp_path, api_key="")
    app.dependency_overrides[get_watchmode_service] = lambda: missing_svc
    client = TestClient(app)
    r503 = client.get("/api/content/trending")
    assert r503.status_code == 503
    assert "watchmode_api_key" in r503.json()["detail"].lower()
    assert "tmdb" not in r503.json()["detail"].lower()

    # Auth failure 401 -> 502 without leaking key
    auth_svc = make_watchmode_test_service(
        lambda req: httpx.Response(401, json={"error": "Unauthorized"}),
        tmp_path,
        api_key=secret,
    )
    app.dependency_overrides[get_watchmode_service] = lambda: auth_svc
    r401 = client.get("/api/content/trending")
    assert r401.status_code == 502
    assert "watchmode authentication failed" in r401.json()["detail"].lower()
    assert secret not in json.dumps(r401.json())

    # Quota exceeded 429 -> 429
    quota_svc = make_watchmode_test_service(
        lambda req: httpx.Response(429, json={"error": "Quota exceeded"}),
        tmp_path,
        api_key=secret,
    )
    app.dependency_overrides[get_watchmode_service] = lambda: quota_svc
    r429 = client.get("/api/content/trending")
    assert r429.status_code == 429
    assert "quota" in r429.json()["detail"].lower()

    # Timeout -> 504
    def timeout_handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=req)

    timeout_svc = make_watchmode_test_service(timeout_handler, tmp_path, api_key=secret)
    app.dependency_overrides[get_watchmode_service] = lambda: timeout_svc
    r504 = client.get("/api/content/trending")
    assert r504.status_code == 504

    # Legacy TMDB ID resolution
    def legacy_handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v1/search":
            assert req.url.params.get("search_field") == "tmdb_movie_id"
            assert req.url.params.get("search_value") == "157336"
            return httpx.Response(200, json={"title_results": [SAMPLE_TITLE_SUMMARY]})
        if req.url.path == "/v1/title/1419130/details":
            return httpx.Response(200, json=SAMPLE_MOVIE_DETAILS)
        return httpx.Response(404)

    legacy_svc = make_watchmode_test_service(legacy_handler, tmp_path, api_key=secret)
    app.dependency_overrides[get_watchmode_service] = lambda: legacy_svc
    res = client.get("/api/content/resolve-legacy/tmdb/157336")
    assert res.status_code == 200
    assert res.json()["watchmode_id"] == 1419130
    assert res.json()["legacy_tmdb_id"] == 157336
