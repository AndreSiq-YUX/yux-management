# YUX CRM Commercial Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the commercially usable CRM cockpit described in `docs/superpowers/specs/2026-06-04-yux-crm-commercial-cockpit-design.md`.

**Architecture:** Extend the governed CRM instance model with richer lead fields, stage history, tags, saved views, imports and next-action rules. Keep business rules in pure `frontend/src/lib/crm/*Rules.ts` modules, data access in services, and UI split into cockpit tabs instead of further growing `CrmWorkspace.tsx`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres migrations, Supabase RLS, CSV parsing in browser-safe TypeScript.

---

## File Structure

- Create: `frontend/src/types/crmCockpit.ts`
- Create: `frontend/src/lib/crm/cockpitRules.ts`
- Create: `frontend/src/lib/crm/cockpitRules.test.ts`
- Create: `frontend/src/services/crmCockpitService.ts`
- Create: `frontend/src/services/crmCockpitService.test.ts`
- Create: `frontend/src/components/crm/CockpitTabs.tsx`
- Create: `frontend/src/components/crm/TodayWorkQueue.tsx`
- Create: `frontend/src/components/crm/LeadAdvancedFilters.tsx`
- Create: `frontend/src/components/crm/Lead360Panel.tsx`
- Create: `frontend/src/components/crm/LeadCsvImportPanel.tsx`
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`
- Modify: `frontend/src/components/crm/LeadKanbanBoard.tsx`
- Modify: `frontend/src/components/crm/LeadDetailPanel.tsx`
- Create: `supabase/migrations/20260604010000_crm_commercial_cockpit.sql`
- Create: `supabase/probes/20260604010000_crm_commercial_cockpit.sql`
- Modify: `docs/crm-lead-management.md`
- Modify: `docs/implementation-status.md`

## Tasks

### Task 1: Cockpit Domain Rules

- [ ] Add `CrmLeadTemperature`, `CrmLeadUrgency`, `CrmNextActionKind`, `CrmCockpitFilterState`, `CrmSavedView`, `LeadImportPreview` in `frontend/src/types/crmCockpit.ts`.
- [ ] Implement `calculateStageAge`, `isLeadStalled`, `rankTodayLead`, `requiresLossReason`, `detectDuplicateLeadCandidates`, `buildCsvImportPreview`, and `applyCockpitFilters` in `frontend/src/lib/crm/cockpitRules.ts`.
- [ ] Test these cases in `frontend/src/lib/crm/cockpitRules.test.ts`: overdue follow-up, stalled stage, hot lead ranking, lost-stage reason requirement, duplicate by phone/email, CSV invalid email row, saved-view filtering.
- [ ] Run `npm test -- src/lib/crm/cockpitRules.test.ts` from `frontend`.
- [ ] Run `npm run type-check` from `frontend`.
- [ ] Commit: `git add frontend/src/types/crmCockpit.ts frontend/src/lib/crm/cockpitRules.ts frontend/src/lib/crm/cockpitRules.test.ts && git commit -m "feat: add crm cockpit rules"`.

### Task 2: Cockpit Schema And RLS

- [ ] Create `supabase/migrations/20260604010000_crm_commercial_cockpit.sql`.
- [ ] Add tables: `lead_stage_history`, `lead_tags`, `lead_tag_assignments`, `lead_loss_reasons`, `lead_duplicates`, `lead_saved_views`, `lead_imports`, `lead_import_rows`, `lead_next_actions`, `crm_activity_calendar_entries`.
- [ ] Extend `leads` with `whatsapp_phone`, `city`, `state`, `segment`, `interest`, `temperature`, `urgency`, `consent_lgpd`, `whatsapp_opt_in`, `email_opt_in`, `competitor`, `objections`, `current_stage_entered_at`.
- [ ] Add RLS using existing CRM governance helpers: readable through `private.can_access_crm_instance`, writable through `private.can_manage_crm_instance` or lead update helper where appropriate.
- [ ] Grant explicit Data API privileges to `authenticated` for new public tables.
- [ ] Create probe `supabase/probes/20260604010000_crm_commercial_cockpit.sql` checking tables, key columns, RLS policies and grants.
- [ ] Run `npx supabase db reset` and probe when Docker is available.
- [ ] Commit: `git add supabase/migrations/20260604010000_crm_commercial_cockpit.sql supabase/probes/20260604010000_crm_commercial_cockpit.sql && git commit -m "feat: add crm cockpit schema"`.

### Task 3: Cockpit Service

- [ ] Implement `frontend/src/services/crmCockpitService.ts` with methods `getCockpitSnapshot`, `getSavedViews`, `saveView`, `previewLeadImport`, `executeLeadImport`, `recordStageHistory`, `createLeadTag`, `assignLeadTag`, `createNextAction`, `completeNextAction`.
- [ ] Add payload-builder tests in `frontend/src/services/crmCockpitService.test.ts` for imports, saved views, tags and next actions.
- [ ] Use snake_case conversion consistent with `crmService.ts`.
- [ ] Run `npm test -- src/services/crmCockpitService.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/services/crmCockpitService.ts frontend/src/services/crmCockpitService.test.ts && git commit -m "feat: add crm cockpit service"`.

### Task 4: Cockpit UI Decomposition

- [ ] Create `CockpitTabs.tsx` with tabs `Kanban`, `Lista`, `Hoje`, `Calendario`, `Fontes`.
- [ ] Create `LeadAdvancedFilters.tsx` with filters for owner, team, source, campaign, stage, value range, temperature, stalled state and tags.
- [ ] Create `TodayWorkQueue.tsx` showing overdue tasks, unanswered leads, hot leads, stalled deals and proposal follow-ups.
- [ ] Create `Lead360Panel.tsx` to replace the dense modal body with summary, profile, timeline, tasks, tags, duplicates and next action.
- [ ] Create `LeadCsvImportPanel.tsx` with file input, preview table, validation badges and execute button.
- [ ] Modify `CrmWorkspace.tsx` to delegate tab content to the new components while preserving current Kanban/list behavior.
- [ ] Add focused component tests using `createRoot` in `frontend/src/components/crm/CrmWorkspace.test.tsx` and new component tests.
- [ ] Run `npm test -- src/components/crm/CrmWorkspace.test.tsx`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/components/crm frontend/src/components/crm/CrmWorkspace.test.tsx && git commit -m "feat: add crm commercial cockpit ui"`.

### Task 5: Documentation And Validation

- [ ] Update `docs/crm-lead-management.md` with Fase 1 implemented scope.
- [ ] Update `docs/implementation-status.md` with migration, service, UI and validation status.
- [ ] Run `npm test`, `npm run type-check`, `npm run build`.
- [ ] Run `npx supabase db reset` and `psql "$SUPABASE_DB_URL" -f supabase/probes/20260604010000_crm_commercial_cockpit.sql` when Docker is available.
- [ ] Commit docs and validation fixes: `git add docs/crm-lead-management.md docs/implementation-status.md && git commit -m "docs: mark crm cockpit phase implemented"`.

## Success Criteria

- CRM has Kanban, advanced list, Hoje, calendar and source views.
- Lead detail works as a 360 panel.
- Tags, next actions, loss reasons, duplicate detection and CSV import are implemented.
- Tests, type-check and build pass.
