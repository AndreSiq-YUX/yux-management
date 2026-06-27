# Omnichannel AI Operations

## Module Contract

The commercial module key remains `whatsapp_ai` for package and contract compatibility. The visible module name is `Central Omnichannel IA`.

- Internal route: `/omnichannel`
- Client portal route: `/portal/omnichannel`
- Public webchat iframe route: `/webchat/session/:sessionToken`
- Required platform permission: `omnichannel.read`
- Operational permissions: `omnichannel.write`, `omnichannel.supervise`, `omnichannel.configure`

## Response Modes

- `automatic`: AI may generate and dispatch a reply without agent approval.
- `assisted`: AI may generate a queued suggestion that must be approved before dispatch.
- `manual`: AI generation and dispatch are skipped; a human operator owns the conversation.

Handoff rules can force manual mode based on human requests, low confidence, keywords, queue, channel, tags, SLA, sentiment, or routing context.

## Simulator Workflow

Internal supervisors and portal configurators can simulate normalized inbound events for:

- WhatsApp
- Instagram
- Email
- Webchat

The simulator uses `simulate-channel-event`, which reuses the same ingestion contract as `receive-channel-event`. It is authenticated and must not accept cross-organization channel connections.

## Optional n8n Webhooks

The system remains testable without n8n. When these secrets are absent, provider-neutral fallback behavior is preserved:

- `N8N_OMNICHANNEL_AI_WEBHOOK_URL`
- `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`
- `N8N_OMNICHANNEL_SCHEDULING_WEBHOOK_URL`

Do not commit secret values. Real WhatsApp, Instagram, email, and scheduling credentials must stay in n8n or the selected adapter layer, never in the frontend.

## Meta Channel Connectors

YUX Hub uses the official Meta app owned by YUX for customer channel onboarding.
Customers connect their own assets through WhatsApp Embedded Signup and Meta
Login. The customer remains the owner of WABAs, WhatsApp numbers, Instagram
accounts and Facebook pages.

Operational channels:

- WhatsApp: official Cloud API adapter `meta-whatsapp`.
- Instagram Direct: official Meta messaging adapter `meta-instagram`.
- Facebook Messenger: official Meta messaging adapter `meta-messenger`.
- n8n fallback: `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL` for explicitly
  intermediated routes.

Secrets stay server-side. Portal and Admin screens show only safe references,
health states and sanitized audit events.

## Tokens And Webchat

Adapter inbound tokens and widget public tokens are stored only as hashes. `webchat_widgets` stores public configuration and token rotation metadata; token hashes live in the backend Postgres schema and are never exposed to the browser.

The host page loads `frontend/public/yux-webchat.js` with a public widget token. The script sends the browser `Origin` to `/api/public/webchat/events`, receives a short-lived session token, and injects an iframe with only that session token. The long-lived widget token is never placed in the iframe URL.

Rotate widget tokens from the Webchat settings panel. Revoke or deactivate widgets when an origin is no longer trusted.

## Knowledge Publishing

Knowledge entries move through draft, review, and publish actions. Published AI context uses immutable `knowledge_publications.body_snapshot` records so later draft edits do not silently change prior approved content.

## CRM Synchronization

Inbound messages call transactional CRM sync after conversation creation. Organization settings can filter CRM sync by channel, status, qualification, and tags. Sync links or creates a lead idempotently and records sanitized `crm_sync_runs`.

## Retention

Conversation and attachment retention deadlines are stored at write time. Message attachment files are stored on the VPS under `OMNICHANNEL_ATTACHMENTS_DIR` and persisted by the `yux_omnichannel_attachments_data` Docker volume. Cleanup, anonymization, and file purge jobs are intentionally left as a later scheduled operations task.

## Adapter Onboarding Checklist

1. Select the real provider or n8n workflow for the channel.
2. Store provider credentials only in n8n, Dokploy secrets, or the selected server-side adapter layer.
3. Create or rotate the channel adapter token.
4. Configure `channel_connections.adapter_key` and n8n routing metadata.
5. Send normalized events to the backend omnichannel ingestion route for the selected adapter.
6. Verify duplicate external events do not duplicate messages.
7. Verify outbound delivery status and retry behavior.
8. Verify protected errors are sanitized before storage.
