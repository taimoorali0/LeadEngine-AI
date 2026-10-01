# LeadEngine AI

Multi-industry business discovery, enrichment, lead scoring and CRM platform.

**Search → Discover → Verify → Enrich → Score → Assign → Follow Up → Convert**

## Install

**→ See [docs/INSTALL.md](docs/INSTALL.md).** Short version:

- **Any computer (Docker):** `docker compose up -d --build`, then open http://localhost:8080
- **Ubuntu server:** `sudo bash deploy/ubuntu/install.sh`, then open http://your-server-ip

Demo login: `owner@leadengine.test` / `password`.

## Repository layout

| Path | Status | Purpose |
|---|---|---|
| `python-engine/` | ✅ working, tested | FastAPI data engine: phone normalization, email extraction, dedup, lead scoring, keyword generation, website enrichment, AI analysis (OpenAI or rule-based fallback) |
| `database/` | ✅ validated on PostgreSQL | Core schema (`schema.sql`) and seed data (`seed.sql`): orgs, RBAC, locations, industries, companies, campaigns, leads, CRM, audit, usage |
| `backend/` | ✅ working, tested | Laravel 12 API: Sanctum auth + TOTP 2FA, roles/permissions, users/teams, tenancy, campaigns, Google Places discovery, dedup/merge, scoring, enrichment + AI jobs, CRM, automation rules, auto-assignment, notifications, Reverb live updates, reports, plans/credits, audit logs |
| `frontend/` | ✅ builds, e2e-checked | Angular 20 + Tailwind PWA-ready SPA in English, Urdu and Arabic (RTL): everything above plus reports, automation builder, users/teams, settings, billing, cost dashboard, notifications |
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
# 1. Services: PostgreSQL + Redis running locally
# 2. Python engine
cd python-engine && uvicorn app.main:app --port 8001
# 3. Laravel API
cd backend && composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed          # loads database/schema.sql + seed.sql, creates owner@leadengine.test / password
php artisan serve --port=8000
php artisan queue:work              # runs campaigns, enrichment, AI analysis, notifications
php artisan reverb:start            # WebSocket server for live updates (port 8080)
php artisan schedule:work           # follow-up reminders, campaign refresh, monthly credits
# 4. Angular app (proxies /api to :8000)
cd frontend && npm install && npm start   # http://localhost:4200
```

Set `GOOGLE_PLACES_API_KEY` in `backend/.env` so campaigns can discover businesses.
Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`) in the **Python engine's** environment for
AI summaries and classification. Without it the engine uses a rule-based classifier, so the pipeline still works.
Without it, campaign runs end as **failed**, with every query counted under *failed queries*.

Tests: `cd backend && php artisan test` (needs a `leadengine_test` PostgreSQL database), `cd python-engine && pytest`.

