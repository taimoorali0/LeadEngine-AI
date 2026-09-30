"""LeadEngine Python data engine (FastAPI). Called by the Laravel API/workers."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.models import (
    CompanyRecord, DuplicateMatch, NormalizedPhone, ScoreResult, ScoringInput, ScoringRules, WebsiteExtraction,
)
from app.services.dedup import find_duplicates
from app.services.keywords import generate_keywords
from app.services.phones import normalize_phone
from app.services.scoring import score_lead
from app.services.website import enrich_website

app = FastAPI(title="LeadEngine Data Engine", version="0.1.0")


class PhoneRequest(BaseModel):
    numbers: list[str]
    default_region: str = "PK"


class DedupRequest(BaseModel):
    record: CompanyRecord
    existing: list[CompanyRecord]


class ScoreRequest(BaseModel):
    lead: ScoringInput
    rules: ScoringRules | None = None


class KeywordRequest(BaseModel):
    company_type: str
    languages: list[str] = ["en"]


class EnrichRequest(BaseModel):
    url: str
    default_region: str = "PK"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/phones/normalize", response_model=list[NormalizedPhone])
def phones(req: PhoneRequest):
    return [normalize_phone(n, req.default_region) for n in req.numbers]


@app.post("/dedup/check", response_model=list[DuplicateMatch])
def dedup(req: DedupRequest):
    return find_duplicates(req.record, req.existing)


@app.post("/scoring/score", response_model=ScoreResult)
def scoring(req: ScoreRequest):
    return score_lead(req.lead, req.rules)


@app.post("/keywords/generate", response_model=list[str])
def keywords(req: KeywordRequest):
    return generate_keywords(req.company_type, req.languages)


@app.post("/enrich/website", response_model=WebsiteExtraction)
async def enrich(req: EnrichRequest):
    return await enrich_website(req.url, req.default_region)
