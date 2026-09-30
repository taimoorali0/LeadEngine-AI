-- LeadEngine AI — core PostgreSQL schema (Phase 1 foundation + CRM tables).
-- Every tenant-owned table carries organization_id (spec §64).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE organizations (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        CITEXT NOT NULL UNIQUE,
    plan        TEXT NOT NULL DEFAULT 'starter',
    settings    JSONB NOT NULL DEFAULT '{}',          -- incl. scoring rules overrides
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles & permissions (spec §5)
CREATE TABLE roles (
    id    SMALLSERIAL PRIMARY KEY,
    key   TEXT NOT NULL UNIQUE,     -- super_admin, owner, sales_manager, team_leader, researcher, agent, qc, viewer
    name  TEXT NOT NULL
);
CREATE TABLE permissions (
    id    SMALLSERIAL PRIMARY KEY,
    key   TEXT NOT NULL UNIQUE      -- e.g. leads.view_assigned, leads.export_all, companies.delete
);
CREATE TABLE role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES permissions ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                BIGSERIAL PRIMARY KEY,
    organization_id   BIGINT REFERENCES organizations ON DELETE CASCADE,  -- NULL only for super admins
    role_id           SMALLINT NOT NULL REFERENCES roles,
    name              TEXT NOT NULL,
    email             CITEXT NOT NULL UNIQUE,
    password          TEXT NOT NULL,
    two_factor_secret TEXT,
    locale            TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ur','ar')),
    daily_lead_limit  INT,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    last_login_at     TIMESTAMPTZ,
    last_login_ip     INET,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations ON DELETE CASCADE,
    name            TEXT NOT NULL,
    leader_id       BIGINT REFERENCES users ON DELETE SET NULL
);
CREATE TABLE team_user (
    team_id BIGINT NOT NULL REFERENCES teams ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY (team_id, user_id)
);

-- Locations: country > province > city > area (spec §11, §36)
CREATE TABLE locations (
    id           BIGSERIAL PRIMARY KEY,
    parent_id    BIGINT REFERENCES locations ON DELETE CASCADE,
    level        TEXT NOT NULL CHECK (level IN ('country','province','city','area')),
    iso_code     TEXT,                       -- ISO-3166 for countries (PK, SA)
    name_en      TEXT NOT NULL,
    name_ar      TEXT,
    name_ur      TEXT,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    radius_m     INT,                        -- search-grid radius
    search_priority SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (parent_id, level, name_en)
);

-- Industries with aliases (spec §16, §37)
CREATE TABLE industries (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT REFERENCES industries ON DELETE SET NULL,   -- sub-industry
    slug       TEXT NOT NULL UNIQUE,
    name_en    TEXT NOT NULL,
    name_ar    TEXT,
    name_ur    TEXT
);
CREATE TABLE industry_aliases (
    id          BIGSERIAL PRIMARY KEY,
    industry_id BIGINT NOT NULL REFERENCES industries ON DELETE CASCADE,
    alias       TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'en',
    UNIQUE (industry_id, alias)
);

-- Companies exist once per organization (spec §21)
CREATE TABLE companies (
    id                BIGSERIAL PRIMARY KEY,
    organization_id   BIGINT NOT NULL REFERENCES organizations ON DELETE CASCADE,
    name_en           TEXT NOT NULL,
    name_ar           TEXT,
    normalized_name   TEXT NOT NULL,
    industry_id       BIGINT REFERENCES industries,
    sub_industry_id   BIGINT REFERENCES industries,
    classification_confidence NUMERIC(5,2),
    business_category TEXT,
    location_id       BIGINT REFERENCES locations,             -- most specific known level
    address_en        TEXT,
    address_ar        TEXT,
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    website           TEXT,
    website_domain    CITEXT,
    google_place_id   TEXT,
    rating            NUMERIC(2,1),
    review_count      INT,
    business_status   TEXT,
    description_en    TEXT,
    description_ar    TEXT,
    products          JSONB NOT NULL DEFAULT '[]',
    services          JSONB NOT NULL DEFAULT '[]',
    possible_needs    JSONB NOT NULL DEFAULT '[]',               -- AI sales indicators, not facts
    social_links      JSONB NOT NULL DEFAULT '{}',
    enrichment_status TEXT NOT NULL DEFAULT 'pending',
    last_checked_at   TIMESTAMPTZ,
    merged_into_id    BIGINT REFERENCES companies,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, google_place_id)
);
CREATE INDEX companies_name_trgm ON companies USING gin (normalized_name gin_trgm_ops);
CREATE INDEX companies_domain ON companies (organization_id, website_domain);
CREATE INDEX companies_industry ON companies (organization_id, industry_id);

CREATE TABLE company_phones (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies ON DELETE CASCADE,
    original     TEXT NOT NULL,
    normalized   TEXT,                -- E.164
    country_code TEXT,
    country      TEXT,
    phone_type   TEXT,
    source       TEXT NOT NULL,
    UNIQUE (company_id, normalized)
);
CREATE INDEX company_phones_normalized ON company_phones (normalized);

CREATE TABLE company_emails (
    id         BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies ON DELETE CASCADE,
    email      CITEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'general',
    status     TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('published','verified','unverified','invalid')),
    source     TEXT NOT NULL,
    UNIQUE (company_id, email)
);

