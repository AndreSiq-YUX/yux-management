# YUX Marketing Studio Phase 6: Writing, Review And Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the provider-neutral writing, brand review, quality scoring and grounding-control layer for Marketing Studio.

**Architecture:** Extend the existing Marketing Studio schema and harness instead of introducing a separate agent platform. Store generation runs and quality checks as operational records, keep live LLM/Jina execution out of this phase, and expose the writing/review status in the internal Marketing Studio workspace.

**Tech Stack:** React 18, TypeScript, Vitest, Supabase Postgres/RLS, Python worker tests.

---

### Task 1: Writing And Quality Schema

**Files:**
- Create: `supabase/migrations/20260607141134_marketing_studio_writing_review_grounding.sql`
- Create: `supabase/probes/20260607141134_marketing_studio_writing_review_grounding.sql`

- [x] Create `marketing_content_generation_runs` for writer/reviewer run output, status, prompt/context snapshots, generated draft, quality score and grounding status.
- [x] Create `marketing_content_quality_checks` for checklist, risk flags, grounding summary and review outcome.
- [x] Add RLS, explicit Data API grants and indexes for the new public tables.

### Task 2: Domain Types, Rules And Service

**Files:**
- Modify: `frontend/src/types/marketingStudio.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`
- Modify: `frontend/src/services/marketingStudioService.ts`

- [x] Add TypeScript contracts for generation runs and quality checks.
- [x] Add rules for grounding requirement, quality checklist scoring and pipeline summary.
- [x] Add service mappers, payload builders and read/create methods.

### Task 3: Worker Contracts

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/writing.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_writing.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py`

- [x] Add deterministic writer draft construction from brief, brand context, knowledge snippets and channel.
- [x] Add deterministic review checklist, score, risk flags and grounding request helper.
- [x] Keep provider calls out of scope and test only request/output contracts.

### Task 4: Internal Workspace Surface

**Files:**
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`
- Modify: `frontend/src/pages/marketing-studio/MarketingStudioPage.tsx`

- [x] Load generation runs and quality checks for the active contract.
- [x] Render the writing/review/grounding pipeline in the internal workspace.
- [x] Keep the client portal unchanged except for existing review decisions.

### Task 5: Validation And Commit

- [x] Apply migration to `portal-yux` and run the probe.
- [x] Run focused frontend and Python tests.
- [x] Run `npm run type-check` and `npm run build` from `frontend/`.
- [x] Commit only phase 6 files and leave unrelated worktree changes untouched.
