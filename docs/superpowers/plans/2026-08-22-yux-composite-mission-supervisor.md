# YUX Composite Mission Supervisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one grounded Mission select and compose multiple published Action Packs, route bounded specialist agents and execute cross-module dependencies without creating a free-form DAG.

**Architecture:** Add a pack catalog/resolver and immutable composite-plan manifest. The Harness supervisor selects packs and specialist workflows; TypeScript validates each pack independently, permits only declared cross-pack bindings and executes one durable plan under a single Mission owner. Pack-specific evaluators feed a composite outcome policy.

**Tech Stack:** TypeScript/Fastify/PostgreSQL/BullMQ, Python/FastAPI/Pydantic, React/Vite, Vitest and Pytest.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Releases 0, 1A, 1B, 2 and 3 are prerequisites.
- Composite planning selects immutable published pack versions; it never copies or rewrites their protected topology.
- Cross-pack bindings use declared artifact contracts and cannot reference arbitrary output paths.
- One Action Engine Mission owns intent, pause, cancel, budget and replan across all subprocesses.
- Specialists propose typed artifacts only and cannot invoke mutation capabilities.
- Specialist routing consumes the Release 0 planning-cycle budget/cache and exits to clarification or human review when the cycle ceiling is reached.
- A composite plan hash covers every pack hash, context hash, binding, step, source and economic estimate.

---

### Task 1: Build the published pack catalog and resolver

**Files:**
- Create: `backend/src/modules/action-engine/pack-registry.ts`
- Create: `backend/src/modules/action-engine/pack-resolver.ts`
- Modify: `backend/src/modules/action-engine/action-pack.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Test: `backend/tests/action-engine-pack-resolver.test.ts`

**Interfaces:**
- Consumes: published pack versions, required modules, capability availability and Mission goal.
- Produces: `PackCatalogEntry`, `ResolvedPackSelection` and `resolvePackSelection()`.

- [ ] **Step 1: Write resolver allowlist tests**

Cover single pack, compatible pair, missing entitlement, unavailable capability, unpublished version, hash mismatch, duplicate selection and unsatisfied artifact requirement.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-pack-resolver.test.ts`  
Expected: FAIL with missing resolver.

- [ ] **Step 3: Define pack input/output artifacts**

```ts
type PackCatalogEntry = {
  key: string
  semanticVersion: string
  contentHash: string
  requiredModules: string[]
  requiredCapabilities: Array<{ key: string; version: number }>
  consumesArtifacts: Array<{ key: string; schemaVersion: number; optional: boolean }>
  producesArtifacts: Array<{ key: string; schemaVersion: number }>
}
```

- [ ] **Step 4: Implement deterministic selection validation**

The Harness may propose keys; TypeScript resolves exact published versions and rejects incompatible artifact graphs. Expose a read-only catalog endpoint filtered by organization entitlements.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-pack-resolver.test.ts tests/action-engine-pack.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add governed action pack resolver`

---

### Task 2: Compile immutable composite plans and bindings

**Files:**
- Create: `backend/src/modules/action-engine/composite-plan.ts`
- Modify: `backend/src/modules/action-engine/mission-wire-validator.ts`
- Modify: `backend/src/modules/action-engine/generated/mission-wire.ts`
- Modify: `backend/src/modules/action-engine/planner.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Test: `backend/tests/action-engine-composite-plan.test.ts`

**Interfaces:**
- Consumes: resolved pack selection, per-pack compiled plans and declared artifact contracts.
- Produces: `CompiledCompositePlan` and namespaced step keys `<packKey>.<localStepKey>`.

- [ ] **Step 1: Write composition and attack tests**