CREATE TABLE contacts (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NOT NULL REFERENCES companies ON DELETE CASCADE,
    name        TEXT NOT NULL,
    title       TEXT,
    phone       TEXT,
    email       CITEXT,
    source      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provenance: which source supplied which fields (spec §58: facts stay linked to source)
CREATE TABLE company_sources (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies ON DELETE CASCADE,
    source       TEXT NOT NULL,          -- google_places, website, csv, manual
    external_ref TEXT,
    campaign_id  BIGINT,
    keyword      TEXT,
    raw_payload  JSONB,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns (spec §7, §31)
CREATE TABLE campaigns (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations ON DELETE CASCADE,
    created_by       BIGINT REFERENCES users ON DELETE SET NULL,
    name             TEXT NOT NULL,
    country_id       BIGINT NOT NULL REFERENCES locations,
    industry_id      BIGINT REFERENCES industries,
    company_type     TEXT NOT NULL,
    target_results   INT NOT NULL DEFAULT 500,
    filters          JSONB NOT NULL DEFAULT '{}',   -- must_have_phone, min_rating, min_reviews, ...
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','queued','running','completed','failed','cancelled')),
    progress         JSONB NOT NULL DEFAULT '{}',   -- per-stage percentages
    stats            JSONB NOT NULL DEFAULT '{}',   -- queries, found, duplicates, saved, emails...
    last_run_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE company_sources ADD FOREIGN KEY (campaign_id) REFERENCES campaigns ON DELETE SET NULL;

CREATE TABLE campaign_locations (
    campaign_id BIGINT NOT NULL REFERENCES campaigns ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations,
    PRIMARY KEY (campaign_id, location_id)
);
CREATE TABLE campaign_keywords (
    id          BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaigns ON DELETE CASCADE,
    keyword     TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'en',
    origin      TEXT NOT NULL DEFAULT 'generated' CHECK (origin IN ('generated','custom')),
    enabled     BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (campaign_id, keyword)
);
CREATE TABLE campaign_runs (
    id            BIGSERIAL PRIMARY KEY,
    campaign_id   BIGINT NOT NULL REFERENCES campaigns ON DELETE CASCADE,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    stats         JSONB NOT NULL DEFAULT '{}',
    new_companies INT NOT NULL DEFAULT 0          -- spec §32
);

-- Leads: a sales opportunity for a company within a campaign (spec §21, §26)
CREATE TABLE leads (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations ON DELETE CASCADE,
    company_id      BIGINT NOT NULL REFERENCES companies ON DELETE CASCADE,
    campaign_id     BIGINT REFERENCES campaigns ON DELETE SET NULL,
    assigned_to     BIGINT REFERENCES users ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                        'new','verified','qualified','assigned','contacted','follow_up','interested',
                        'meeting','proposal','won','not_interested','invalid','duplicate','closed')),
    score           SMALLINT CHECK (score BETWEEN 0 AND 100),
    score_breakdown JSONB NOT NULL DEFAULT '{}',
    quality         TEXT,
    pipeline_position INT NOT NULL DEFAULT 0,      -- kanban ordering
    next_follow_up_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, campaign_id)
);
CREATE INDEX leads_board ON leads (organization_id, status, pipeline_position);
CREATE INDEX leads_assignee ON leads (assigned_to, status);

CREATE TABLE follow_ups (
    id          BIGSERIAL PRIMARY KEY,
    lead_id     BIGINT NOT NULL REFERENCES leads ON DELETE CASCADE,
    user_id     BIGINT REFERENCES users ON DELETE SET NULL,
    due_at      TIMESTAMPTZ NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('call','email','meeting','whatsapp','task')),
    priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    notes       TEXT,
    completed_at TIMESTAMPTZ
);
CREATE INDEX follow_ups_due ON follow_ups (user_id, due_at) WHERE completed_at IS NULL;

CREATE TABLE lead_activities (
    id         BIGSERIAL PRIMARY KEY,
    lead_id    BIGINT NOT NULL REFERENCES leads ON DELETE CASCADE,
    user_id    BIGINT REFERENCES users ON DELETE SET NULL,
    type       TEXT NOT NULL,     -- created, assigned, call, note, status_changed, follow_up, meeting, proposal, won
    body       TEXT,
    meta       JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_timeline ON lead_activities (lead_id, created_at);

-- Audit log (spec §55)
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES organizations ON DELETE SET NULL,
    user_id         BIGINT REFERENCES users ON DELETE SET NULL,
    action          TEXT NOT NULL,       -- auth.login, leads.export, campaign.start, ...
    subject_type    TEXT,
    subject_id      BIGINT,
    meta            JSONB NOT NULL DEFAULT '{}',
    ip              INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_time ON audit_logs (organization_id, created_at DESC);

-- Usage / cost tracking (spec §66-67)
CREATE TABLE usage_events (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations ON DELETE CASCADE,
    campaign_id     BIGINT REFERENCES campaigns ON DELETE SET NULL,
    kind            TEXT NOT NULL,    -- google_search, website_enrichment, ai_analysis, email_verification
    credits         INT NOT NULL DEFAULT 1,
    cost_usd        NUMERIC(10,5) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
