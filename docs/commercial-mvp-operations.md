# YUX Hub Commercial MVP Operations

Updated: 2026-06-07

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
- Marketing Studio native publishing: Meta Social OAuth for Facebook Page and
  Instagram Business publishing, Google Business Profile OAuth and encrypted
  provider-token storage.
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
- `PROVIDER_SECRET_ENCRYPTION_KEY_B64`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_MARKETING_OAUTH_REDIRECT_URI`
- `META_GRAPH_VERSION`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_MARKETING_OAUTH_REDIRECT_URI`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_API_VERSION`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_WEBHOOK_APP_SECRET`
- provider-specific ad credentials as chosen by operations.

## OAuth And Webhook Redirects

Configure provider dashboards with the deployed project URLs:

- Ads OAuth callback: production callback URL for provider connection flow.
- Marketing Studio Meta OAuth callback:
  `META_MARKETING_OAUTH_REDIRECT_URI`.
- Marketing Studio Google OAuth callback:
  `GOOGLE_MARKETING_OAUTH_REDIRECT_URI`.
- WhatsApp webhook: `receive-channel-event` public Edge Function endpoint.
- Public proposal review: `/proposal/review/:token`.
- Webchat session bootstrap: `/webchat/session/:sessionToken`.

## Edge Function Deploy Order

Deploy shared helpers first by deploying dependent functions after code is
present:

1. Marketing Studio provider OAuth and publishing functions:
   `start-marketing-provider-connect`, `complete-marketing-provider-connect`,
   `list-marketing-provider-assets`, `execute-marketing-publishing`.
2. Ads provider functions: `connect-ads-provider`,
   `execute-ad-provider-mutation`, `sync-ad-metrics`.
3. Omnichannel provider functions: `receive-channel-event`,
   `dispatch-outbound-message`, `process-ai-message`.
4. Automation function: `dispatch-crm-automation`.

## Manual Verification Checklist

- Internal navigation shows CRM, Omnichannel, Landing Pages, Campaigns,
  Automations, Reports, Support and Finance when modules are enabled.
- Portal navigation only shows modules enabled on the active contract.
- A landing page can be created, versioned, approved, and shown in portal.
- A campaign draft can be created and provider mutation run is recorded without
  exposing protected provider errors.
- A Marketing Studio provider OAuth start/complete flow stores only sanitized
  metadata in public connection tables and encrypted token material in
  `provider_integration_secrets`.
- A Facebook Page, Instagram Business or Google Business Profile publishing run
  requires approved/scheduled content and records `provider_post_id`,
  `published_url` when returned and sanitized response payload.
- Meta Ads and Google Ads mutations require explicit approval for campaign
  creation/budget changes and keep provider-created campaigns paused unless
  activation is explicitly requested.
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
