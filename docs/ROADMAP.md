# Architecture & Roadmap

## Architecture

```
Angular PWA (app.leadengine)  →  Laravel API (api.leadengine)  →  Redis queues
                                        │                              │
                                   PostgreSQL  ←──────────  Python engine (FastAPI workers)
                                                                       │
                                                  Google Places · company websites · CSV · manual
```

- **Laravel** owns auth, RBAC, tenancy (`organization_id` on every tenant table), campaigns, CRM, audit logs,
  exports and billing. It dispatches campaign jobs to Redis and broadcasts progress via Reverb.
- **Python engine** is stateless and does the data work. Laravel calls it over HTTP.
- **Source connectors** implement one `LeadSourceInterface` (`GooglePlacesSource`, `WebsiteCrawlerSource`,
  `CsvSource`, `ManualSource`) so new sources plug in without touching campaign logic.
- API keys (Google, OpenAI) are server-side only.
- Every company record keeps its provenance in `company_sources`. AI output (`possible_needs`, summaries)
  is stored apart from sourced facts.

## Design decisions in the engine

- **Phones:** stored as original plus E.164. Pakistani mobiles written without the trunk prefix (`3041234567`) are accepted.
- **Emails:** emails scraped from a site are `published`. Only an email verification step can mark one `verified`.
- **Dedup:** a matching Google place ID means the same company. Otherwise the confidence score starts from
  name similarity (legal suffixes like "Pvt Ltd" are stripped) and adds points for matching phone,
  website or email domain, address, and coordinates within 100 m. The threshold is 85. When names clearly
  differ, confidence is capped at 70, so two businesses sharing one switchboard number are not merged.
- **Scoring:** default weights follow the spec (max 100). Weights, the rating threshold and quality bands can
  be overridden per organization.

## Phases

1. **Foundation**: auth, roles, users, companies, industries, locations, campaigns, basic leads *(done)*
2. **Google discovery**: Places connector, area-based search, keyword generator, progress (polling), dedup *(done; auto-generated geo grid and live WebSockets/Reverb pending)*
3. **Python enrichment**: crawler *(basic multi-page version done)*, phone/email/social extraction *(done)*, AI summary and classification
4. **CRM**: statuses, Kanban, assignments, notes, follow-ups, activities *(done)*; notifications pending
5. **Intelligence**: AI summaries, opportunity classification, campaign analytics
6. **Automation**: rules engine, auto-assignment, scheduled refresh, new-business alerts
7. **SaaS**: plans, billing, credits, onboarding

## Not yet built

- Two-factor auth, user/team management screens, settings UI
- Notifications, Reverb live updates (campaign page polls every 3 s for now)
- AI features (summaries, classification, opportunity detection, natural-language campaigns)
- Translations (EN/UR/AR UI): the data model is already bilingual
- Auto-assignment rules, automation, scheduled refresh, billing/credits UI, reports
