# YUX CRM Attribution MROI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CRM attribution, source dashboards and MROI reports from `docs/superpowers/specs/2026-06-04-yux-crm-attribution-mroi-design.md`.

**Architecture:** Normalize lead sources and attribution events around `crm_instance_id`, then roll up metrics for CRM, campaigns, landing pages, proposals and finance. Keep calculations in pure rules and expose portal-safe summaries separately from internal data.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres, Recharts, existing campaign, landing page, proposal and report services.

---

## File Structure

- Create: `frontend/src/types/crmAttribution.ts`
- Create: `frontend/src/lib/crm/attributionRules.ts`
- Create: `frontend/src/lib/crm/attributionRules.test.ts`
- Create: `frontend/src/services/crmAttributionService.ts`
- Create: `frontend/src/services/crmAttributionService.test.ts`
- Create: `frontend/src/components/crm/LeadSourcesDashboard.tsx`
- Create: `frontend/src/components/crm/SourceFunnelChart.tsx`
- Create: `frontend/src/components/crm/MroiAlertPanel.tsx`
- Modify: `frontend/src/components/reports/ReportsWorkspace.tsx`
- Modify: `frontend/src/components/reports/PortalReportsWorkspace.tsx`
- Create: `supabase/migrations/20260604040000_crm_attribution_mroi.sql`
- Create: `supabase/probes/20260604040000_crm_attribution_mroi.sql`

## Tasks

### Task 1: Attribution Rules

- [ ] Define source, attribution event, rollup, revenue attribution, alert and export types.
- [ ] Implement `normalizeUtmSource`, `derivePrimarySource`, `calculateCpl`, `calculateSourceConversion`, `calculateMroi`, `sanitizePortalAttribution`, `buildMroiAlerts`.
- [ ] Tests cover UTM normalization, WhatsApp direct source, paid campaign source, zero-cost source, MROI formula, portal sanitization and alert thresholds.
- [ ] Run `npm test -- src/lib/crm/attributionRules.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/types/crmAttribution.ts frontend/src/lib/crm/attributionRules.ts frontend/src/lib/crm/attributionRules.test.ts && git commit -m "feat: add crm attribution rules"`.

### Task 2: Schema And Probe

- [ ] Create migration `supabase/migrations/20260604040000_crm_attribution_mroi.sql`.
- [ ] Add tables: `lead_sources`, `lead_attribution_events`, `lead_source_rollups`, `campaign_crm_performance_snapshots`, `crm_revenue_attribution`, `crm_mroi_alerts`, `crm_report_exports`.
- [ ] Extend `leads` with `primary_source_id` and `source_confidence`.
- [ ] Extend `campaigns` with `crm_performance_status`.
- [ ] Extend `landing_pages` with `crm_source_id`.
- [ ] Extend `proposals` and `invoices` with `source_lead_id` when tables exist.
- [ ] Add RLS and authenticated grants.
- [ ] Create probe checking source tables, columns, policies and grants.
- [ ] Run Supabase reset/probe when Docker is available.
- [ ] Commit: `git add supabase/migrations/20260604040000_crm_attribution_mroi.sql supabase/probes/20260604040000_crm_attribution_mroi.sql && git commit -m "feat: add crm attribution schema"`.

### Task 3: Attribution Service

- [ ] Implement methods: `recordLeadAttribution`, `getLeadSourcesDashboard`, `getSourceFunnel`, `getCampaignMroi`, `getPortalSafeMroi`, `createMroiAlert`, `exportAttributionCsv`.
- [ ] Add service tests for mapping, portal sanitization and CSV export payload.
- [ ] Ensure service reads campaign, landing page, proposal and finance ids without duplicating those module services.
- [ ] Run `npm test -- src/services/crmAttributionService.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/services/crmAttributionService.ts frontend/src/services/crmAttributionService.test.ts && git commit -m "feat: add crm attribution service"`.

### Task 4: Dashboards And Reports

- [ ] Add `LeadSourcesDashboard.tsx` with source table, CPL, opportunities, sales, revenue and MROI.
- [ ] Add `SourceFunnelChart.tsx` using existing chart patterns.
- [ ] Add `MroiAlertPanel.tsx` with actionable alerts.
- [ ] Add "Fontes" tab to CRM cockpit if Fase 1 has been implemented; otherwise expose through reports.
- [ ] Modify `ReportsWorkspace.tsx` and `PortalReportsWorkspace.tsx` to show internal and portal-safe CRM attribution.
- [ ] Add component tests for source dashboard and portal sanitization.
- [ ] Run `npm test -- src/components/reports src/components/crm`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/components/crm frontend/src/components/reports && git commit -m "feat: add crm attribution dashboards"`.

### Task 5: Docs And Validation

- [ ] Update `docs/crm-lead-management.md`.
- [ ] Update `docs/implementation-status.md`.
- [ ] Run `npm test`, `npm run type-check`, `npm run build`.
- [ ] Run Supabase probe when Docker is available.
- [ ] Commit docs: `git add docs/crm-lead-management.md docs/implementation-status.md && git commit -m "docs: mark crm attribution phase implemented"`.

## Success Criteria

- Leads have normalized primary source and attribution events.
- Internal dashboards show CPL, conversion, revenue and MROI.
- Portal dashboards hide protected/internal cost data.
- Reports can filter by period, funil, source, campaign, team and seller.
