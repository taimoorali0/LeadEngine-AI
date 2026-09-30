# LeadEngine AI

Multi-industry business discovery, enrichment, lead scoring and CRM platform.

**Search → Discover → Verify → Enrich → Score → Assign → Follow Up → Convert**

## Repository layout

| Path | Status | Purpose |
|---|---|---|
| `python-engine/` | ✅ working, tested | FastAPI data engine: phone normalization, email extraction, dedup, lead scoring, keyword generation, website enrichment |
| `database/` | ✅ validated on PostgreSQL | Core schema (`schema.sql`) and seed data (`seed.sql`): orgs, RBAC, locations, industries, companies, campaigns, leads, CRM, audit, usage |
| `backend/` | ⏳ next | Laravel 12 API (auth, RBAC, campaigns, CRM, queues, Reverb) |
| `frontend/` | ⏳ next | Angular + Tailwind PWA (dashboard, campaign builder, leads, Kanban) |
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

## Local stack

`docker compose up` starts PostgreSQL (auto-loads the schema and seed), Redis and the Python engine.
