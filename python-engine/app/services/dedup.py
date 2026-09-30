"""Duplicate detection (spec §20)."""
from __future__ import annotations

import math
import re
from urllib.parse import urlparse

from rapidfuzz import fuzz

from app.models import CompanyRecord, DuplicateMatch
from app.services.phones import normalize_phone

_LEGAL_SUFFIXES = re.compile(
    r"\b(pvt|private|ltd|limited|llc|inc|co|company|corp|corporation|plc|smc|est|group)\b\.?", re.I
)
DUPLICATE_THRESHOLD = 85.0


def normalize_name(name: str) -> str:
    name = _LEGAL_SUFFIXES.sub(" ", name.lower())
    name = re.sub(r"[^\w\s]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def domain_of(url_or_email: str | None) -> str | None:
    if not url_or_email:
        return None
    if "@" in url_or_email and "://" not in url_or_email:
        host = url_or_email.rsplit("@", 1)[1]
    else:
        host = urlparse(url_or_email if "://" in url_or_email else "http://" + url_or_email).hostname or ""
    host = host.lower().removeprefix("www.")
    return host or None


def _phone(value: str | None) -> str | None:
    return normalize_phone(value).normalized if value else None


def _haversine_m(a: CompanyRecord, b: CompanyRecord) -> float | None:
    if None in (a.latitude, a.longitude, b.latitude, b.longitude):
        return None
    r = 6_371_000
    p1, p2 = math.radians(a.latitude), math.radians(b.latitude)
    dp, dl = p2 - p1, math.radians(b.longitude - a.longitude)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def compare(a: CompanyRecord, b: CompanyRecord) -> DuplicateMatch:
    name_sim = fuzz.token_set_ratio(normalize_name(a.name), normalize_name(b.name))
    phone_match = bool(_phone(a.phone)) and _phone(a.phone) == _phone(b.phone)
    website_match = bool(domain_of(a.website)) and domain_of(a.website) == domain_of(b.website)
    email_domain_match = bool(domain_of(a.email)) and domain_of(a.email) == domain_of(b.email)
    address_sim = fuzz.token_set_ratio(a.address.lower(), b.address.lower()) if a.address and b.address else 0.0
    google_match = bool(a.google_place_id) and a.google_place_id == b.google_place_id
    distance = _haversine_m(a, b)

    if google_match:
        confidence = 100.0
    else:
        # Name similarity is the base; strong identifiers raise confidence.
        confidence = name_sim * 0.5
        if phone_match:
            confidence += 25
        if website_match:
            confidence += 25
        elif email_domain_match:
            confidence += 15
        if address_sim >= 85:
            confidence += 10
        if distance is not None and distance <= 100:
            confidence += 10
        # A shared identifier on differently-named businesses (e.g. a shared
        # switchboard) is not enough on its own.
        if name_sim < 60:
            confidence = min(confidence, 70)
        confidence = min(confidence, 99.0)

    return DuplicateMatch(
        candidate_id=b.id,
        name_similarity=round(name_sim, 1),
        phone_match=phone_match,
        website_match=website_match,
        email_domain_match=email_domain_match,
        address_similarity=round(address_sim, 1),
        google_ref_match=google_match,
        distance_m=round(distance, 1) if distance is not None else None,
        confidence=round(confidence, 1),
        is_duplicate=confidence >= DUPLICATE_THRESHOLD,
    )


def find_duplicates(record: CompanyRecord, existing: list[CompanyRecord]) -> list[DuplicateMatch]:
    matches = [compare(record, other) for other in existing]
    return sorted((m for m in matches if m.is_duplicate), key=lambda m: m.confidence, reverse=True)
