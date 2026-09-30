"""Email extraction and role classification (spec §19)."""
from __future__ import annotations

import re

from app.models import ClassifiedEmail

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_ASSET_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")

_ROLE_PREFIXES = {
    "general": ("info", "contact", "hello", "office", "admin", "enquiry", "enquiries", "inquiry"),
    "sales": ("sales", "business", "orders", "order", "bd"),
    "marketing": ("marketing", "media", "pr"),
    "support": ("support", "help", "service", "customercare", "care"),
    "hr": ("hr", "careers", "jobs", "recruitment"),
    "accounts": ("accounts", "billing", "finance"),
}


def classify_email_type(email: str) -> str:
    local = email.split("@", 1)[0].lower()
    for kind, prefixes in _ROLE_PREFIXES.items():
        if local in prefixes or any(local.startswith(p + ".") or local.startswith(p + "_") for p in prefixes):
            return kind
    return "personal"


def extract_emails(text: str) -> list[ClassifiedEmail]:
    """Emails found on a public page are 'published' — never 'verified'."""
    seen: dict[str, ClassifiedEmail] = {}
    for match in EMAIL_RE.findall(text or ""):
        email = match.lower().rstrip(".")
        if email.endswith(_ASSET_SUFFIXES) or email in seen:
            continue
        seen[email] = ClassifiedEmail(email=email, type=classify_email_type(email), status="published")
    return list(seen.values())
