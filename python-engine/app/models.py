from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EmailStatus = Literal["published", "verified", "unverified", "invalid"]


class NormalizedPhone(BaseModel):
    original: str
    normalized: str | None = None
    country_code: str | None = None
    country: str | None = None
    phone_type: str | None = None
    valid: bool


class ClassifiedEmail(BaseModel):
    email: str
    type: str
    status: EmailStatus


class CompanyRecord(BaseModel):
    """A company as seen by a discovery source, before deduplication."""

    id: str | None = None
    name: str
    website: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    google_place_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class DuplicateMatch(BaseModel):
    candidate_id: str | None
    name_similarity: float
    phone_match: bool
    website_match: bool
    email_domain_match: bool
    address_similarity: float
    google_ref_match: bool
    distance_m: float | None
    confidence: float
    is_duplicate: bool


class ScoringInput(BaseModel):
    has_phone: bool = False
    has_website: bool = False
    has_email: bool = False
    business_active: bool = False
    industry_match: bool = False
    location_match: bool = False
    rating: float | None = None
    has_social_profiles: bool = False
    profile_complete: bool = False


class ScoringRules(BaseModel):
    """Per-organization overridable weights (spec §22-23)."""

    phone: int = 15
    website: int = 15
    email: int = 20
    business_active: int = 10
    industry_match: int = 15
    location_match: int = 10
    rating_above_threshold: int = 5
    online_presence: int = 5
    profile_complete: int = 5
    rating_threshold: float = 3.5
    bands: list[tuple[int, str]] = Field(
        default=[(90, "Highly Qualified"), (75, "Qualified"), (55, "Needs Review"), (0, "Needs Enrichment")]
    )


class ScoreResult(BaseModel):
    score: int
    category: str
    breakdown: dict[str, int]


class WebsiteExtraction(BaseModel):
    emails: list[ClassifiedEmail]
    phones: list[NormalizedPhone]
    social_links: dict[str, str]
    title: str | None = None
    description: str | None = None
    text: str = ""  # visible page text, trimmed; input for AI analysis


class IndustryOption(BaseModel):
    slug: str
    name: str
    aliases: list[str] = []
    parent_slug: str | None = None


class AnalyzeRequest(BaseModel):
    name: str
    text: str = ""
    description: str | None = None
    category: str | None = None
    industries: list[IndustryOption] = []
    offerings: list[str] = []  # what the user's company sells, to judge relevance
    language: Literal["en", "ar", "ur"] = "en"


class Analysis(BaseModel):
    summary: str | None
    industry_slug: str | None
    sub_industry_slug: str | None
    confidence: float  # 0-100
    possible_needs: list[str]
    products: list[str]
    services: list[str]
    provider: str
