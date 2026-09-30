"""Rule-based search keyword generator (spec §8, §37-38).

This is the deterministic baseline; an AI provider can extend the list later.
"""
from __future__ import annotations

# Industry seeds: canonical term -> related search terms and local aliases.
SEED_TERMS: dict[str, list[str]] = {
    "paper manufacturer": [
        "Paper Mill", "Paper Factory", "Tissue Manufacturer", "Paper Products Manufacturer",
        "Packaging Manufacturer", "Corrugated Manufacturer", "Paper Converting Company",
    ],
    "real estate agency": [
        "Property Dealer", "Property Consultant", "Estate Agent", "Property Agent", "Realtor",
        "Real Estate Developer", "Builders",
    ],
    "hospital": ["Clinic", "Medical Center", "Diagnostic Center", "Healthcare Center"],
    "textile mill": ["Textile Manufacturer", "Spinning Mill", "Weaving Mill", "Garment Factory", "Dyeing Unit"],
    "solar installation company": ["Solar Installer", "Solar Panel Supplier", "Solar Energy Company", "Solar EPC"],
    "construction company": ["Contractor", "Builders", "Civil Engineering Company", "General Contractor"],
}

ARABIC_TERMS: dict[str, list[str]] = {
    "paper manufacturer": ["مصنع ورق", "مصنع مناديل", "مصنع كرتون"],
    "hospital": ["مستشفى", "عيادة", "مركز طبي"],
    "construction company": ["شركة مقاولات", "شركة بناء"],
    "real estate agency": ["مكتب عقار", "شركة عقارية"],
}

_SUFFIX_VARIANTS = ("Manufacturer", "Company", "Factory", "Mill", "Supplier")


def _variants(term: str) -> list[str]:
    words = term.title().split()
    if words and words[-1] in _SUFFIX_VARIANTS:
        stem = " ".join(words[:-1])
        return [f"{stem} {s}" for s in ("Manufacturer", "Factory", "Company")]
    return []


def generate_keywords(company_type: str, languages: list[str] | None = None) -> list[str]:
    languages = languages or ["en"]
    key = company_type.strip().lower()
    out = [company_type.strip().title()]
    out += SEED_TERMS.get(key, [])
    out += _variants(company_type)
    if "ar" in languages:
        out += ARABIC_TERMS.get(key, [])
    seen: set[str] = set()
    return [k for k in out if not (k.lower() in seen or seen.add(k.lower()))]
