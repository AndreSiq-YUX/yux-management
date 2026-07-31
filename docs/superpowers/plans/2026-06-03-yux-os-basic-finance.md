# YUX OS Basic Finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the finance placeholder with a basic accounts-receivable module tied to contracts.

**Architecture:** Add invoice and billing-item tables under the existing organization/client/contract model, with RLS through private helpers. Expose typed frontend rules and a Supabase service, then render internal and portal finance workspaces with the same sanitized data boundary.

**Tech Stack:** PostgreSQL and RLS on Supabase, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn/ui, lucide-react.

---

### Task 1: Finance Domain Rules

**Files:**
- Create: `frontend/src/types/finance.ts`
- Create: `frontend/src/lib/finance/financeRules.ts`
- Create: `frontend/src/lib/finance/financeRules.test.ts`

- [x] Define invoice and billing item domain types.
- [x] Add tests for overdue/upcoming/open/paid classification, totals, portal sanitization, and due-date formatting.
- [x] Implement pure rules and pass focused tests.

### Task 2: Finance Schema And RLS

**Files:**
- Create: `supabase/migrations/20260601220000_basic_finance.sql`
- Create: `supabase/probes/20260601220000_basic_finance.sql`

- [x] Create `invoices` and `billing_items` with organization, client, contract, status, values, due dates, and immutable paid timestamp metadata.
- [x] Add indexes, updated-at triggers, RLS policies, grants, and private finance access helpers.
- [x] Seed no production-like invoices; keep data creation operational.
- [x] Add SQL probes for RLS enablement, contract isolation, status checks, and portal read boundaries.

### Task 3: Typed Finance Service

**Files:**
- Create: `frontend/src/services/financeService.ts`
- Create: `frontend/src/services/financeService.test.ts`

- [x] Write mapper tests for numeric values, nested billing items, summaries, filter payloads, and portal-safe results.
- [x] Implement reads, create/update invoice, add/update billing item, and status transition helpers.

### Task 4: Finance Workspaces

**Files:**
- Create: `frontend/src/components/finance/FinanceWorkspace.tsx`
- Create: `frontend/src/components/finance/PortalFinanceWorkspace.tsx`
- Create: `frontend/src/components/finance/FinanceWorkspace.test.tsx`
- Create: `frontend/src/pages/finance/FinancePage.tsx`
- Create: `frontend/src/pages/client-portal/PortalFinancePage.tsx`
- Modify: `frontend/src/App.tsx`

- [x] Replace `/finance` and `/portal/finance` placeholders with operational pages.
- [x] Internal page shows totals, filters, invoice list, details, item creation, and status controls.
- [x] Portal page shows active-contract financial summary, invoices, items, and status/due dates without internal-only controls.
- [x] Add focused component tests for internal controls and portal read-only behavior.

### Task 5: Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-29-yux-os-functional-implementation-design.md`

- [x] Mark the finance phase as implemented in the implementation notes.
- [x] Run focused tests, full frontend tests, type-check, build, Deno shared tests, and git diff checks.
- [ ] Commit the completed finance slice.
