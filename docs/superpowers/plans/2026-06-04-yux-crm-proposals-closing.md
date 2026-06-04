# YUX CRM Proposals Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the lead-to-proposal-to-contract closing flow from `docs/superpowers/specs/2026-06-04-yux-crm-proposals-closing-design.md`.

**Architecture:** Keep proposals, contracts, projects and finance as existing module owners. Add CRM-facing orchestration records, idempotent conversion runs and UI panels that guide the user without duplicating proposal or contract logic.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres, proposal service, platform contract service, project and finance services.

---

## File Structure

- Create: `frontend/src/types/crmClosing.ts`
- Create: `frontend/src/lib/crm/closingRules.ts`
- Create: `frontend/src/lib/crm/closingRules.test.ts`
- Create: `frontend/src/services/crmClosingService.ts`
- Create: `frontend/src/services/crmClosingService.test.ts`
- Create: `frontend/src/components/crm/LeadProposalLauncher.tsx`
- Create: `frontend/src/components/crm/ProposalRecommendationPanel.tsx`
- Create: `frontend/src/components/crm/ClosingChecklistPanel.tsx`
- Create: `frontend/src/components/crm/ProposalEventTimeline.tsx`
- Modify: `frontend/src/components/proposals/LeadCommercialPanel.tsx`
- Create: `supabase/migrations/20260604030000_crm_proposals_closing.sql`
- Create: `supabase/probes/20260604030000_crm_proposals_closing.sql`

## Tasks

### Task 1: Closing Rules

- [ ] Define types for recommendations, view events, follow-up tasks, objections, closing checklists, conversion runs and onboarding checklists.
- [ ] Implement rules: `recommendPackageForLead`, `canCreateProposalFromLead`, `buildProposalFromLeadDraft`, `requiresClosingApproval`, `buildConversionPlan`, `isConversionRetryable`.
- [ ] Tests cover seller permission, missing lead access, module recommendation, approved proposal conversion, duplicate conversion prevention and retryable failure.
- [ ] Run `npm test -- src/lib/crm/closingRules.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/types/crmClosing.ts frontend/src/lib/crm/closingRules.ts frontend/src/lib/crm/closingRules.test.ts && git commit -m "feat: add crm closing rules"`.

### Task 2: Schema And Probe

- [ ] Create migration `supabase/migrations/20260604030000_crm_proposals_closing.sql`.
- [ ] Add tables: `lead_proposal_recommendations`, `proposal_view_events`, `proposal_follow_up_tasks`, `proposal_objections`, `proposal_closing_checklists`, `proposal_conversion_runs`, `client_onboarding_checklists`, `client_onboarding_tasks`.
- [ ] Extend `proposals` with `lead_id`, `crm_instance_id`, `recommended_package_id`.
- [ ] Extend `contracts` with `source_proposal_id`.
- [ ] Extend `projects` with `source_lead_id`.
- [ ] Extend `invoices` with `source_proposal_id` when finance table exists.
- [ ] Add RLS and authenticated grants.
- [ ] Create probe checking tables, added columns, policies and grants.
- [ ] Run Supabase reset/probe when Docker is available.
- [ ] Commit: `git add supabase/migrations/20260604030000_crm_proposals_closing.sql supabase/probes/20260604030000_crm_proposals_closing.sql && git commit -m "feat: add crm closing schema"`.

### Task 3: Closing Service

- [ ] Implement `crmClosingService` methods: `getLeadProposalContext`, `createProposalFromLead`, `recordProposalViewEvent`, `recordProposalObjection`, `scheduleProposalFollowUp`, `createClosingChecklist`, `runProposalConversion`, `retryProposalConversion`.
- [ ] Service must call existing proposal/platform/project/finance services through clear methods and store conversion runs.
- [ ] Add tests for payloads, idempotency keys and conversion run mapping.
- [ ] Run `npm test -- src/services/crmClosingService.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/services/crmClosingService.ts frontend/src/services/crmClosingService.test.ts && git commit -m "feat: add crm closing service"`.

### Task 4: CRM Closing UI

- [ ] Add `LeadProposalLauncher.tsx` with create-proposal CTA and inherited lead data preview.
- [ ] Add `ProposalRecommendationPanel.tsx` showing package and module suggestions.
- [ ] Add `ClosingChecklistPanel.tsx` with contract, modules, project, finance and onboarding steps.
- [ ] Add `ProposalEventTimeline.tsx` showing sent, viewed, adjusted, accepted, rejected and converted events.
- [ ] Modify `LeadCommercialPanel.tsx` to use the new components without removing existing proposal functionality.
- [ ] Add follow-up items to `TodayWorkQueue.tsx`.
- [ ] Run `npm test -- src/components/proposals src/components/crm`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/components/crm frontend/src/components/proposals/LeadCommercialPanel.tsx && git commit -m "feat: add crm proposal closing ui"`.

### Task 5: Validation And Docs

- [ ] Update `docs/crm-lead-management.md` with closing flow.
- [ ] Update `docs/implementation-status.md`.
- [ ] Run `npm test`, `npm run type-check`, `npm run build`.
- [ ] Run Supabase probe when Docker is available.
- [ ] Commit docs: `git add docs/crm-lead-management.md docs/implementation-status.md && git commit -m "docs: mark crm closing phase implemented"`.

## Success Criteria

- Lead can create proposal with inherited CRM context.
- Proposal events return to the lead timeline.
- Accepted proposal can create contract, activate modules, create project and start onboarding.
- Conversion is idempotent and retryable.