Compose Funnel + Nurture before Campaign Launch; reject undeclared binding, pack cycle, protected-node collision, capability escalation, budget sum overflow and source outside snapshot.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-composite-plan.test.ts`  
Expected: FAIL with missing composite compiler.

- [ ] **Step 3: Define the manifest**

```ts
type CompiledCompositePlan = {
  packs: ResolvedPackSelection[]
  steps: CompiledMissionPlan['steps']
  bindings: Array<{ fromPack: string; artifactKey: string; toPack: string; inputKey: string; schemaVersion: number }>
  aggregateEconomics: Record<string, string>
  planHash: string
}
```

- [ ] **Step 4: Persist pack manifest and artifact bindings**

Store the manifest in the plan compiled payload and normalized artifact-binding rows for queries. A replan may change parameters or permitted extensions but not an approved pack version without a new scope approval.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-composite-plan.test.ts tests/action-engine-general-planner.test.ts tests/action-engine-replan.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: compile immutable composite mission plans`

---

### Task 3: Orchestrate supervisor specialists and clarification loops

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_supervisor.py`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_router.py`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_verifier.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_composite_mission_supervisor.py`

**Interfaces:**
- Consumes: pack catalog, context snapshot, user answers and specialist artifact schemas.
- Produces: clarification or composite proposal with per-specialist trace and one verifier verdict.

- [ ] **Step 1: Write routing and boundedness tests**

Cover CRM-only request, campaign-only request, funnel+campaign composition, ambiguous request within the three-question cap, conflicting specialist output, deterministic specialist skip/cache hit, planning-cycle exhaustion, unsupported functional area and prompt-injected request for an arbitrary tool.

- [ ] **Step 2: Run Pytest and verify failure**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_composite_mission_supervisor.py -q`  
Expected: FAIL with missing router/verifier.

- [ ] **Step 3: Implement structured router output**

```python
class MissionRoute(BaseModel):
    selected_pack_keys: list[str]
    specialist_profiles: list[str]
    clarification_questions: list[ClarificationQuestion]
    rationale: str
```

Validate every key/profile against server-provided catalogs.

- [ ] **Step 4: Merge specialist artifacts through the verifier**

The verifier checks artifact schema, citations, capability needs, pack contracts, cross-pack bindings, economics and approval requirements before returning a proposal.

- [ ] **Step 5: Run Python suite and commit**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest -q`  
Expected: PASS.  
Commit: `feat: orchestrate composite mission specialists`

---

### Task 4: Execute cross-pack artifacts, ownership and cancellation safely

**Files:**
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/action-engine/execution-ownership.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Test: `backend/tests/action-engine-composite-execution.test.ts`

**Interfaces:**
- Consumes: composite action runs, artifact bindings and one Mission state.
- Produces: resolved downstream inputs, cross-pack scheduling and atomic Mission-wide pause/cancel behavior.

- [ ] **Step 1: Write dependency and race tests**

Test downstream wait for published funnel artifact, artifact schema mismatch, parallel independent branches, cancellation during one provider action, Mission-wide ownership conflict and retry without duplicate artifact.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-composite-execution.test.ts`  
Expected: FAIL because bindings are not resolved.

- [ ] **Step 3: Resolve inputs only from successful immutable artifacts**

Before an action becomes ready, load declared bindings and validate artifact key/schema/hash. Store the resolved input snapshot on the attempt for audit.

- [ ] **Step 4: Apply Mission state to all branches**

Pause/cancel/kill switch prevents new claims across every pack. Provider calls already accepted are reconciled and recorded, not erased. Ownership covers all linked artifacts and entities.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-composite-execution.test.ts tests/action-engine-execution.test.ts tests/action-engine-ownership.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: execute composite missions safely`

---

### Task 5: Aggregate pack metrics and Mission outcome

**Files:**
- Create: `backend/src/modules/action-engine/metrics/composite.ts`
- Modify: `backend/src/modules/action-engine/evaluator.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Test: `backend/tests/action-engine-composite-evaluator.test.ts`

**Interfaces:**
- Consumes: per-pack metrics/evaluations, aggregate economics and Mission acceptance criteria.
- Produces: per-pack conclusions plus one Mission conclusion and replan request.

- [ ] **Step 1: Write aggregate evaluation tests**

