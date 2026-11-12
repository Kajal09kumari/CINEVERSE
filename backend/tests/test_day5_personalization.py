"""
CINEVERSE Day 5 — Personalization, Taste DNA, Onboarding, Isolation & MIRA Integration Tests
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.database import DatabaseManager
from app.main import app
from app.services.mira_service import MiraService
from app.services.recommendation_service import RecommendationService
from app.services.taste_dna_service import TasteDnaService
from ml.models.hybrid_recommender import HybridRecommender


@pytest.fixture()
def day5_client(tmp_path: Path):
    db_file = tmp_path / "cineverse_day5_test.db"
    db = DatabaseManager(db_path=db_file)
    recommender = HybridRecommender.load_or_train(force_retrain=False, sync_db=False)
    taste_dna = TasteDnaService(recommender=recommender, db=db, ttl_seconds=60.0)
    rec_service = RecommendationService(
        recommender=recommender,
        watchmode_service=None,
        db=db,
        taste_dna_service=taste_dna,
    )
    mira_service = MiraService(
        recommendation_service=rec_service,
        db=db,
        taste_dna_service=taste_dna,
    )

    # Seed two cached content items with rich cast/director/genre metadata
    c1 = db.upsert_content_item(
        {
            "watchmode_id": 900101,
            "imdb_id": "tt1375666",
            "title": "Inception",
            "content_type": "MOVIE",
            "is_documentary": False,
            "release_year": 2010,
            "genres": ["Sci-Fi", "Action", "Thriller"],
            "rating": 8.8,
            "popularity": 95.0,
            "language": "en",
            "poster_url": "https://example.com/inception.jpg",
            "directors": [{"name": "Christopher Nolan"}],
            "cast": [{"name": "Leonardo DiCaprio"}, {"name": "Joseph Gordon-Levitt"}],
            "has_full_details": True,
        }
    )
    c2 = db.upsert_content_item(
        {
            "watchmode_id": 900102,
            "imdb_id": "tt0816692",
            "title": "Interstellar",
            "content_type": "MOVIE",
            "is_documentary": False,
            "release_year": 2014,
            "genres": ["Sci-Fi", "Drama", "Adventure"],
            "rating": 8.7,
            "popularity": 92.0,
            "language": "en",
            "poster_url": "https://example.com/interstellar.jpg",
            "directors": [{"name": "Christopher Nolan"}],
            "cast": [{"name": "Matthew McConaughey"}],
            "has_full_details": True,
        }
    )

    # Override route DB dependency & app.state inside TestClient lifespan
    from app.api.routes import library as lib_routes
    from app.api.routes import recommendations as rec_routes

    app.dependency_overrides[lib_routes.get_db] = lambda: db
    app.dependency_overrides[rec_routes.get_db] = lambda: db
    app.dependency_overrides[rec_routes.get_taste_dna_service] = lambda: taste_dna
    app.dependency_overrides[rec_routes.get_recommendation_service] = lambda: rec_service

    with TestClient(app) as client:
        app.state.hybrid_recommender = recommender
        app.state.taste_dna_service = taste_dna
        app.state.recommendation_service = rec_service
        app.state.mira_service = mira_service
        yield client, db, taste_dna, c1, c2

    app.dependency_overrides.clear()


def test_new_user_cold_start_has_no_fake_sections(day5_client) -> None:
    client, _db, _taste, _c1, _c2 = day5_client
    dna = client.get("/api/recommendations/taste-dna", params={"user_id": "fresh_user"}).json()
    assert dna["has_sufficient_data"] is False
    assert dna["onboarding_completed"] is False
    assert dna["top_genres"] == []
    assert dna["average_user_rating"] is None

    home = client.get("/api/recommendations/home-sections", params={"user_id": "fresh_user"}).json()
    assert home["has_sufficient_data"] is False
    assert home["show_onboarding"] is True
    assert home["sections"] == []


def test_onboarding_and_adaptive_homepage_sections(day5_client) -> None:
    client, _db, _taste, _c1, _c2 = day5_client
    resp = client.post(
        "/api/recommendations/onboarding",
        json={
            "user_id": "onboard_u1",
            "preferred_genres": ["Sci-Fi", "Mystery"],
            "disliked_genres": ["Horror"],
            "preferred_types": ["MOVIE", "DOCUMENTARY"],
            "preferred_languages": ["en", "ja"],
            "favorite_themes": ["time travel", "mind-bending"],
            "preferred_era": "2010s",
            "min_rating": 7.0,
            "discovery_openness": 0.6,
        },
    )
    assert resp.status_code == 200
    dna = resp.json()
    assert dna["has_sufficient_data"] is True
    assert dna["onboarding_completed"] is True
    assert "Sci-Fi" in dna["top_genres"]
    assert "time travel" in dna["favorite_themes"]
    assert "EN" in dna["preferred_languages"]

    home = client.get("/api/recommendations/home-sections", params={"user_id": "onboard_u1"}).json()
    assert home["has_sufficient_data"] is True
    section_ids = [s["section_id"] for s in home["sections"]]
    assert "recommended_for_you" in section_ids
    assert "because_you_love" in section_ids
    assert "discover_something_different" in section_ids

    # Ensure zero duplicate titles across adaptive homepage sections
    all_titles: list[str] = []
    for sec in home["sections"]:
        for item in sec["items"]:
            all_titles.append(item["title"].lower())
    assert len(all_titles) == len(set(all_titles))


def test_interaction_history_and_continue_exploring(day5_client) -> None:
    client, _db, _taste, c1, _c2 = day5_client
    r1 = client.post(
        "/api/recommendations/interaction",
        json={
            "user_id": "viewer_u1",
            "content_id": c1,
            "interaction_type": "progress",
            "progress_pct": 45.0,
        },
    )
    assert r1.status_code == 200
    assert r1.json()["title"] == "Inception"

    home1 = client.get("/api/recommendations/home-sections", params={"user_id": "viewer_u1"}).json()
    assert len(home1["continue_exploring"]) == 1
    assert home1["continue_exploring"][0]["interaction"]["progress_pct"] == 45.0

    # Mark as finished (100%) -> should leave Continue Exploring
    r2 = client.post(
        "/api/recommendations/interaction",
        json={
            "user_id": "viewer_u1",
            "content_id": c1,
            "interaction_type": "progress",
            "progress_pct": 100.0,
        },
    )
    assert r2.status_code == 200
    home2 = client.get("/api/recommendations/home-sections", params={"user_id": "viewer_u1"}).json()
    assert home2["continue_exploring"] == []


def test_feedback_less_like_this_no_single_click_overfitting(day5_client) -> None:
    client, _db, _taste, c1, c2 = day5_client
    client.post(
        "/api/recommendations/onboarding",
        json={
            "user_id": "fb_u1",
            "preferred_genres": ["Sci-Fi"],
            "preferred_types": ["MOVIE"],
        },
    )
    # Single rating + single like should keep affinity bounded (< 100.0)
    client.post("/api/library/ratings", params={"user_id": "fb_u1"}, json={"content_id": c1, "rating": 9.5})
    fb = client.post(
        "/api/recommendations/feedback",
        json={"user_id": "fb_u1", "content_id": c2, "title": "Interstellar", "feedback_type": "less_like_this"},
    )
    assert fb.status_code == 200
    assert "without erasing" in fb.json()["profile_note"]

    dna = client.get("/api/recommendations/taste-dna", params={"user_id": "fb_u1"}).json()
    assert dna["favorite_directors"][0]["name"] == "Christopher Nolan"
    for g in dna["genre_affinity_scores"]:
        assert 0.0 < g["score"] < 100.0

    # Explicit preferred_genres remains intact
    prefs = client.get("/api/library/preferences", params={"user_id": "fb_u1"}).json()
    assert "Sci-Fi" in prefs["preferred_genres"]


def test_multi_user_isolation_mira_taste_dna_and_reset(day5_client) -> None:
    client, _db, taste_dna, _c1, _c2 = day5_client

    client.post(
        "/api/recommendations/onboarding",
        json={
            "user_id": "user_alpha",
            "preferred_genres": ["Thriller", "Crime"],
            "preferred_types": ["MOVIE"],
        },
    )
    client.post(
        "/api/recommendations/onboarding",
        json={
            "user_id": "user_beta",
            "preferred_genres": ["Comedy", "Animation"],
            "preferred_types": ["MOVIE"],
        },
    )

    dna_a = client.get("/api/recommendations/taste-dna", params={"user_id": "user_alpha"}).json()
    dna_b = client.get("/api/recommendations/taste-dna", params={"user_id": "user_beta"}).json()
    assert "Thriller" in dna_a["top_genres"]
    assert "Thriller" not in dna_b["top_genres"]
    assert "Comedy" in dna_b["top_genres"]

    # TTL cache returns identical object on repeated call until invalidated
    p1 = taste_dna.get_profile("user_alpha")
    p2 = taste_dna.get_profile("user_alpha")
    assert p1 is p2

    # MIRA integrates Taste DNA when asked for something different from usual choices
    mira_resp = client.post(
        "/api/mira/chat",
        json={
            "user_id": "user_alpha",
            "session_id": "sess_alpha_1",
            "message": "Recommend something different from my usual choices",
            "top_k": 4,
        },
    )
    assert mira_resp.status_code == 200
    mdata = mira_resp.json()
    assert mdata["constraints"]["surprise_different"] is True
    assert "Thriller" in mdata["reply"]
    assert len(mdata["recommendations"]) > 0

    # Reset user_alpha without affecting user_beta
    reset_resp = client.post("/api/recommendations/reset", params={"user_id": "user_alpha"})
    assert reset_resp.status_code == 200
    assert reset_resp.json()["reset"] is True

    dna_a_after = client.get("/api/recommendations/taste-dna", params={"user_id": "user_alpha"}).json()
    dna_b_after = client.get("/api/recommendations/taste-dna", params={"user_id": "user_beta"}).json()
    assert dna_a_after["has_sufficient_data"] is False
    assert dna_b_after["has_sufficient_data"] is True
