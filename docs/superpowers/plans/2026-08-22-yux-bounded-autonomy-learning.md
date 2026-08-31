# YUX Bounded Autonomy and Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable time-bound autonomous Mission execution and optimization inside an approved envelope, with continuous evaluation, kill switches, explainability and learning recommendations that cannot change production without review.

**Architecture:** Extend autonomy envelopes with signed/versioned grants, run scheduled checkpoints and policy preflight before every effect, permit only preapproved optimization capabilities, and convert outcomes into reviewable learning recommendations and shadow experiments. Production rollout advances from shadow to prepare to assisted to autonomous through explicit gates.

**Tech Stack:** TypeScript/Fastify/PostgreSQL/BullMQ, Python Harness, React/Vite, provider adapters, Vitest, Pytest and operational runbooks.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Releases 0, 1A, 1B, 2, 3 and 4 are prerequisites.
- Autonomous means bounded by an explicit time-limited envelope, never unrestricted.
- Destructive actions, credentials, permissions, legal commitments and first-contact outreach always require approval in this release.
- A learning recommendation cannot modify prompts, packs, policies, knowledge or models.
- Final preflight is authoritative even after a plan/action was approved or queued.
- Emergency pause is favored over continued execution when state is uncertain.
- Every provider mutation requires an unexpired single-attempt mutation lease and current fencing token; post-dispatch cancellation is reconciled, not described as instantaneous undo.
- Model, prompt, retrieval, pack and policy promotion must pass the golden-mission corpus before any canary.

---

### Task 1: Version and govern autonomy grants

**Files:**
- Create: `backend/src/db/migrations/0137_mission_autonomy_grants.sql`
- Create: `backend/src/modules/action-engine/autonomy-grants.ts`
- Modify: `backend/src/modules/action-engine/types.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Test: `backend/tests/action-engine-autonomy-grants.test.ts`

**Interfaces:**
- Consumes: Mission, actor permission, contract entitlement and requested autonomy envelope.
- Produces: immutable `AutonomyGrant`, approval hash, activation/revocation and expiry.

- [x] **Step 1: Write grant lifecycle and scope tests**

Cover request, exact approval, activation, expiry, revocation, scope reduction, forbidden capability, budget/contact ceilings, another tenant and stale Mission version.

- [x] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-autonomy-grants.test.ts`  
Expected: FAIL because grants do not exist.

- [x] **Step 3: Add immutable grant storage**

```ts
type AutonomyGrant = {
  id: string
  missionId: string
  envelopeHash: string
  status: 'pending' | 'active' | 'revoked' | 'expired'
  startsAt: string
  expiresAt: string
  approvedBy?: string
  approvedAt?: string
}
```

Use append-only grant history; changes create a new version and approval.

- [x] **Step 4: Add request/approve/revoke routes**

Require platform or delegated client permission. Revocation is immediate and emits an event consumed by the worker.

- [x] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-autonomy-grants.test.ts tests/action-engine-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add governed mission autonomy grants`

---

### Task 2: Enforce autonomous final preflight and continuous limits

**Files:**
- Modify: `backend/src/modules/action-engine/capability-policy.ts`
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/action-engine/economics.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Test: `backend/tests/action-engine-autonomous-preflight.test.ts`

**Interfaces:**
- Consumes: active grant, cumulative cost/contacts/hours, capability metadata, current provider/consent/ownership state.
- Produces: allow, approval, pause or deny immediately before effect.

- [x] **Step 1: Write boundary and race tests**

Cover exactly-at-limit, over-limit, expired during queue wait, revoked during retry, provider degraded, consent removed, ownership conflict, stale fencing token, expired/replayed mutation lease, provider effect already dispatched, budget entry race and duplicate attempt.

- [x] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-autonomous-preflight.test.ts`  
Expected: FAIL because active grants are not checked.

- [x] **Step 3: Add cumulative envelope usage query**

Return actual/reserved cost, human minutes, external contacts, capability counts and remaining allowance using transactional ledger rows. Unknown provider effect reconciliation denies another effect until resolved.

- [x] **Step 4: Apply preflight and automatic containment**

An exceeded critical limit atomically pauses the Mission, records evaluation reason and skips provider invocation. Noncritical scope expansion creates approval instead. If dispatch was already accepted inside the residual lease window, mark or retain the effect as `unknown|confirmed_created`, contain pausable providers and reconcile before releasing claims.

