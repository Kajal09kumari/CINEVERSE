# CINEVERSE Backend API Documentation

**Base URL (Development):** `http://127.0.0.1:8000`  
**Framework:** FastAPI + Pydantic v2 + Async HTTPX  
**Authentication with TMDB:** Server-side Bearer token via `TMDB_ACCESS_TOKEN` in `backend/.env` (never exposed to browser clients).

---

## Health Endpoints

### `GET /`
Confirm the API server is reachable.

**Response (`200 OK`):**
```json
{
  "message": "Welcome to CINEVERSE API",
  "status": "running"
}
```

### `GET /health`
Check API health status.

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "cineverse-backend"
}
```

---

## Movie Discovery Endpoints (`/api/movies`)

All movie discovery endpoints validate inputs via Pydantic/FastAPI, normalize upstream TMDB v3 JSON payloads, and cache responses briefly in memory (`_TTLCache`) to reduce rate-limit pressure.

### Common Error Responses

| HTTP Status | Meaning | Example `detail` |
|---|---|---|
| `400 Bad Request` | Empty/whitespace search query | `"Search query must not be empty."` |
| `404 Not Found` | Movie ID not found on TMDB | `"Requested movie or resource was not found on TMDB."` |
| `422 Unprocessable Entity` | Invalid query/path parameter (e.g. `min_rating=15`, `year=1700`, invalid `sort_by`) | FastAPI validation error array |
| `429 Too Many Requests` | Upstream TMDB API rate limit exceeded | `"TMDB rate limit exceeded. Please wait briefly and retry."` |
| `502 Bad Gateway` | Upstream TMDB authentication failure (`401`/`403`) or HTTP/transport error | `"TMDB authentication failed. Verify TMDB_ACCESS_TOKEN in backend/.env."` |
| `503 Service Unavailable` | `TMDB_ACCESS_TOKEN` missing/empty in `backend/.env` | `"TMDB API access token is not configured. Set TMDB_ACCESS_TOKEN in backend/.env."` |
| `504 Gateway Timeout` | Upstream TMDB request exceeded timeout | `"TMDB request timed out. Please try again."` |

---

### `GET /api/movies/trending`
Fetch weekly trending movies from TMDB (`/trending/movie/week`).

**Query Parameters:**
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse`
```json
{
  "page": 1,
  "results": [
    {
      "id": 157336,
      "title": "Interstellar",
      "overview": "Explorers travel through a wormhole in space.",
      "poster_path": "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      "backdrop_path": "/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
      "release_date": "2014-11-05",
      "vote_average": 8.4,
      "vote_count": 35000,
      "genre_ids": [12, 18, 878],
      "genres": [],
      "original_language": "en",
      "popularity": 195.4,
      "adult": false
    }
  ],
  "total_pages": 10,
  "total_results": 200,
  "source": "tmdb"
}
```

---

### `GET /api/movies/popular`
Fetch currently popular movies from TMDB (`/movie/popular`).

**Query Parameters:**
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse`

---

### `GET /api/movies/search`
Search movies by title/keywords (`/search/movie`, `include_adult=false`).

**Query Parameters:**
- `query` (`string`, **required**, non-empty `1–200` chars)
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse` (returns `"results": []` with `"total_results": 0` when nothing matches).

---

### `GET /api/movies/genres`
Fetch official TMDB movie genre IDs and names (`/genre/movie/list`, cached 1 hour).

**Response (`200 OK`):**
```json
{
  "genres": [
    { "id": 28, "name": "Action" },
    { "id": 878, "name": "Science Fiction" }
  ]
}
```

---

### `GET /api/movies/discover`
Discover movies with combined TMDB filters and sorting (`/discover/movie`).

**Query Parameters:**
- `genre` (`string`, optional) — Comma or pipe-separated TMDB genre IDs (e.g. `878,18`)
- `language` (`string`, optional) — ISO 639-1 original language code (e.g. `en`, `hi`, `ko`, `ja`, `fr`, `es`)
- `year` (`int`, optional, range `1888–2035`) — `primary_release_year`
- `min_rating` (`float`, optional, range `0.0–10.0`) — `vote_average.gte`
- `min_votes` (`int`, optional) — `vote_count.gte` (defaults to `50` automatically when sorting by rating without explicit `min_votes`)
- `max_votes` (`int`, optional) — `vote_count.lte`
- `sort_by` (`enum`, optional, default `popularity.desc`) — Supported: `popularity` / `popularity.desc` / `popularity.asc`, `rating` / `vote_average.desc` / `vote_average.asc`, `release_date` / `primary_release_date.desc` / `primary_release_date.asc`, `title` / `title.asc` / `title.desc`
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse`

---

### `GET /api/movies/genre/{genre_id}`
Fetch popular movies matching a single TMDB genre ID.

**Path Parameters:**
- `genre_id` (`int`, `> 0`)

**Query Parameters:**
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse`

---

### `GET /api/movies/{movie_id}`
Fetch complete metadata for a single movie (`/movie/{movie_id}`).

**Path Parameters:**
- `movie_id` (`int`, `> 0`)

**Response (`200 OK`):** `MovieDetail`
Includes `id`, `title`, `overview`, `tagline`, `poster_path`, `backdrop_path`, `release_date`, `runtime`, `vote_average`, `vote_count`, `original_language`, `popularity`, `status`, `budget`, `revenue`, `homepage`, `imdb_id`, `genres`, `production_countries`, `spoken_languages`.

---

### `GET /api/movies/{movie_id}/similar`
Fetch TMDB metadata-similar movies (`/movie/{movie_id}/similar`).

> **Note:** This endpoint returns TMDB's native metadata-based similar films, NOT CINEVERSE's ML hybrid recommendation engine (scheduled for Day 4).

**Path Parameters:**
- `movie_id` (`int`, `> 0`)

**Query Parameters:**
- `page` (`int`, optional, default `1`, range `1–500`)

**Response (`200 OK`):** `MovieListResponse`
