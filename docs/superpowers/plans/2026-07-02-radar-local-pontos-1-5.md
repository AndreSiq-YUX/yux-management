# Radar Local Pontos 1-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Radar Local points 1-5: real Jina Reader/Search integration, source governance limits, duplicate detection, batch UI, and detailed import results.

**Architecture:** Keep the Radar as a backend-executed Growth Workspace workflow. Add focused backend helpers for Jina, source limits, duplicate detection, and import result mapping, then expose those capabilities in the existing Radar Workspace without adding client-portal visibility or automatic outreach.

**Tech Stack:** Fastify + TypeScript, Postgres migrations, Vitest, React 18 + Vite + TypeScript, existing API client, Jina Reader/Search over `r.jina.ai` and `s.jina.ai`.

---

## Task 1: Real Jina Reader And Search

**Files:**
- Create: `backend/src/modules/radar/jinaClient.ts`
- Create: `backend/tests/radar-jina-client.test.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] Implement `readJinaUrl` and `searchJinaWeb` using `fetch`, `Accept: application/json`, `X-Respond-With: markdown`, `X-Retain-Images: none`, `X-Timeout: 10`, and optional `JINA_API_KEY`.
- [ ] Parse URL read output into public evidence: title, description/snippet, emails, phones, links, CTA terms, raw content excerpt.
- [ ] Parse search output into normalized candidate records with title, source URL, snippet, and evidence.
- [ ] Replace deterministic URL/search fallback with real provider calls when source is enabled; keep governed failed runs when disabled.
- [ ] Add tests with mocked `fetch` for URL read, search results, and provider failure.

## Task 2: Source Governance Limits

**Files:**
- Create: `backend/src/db/migrations/0109_radar_source_governance.sql`
- Modify: `backend/src/modules/radar/sourceRules.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] Add `radar_source_usage_counters` with organization, campaign, source, usage date, units, estimated cost, timestamps, and unique daily key.
- [ ] Enforce source enabled state, daily source limit, campaign/day limit, and estimated cost before provider execution.
- [ ] Use `default_cost_per_unit` in `radar_cost_logs` and source counters.
- [ ] Return clear `source_limit_exceeded` and `source_budget_exceeded` issues without executing providers.
- [ ] Add route tests for limit allowed and blocked cases.

## Task 3: Duplicate Detection Engine

**Files:**
- Create: `backend/src/modules/radar/dedupe.ts`
- Create: `backend/tests/radar-dedupe.test.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] Detect duplicates on company insert/import by CNPJ, normalized domain, normalized phone, and similar name in same city/state.
- [ ] Insert `radar_duplicate_candidates` as pending without deleting or auto-merging records.
- [ ] Mark imported search candidates as `duplicate` when a likely duplicate exists.
- [ ] Keep dismissed pairs from immediately reappearing.
- [ ] Add tests for each match type and route-level duplicate list behavior.

## Task 4: Frontend Batch And Duplicate UI

**Files:**
- Modify: `frontend/src/types/radar.ts`
- Modify: `frontend/src/services/radarService.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`
- Modify: `frontend/src/lib/radar/radarSourceRules.test.ts`

- [ ] Add API methods for duplicates and batch enrich/analyze.
- [ ] Add multi-select checkboxes on opportunities, capped at 10.
- [ ] Add buttons for batch enrich and batch analyze; refresh opportunities, runs, and metrics after success.
- [ ] Add duplicate review panel with confirm, dismiss, and merge actions.
- [ ] Preserve human review controls and do not add bulk lead conversion or message sending.

## Task 5: Detailed Import Results UI

**Files:**
- Modify: `frontend/src/types/radar.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`
- Modify: `frontend/src/services/radarService.ts`

- [ ] Show CSV import summary with imported count, invalid rows, duplicate rows, and per-line issue messages.
- [ ] Show URL import summary with imported URLs and provider issues.
- [ ] Show search summary with candidates, source URL, evidence snippet, and disabled/limit issues.
- [ ] Keep source cards explicit about active, blocked, planned, and limit status.
- [ ] Ensure all text fits in existing dense dashboard layout.

## Verification

- [ ] `cd backend; npm run test -- tests/radar-routes.test.ts tests/radar-source-rules.test.ts tests/radar-csv-import.test.ts tests/radar-jina-client.test.ts tests/radar-dedupe.test.ts`
- [ ] `cd backend; npm run type-check`
- [ ] `cd backend; npm run build`
- [ ] `cd frontend; npm run test -- src/lib/radar/radarSourceRules.test.ts src/lib/radar/radarRules.test.ts`
- [ ] `cd frontend; npm run type-check`
- [ ] `cd frontend; npm run build`
- [ ] `git status --short`
- [ ] Commit and push `codex/strategy-packs-workspace`.

