# CINEVERSE

> **Discover Beyond the Ordinary.**

CINEVERSE is an intelligent movie discovery and recommendation platform powered by machine learning and conversational AI. It helps users find films that genuinely match their taste — not just what's popular this week.

---

## Problem Statement

Most streaming platforms recommend content based on what you just watched or what is trending globally. They don't understand individual taste, context, or nuance. CINEVERSE addresses this by combining content-based filtering, collaborative filtering, and a conversational AI assistant (MIRA) that understands natural-language requests like *"I want something like Arrival but lighter in tone"*.

---

## Objectives

1. Build a personalised movie recommendation engine using real movie data.
2. Implement a hybrid recommendation system (content-based + collaborative filtering).
3. Create MIRA, a conversational AI assistant that understands movie preferences.
4. Provide explainable recommendations — users know *why* a film was suggested.
5. Build a professional, cinematic frontend experience.
6. Use industry-standard tools and practices throughout.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Framer Motion, Lucide React |
| **Backend** | Python 3.15, FastAPI, Pydantic, HTTPX |
| **Machine Learning** | Pandas, NumPy, scikit-learn, SciPy, TF-IDF, Cosine Similarity, SVD |
| **Database** | Supabase (PostgreSQL + Auth) |
| **External APIs** | TMDB (movie data), LLM API (MIRA's intelligence) |

---

## Project Structure

```
CINEVERSE/
├── frontend/               # Next.js application
│   └── src/
│       ├── app/            # Pages (App Router)
│       ├── components/     # UI components
│       ├── services/       # API communication
│       ├── lib/            # Utility functions
│       ├── hooks/          # Custom React hooks
│       ├── types/          # TypeScript type definitions
│       └── ...
│
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── main.py         # App entry point
│   │   ├── api/routes/     # API endpoint handlers
│   │   ├── core/           # Config, security
│   │   ├── services/       # Business logic
│   │   └── schemas/        # Pydantic models
│   │
│   └── ml/                 # Machine learning pipeline
│       ├── preprocessing/  # Data cleaning and feature engineering
│       ├── models/         # Trained model artifacts
│       └── notebooks/      # Exploration notebooks
│
└── docs/                   # Architecture and API documentation
```

---

## Installation

### Prerequisites

- Node.js 20+
- Python 3.11+
- npm or pnpm

### Frontend

```bash
cd frontend
npm install
```

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

---

## Running the Application

### Start the backend (FastAPI)

```bash
cd backend

# Activate venv first (see above)

# Run with auto-reload for development
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at: http://127.0.0.1:8000

### Start the frontend (Next.js)

```bash
cd frontend
npm run dev
```

The frontend will be available at: http://localhost:3000

---

## Environment Configuration

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in your credentials:

```
DEBUG=true
FRONTEND_ORIGIN=http://localhost:3000
TMDB_ACCESS_TOKEN=your_token_here
LLM_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key_here
```

### Frontend (`frontend/.env.local`)

Copy `frontend/.env.local.example` to `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

> **Security note:** Never put secret API keys in `NEXT_PUBLIC_` variables. Those values are visible to anyone who opens your website's source code.

---

## Development Status

> This project is in active development as a college internship project.

| Phase | Status |
|---|---|
| Day 1: Foundation & Architecture | ✅ Complete |
| Day 2: Database Schema | ⏳ Upcoming |
| Day 3: ML Pipeline | ⏳ Upcoming |
| Day 4: Recommendation Engine | ⏳ Upcoming |
| Day 5: MIRA Integration | ⏳ Upcoming |
| Day 6: Frontend UI | ⏳ Upcoming |

---

## Author

Built as a college internship project demonstrating full-stack ML engineering.