- [x] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-autonomous-preflight.test.ts tests/action-engine-execution.test.ts tests/action-engine-economics.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: enforce autonomous execution limits`

---

### Task 3: Add continuous optimization packs and checkpoints

**Files:**
- Create: `backend/src/modules/action-engine/packs/campaign-optimization-v1.ts`
- Create: `backend/src/db/migrations/0138_campaign_optimization_pack.sql`
- Create: `backend/src/modules/action-engine/capabilities/campaign-optimization.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/worker.ts`
- Test: `backend/tests/campaign-optimization-pack.test.ts`

**Interfaces:**
- Consumes: campaign metrics, active autonomy grant and approved optimization capability allowlist.
- Produces: scheduled evaluation, bounded bid/budget/creative recommendations, approval or execution.

- [x] **Step 1: Write optimization guardrail tests**

Test insufficient sample, budget decrease, budget increase requiring approval, pause on tracking loss, creative recommendation, autonomous action within percentage ceiling and repeated checkpoint idempotency.

- [x] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/campaign-optimization-pack.test.ts`  
Expected: FAIL because pack/capabilities are absent.

- [x] **Step 3: Define bounded optimization capabilities**

Allow campaign pause, approved percentage-limited budget adjustment and creative draft creation. Publication of new creative and any budget expansion beyond the grant require approval.

- [x] **Step 4: Schedule durable checkpoints**

Create idempotent hourly/daily jobs according to pack parameters. A checkpoint records metrics and deterministic guardrail conclusion before requesting optional Harness analysis.

- [x] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/campaign-optimization-pack.test.ts tests/campaign-launch-evaluator.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add bounded campaign optimization missions`

---

### Task 4: Create governed operational memory and learning recommendations

**Files:**
- Create: `backend/src/db/migrations/0146_mission_learning_recommendations.sql`
- Create: `backend/src/modules/action-engine/learning.ts`
- Modify: `backend/src/modules/action-engine/context-builder.ts`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_learning.py`
- Test: `backend/tests/action-engine-learning.test.ts`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission_learning.py`

**Interfaces:**
- Consumes: completed Mission outcomes, interventions, approvals, costs, evaluations and evidence.
- Produces: tenant-scoped memory summaries and immutable `LearningRecommendation` records.

- [x] **Step 1: Write non-self-modification tests**

Assert a completed Mission creates a recommendation; duplicate outcome is idempotent; another tenant is isolated; recommendation cannot update prompt/pack/policy; only approved outcome summaries enter future context.

- [x] **Step 2: Run TypeScript and Python tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-learning.test.ts`; `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_mission_learning.py -q`  
Expected: FAIL with missing learning components.

- [x] **Step 3: Define recommendation contract**

```ts
type LearningRecommendation = {
  recommendationType: 'pack_change' | 'prompt_change' | 'policy_change' | 'knowledge_candidate'
  targetKey: string
  rationale: string
  evidenceIds: string[]
  expectedImpact: Record<string, string>
  status: 'proposed' | 'shadow_testing' | 'approved' | 'rejected' | 'promoted'
}
```

- [x] **Step 4: Feed only approved memory summaries into context**

Context Builder includes compact outcome patterns scoped to organization and relevant pack. Raw conversations, hidden prompts and rejected recommendations are excluded.

- [x] **Step 5: Run tests and commit**

Run both focused suites, then full backend and Python suites.  
Expected: PASS.  
Commit: `feat: add governed mission learning memory`

---

### Task 5: Add shadow experiments and admin promotion workflow

