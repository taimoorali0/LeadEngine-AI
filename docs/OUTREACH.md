# AI Outreach

Open **Sales → AI Outreach**. An organization owner configures its company name, offer, daily sending limit, SMTP connection and WhatsApp Cloud API credentials. Secrets are stored in an encrypted organization column and are never returned by settings responses. APP_KEY must remain stable and backed up.

Select a lead and a recorded business contact. AI checks the recorded public website (home, about and contact pages) and drafts an introduction using your offer. Research status and website evidence appear alongside the draft. Unavailable research is labelled; inferred needs must not be presented as confirmed problems. Drafting requires the plan's AI-analysis feature, credits, and OPENAI_API_KEY in the Python engine environment. Failed drafts refund their analysis credits.

Review/edit email subject and body, record contact-permission evidence, then approve. Workers recheck organization status, the send-enable switch, permission, prior replies and the daily limit before attempting delivery. Duplicate approvals and duplicate jobs do not resend the same message. A recent or pending message to the same contact blocks a second approval for 24 hours. Pausing sending prevents queued messages from being sent; messages blocked by pause/limits need a new reviewed draft.

## Email

Supports per-organization SMTP with port 587 (STARTTLS) or 465 (TLS), username/password and authorized sender address. SPF/DKIM must be configured at your email provider. Emails include an unsubscribe link; visiting the link displays confirmation, and the confirmation POST suppresses future outreach. Status `accepted` means SMTP/provider acceptance, not inbox delivery. Email replies and opt-outs can be recorded manually in message history; automatic email bounce or inbox-reply ingestion is not included.

## WhatsApp

Use your supported Graph API version, phone-number ID, access token, app secret and webhook verification token. Configure Meta's callback URL shown on the Outreach page and subscribe to `messages`. GET subscription verification and POST HMAC signature validation are implemented. Inbound events must match this organization's phone-number ID.

First-contact messages use a Meta-approved template. Enter its exact name, language code and ordered text body-variable values. The AI text is a drafting aid; only the approved template and reviewed parameters are sent. Use a template containing opt-out wording. This version supports text body parameters, not media/header/button templates or free-text conversation-window messages.

Delivery statuses update from signed webhooks. Incoming replies stop queued messages for that recipient. STOP/UNSUBSCRIBE/OPT OUT and supported Arabic/Urdu stop words suppress further outreach. Manual “Do not contact” is available for both channels.

## Delivery reliability

`draft → queued → sending → accepted → sent/delivered/read` (WhatsApp).
`cancelled`, `blocked`, `failed`, and `unknown` explain exceptions. Provider timeouts and interrupted workers are ambiguous: they are not retried automatically. Check provider records before creating another message. Recovery scheduling redispatches orphaned queued records, while atomic database claims prevent duplicate job sends. A worker interruption in `sending` is marked `unknown` after five minutes.

Only approved messages are sent. This release does not autonomously launch campaigns or schedule automatic follow-up sequences.

## Deployment

After merging this branch, update the server checkout, run `php artisan migrate --force`, clear/rebuild Laravel caches, run `npm ci` and `npm run build` in frontend, then restart `leadengine-engine`, `leadengine-worker`, and `leadengine-scheduler`.

Set OPENAI_API_KEY securely in `/etc/leadengine-engine.env` and restart the engine. Set APP_URL to your public HTTPS domain so email opt-out and WhatsApp callbacks use correct URLs. Channel credentials are entered inside the app, not committed to Git.

## Validation

Frontend production build and Python tests run locally. PHP syntax is checked with a parser. The Laravel feature tests cover encryption/redaction, permissions, tenant isolation, one-time approval, duplicate jobs, queued permission checks and unsigned webhooks; execute them against an isolated PostgreSQL test database before production rollout:

```bash
cd backend
php artisan test --filter=OutreachTest
```

No real outbound messages were sent during development. Live delivery requires a controlled test to your own permitted email/WhatsApp contact with real provider credentials.
