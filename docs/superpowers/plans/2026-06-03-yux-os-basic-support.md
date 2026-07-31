# YUX OS Basic Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first contract-based support ticketing module with internal and portal views.

**Architecture:** Add a narrow vertical slice: typed support models, pure rules, Supabase service, internal workspace, portal workspace, routes, and RLS-backed tables. Keep integration with omnichannel, attachments, and advanced SLA outside this slice.

**Tech Stack:** React 18, TypeScript, Vite/Vitest, Supabase Postgres migrations, RLS policies.

---

### Task 1: Support Types And Rules

**Files:**
- Create: `frontend/src/types/support.ts`
- Create: `frontend/src/lib/support/supportRules.ts`
- Test: `frontend/src/lib/support/supportRules.test.ts`

- [x] Write failing tests for SLA state, summary calculation, next ticket selection, and portal sanitization.
- [x] Run `npm test -- src/lib/support/supportRules.test.ts` from `frontend` and confirm it fails because the module does not exist.
- [x] Implement the minimal types and pure rule helpers.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Support Service

**Files:**
- Create: `frontend/src/services/supportService.ts`
- Test: `frontend/src/services/supportService.test.ts`

- [x] Write failing tests for row mapping, filter cleanup, portal sanitization, ticket creation payload, message creation payload, and ticket status updates.
- [x] Run `npm test -- src/services/supportService.test.ts` from `frontend` and confirm it fails because the service does not exist.
- [x] Implement the Supabase service using `support_tickets` and `support_messages`.
- [x] Re-run the focused service test and confirm it passes.

### Task 3: Internal Support Workspace

**Files:**
- Create: `frontend/src/components/support/SupportWorkspace.tsx`
- Create: `frontend/src/pages/support/SupportPage.tsx`
- Test: `frontend/src/components/support/SupportWorkspace.test.tsx`
- Modify: `frontend/src/App.tsx`

- [x] Write failing component tests for metrics, ticket selection, ticket creation, reply creation, and status updates.
- [x] Run `npm test -- src/components/support/SupportWorkspace.test.tsx` from `frontend` and confirm it fails because the component does not exist.
- [x] Implement the internal workspace and page.
- [x] Replace `/support` placeholder with `SupportPage`.
- [x] Re-run the focused component test and confirm it passes.

### Task 4: Portal Support Workspace

**Files:**
- Create: `frontend/src/components/support/PortalSupportWorkspace.tsx`
- Create: `frontend/src/pages/client-portal/PortalSupportPage.tsx`
- Test: `frontend/src/components/support/SupportWorkspace.test.tsx`
- Modify: `frontend/src/App.tsx`

- [x] Extend component tests for portal ticket opening, public replies, and hiding internal content.
- [x] Run the focused component test and confirm the new cases fail before implementation.
- [x] Implement the portal workspace and page using `activeContract`.
- [x] Replace `/portal/support` placeholder with `PortalSupportPage`.
- [x] Re-run the focused component test and confirm it passes.

### Task 5: Supabase Schema And Probes

**Files:**
- Create: `supabase/migrations/20260601230000_basic_support.sql`
- Create: `supabase/probes/20260601230000_basic_support.sql`
- Modify: `docs/superpowers/specs/2026-05-29-yux-os-functional-implementation-design.md`

- [x] Add private support access helpers.
- [x] Add `support_tickets` and `support_messages` with constraints, indexes, triggers, grants, and RLS.
- [x] Add probe checks for tables, helpers, policies, grants, and module metadata.
- [x] Document this support slice in the functional implementation design.

### Task 6: Verification And Release

**Files:**
- All files above.

- [x] Run focused support tests.
- [x] Run full `npm test`.
- [x] Run `npm run type-check`.
- [x] Run `npm run build`.
- [x] Run `deno test supabase/functions/_shared`.
- [x] Run `git diff --check`.
- [x] Stage only support-related files.
- [x] Commit with `feat: add basic support module`.
- [x] Push to `origin/codex/phase-8-hardening`.
