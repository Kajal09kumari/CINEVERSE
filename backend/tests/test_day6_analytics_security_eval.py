"""Day 6 tests: Analytics, Admin Auth, Security Middleware, Watchlist, and ML Evaluation."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import DatabaseManager
import app.db.database as db_module
from app.main import _rate_buckets, app
from ml.evaluation.evaluate import evaluate_svd_holdout


def _make_isolated_db(tmp_path: Path) -> DatabaseManager:
    db_path = tmp_path / "day6_test.db"
    return DatabaseManager(db_path=db_path)


def test_analytics_event_dedupe_and_secret_stripping(tmp_path: Path, monkeypatch):
    iso_db = _make_isolated_db(tmp_path)
    monkeypatch.setattr(db_module, "_db_manager", iso_db)
    _rate_buckets.clear()

    client = TestClient(app)

    # First event recorded
    res1 = client.post(
        "/api/analytics/event",
        json={
            "event_type": "content_viewed",
            "user_id": "u-test",
            "session_id": "s-1",
            "content_id": 101,
            "title": "Inception",
            "source_surface": "movie_detail",
            "dedupe_key": "view:101",
            "metadata": {
                "genres": ["Sci-Fi", "Thriller"],
                "password": "should-not-be-stored",
                "api_key": "secret-123",
                "token": "abc",
                "private_chat": "hidden",
            },
        },
    )
    assert res1.status_code == 200
    body1 = res1.json()
    assert body1["recorded"] is True
    assert body1["deduped"] is False

    # Immediate duplicate within 5s window should be deduped
    res2 = client.post(
        "/api/analytics/event",
        json={
            "event_type": "content_viewed",
            "user_id": "u-test",
            "session_id": "s-1",
            "content_id": 101,
            "title": "Inception",
            "source_surface": "movie_detail",
            "dedupe_key": "view:101",
            "metadata": {"genres": ["Sci-Fi"]},
        },
    )
    assert res2.status_code == 200
    assert res2.json()["recorded"] is False
    assert res2.json()["deduped"] is True

    # Verify secret keys were stripped in SQLite
    with iso_db.connection() as conn:
        row = conn.execute("SELECT metadata_json FROM analytics_events WHERE id = ?", (body1["event_id"],)).fetchone()
        raw_meta = row["metadata_json"]
        assert "should-not-be-stored" not in raw_meta
        assert "secret-123" not in raw_meta
        assert "private_chat" not in raw_meta
        assert "Sci-Fi" in raw_meta


def test_admin_analytics_auth_and_aggregation(tmp_path: Path, monkeypatch):
    iso_db = _make_isolated_db(tmp_path)
    monkeypatch.setattr(db_module, "_db_manager", iso_db)
    _rate_buckets.clear()

    client = TestClient(app)

    # 1. Fail closed (503) when ADMIN_API_KEY is not configured
    with patch.object(settings, "admin_api_key", ""):
        res_unconf = client.get("/api/admin/analytics")
        assert res_unconf.status_code == 503

    # 2. Reject missing/wrong X-Admin-Key (401)
    with patch.object(settings, "admin_api_key", "super-secret-admin-key"):
        res_missing = client.get("/api/admin/analytics")
        assert res_missing.status_code == 401

        res_wrong = client.get("/api/admin/analytics", headers={"X-Admin-Key": "wrong-key"})
        assert res_wrong.status_code == 401

        # 3. Empty analytics returns ctr_pct=None (Unavailable) rather than 0%
        res_empty = client.get("/api/admin/analytics?range=7d", headers={"X-Admin-Key": "super-secret-admin-key"})
        assert res_empty.status_code == 200
        empty_data = res_empty.json()
        assert empty_data["recommendation_analytics"]["ctr_pct"] is None
        assert empty_data["recommendation_analytics"]["like_ratio_pct"] is None

        # 4. Seed real events via batch endpoint and verify aggregation
        batch_res = client.post(
            "/api/analytics/events/batch",
            json={
                "events": [
                    {
                        "event_type": "content_searched",
                        "user_id": "u-1",
                        "session_id": "s-1",
                        "metadata": {"query": "Interstellar"},
                    },
                    {
                        "event_type": "recommendation_displayed",
                        "user_id": "u-1",
                        "session_id": "s-1",
                        "source_surface": "mira_chat",
                    },
                    {
                        "event_type": "recommendation_displayed",
                        "user_id": "u-1",
                        "session_id": "s-1",
                        "source_surface": "mira_chat",
                    },
                    {
                        "event_type": "recommendation_clicked",
                        "user_id": "u-1",
                        "session_id": "s-1",
                        "content_id": 42,
                        "title": "Arrival",
                        "source_surface": "mira_chat",
                    },
                    {
                        "event_type": "recommendation_feedback",
                        "user_id": "u-1",
                        "session_id": "s-1",
                        "metadata": {"feedback": "like"},
                    },
                ]
            },
        )
        assert batch_res.status_code == 200
        assert batch_res.json()["recorded"] == 5

        res_ok = client.get("/api/admin/analytics?range=7d", headers={"X-Admin-Key": "super-secret-admin-key"})
        assert res_ok.status_code == 200
        data = res_ok.json()
        assert data["platform_overview"]["total_events"] == 5
        assert data["platform_overview"]["total_searches"] == 1
        assert data["recommendation_analytics"]["recommendations_displayed"] == 2
        assert data["recommendation_analytics"]["recommendations_clicked"] == 1
        assert data["recommendation_analytics"]["ctr_pct"] == 50.0
        assert data["recommendation_analytics"]["likes"] == 1
        assert data["recommendation_analytics"]["like_ratio_pct"] == 100.0
        assert data["mira_analytics"]["recommendation_clicks_from_mira"] == 1


def test_security_headers_and_rate_limiter():
    _rate_buckets.clear()
    client = TestClient(app)

    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    with patch.object(settings, "rate_limit_per_minute", 2):
        _rate_buckets.clear()
        assert client.get("/").status_code == 200
        assert client.get("/").status_code == 200
        limited = client.get("/")
        assert limited.status_code == 429
        assert limited.headers.get("Retry-After") == "60"
    _rate_buckets.clear()


def test_watchlist_persistence_roundtrip(tmp_path: Path, monkeypatch):
    iso_db = _make_isolated_db(tmp_path)
    monkeypatch.setattr(db_module, "_db_manager", iso_db)
    _rate_buckets.clear()

    client = TestClient(app)
    add_res = client.post(
        "/api/library/watchlist?user_id=u-wl",
        json={
            "content_id": 777,
            "title": "The Prestige",
            "content_type": "MOVIE",
            "release_year": 2006,
            "rating": 8.5,
            "genres": ["Mystery", "Thriller"],
        },
    )
    assert add_res.status_code == 200

    list_res = client.get("/api/library/watchlist?user_id=u-wl")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "The Prestige"

    del_res = client.delete("/api/library/watchlist/777?user_id=u-wl")
    assert del_res.status_code == 200
    assert client.get("/api/library/watchlist?user_id=u-wl").json()["items"] == []


def test_ml_evaluation_extended_metrics_and_cold_start():
    rows = []
    for u in range(1, 25):
        for m in range(1, 21):
            rating = 4.5 if (u + m) % 3 == 0 else 2.5
            rows.append({"userId": u, "movieId": m, "rating": rating})
    ratings_df = pd.DataFrame(rows)
    movies_df = pd.DataFrame(
        [
            {"movieId": m, "genres_list": ["Sci-Fi", "Thriller"] if m % 2 == 0 else ["Drama", "Mystery"]}
            for m in range(1, 21)
        ]
    )

    metrics = evaluate_svd_holdout(ratings_df, n_components=4, k=5, movies_df=movies_df)
    assert metrics["test_samples"] > 0
    assert "ndcg_at_5" in metrics
    assert "hit_rate_at_5" in metrics
    assert "catalog_coverage" in metrics
    assert metrics["diversity"] is not None
    assert metrics["novelty"] > 0.0
    assert metrics["cold_start"]["evaluated_users"] > 0
    assert "ndcg_at_5" in metrics["cold_start"]
