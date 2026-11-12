"""
Tests for MovieLens Hybrid ML Engine, SQLite Library Persistence,
Feedback Learning, and Multi-Turn MIRA Conversational Assistant.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.database import DatabaseManager
from app.main import app
from app.schemas.recommendations import MiraChatRequest
from app.services.mira_service import MiraService
from app.services.recommendation_service import RecommendationService
from ml.models.hybrid_recommender import HybridRecommender, RecommendationQuery


@pytest.fixture(scope="module")
def recommender() -> HybridRecommender:
    return HybridRecommender.load_or_train(force_retrain=False, sync_db=False)


def test_movielens_dataset_and_evaluation_metrics(recommender: HybridRecommender) -> None:
    assert recommender.dataset_stats["total_movies"] >= 9000
    assert recommender.dataset_stats["total_ratings"] >= 100000
    assert 0.5 < recommender.eval_metrics["rmse"] < 1.15
    assert recommender.eval_metrics["precision_at_10"] > 0.05


def test_seed_similarity_and_hard_genre_constraints(recommender: HybridRecommender) -> None:
    seed_results = recommender.recommend(
        RecommendationQuery(
            seed_titles=["Interstellar"],
            top_k=5,
        )
    )
    assert len(seed_results) == 5
    titles = [r["title"] for r in seed_results]
    assert "Interstellar" not in titles
    assert any("Sci-Fi" in r["genres"] or "Adventure" in r["genres"] or "Drama" in r["genres"] for r in seed_results)
    assert all(r["explanation"] for r in seed_results)

    filtered = recommender.recommend(
        RecommendationQuery(
            genres=["Thriller"],
            exclude_genres=["Horror", "War"],
            min_rating_10=7.0,
            top_k=6,
        )
    )
    assert len(filtered) > 0
    for item in filtered:
        assert "Thriller" in item["genres"]
        assert "Horror" not in item["genres"]
        assert "War" not in item["genres"]
        assert item["rating"] >= 7.0


def test_library_crud_and_deduplication(tmp_path: Path) -> None:
    db = DatabaseManager(db_path=tmp_path / "test_library.db")
    db.upsert_watchlist_item(
        user_id="u1",
        content_id=101,
        title="Arrival",
        content_type="MOVIE",
        release_year=2016,
        rating=7.9,
    )
    # Duplicate insert should deduplicate cleanly
    db.upsert_watchlist_item(
        user_id="u1",
        content_id=101,
        title="Arrival (Updated)",
        content_type="MOVIE",
        release_year=2016,
        rating=8.0,
    )
    wl = db.list_watchlist("u1")
    assert len(wl) == 1
    assert wl[0]["title"] == "Arrival (Updated)"

    col = db.create_collection(user_id="u1", name="Mind-Bending Sci-Fi", description="Weekend picks")
    assert db.add_collection_item(user_id="u1", collection_id=col["id"], content_id=101)
    assert db.add_collection_item(user_id="u1", collection_id=col["id"], content_id=101)
    cols = db.list_collections_with_items("u1")
    assert len(cols) == 1
    assert cols[0]["item_count"] == 1

    assert db.remove_collection_item(user_id="u1", collection_id=col["id"], content_id=101)
    assert db.list_collections_with_items("u1")[0]["item_count"] == 0
    assert db.delete_collection(user_id="u1", collection_id=col["id"])
    assert db.remove_watchlist_item(user_id="u1", content_id=101)


def test_mira_multiturn_refinement_and_constraints(
    tmp_path: Path,
    recommender: HybridRecommender,
) -> None:
    asyncio.run(_run_mira_multiturn_checks(tmp_path, recommender))


async def _run_mira_multiturn_checks(
    tmp_path: Path,
    recommender: HybridRecommender,
) -> None:
    db = DatabaseManager(db_path=tmp_path / "test_mira.db")
    # Seed a cached TV series in SQLite so Watchmode catalog path can return real series offline
    db.upsert_content_item(
        {
            "watchmode_id": 990001,
            "title": "True Detective",
            "content_type": "TV_SERIES",
            "watchmode_type": "tv_series",
            "is_documentary": False,
            "release_year": 2014,
            "poster_url": "https://cdn.watchmode.com/posters/0990001_poster_w342.jpg",
            "genres": ["Crime", "Drama", "Mystery"],
            "rating": 8.9,
            "popularity": 95.0,
            "language": "en",
            "description": "Detectives investigate haunting crimes.",
        },
        full_details=False,
    )

    rec_svc = RecommendationService(recommender=recommender, watchmode_service=None, db=db)
    mira = MiraService(recommendation_service=rec_svc, db=db)

    # Turn 1: Thriller
    t1 = await mira.chat(
        MiraChatRequest(
            message="I want an underrated psychological thriller",
            session_id="sess-refine",
            user_id="u-test",
            top_k=5,
        )
    )
    assert "Thriller" in t1.constraints.genres
    assert t1.constraints.underrated is True
    assert len(t1.recommendations) > 0

    # Turn 2: Multi-turn refinement keeping Thriller while excluding violent/horror genres
    t2 = await mira.chat(
        MiraChatRequest(
            message="Something less violent",
            session_id="sess-refine",
            user_id="u-test",
            top_k=5,
        )
    )
    assert "Thriller" in t2.constraints.genres
    assert "Horror" in t2.constraints.exclude_genres
    for rec in t2.recommendations:
        assert "Horror" not in rec.genres

    # Turn 3: TV series with mystery
    t3 = await mira.chat(
        MiraChatRequest(
            message="TV series with mystery",
            session_id="sess-series",
            user_id="u-test",
            top_k=4,
        )
    )
    assert t3.constraints.content_type == "TV_SERIES"
    assert "Mystery" in t3.constraints.genres
    assert any(r.title == "True Detective" for r in t3.recommendations)

    # Turn 4: Documentaries about space
    t4 = await mira.chat(
        MiraChatRequest(
            message="Documentaries about space",
            session_id="sess-docs",
            user_id="u-test",
            top_k=4,
        )
    )
    assert t4.constraints.content_type == "DOCUMENTARY"
    assert "space" in t4.constraints.keywords
    assert len(t4.recommendations) > 0

    # Check persistent SQLite chat history
    history = mira.get_history("sess-refine", user_id="u-test")
    assert len(history.messages) == 4  # 2 user + 2 assistant


def test_api_endpoints_personalized_feedback_and_mira_routes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    recommender: HybridRecommender,
) -> None:
    isolated_db = DatabaseManager(db_path=tmp_path / "test_api.db")
    monkeypatch.setattr(app.state, "hybrid_recommender", recommender, raising=False)
    monkeypatch.setattr(
        app.state,
        "recommendation_service",
        RecommendationService(recommender=recommender, watchmode_service=None, db=isolated_db),
        raising=False,
    )
    monkeypatch.setattr(
        app.state,
        "mira_service",
        MiraService(
            recommendation_service=app.state.recommendation_service,
            db=isolated_db,
        ),
        raising=False,
    )

    from app.api.routes import library as lib_routes
    from app.api.routes import recommendations as rec_routes

    app.dependency_overrides[lib_routes.get_db] = lambda: isolated_db
    app.dependency_overrides[rec_routes.get_db] = lambda: isolated_db

    try:
        client = TestClient(app)

        metrics_res = client.get("/api/recommendations/metrics")
        assert metrics_res.status_code == 200
        assert metrics_res.json()["dataset"]["total_movies"] >= 9000

        pers_res = client.get("/api/recommendations/personalized?user_id=api-u1&top_k=4")
        assert pers_res.status_code == 200
        data = pers_res.json()
        assert data["is_cold_start"] is True
        assert len(data["results"]) == 4

        first_pick = data["results"][0]
        fb_res = client.post(
            "/api/recommendations/feedback",
            json={
                "user_id": "api-u1",
                "feedback_type": "already_watched",
                "movielens_movie_id": first_pick["movielens_id"],
                "title": first_pick["title"],
            },
        )
        assert fb_res.status_code == 200
        assert fb_res.json()["recorded"]["feedback_type"] == "already_watched"

        # Personalized picks should now exclude the already_watched title
        pers_after = client.get("/api/recommendations/personalized?user_id=api-u1&top_k=5")
        assert pers_after.status_code == 200
        after_titles = [r["title"] for r in pers_after.json()["results"]]
        assert first_pick["title"] not in after_titles

        # MIRA route
        mira_res = client.post(
            "/api/mira/chat",
            json={
                "session_id": "api-mira-1",
                "user_id": "api-u1",
                "message": "Suggest something like Interstellar",
                "top_k": 4,
            },
        )
        assert mira_res.status_code == 200
        mira_json = mira_res.json()
        assert "Interstellar" in mira_json["constraints"]["seed_titles"]
        assert len(mira_json["recommendations"]) == 4

        hist_res = client.get("/api/mira/history?session_id=api-mira-1&user_id=api-u1")
        assert hist_res.status_code == 200
        assert len(hist_res.json()["messages"]) == 2
    finally:
        app.dependency_overrides.clear()
