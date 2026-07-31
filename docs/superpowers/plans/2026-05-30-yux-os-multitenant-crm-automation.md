# YUX OS Multitenant CRM Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver configurable multi-organization CRM pipelines with operational lead management, editable follow-up sequences, and traceable n8n-ready automation executions.

**Architecture:** Extend Supabase with organization-owned CRM records and strict RLS. Build a reusable React CRM workspace for internal and portal routes, then expose protected automation dispatch through a Supabase Edge Function while keeping provider credentials outside the frontend.

**Tech Stack:** PostgreSQL and RLS on Supabase, Supabase Edge Functions, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn/ui.

---

### Task 1: CRM schema, defaults, and RLS

**Files:**
- Create: `supabase/migrations/20260601110000_multitenant_crm_automation.sql`

- [ ] Add pipelines, stages, CRM tasks, sequences, steps, enrollments, and automation execution tables.
- [ ] Extend leads and interactions with organization ownership and configurable stage references.
- [ ] Backfill YUX leads into the default YUX pipeline.
- [ ] Create private authorization helpers for CRM organization access and active client CRM contracts.
- [ ] Add RLS and foreign-key indexes.
- [ ] Apply migration, run advisors, and probe YUX, own-client, disabled-module, and cross-client access.
- [ ] Commit schema checkpoint.

### Task 2: Domain rules and Supabase service

**Files:**
- Create: `frontend/src/types/crm.ts`
- Create: `frontend/src/lib/crm/followUpRules.ts`
- Create: `frontend/src/lib/crm/followUpRules.test.ts`
- Modify: `frontend/src/services/supabaseService.ts`

- [ ] Write failing tests for stage ordering and enrollment manual controls.
- [ ] Implement CRM types and pure rules.
- [ ] Add typed mapping and service operations for pipelines, stages, leads, interactions, tasks, sequences, enrollments, and executions.
- [ ] Run focused tests and type checking.
- [ ] Commit domain checkpoint.

### Task 3: Shared CRM workspace

**Files:**
- Create: `frontend/src/components/crm/CrmWorkspace.tsx`
- Modify: `frontend/src/pages/leads/LeadsPage.tsx`

- [ ] Build organization-aware pipeline loading.
- [ ] Add Kanban stages and lead cards with stage movement.
- [ ] Add lead creation and editing.
- [ ] Add lead details with interactions and follow-up tasks.
- [ ] Add sequence enrollment and manual pause, resume, reschedule, and takeover controls.
- [ ] Add execution status list and retry command.
- [ ] Run type checking and commit workspace checkpoint.

### Task 4: Portal CRM route

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`

- [ ] Add `/portal/crm` route backed by the shared workspace.
- [ ] Ensure portal navigation derives CRM access from the active contract.
- [ ] Run automated tests, type checking, and build.
- [ ] Commit portal checkpoint.

### Task 5: Protected automation dispatch

**Files:**
- Create: `supabase/functions/dispatch-crm-automation/index.ts`
- Create: `supabase/functions/dispatch-crm-automation/deno.json`

- [ ] Validate caller JWT and CRM execution access.
- [ ] Persist attempts and internal tasks.
- [ ] Dispatch WhatsApp and email actions to `N8N_CRM_WEBHOOK_URL` when configured.
- [ ] Store success or failure without discarding execution history.
- [ ] Deploy with JWT verification enabled.
- [ ] Verify manual retry behavior.
- [ ] Commit automation checkpoint.

### Task 6: Final verification

**Files:**
- Modify only if verification reveals a defect.

- [ ] Run `npm test`, `npm run type-check`, and `npm run build`.
- [ ] Run Supabase security and performance advisors.
- [ ] Probe RLS organization boundaries and active CRM contract enforcement.
- [ ] Smoke test internal YUX CRM and client portal CRM in the browser.
- [ ] Commit any verification fixes.

