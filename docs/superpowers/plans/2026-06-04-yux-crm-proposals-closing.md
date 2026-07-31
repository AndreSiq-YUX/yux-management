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

- [x] Define types for recommendations, view events, follow-up tasks, objections, closing checklists, conversion runs and onboarding checklists.
- [x] Implement rules: `recommendPackageForLead`, `canCreateProposalFromLead`, `buildProposalFromLeadDraft`, `requiresClosingApproval`, `buildConversionPlan`, `isConversionRetryable`.
- [x] Tests cover seller permission, missing lead access, module recommendation, approved proposal conversion, duplicate conversion prevention and retryable failure.
- [x] Run `npm test -- src/lib/crm/closingRules.test.ts`.
- [x] Run `npm run type-check`.
- [x] Commit: `git add frontend/src/types/crmClosing.ts frontend/src/lib/crm/closingRules.ts frontend/src/lib/crm/closingRules.test.ts && git commit -m "feat: add crm closing rules"`.

### Task 2: Schema And Probe

- [x] Create migration `supabase/migrations/20260604030000_crm_proposals_closing.sql`.
- [x] Add tables: `lead_proposal_recommendations`, `proposal_view_events`, `proposal_follow_up_tasks`, `proposal_objections`, `proposal_closing_checklists`, `proposal_conversion_runs`, `client_onboarding_checklists`, `client_onboarding_tasks`.
- [x] Extend `proposals` with `lead_id`, `crm_instance_id`, `recommended_package_id`.
- [x] Extend `contracts` with `source_proposal_id`.
- [x] Extend `projects` with `source_lead_id`.
- [x] Extend `invoices` with `source_proposal_id` when finance table exists.
- [x] Add RLS and authenticated grants.
- [x] Create probe checking tables, added columns, policies and grants.
- [x] Attempt Supabase reset/probe; blocked locally because Docker Desktop/daemon is unavailable.
- [x] Commit: `git add supabase/migrations/20260604030000_crm_proposals_closing.sql supabase/probes/20260604030000_crm_proposals_closing.sql && git commit -m "feat: add crm closing schema"`.

### Task 3: Closing Service

- [x] Implement `crmClosingService` methods: `getLeadProposalContext`, `createProposalFromLead`, `recordProposalViewEvent`, `recordProposalObjection`, `scheduleProposalFollowUp`, `createClosingChecklist`, `runProposalConversion`, `retryProposalConversion`.
- [x] Service must call existing proposal/platform/project/finance services through clear methods and store conversion runs.
- [x] Add tests for payloads, idempotency keys and conversion run mapping.
- [x] Run `npm test -- src/services/crmClosingService.test.ts`.
- [x] Run `npm run type-check`.
- [x] Commit: `git add frontend/src/services/crmClosingService.ts frontend/src/services/crmClosingService.test.ts && git commit -m "feat: add crm closing service"`.

### Task 4: CRM Closing UI

- [x] Add `LeadProposalLauncher.tsx` with create-proposal CTA and inherited lead data preview.
- [x] Add `ProposalRecommendationPanel.tsx` showing package and module suggestions.
- [x] Add `ClosingChecklistPanel.tsx` with contract, modules, project, finance and onboarding steps.
- [x] Add `ProposalEventTimeline.tsx` showing sent, viewed, adjusted, accepted, rejected and converted events.
- [x] Modify `LeadCommercialPanel.tsx` to use the new components without removing existing proposal functionality.
- [x] Add follow-up items to `TodayWorkQueue.tsx`.
- [x] Run `npm test -- src/components/proposals src/components/crm`.
- [x] Run `npm run type-check`.
- [x] Commit: `git add frontend/src/components/crm frontend/src/components/proposals/LeadCommercialPanel.tsx && git commit -m "feat: add crm proposal closing ui"`.

### Task 5: Validation And Docs

- [x] Update `docs/crm-lead-management.md` with closing flow.
- [x] Update `docs/implementation-status.md`.
- [x] Run `npm test`, `npm run type-check`, `npm run build`.
- [x] Attempt Supabase probe; blocked locally because Docker Desktop/daemon is unavailable.
- [x] Commit docs: `git add docs/crm-lead-management.md docs/implementation-status.md && git commit -m "docs: mark crm closing phase implemented"`.

## Success Criteria

- Lead can create proposal with inherited CRM context.
- Proposal events return to the lead timeline.
- Accepted proposal can create contract, activate modules, create project and start onboarding.
- Conversion is idempotent and retryable.
