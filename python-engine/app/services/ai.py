"""Company analysis (spec §15-17): summary, industry classification, products,
services and *possible* needs.

Uses the OpenAI API when OPENAI_API_KEY is set; otherwise a deterministic,
rule-based analyzer so the pipeline works without an AI provider. Output is a
sales research indicator, never a sourced fact.
"""
from __future__ import annotations

import json
import os
import re

import httpx

from app.models import AnalyzeRequest, Analysis

# Likely needs by industry family, used by the rule-based analyzer.
NEEDS_BY_FAMILY: dict[str, list[str]] = {
    "manufactur": ["Industrial automation", "Electrical maintenance", "Preventive maintenance", "Machine installation",
                   "Fabrication", "Mechanical services"],
    "mill": ["Industrial automation", "Electrical maintenance", "Preventive maintenance", "Machine installation"],
    "textile": ["Industrial automation", "Electrical maintenance", "HVAC", "Preventive maintenance"],
    "paper": ["Industrial automation", "Electrical maintenance", "Machine installation", "Preventive maintenance"],
    "health": ["Medical equipment", "HVAC", "Facility maintenance", "IT services"],
    "hospital": ["Medical equipment", "HVAC", "Facility maintenance", "Power backup"],
    "real-estate": ["Marketing services", "CRM software", "Construction services"],
    "real estate": ["Marketing services", "CRM software", "Construction services"],
    "education": ["IT services", "Facility maintenance", "Solar energy"],
    "construction": ["Machinery", "Manpower", "Fabrication", "Electrical services"],
}

_PRODUCT_HINTS = re.compile(r"\b(?:we (?:manufacture|produce|supply|offer)|our products(?: include)?|products?:)\s+([^.]{5,160})", re.I)
_SERVICE_HINTS = re.compile(r"\b(?:our services(?: include)?|services?:|we provide)\s+([^.]{5,160})", re.I)


def _split_list(fragment: str) -> list[str]:
    parts = re.split(r",|;| and | & |\|", fragment)
    return [p.strip(" .:-").capitalize() for p in parts if 2 < len(p.strip()) < 50][:8]


def _sentences(text: str, n: int) -> str:
    found = re.findall(r"[^.!?]{25,300}[.!?]", text)
    return " ".join(s.strip() for s in found[:n])


def analyze_rules(req: AnalyzeRequest) -> Analysis:
    haystack = f"{req.name} {req.category or ''} {req.description or ''} {req.text}".lower()

    def hits(opt) -> int:
        terms = [opt.name, *opt.aliases, opt.slug.replace("-", " ")]
        return sum(len(re.findall(rf"\b{re.escape(t.lower())}", haystack)) for t in terms if t)

    scored = sorted(((hits(o), o) for o in req.industries), key=lambda x: -x[0])
    best = scored[0] if scored and scored[0][0] > 0 else None
    sub = None
    if best and best[1].parent_slug:
        # A sub-industry match rolls up to its parent industry.
        parent = next((o for o in req.industries if o.slug == best[1].parent_slug), None)
        if parent:
            sub, best = best[1], (best[0] + hits(parent), parent)
    elif best:
        children = [(h, o) for h, o in scored if o.parent_slug == best[1].slug and h > 0]
        if children:
            sub = children[0][1]
    total = sum(h for h, _ in scored) or 1
    confidence = round(min(95.0, 40 + 55 * best[0] / total), 1) if best else 0.0

    needs: list[str] = []
    key = f"{best[1].slug if best else ''} {haystack[:400]}"
    for family, items in NEEDS_BY_FAMILY.items():
        if family in key:
            needs += [i for i in items if i not in needs]
    if req.offerings:
        offered = {o.lower() for o in req.offerings}
        needs = [n for n in needs if n.lower() in offered] or needs

    products = _split_list(m.group(1)) if (m := _PRODUCT_HINTS.search(req.text)) else []
    services = _split_list(m.group(1)) if (m := _SERVICE_HINTS.search(req.text)) else []

    summary = req.description or _sentences(req.text, 2) or None
    if summary and len(summary) > 400:
        summary = summary[:397].rsplit(" ", 1)[0] + "…"

    return Analysis(
        summary=summary,
        industry_slug=best[1].slug if best else None,
        sub_industry_slug=sub.slug if sub else None,
        confidence=confidence,
        possible_needs=needs[:6],
        products=products,
        services=services,
        provider="rules",
    )


_SYSTEM = (
    "You are a B2B sales research analyst. From public website text, describe the company factually and "
    "classify it. Only use information present in the text; never invent contact details. Possible needs are "
    "hypotheses for a sales team, not facts. Reply with JSON only."
)


async def analyze_openai(req: AnalyzeRequest, api_key: str) -> Analysis:
    industries = [{"slug": o.slug, "name": o.name, "parent": o.parent_slug} for o in req.industries]
    lang = {"en": "English", "ar": "Arabic", "ur": "Urdu"}[req.language]
    user = {
        "company_name": req.name,
        "listed_category": req.category,
        "meta_description": req.description,
        "website_text": req.text[:6000],
        "allowed_industries": industries,
        "seller_offerings": req.offerings,
        "instructions": (
            f"Return JSON with keys: summary (2 sentences in {lang}), industry_slug (from allowed_industries or null), "
            "sub_industry_slug (a child of industry_slug or null), confidence (0-100), products (<=8 short strings), "
            "services (<=8), possible_needs (<=6 short strings; prefer items from seller_offerings when relevant)."
        ),
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1") + "/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": json.dumps(user, ensure_ascii=False)}],
            },
        )
        resp.raise_for_status()
        data = json.loads(resp.json()["choices"][0]["message"]["content"])

    allowed = {o.slug for o in req.industries}
    industry = data.get("industry_slug") if data.get("industry_slug") in allowed else None
    sub = data.get("sub_industry_slug") if data.get("sub_industry_slug") in allowed else None
    return Analysis(
        summary=data.get("summary"),
        industry_slug=industry,
        sub_industry_slug=sub,
        confidence=float(data.get("confidence") or 0) if industry else 0.0,
        possible_needs=[str(x) for x in data.get("possible_needs", [])][:6],
        products=[str(x) for x in data.get("products", [])][:8],
        services=[str(x) for x in data.get("services", [])][:8],
        provider="openai",
    )


async def analyze(req: AnalyzeRequest) -> Analysis:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        try:
            return await analyze_openai(req, key)
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError):
            pass  # fall back to rules rather than failing the pipeline
    return analyze_rules(req)
