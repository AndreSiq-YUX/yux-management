# YUX Hub Commercial MVP Operations

Updated: 2026-06-03

This runbook covers the commercial MVP slices implemented in this repository:
CRM Cockpit, sector blueprints, landing pages, campaigns, WhatsApp provider,
AI assistant, Flow Builder Lite, operational reports, and the client portal
commercial view.

## Supabase Migrations And Probes

Apply migrations in timestamp order. Commercial MVP additions are:

- `20260601260000_crm_cockpit_upgrade.sql`
- `20260601270000_sector_funnel_blueprints.sql`
- `20260601280000_landing_pages.sql`
- `20260601290000_campaigns_ads_api_core.sql`
- `20260601300000_whatsapp_provider_path.sql`
- `20260601310000_ai_assistant_settings.sql`
- `20260601320000_flow_builder_lite.sql`
- `20260601330000_operational_reports.sql`

Run matching probes in `supabase/probes/` after applying migrations. New public
tables use RLS and explicit `GRANT` because Supabase Data API exposure rules can
vary by project settings.

## Provider Credentials

Required only for live integrations:

- Meta Ads: app credentials, ad account access, OAuth/token storage reference.
- Google Ads: developer token, OAuth client, refresh token storage reference.
- WhatsApp Cloud API: access token, phone number ID, WABA ID, webhook verify
  token, app secret for `x-hub-signature-256`.
- n8n: CRM, campaign, scheduling, and AI webhook URLs if the deployment uses
  external workflow execution.

Do not put provider tokens in frontend env vars. Store them as Supabase/Vercel
secrets and reference them through protected metadata fields.

## Vercel Environment Variables

Expected server/Edge values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `N8N_CRM_WEBHOOK_URL`
- `N8N_OMNICHANNEL_AI_WEBHOOK_URL`
- `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_WEBHOOK_APP_SECRET`
- provider-specific ad credentials as chosen by operations.

## OAuth And Webhook Redirects

Configure provider dashboards with the deployed project URLs:

- Ads OAuth callback: production callback URL for provider connection flow.
- WhatsApp webhook: `receive-channel-event` public Edge Function endpoint.
- Public proposal review: `/proposal/review/:token`.
- Webchat session bootstrap: `/webchat/session/:sessionToken`.

## Edge Function Deploy Order

Deploy shared helpers first by deploying dependent functions after code is
present:

1. Ads provider functions: `connect-ads-provider`,
   `execute-ad-provider-mutation`, `sync-ad-metrics`.
2. Omnichannel provider functions: `receive-channel-event`,
   `dispatch-outbound-message`, `process-ai-message`.
3. Automation function: `dispatch-crm-automation`.

## Manual Verification Checklist

- Internal navigation shows CRM, Omnichannel, Landing Pages, Campaigns,
  Automations, Reports, Support and Finance when modules are enabled.
- Portal navigation only shows modules enabled on the active contract.
- A landing page can be created, versioned, approved, and shown in portal.
- A campaign draft can be created and provider mutation run is recorded without
  exposing protected provider errors.
- WhatsApp webhook payload creates/updates contact, conversation and message.
- Manual WhatsApp outbound creates an outbound run and explicit token state.
- AI assistant metadata appears in `ai_message_runs.metadata`.
- Flow Builder flow runs create `automation_execution_runs` and steps.
- Reports page displays CPL, MROI, landing conversion and proposal approval.
- Portal reports do not expose owner activity or protected internal details.

## Rollback Notes

- Provider mutations are staged in mutation/run tables. To roll back a failed
  provider action, pause the local campaign/flow first, then reconcile the
  provider account manually before replaying a run.
- For WhatsApp token failures, set `token_state = 'needs_reauth'` on the
  channel connection and stop outbound automations until credentials are
  rotated.
- For Flow Builder failures, disable the affected flow and inspect
  `automation_execution_steps.protected_error`.
- For reports, deleting cached metrics/snapshots is safe; they can be
  regenerated from source tables.
