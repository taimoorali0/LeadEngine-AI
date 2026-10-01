# LeadEngine AI

Multi-industry business discovery, enrichment, lead scoring and CRM platform.

**Search → Discover → Verify → Enrich → Score → Assign → Follow Up → Convert**

## Repository layout

| Path | Status | Purpose |
|---|---|---|
| `python-engine/` | ✅ working, tested | FastAPI data engine: phone normalization, email extraction, dedup, lead scoring, keyword generation, website enrichment |
| `database/` | ✅ validated on PostgreSQL | Core schema (`schema.sql`) and seed data (`seed.sql`): orgs, RBAC, locations, industries, companies, campaigns, leads, CRM, audit, usage |
| `backend/` | ✅ working, tested | Laravel 12 API: Sanctum auth, roles/permissions, tenancy, campaigns, Google Places discovery job, dedup/merge, scoring, enrichment job, CRM (leads, Kanban, notes, follow-ups, timeline), export, search, audit logs |
| `frontend/` | ✅ builds, e2e-checked | Angular 20 + Tailwind: login, dashboard, campaign builder, live campaign progress, leads table, Kanban pipeline, lead and company 360° pages, follow-ups, global search |
| `docs/ROADMAP.md` | | Architecture and phase plan |

## Python engine

```bash
cd python-engine
pip install -r requirements.txt
pytest                       # run the test suite
uvicorn app.main:app --port 8001
```

Endpoints: `GET /health`, `POST /phones/normalize`, `POST /dedup/check`, `POST /scoring/score`,
`POST /keywords/generate`, `POST /enrich/website`.

## Database

```bash
createdb leadengine
psql -d leadengine -f database/schema.sql -f database/seed.sql
```

## Running everything locally

```bash
# 1. Services: PostgreSQL + Redis (or `docker compose up database redis python-engine`)
# 2. Python engine
cd python-engine && uvicorn app.main:app --port 8001
# 3. Laravel API
cd backend && composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed          # loads database/schema.sql + seed.sql, creates owner@leadengine.test / password
php artisan serve --port=8000
php artisan queue:work              # runs campaigns and enrichment
# 4. Angular app (proxies /api to :8000)
cd frontend && npm install && npm start   # http://localhost:4200
```

Set `GOOGLE_PLACES_API_KEY` in `backend/.env` so campaigns can discover businesses.
Without it, campaign runs end as **failed**, with every query counted under *failed queries*.

Tests: `cd backend && php artisan test` (needs a `leadengine_test` PostgreSQL database), `cd python-engine && pytest`.

## Local stack

`docker compose up` starts PostgreSQL (auto-loads the schema and seed), Redis and the Python engine.