**Files:**
- Create: `backend/src/db/migrations/0147_mission_learning_experiments.sql`
- Create: `backend/src/modules/action-engine/experiments.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Create: `frontend/src/components/action-engine/MissionLearningPanel.tsx`
- Create: `frontend/src/pages/platform/MissionLearningPage.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/action-engine-experiments.test.ts`
- Test: `frontend/src/components/action-engine/MissionLearningPanel.test.tsx`

**Interfaces:**
- Consumes: learning recommendation and production baseline.
- Produces: shadow experiment, measured comparison, admin decision and versioned promotion request.

- [x] **Step 1: Write workflow and permission tests**

Cover create shadow experiment, no production effect, result comparison, admin-only approval, rejected experiment, pack/prompt version creation request and audit trail.

- [x] **Step 2: Run tests and verify failure**

Run focused backend/frontend tests.  
Expected: FAIL because experiment workflow/UI are absent.

- [x] **Step 3: Implement experiment service**

Shadow experiments replay sanitized context and recorded inputs against a candidate configuration; they never call mutation/provider capabilities. Store metrics and context/config hashes. Promotion additionally runs the complete golden corpus and blocks on any schema, safety, tenant, protected-node, attribution or unapproved cost/latency regression.

- [x] **Step 4: Implement admin review UI**

Show evidence, baseline/candidate metrics, cost and risk. Approval creates a versioned change request; it does not directly overwrite a published artifact.

- [x] **Step 5: Run tests/build and commit**

Run backend/frontend focused tests and frontend build.  
Expected: PASS.  
Commit: `feat: add mission learning shadow experiments`

---

### Task 6: Add autonomy control center and incident operations

**Files:**
- Create: `frontend/src/components/action-engine/AutonomyControlCenter.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/modules/action-engine/readiness.ts`
- Create: `docs/runbooks/yux-autonomous-mission-incident.md`
- Test: `frontend/src/components/action-engine/AutonomyControlCenter.test.tsx`

**Interfaces:**
- Consumes: grants, envelope usage, health, kill switches, approvals and incidents.
- Produces: grant request/revoke, Mission pause and explainable live autonomy status.

- [x] **Step 1: Write UI and API authorization tests**

Cover envelope preview, remaining budget/contacts/time, exact approval hash, revoke, kill switch, client role, expired grant and degraded provider warning.

- [x] **Step 2: Run focused tests and verify failure**

Run frontend control-center test and backend route test.  
Expected: FAIL because control center is absent.

- [x] **Step 3: Add safe operational endpoints**

Return aggregate usage and health without PII. Grant/revoke/kill-switch mutations require explicit permissions and audit events.

- [x] **Step 4: Implement UI and incident runbook**

Provide one-click Mission pause and grant revoke, but require confirmation for global/organization/pack/capability-version kill switches. Runbook specifies the residual post-dispatch lease window, provider reconciliation, cost reversal and claims released last.

- [x] **Step 5: Run tests/build and commit**

Expected: focused tests and frontend build PASS.  
Commit: `feat: add mission autonomy control center`

---

### Task 7: Perform security, resilience and full-program acceptance

**Files:**
- Create: `backend/tests/autonomous-mission-e2e.test.ts`
- Create: `workers/marketing-studio-agent-runtime/tests/test_autonomous_mission_security.py`
- Create: `docs/runbooks/yux-autonomous-mission-rollout.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: all prior releases and Tasks 1–6.
- Produces: signed-off production canary and complete-program acceptance evidence.

- [x] **Step 1: Add adversarial and failure-injection tests**

Cover prompt injection, cross-tenant retrieval, tool escalation, secret exfiltration attempt, malformed model JSON, database/Redis/provider outage, duplicate callbacks, stale approval, cancellation race and budget race.

- [x] **Step 2: Run complete automated verification**

Run all backend/frontend/Python tests, type-checks and production builds.  
Expected: all PASS; modified-file lint PASS.

- [ ] **Step 3: Execute staged production rollout**

For one internal workspace: shadow acceptance, prepare drafts, assisted provider sandbox, assisted low-budget live canary, then a time-limited autonomous grant with a narrow capability allowlist.

- [ ] **Step 4: Exercise incident and rollback paths**

Trigger Mission pause, grant revoke, exact capability kill switch, expired mutation lease, provider unknown-effect reconciliation and rollback. Verify no new dispatch after lease/preflight denial, while every provider-accepted effect remains visible and contained/reconciled.

- [ ] **Step 5: Close the program and commit**

Record acceptance criteria, Mission IDs, pack/context/catalog/attribution hashes, produced value, cost, human hours, approvals, mutation leases, incidents, golden benchmark and rollback evidence. Apply the spec's objective rollback triggers and update status only after authenticated production verification.  
Commit: `feat: complete bounded autonomous mission supervisor`

> Repository acceptance is complete through Step 2. Steps 3–5 remain operational gates: they require an authenticated VPS deployment, a real internal Mission and provider evidence, and therefore cannot be satisfied by local tests or documentation alone.
