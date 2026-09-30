"""Lead scoring (spec §22-23)."""
from __future__ import annotations

from app.models import ScoreResult, ScoringInput, ScoringRules


def score_lead(data: ScoringInput, rules: ScoringRules | None = None) -> ScoreResult:
    rules = rules or ScoringRules()
    breakdown = {
        "phone": rules.phone if data.has_phone else 0,
        "website": rules.website if data.has_website else 0,
        "email": rules.email if data.has_email else 0,
        "business_active": rules.business_active if data.business_active else 0,
        "industry_match": rules.industry_match if data.industry_match else 0,
        "location_match": rules.location_match if data.location_match else 0,
        "rating_above_threshold": rules.rating_above_threshold
        if data.rating is not None and data.rating >= rules.rating_threshold
        else 0,
        "online_presence": rules.online_presence if data.has_social_profiles else 0,
        "profile_complete": rules.profile_complete if data.profile_complete else 0,
    }
    score = min(sum(breakdown.values()), 100)
    category = next(label for floor, label in sorted(rules.bands, reverse=True) if score >= floor)
    return ScoreResult(score=score, category=category, breakdown=breakdown)
