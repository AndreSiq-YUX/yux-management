# YUX CRM Marketing Automation Mautic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional advanced marketing automation with dedicated Mautic connections as specified in `docs/superpowers/specs/2026-06-04-yux-crm-marketing-automation-mautic-design.md`.

**Architecture:** Keep CRM native and operational without Mautic. Add provider connection records, encrypted credential references, mappings, sync runs and portal-safe status surfaces. All provider calls run through Edge Functions or server-side services, never through frontend credentials.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres, Supabase Edge Functions, provider-neutral marketing service interfaces.

---

## File Structure

- Create: `frontend/src/types/marketingAutomation.ts`
- Create: `frontend/src/lib/marketing/marketingAutomationRules.ts`
- Create: `frontend/src/lib/marketing/marketingAutomationRules.test.ts`
- Create: `frontend/src/services/marketingAutomationService.ts`
- Create: `frontend/src/services/marketingAutomationService.test.ts`
- Create: `frontend/src/components/marketing/MarketingConnectionsPage.tsx`
- Create: `frontend/src/components/marketing/MauticConnectionPanel.tsx`
- Create: `frontend/src/components/marketing/MarketingSyncRunsPanel.tsx`
- Create: `frontend/src/components/marketing/PortalMarketingAutomationWorkspace.tsx`
- Create: `supabase/functions/sync-mautic-contact/index.ts`
- Create: `supabase/functions/sync-mautic-contact/deno.json`
- Create: `supabase/migrations/20260604050000_crm_marketing_automation_mautic.sql`
- Create: `supabase/probes/20260604050000_crm_marketing_automation_mautic.sql`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/lib/platform/navigation.ts`

## Tasks

### Task 1: Marketing Automation Rules

- [ ] Define connection, Mautic instance, contact mapping, segment mapping, campaign mapping, sync run, event log and communication preference types.
- [ ] Implement `canUseMarketingAutomation`, `sanitizeMarketingConnectionForPortal`, `shouldSyncLeadToMautic`, `buildMauticContactPayload`, `isMarketingSyncRetryable`, `requiresDedicatedMauticInstance`.
- [ ] Tests cover module-disabled state, missing consent, opt-out, portal sanitization, dedicated instance requirement and retryable sync failure.
- [ ] Run `npm test -- src/lib/marketing/marketingAutomationRules.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/types/marketingAutomation.ts frontend/src/lib/marketing/marketingAutomationRules.ts frontend/src/lib/marketing/marketingAutomationRules.test.ts && git commit -m "feat: add marketing automation rules"`.

### Task 2: Schema And Probe

- [ ] Create migration `supabase/migrations/20260604050000_crm_marketing_automation_mautic.sql`.
- [ ] Add module key `marketing_automation` to platform modules if not present.
- [ ] Add tables: `marketing_provider_connections`, `mautic_instances`, `mautic_contact_mappings`, `mautic_segment_mappings`, `mautic_campaign_mappings`, `marketing_sync_runs`, `marketing_event_logs`, `communication_preferences`.
- [ ] Ensure credential fields store only encrypted references or secret names, not raw secrets.
- [ ] Add RLS by contract, organization and CRM instance.
- [ ] Grant authenticated Data API access only to safe tables and columns exposed through RLS.
- [ ] Create probe checking module key, tables, policies, grants and absence of raw secret columns named `password`, `token` or `secret_value`.
- [ ] Run Supabase reset/probe when Docker is available.
- [ ] Commit: `git add supabase/migrations/20260604050000_crm_marketing_automation_mautic.sql supabase/probes/20260604050000_crm_marketing_automation_mautic.sql && git commit -m "feat: add marketing automation schema"`.

### Task 3: Service And Edge Function

- [ ] Implement `marketingAutomationService` with `getConnections`, `createMauticConnection`, `testMauticConnection`, `getSyncRuns`, `retrySyncRun`, `getPortalMarketingStatus`, `updateCommunicationPreferences`.
- [ ] Add service tests for payloads and portal sanitization.
- [ ] Create Edge Function `sync-mautic-contact` that accepts lead id and connection id, validates access server-side, builds contact payload, records sync run and stores event logs.
- [ ] Add Deno tests or shared helper tests for payload building and failed-provider response.
- [ ] Run `npm test -- src/services/marketingAutomationService.test.ts`.
- [ ] Run `deno test supabase/functions/sync-mautic-contact` when Deno is available.
- [ ] Commit: `git add frontend/src/services/marketingAutomationService.ts frontend/src/services/marketingAutomationService.test.ts supabase/functions/sync-mautic-contact && git commit -m "feat: add mautic sync service"`.

### Task 4: Admin And Portal UI

- [ ] Add internal route `/marketing-automation`.
- [ ] Add portal route `/portal/marketing-automation`.
- [ ] Add module registry and navigation entries gated by `marketing_automation`.
- [ ] Build `MarketingConnectionsPage.tsx` for YUX admins with connection status, instance, test connection and sync runs.
- [ ] Build `PortalMarketingAutomationWorkspace.tsx` for client-visible status, segments, campaigns and sync health.
- [ ] Build `MauticConnectionPanel.tsx` and `MarketingSyncRunsPanel.tsx`.
- [ ] Add tests for navigation, internal route rendering and portal-safe sanitization.
- [ ] Run `npm test -- src/lib/platform/navigation.test.ts src/components/marketing`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/App.tsx frontend/src/lib/platform/moduleRegistry.ts frontend/src/lib/platform/navigation.ts frontend/src/components/marketing && git commit -m "feat: add marketing automation surfaces"`.

### Task 5: Docs And Validation

- [ ] Update `docs/crm-lead-management.md` explaining Mautic as optional engine, not CRM core.
- [ ] Update `docs/implementation-status.md`.
- [ ] Run `npm test`, `npm run type-check`, `npm run build`.
- [ ] Run Supabase and Edge Function probes/tests when Docker and Deno are available.
- [ ] Commit docs: `git add docs/crm-lead-management.md docs/implementation-status.md && git commit -m "docs: mark marketing automation phase implemented"`.

## Success Criteria

- CRM works without Mautic.
- Dedicated Mautic connection can be registered per contracted client.
- Contacts sync only when consent and opt-in rules allow it.
- Portal sees status and metrics without credentials.
- Failures are logged and retryable.
