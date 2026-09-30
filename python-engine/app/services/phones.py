"""Phone number normalization (spec §18). The original value is always kept."""
from __future__ import annotations

import re

import phonenumbers
from phonenumbers import PhoneNumberType

from app.models import NormalizedPhone

_TYPE_NAMES = {
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE: "landline",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "landline_or_mobile",
    PhoneNumberType.TOLL_FREE: "toll_free",
    PhoneNumberType.VOIP: "voip",
    PhoneNumberType.UAN: "uan",
}


def normalize_phone(raw: str, default_region: str = "PK") -> NormalizedPhone:
    original = raw
    cleaned = re.sub(r"[^\d+]", "", raw or "")
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    candidates = [cleaned]
    # Pakistani mobiles are often written without the trunk prefix: 3041234567
    if default_region == "PK" and re.fullmatch(r"3\d{9}", cleaned):
        candidates.insert(0, "0" + cleaned)

    for candidate in candidates:
        try:
            parsed = phonenumbers.parse(candidate, default_region)
        except phonenumbers.NumberParseException:
            continue
        if phonenumbers.is_valid_number(parsed):
            return NormalizedPhone(
                original=original,
                normalized=phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
                country_code=f"+{parsed.country_code}",
                country=phonenumbers.region_code_for_number(parsed),
                phone_type=_TYPE_NAMES.get(phonenumbers.number_type(parsed), "unknown"),
                valid=True,
            )
    return NormalizedPhone(original=original, valid=False)