Cover all packs succeeding, upstream failure blocking downstream, optional pack failure, campaign guardrail pause, aggregate budget breach, unknown metrics and acceptance criteria achieved.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-composite-evaluator.test.ts`  
Expected: FAIL with missing composite evaluator.

- [ ] **Step 3: Implement deterministic precedence**

Critical block/pause beats success; terminal required-pack failure fails Mission; unknown required metrics follow the pack policy; optional pack failure cannot fabricate success. LLM analysis remains descriptive and cannot override conclusion.

- [ ] **Step 4: Replan only affected packs and dependents**

Provide previous manifest, observations and artifact diffs to the Harness. Preserve unaffected approved pack revisions and require scope approval for pack addition/removal.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-composite-evaluator.test.ts tests/campaign-launch-evaluator.test.ts tests/action-engine-evaluator.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: evaluate composite mission outcomes`

---

### Task 6: Add composite plan and specialist trace UI

**Files:**
- Create: `frontend/src/components/action-engine/CompositeMissionPlan.tsx`
- Create: `frontend/src/components/action-engine/MissionSpecialistTrace.tsx`
- Modify: `frontend/src/components/action-engine/MissionPlanPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/types/actionEngine.ts`
- Test: `frontend/src/components/action-engine/CompositeMissionPlan.test.tsx`

**Interfaces:**
- Consumes: pack manifest, cross-pack bindings, specialist trace summaries and per-pack metrics.
- Produces: understandable composite-plan, dependency and approval display.

- [ ] **Step 1: Write rendering and permission tests**

Cover two-pack plan, binding visualization, per-pack status, source/economic summary, specialist trace without hidden prompts, replan diff and client-safe view.

- [ ] **Step 2: Run focused test and verify failure**

Run: `cd frontend && npx vitest run src/components/action-engine/CompositeMissionPlan.test.tsx`  
Expected: FAIL with missing component.

- [ ] **Step 3: Extend typed detail response**

Add `selectedPacks`, `artifactBindings`, `packStatuses`, `specialistTraceSummaries` and `packMetrics`; retain single-pack rendering compatibility.

- [ ] **Step 4: Render the smallest useful dependency visualization**

Group steps by pack and show explicit artifact arrows between groups. Approvals display affected packs, versions and hashes.

- [ ] **Step 5: Run tests/build and commit**

Run: `cd frontend && npx vitest run src/components/action-engine/CompositeMissionPlan.test.tsx && npm run build`  
Expected: PASS.  
Commit: `feat: add composite mission cockpit`

---

### Task 7: Complete composite end-to-end acceptance

**Files:**
- Create: `backend/tests/composite-mission-e2e.test.ts`
- Create: `docs/runbooks/yux-composite-mission-supervisor.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: Tasks 1–6 and Releases 0, 1A, 1B, 2 and 3.
- Produces: accepted composite Mission contract and rollout flag.

- [ ] **Step 1: Add full fake-provider scenario**

Request funnel+nurture+campaign, create and publish funnel artifacts, bind them into campaign planning, create provider campaign paused, approve/activate, observe metrics and complete.

- [ ] **Step 2: Add cancellation, tenant and pack-attack scenarios**

Cancel while packs run in parallel; reject cross-tenant artifact binding, unknown pack, capability escalation, pack removal replan and duplicate provider callback.

- [ ] **Step 3: Run all suites and builds**

Expected: backend, frontend and Python suites PASS.

- [ ] **Step 4: Perform browser acceptance**

Verify natural-language request, clarification, selected packs, cross-pack plan, approvals, artifact links, pause and replan with a disposable organization.

- [ ] **Step 5: Document rollback and commit**

Runbook covers objective rollback triggers, Mission-wide pause, exact pack/capability flags, provider unknown-effect reconciliation, artifact preservation, claims released last and immutable manifest audit. Rehearse rollback on cross-pack fencing conflict and two consecutive 15-minute SLO breaches.  
Commit: `feat: complete composite mission supervisor`
