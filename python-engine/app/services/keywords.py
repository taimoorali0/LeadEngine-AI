"""Deterministic keyword expansion for business discovery.

The user's phrase is always preserved. Known business types receive curated aliases;
unknown phrases still get useful company/supplier/manufacturer/store variants.
"""
from __future__ import annotations

SEED_TERMS: dict[str, list[str]] = {
    "clothing brand": [
        "Fashion Brand", "Apparel Brand", "Ready-to-Wear Brand", "Designer Clothing",
        "Women's Clothing Brand", "Men's Clothing Brand", "Kids Clothing Brand",
        "Sportswear Brand", "Boutique", "Fashion Store",
    ],
    "clothing brands": [
        "Fashion Brands", "Apparel Brands", "Ready-to-Wear", "Designer Clothing",
        "Women's Clothing", "Men's Clothing", "Kids Clothing", "Sportswear",
        "Boutiques", "Clothing Stores",
    ],
    "fashion brand": ["Clothing Brand", "Apparel Brand", "Ready-to-Wear", "Designer Clothing", "Boutique"],
    "paper manufacturer": [
        "Paper Mill", "Paper Factory", "Tissue Manufacturer", "Paper Products Manufacturer",
        "Packaging Manufacturer", "Corrugated Manufacturer", "Paper Converting Company",
    ],
    "real estate agency": [
        "Property Dealer", "Property Consultant", "Estate Agent", "Property Agent", "Realtor",
        "Real Estate Developer", "Builders",
    ],
    "real estate developer": ["Property Developer", "Builders", "Housing Developer", "Construction Developer"],
    "hospital": ["Clinic", "Medical Center", "Diagnostic Center", "Healthcare Center"],
    "medical equipment supplier": ["DME Supplier", "Healthcare Equipment Supplier", "Medical Supply Store"],
    "textile mill": ["Textile Manufacturer", "Spinning Mill", "Weaving Mill", "Garment Factory", "Dyeing Unit"],
    "solar installation company": ["Solar Installer", "Solar Panel Supplier", "Solar Energy Company", "Solar EPC"],
    "solar company": ["Solar Installer", "Solar EPC", "Solar Energy Company", "Solar Panel Supplier"],
    "construction company": ["Contractor", "Builders", "Civil Engineering Company", "General Contractor"],
    "digital marketing agency": ["Marketing Agency", "Performance Marketing Agency", "Advertising Agency", "Creative Agency"],
    "software company": ["Software House", "IT Company", "Web Development Company", "App Development Company"],
    "logistics company": ["Freight Company", "Freight Forwarder", "3PL", "Transport Company", "Warehousing Company"],
    "restaurant": ["Restaurant", "Cafe", "Food Restaurant", "Dining"],
    "hotel": ["Hotel", "Resort", "Accommodation"],
    "school": ["Private School", "Education Institute", "Academy"],
    "college": ["Private College", "Education Institute"],
    "law firm": ["Law Firm", "Legal Firm", "Lawyers", "Legal Consultants"],
    "car dealer": ["Auto Dealer", "Vehicle Dealer", "Car Showroom"],
    "security company": ["Security Services", "Guarding Company", "CCTV Company", "Surveillance Company"],
}

ARABIC_TERMS: dict[str, list[str]] = {
    "paper manufacturer": ["مصنع ورق", "مصنع مناديل", "مصنع كرتون"],
    "hospital": ["مستشفى", "عيادة", "مركز طبي"],
    "construction company": ["شركة مقاولات", "شركة بناء"],
    "real estate agency": ["مكتب عقار", "شركة عقارية"],
    "clothing brand": ["علامة ملابس", "متجر أزياء", "ملابس جاهزة"],
    "solar company": ["شركة طاقة شمسية", "تركيب ألواح شمسية"],
}

_SUFFIX_VARIANTS = ("manufacturer", "company", "factory", "mill", "supplier", "agency", "store", "brand")


def _variants(term: str) -> list[str]:
    clean = " ".join(term.strip().split())
    words = clean.split()
    if not words:
        return []
    lower_last = words[-1].lower()
    stem = " ".join(words[:-1]).strip()
    if lower_last in _SUFFIX_VARIANTS and stem:
        return [f"{stem} {s}" for s in ("Manufacturer", "Company", "Supplier", "Store", "Agency")]
    # Unknown free-text request: add conservative business-intent variants.
    return [f"{clean} Company", f"{clean} Supplier", f"{clean} Store"]


def generate_keywords(company_type: str, languages: list[str] | None = None) -> list[str]:
    languages = languages or ["en"]
    clean = " ".join(company_type.strip().split())
    key = clean.lower()
    out = [clean]
    out += SEED_TERMS.get(key, [])
    # Singular/plural normalization for common user phrasing.
    if key.endswith("s") and key[:-1] in SEED_TERMS:
        out += SEED_TERMS[key[:-1]]
    out += _variants(clean)
    if "ar" in languages:
        out += ARABIC_TERMS.get(key, [])
    seen: set[str] = set()
    return [k for k in out if k and not (k.lower() in seen or seen.add(k.lower()))][:24]
