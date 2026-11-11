# CINEVERSE — Database Schema

> Status: **Planned** — Will be implemented in Day 2.

This document will describe the full Supabase/PostgreSQL database schema for CINEVERSE, including:

- Table definitions with column types and constraints
- Foreign key relationships
- Row Level Security (RLS) policies
- Indexes for performance
- Supabase Auth integration

---

## Planned Tables

### `users`
Extends Supabase Auth. Stores public profile data.

### `movies`
Cached movie metadata fetched from TMDB. Avoids redundant API calls.

### `genres`
Reference table for movie genres.

### `ratings`
User-submitted ratings (1–10 scale) for movies.

### `watchlist`
Movies a user has bookmarked to watch later.

### `viewing_history`
Movies a user has marked as watched.

### `preferences`
Explicit user preference settings (favourite genres, languages, etc.).

### `conversations`
MIRA chat sessions, one per conversation thread.

### `messages`
Individual messages within a MIRA conversation.

### `recommendation_feedback`
Thumbs up/down feedback on individual recommendations.

---

> This document will be completed in Day 2.
