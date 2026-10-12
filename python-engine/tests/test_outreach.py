import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from app.models import WebsiteExtraction
from app.services import outreach


def request(**kwargs):
    return outreach.OutreachRequest(company_name='Paper Co', seller_name='Gulf Industrial', offer='Industrial maintenance services', **kwargs)


def test_missing_ai_key_never_claims_ai_draft(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    with pytest.raises(ValueError, match='OPENAI_API_KEY'):
        asyncio.run(outreach.draft_outreach(request()))


def test_draft_uses_evidence_and_language(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(outreach, 'public_website_text', AsyncMock(return_value='We manufacture paper.'))
    captured = {}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            captured.update(kwargs['json'])
            return httpx.Response(200, request=httpx.Request('POST', url), json={'choices':[{'message':{'content':json.dumps({'subject':'Introduction','body':'We offer maintenance services.','rationale':'Paper manufacturing is stated on the website.'})}}]})
    monkeypatch.setattr(outreach.httpx, 'AsyncClient', Client)
    result = asyncio.run(outreach.draft_outreach(request(website='https://example.com', language='ar')))
    assert result.provider == 'openai' and result.research_status == 'website_checked'
    assert result.evidence_url == 'https://example.com'
    payload = json.loads(captured['messages'][1]['content'])
    assert payload['language'] == 'ar' and payload['website_text'] == 'We manufacture paper.'
    assert 'untrusted' in captured['messages'][0]['content']


def test_failed_research_is_explicit(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(outreach, 'public_website_text', AsyncMock(side_effect=ValueError('blocked')))
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            data=json.loads(kwargs['json']['messages'][1]['content'])
            assert data['research_status']=='website_unavailable' and data['website_text']==''
            return httpx.Response(200,request=httpx.Request('POST',url),json={'choices':[{'message':{'content':'{"subject":"Hello","body":"Introduction","rationale":"No website evidence."}'}}]})
    monkeypatch.setattr(outreach.httpx,'AsyncClient',Client)
    result=asyncio.run(outreach.draft_outreach(request(website='https://example.com')))
    assert result.evidence_url is None


def test_private_website_is_blocked(monkeypatch):
    monkeypatch.setattr(outreach.socket,'getaddrinfo',lambda *args,**kwargs:[(2,1,6,'',('127.0.0.1',443))])
    with pytest.raises(ValueError,match='Private network'):
        asyncio.run(outreach.public_website_text('http://localhost'))
