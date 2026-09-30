import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import CompanyRecord, ScoringInput
from app.services.dedup import compare, find_duplicates, normalize_name
from app.services.emails import extract_emails
from app.services.keywords import generate_keywords
from app.services.phones import normalize_phone
from app.services.scoring import score_lead
from app.services.website import extract_from_html


@pytest.mark.parametrize("raw", ["0304 1234567", "3041234567", "00923041234567", "+923041234567"])
def test_pakistan_phone_formats_normalize(raw):
    p = normalize_phone(raw)
    assert p.valid and p.normalized == "+923041234567"
    assert p.original == raw and p.country == "PK" and p.country_code == "+92"
    assert p.phone_type == "mobile"


def test_saudi_phone_and_invalid():
    assert normalize_phone("0501234567", "SA").normalized == "+966501234567"
    assert not normalize_phone("12345").valid


def test_emails_are_published_and_typed():
    found = {e.email: e for e in extract_emails("Mail info@abc.com or Sales@abc.com, logo@2x.png, ali.khan@abc.com")}
    assert set(found) == {"info@abc.com", "sales@abc.com", "ali.khan@abc.com"}
    assert found["info@abc.com"].type == "general"
    assert found["sales@abc.com"].type == "sales"
    assert found["ali.khan@abc.com"].type == "personal"
    assert all(e.status == "published" for e in found.values())


def test_duplicate_detection_spec_example():
    a = CompanyRecord(id="1", name="ABC Paper Mills", phone="0304 1234567", website="https://www.abcpaper.com",
                      address="Plot 12, Sundar Industrial Estate, Lahore")
    b = CompanyRecord(id="2", name="ABC Paper Mills Pvt Ltd", phone="+923041234567", website="abcpaper.com/contact",
                      address="Plot 12 Sundar Industrial Estate Lahore")
    m = compare(a, b)
    assert m.phone_match and m.website_match and m.is_duplicate and m.confidence >= 95
    assert normalize_name("ABC Paper Mills Pvt. Ltd.") == "abc paper mills"


def test_different_companies_sharing_phone_not_merged():
    a = CompanyRecord(name="Prime Tissue", phone="+923041234567")
    b = CompanyRecord(name="Global Steel Works", phone="03041234567")
    assert not compare(a, b).is_duplicate


def test_google_place_id_is_definitive():
    a = CompanyRecord(name="X", google_place_id="ChIJ1")
    b = CompanyRecord(id="9", name="Y", google_place_id="ChIJ1")
    assert find_duplicates(a, [b])[0].candidate_id == "9"


def test_scoring_max_and_bands():
    full = ScoringInput(has_phone=True, has_website=True, has_email=True, business_active=True, industry_match=True,
                        location_match=True, rating=4.2, has_social_profiles=True, profile_complete=True)
    r = score_lead(full)
    assert r.score == 100 and r.category == "Highly Qualified"
    r = score_lead(ScoringInput(has_phone=True, has_website=True, industry_match=True, location_match=True,
                                business_active=True, rating=3.0))
    assert r.score == 65 and r.category == "Needs Review" and r.breakdown["rating_above_threshold"] == 0
    assert score_lead(ScoringInput()).category == "Needs Enrichment"


def test_keywords():
    kws = generate_keywords("Paper Manufacturer", ["en", "ar"])
    assert kws[0] == "Paper Manufacturer" and "Paper Mill" in kws and "مصنع ورق" in kws
    assert len(kws) == len({k.lower() for k in kws})
    assert generate_keywords("Glass Factory")[:2] == ["Glass Factory", "Glass Manufacturer"]


def test_html_extraction():
    html = """<html><head><title>ABC Paper Mills</title><meta name="description" content="Paper makers">
    </head><body><a href="mailto:info@abcpaper.com">Email</a><a href="tel:+92 42 35761234">Call</a>
    <p>Mobile: 0304-1234567</p><a href="https://www.facebook.com/abcpaper">fb</a>
    <a href="https://linkedin.com/company/abc">in</a><script>var x="ignored@js.com"</script></body></html>"""
    r = extract_from_html(html)
    assert [e.email for e in r.emails] == ["info@abcpaper.com"]
    assert {p.normalized for p in r.phones} == {"+924235761234", "+923041234567"}
    assert set(r.social_links) == {"facebook", "linkedin"}
    assert r.title == "ABC Paper Mills" and r.description == "Paper makers"


def test_api_endpoints():
    c = TestClient(app)
    assert c.get("/health").json() == {"status": "ok"}
    assert c.post("/phones/normalize", json={"numbers": ["3041234567"]}).json()[0]["normalized"] == "+923041234567"
    assert c.post("/scoring/score", json={"lead": {"has_email": True}}).json()["score"] == 20
