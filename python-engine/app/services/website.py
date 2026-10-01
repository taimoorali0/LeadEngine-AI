"""Public website extraction (spec §14): emails, phones, social links, meta."""
from __future__ import annotations

import re

import httpx
from bs4 import BeautifulSoup

from app.models import WebsiteExtraction
from app.services.emails import extract_emails
from app.services.phones import normalize_phone

SOCIAL_HOSTS = {
    "facebook": "facebook.com",
    "linkedin": "linkedin.com",
    "instagram": "instagram.com",
    "youtube": "youtube.com",
    "twitter": "twitter.com",
    "x": "x.com",
    "tiktok": "tiktok.com",
}
CANDIDATE_PATHS = ("", "/contact", "/contact-us", "/about", "/about-us")
_PHONE_RE = re.compile(r"(?:\+|00)?\d[\d\s().-]{7,16}\d")
MAX_TEXT = 6000
USER_AGENT = "LeadEngineBot/0.1 (+https://leadengine.ai/bot)"


def extract_from_html(html: str, default_region: str = "PK") -> WebsiteExtraction:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    mailtos = " ".join(a["href"][7:].split("?")[0] for a in soup.select('a[href^="mailto:"]'))
    tels = [a["href"][4:] for a in soup.select('a[href^="tel:"]')]
    text = soup.get_text(" ")

    phones, seen = [], set()
    for raw in tels + _PHONE_RE.findall(text):
        p = normalize_phone(raw, default_region)
        if p.valid and p.normalized not in seen:
            seen.add(p.normalized)
            phones.append(p)

    social: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        for name, host in SOCIAL_HOSTS.items():
            if name not in social and re.search(rf"(^|[/.]){re.escape(host)}/", href):
                social[name] = href

    desc = soup.find("meta", attrs={"name": "description"})
    visible = re.sub(r"\s+", " ", text).strip()
    return WebsiteExtraction(
        emails=extract_emails(mailtos + " " + text),
        phones=phones,
        social_links=social,
        title=soup.title.string.strip() if soup.title and soup.title.string else None,
        description=desc.get("content") if desc else None,
        text=visible[:MAX_TEXT],
    )


async def enrich_website(url: str, default_region: str = "PK") -> WebsiteExtraction:
    """Fetch the home page and common contact/about pages and merge results."""
    base = url if "://" in url else "https://" + url
    base = base.rstrip("/")
    merged = WebsiteExtraction(emails=[], phones=[], social_links={})
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        for path in CANDIDATE_PATHS:
            try:
                resp = await client.get(base + path)
            except httpx.HTTPError:
                continue
            if resp.status_code != 200 or "html" not in resp.headers.get("content-type", ""):
                continue
            page = extract_from_html(resp.text, default_region)
            merged.emails += [e for e in page.emails if e.email not in {m.email for m in merged.emails}]
            merged.phones += [p for p in page.phones if p.normalized not in {m.normalized for m in merged.phones}]
            merged.social_links = {**page.social_links, **merged.social_links}
            merged.title = merged.title or page.title
            merged.description = merged.description or page.description
            if len(merged.text) < MAX_TEXT:
                merged.text = (merged.text + " " + page.text).strip()[:MAX_TEXT]
    return merged
