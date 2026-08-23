# YUX Mission Foundation and Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Missions beyond Revenue Recovery, ground every plan in frozen organization knowledge and live state, and enforce real shadow/prepare/assisted/autonomous semantics.

**Architecture:** Add additive Mission goal, autonomy and context-snapshot persistence; build a TypeScript context builder over Company Intelligence and read-only baselines; make the Python Harness produce a typed supervisor proposal; compile it again in TypeScript; and derive capability effects from Mission mode at final preflight. Existing Revenue Recovery behavior remains compatible.

**Tech Stack:** PostgreSQL migrations, TypeScript/Fastify/BullMQ, Python/FastAPI/Pydantic/OpenRouter, React/Vite, Vitest and Pytest.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Release 0 safety contracts, unknown-effect reconciliation, claims/fencing, redaction and golden gates are prerequisites.
- Preserve all `revenue_recovery@0.1.0` rows and routes.
- Store exact source IDs, hashes and the pinned capability manifest/hash for each plan/replan.
- Treat Harness output as untrusted and validate it in Python and TypeScript.
- `shadow` produces no mutation; `prepare` permits draft effects only.
- No knowledge item enters context unless published and allowed for the selected agent profile.
- The Action Engine, not the Harness, decides whether an effect may execute.

---

### Task 1: Persist generic goals, autonomy envelopes and context snapshots

**Files:**
- Create: `backend/src/db/migrations/0131_mission_supervisor_foundation.sql`
- Modify: `backend/src/modules/action-engine/types.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Test: `backend/tests/mission-supervisor-schema.test.ts`
- Test: `backend/tests/action-engine-routes.test.ts`

**Interfaces:**
- Consumes: existing `action_missions`, `action_plans` and tenant RLS helpers.
- Produces: `MissionGoal`, `AutonomyEnvelope`, `MissionContextSnapshot`, `insertMissionContextSnapshot()` and `getMissionContextSnapshot()`.

- [ ] **Step 1: Write failing schema and repository tests**

Assert the migration adds `goal JSONB`, `autonomy_envelope JSONB`, `pack_selection JSONB`, and a tenant-protected `action_mission_context_snapshots` table with `context_hash`, `knowledge_items`, `strategy_items`, `live_state`, `capability_manifest` and `capability_catalog_hash`. Add a route fixture that creates and reads the new fields while an old Revenue Recovery row maps them to safe defaults.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd backend && npx vitest run tests/mission-supervisor-schema.test.ts tests/action-engine-routes.test.ts`  
Expected: FAIL because migration `0131` and new types do not exist.

- [ ] **Step 3: Add the migration and exact TypeScript contracts**

```ts
export type MissionGoal = {
  statement: string
  requestedOutcome: string
  scopeHints: string[]
  constraints: Record<string, unknown>
  acceptanceCriteria: Array<{ key: string; operator: string; target: string; unit: string }>
}

export type AutonomyEnvelope = {
  mode: 'shadow' | 'prepare' | 'assisted' | 'autonomous'
  allowedModules: string[]
  allowedCapabilityKeys: string[]
  maxTotalCostBrl: string
  maxHumanHours: string
  maxExternalContacts?: number
  expiresAt: string
  alwaysRequireApprovalFor: string[]
}
```

Extend `MissionMode` and the database mode check to include `autonomous`. Use JSONB object checks, organization foreign keys, `UNIQUE (mission_id, context_hash)`, RLS matching other Action Engine ledgers, and append-only protection for context snapshots.

- [ ] **Step 4: Implement repository mapping and snapshot functions**

Use parameterized queries and return camelCase objects. Compute `context_hash` before insert from a stable serialization; a duplicate hash for the same Mission returns the existing row.

- [ ] **Step 5: Run tests, type-check and commit**

Run: `cd backend && npx vitest run tests/mission-supervisor-schema.test.ts tests/action-engine-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add generic mission goal and context ledger`

---

### Task 2: Build the Mission context and live-baseline service

**Files:**
- Create: `backend/src/modules/action-engine/context-builder.ts`
- Create: `backend/src/modules/action-engine/baselines/index.ts`
- Create: `backend/src/modules/action-engine/baselines/crm.ts`
- Create: `backend/src/modules/action-engine/baselines/automations.ts`
- Create: `backend/src/modules/action-engine/baselines/campaigns.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Test: `backend/tests/action-engine-context.test.ts`

**Interfaces:**
- Consumes: Company Intelligence published knowledge, active Strategy Pack bindings, contract entitlements and read-only module state.
- Produces: `buildMissionContext(pool, input): Promise<BuiltMissionContext>` and `collectMissionBaseline(pool, input): Promise<Record<string, unknown>>`.

- [ ] **Step 1: Write tenant, publication and hash tests**

Cover published versus draft knowledge, external visibility, allowed/blocked profiles, another organization, missing optional modules, stable ordering and stable hash. Assert baseline output contains counts and IDs but no provider secret or message body PII.

- [ ] **Step 2: Run the context tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-context.test.ts`  
Expected: FAIL with missing `buildMissionContext`.

- [ ] **Step 3: Implement the context contract**

```ts
export type BuiltMissionContext = {
  query: string
  companyContext: Record<string, unknown>
  strategyItems: Array<{ id: string; version: number; contentHash: string }>
  knowledgeItems: Array<{ id: string; sourceId: string; contentHash: string; visibility: string; excerpt: string }>
  liveState: Record<string, unknown>
  capabilityManifest: Array<{ key: string; version: number; definitionHash: string }>
  capabilityCatalogHash: string
  contextHash: string
}
```

Limit excerpts and total characters; reuse Company Intelligence governance rules; stable-sort every collection before hashing.

- [ ] **Step 4: Replace empty planner inputs**

In `handleActionEnginePlanMission`, call `buildMissionContext`, persist the snapshot, and pass `strategy_context`, `baseline`, `context_snapshot_id` and `allowed_source_ids` to the Harness instead of `{}`.

- [ ] **Step 5: Run focused and regression tests, then commit**

Run: `cd backend && npx vitest run tests/action-engine-context.test.ts tests/action-engine-planner.test.ts tests/company-intelligence-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: ground mission plans in frozen workspace context`

---

### Task 3: Add the real Harness Mission Supervisor contract

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_contracts.py`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_supervisor.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission_supervisor.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission.py`

**Interfaces:**
- Consumes: `MissionPlanRequest`, context snapshot, published pack catalog and allowed capability metadata.
- Produces: `MissionSupervisorProposal` with either `clarification` or `plan`, plus trace and usage.

- [ ] **Step 1: Write failing contract tests**

Cover a clarification response, a valid single-pack plan, invalid source citation, unknown capability, invented pack, malformed JSON, prompt injection inside retrieved context and tenant validation. Mock OpenRouter; do not require a live provider.

- [ ] **Step 2: Run Pytest and verify failure**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_mission_supervisor.py tests/test_mission.py -q`  
Expected: FAIL because `MissionSupervisorProposal` is missing.

- [ ] **Step 3: Extend the canonical Pydantic response boundary and regenerate consumers**

```python
class MissionSupervisorProposal(BaseModel):
    kind: Literal["clarification", "plan"]
    interpretation: dict[str, Any]
    questions: list[ClarificationQuestion] = Field(default_factory=list)
    selected_packs: list[SelectedPack] = Field(default_factory=list)
    plan: dict[str, Any] | None = None
    source_ids: list[str] = Field(default_factory=list)
```

Reject any `source_id` outside `allowed_source_ids` and any pack/capability outside the request catalog.

Update the Release 0 canonical models, export `contracts/mission-supervisor/v1/mission-wire.schema.json`, regenerate TypeScript and pass the CI drift check; do not introduce a separate Zod copy of this response.

- [ ] **Step 4: Implement model invocation and deterministic fallback boundaries**

Use the configured Harness model route with JSON-only output. Keep deterministic fallback only for the legacy Revenue Recovery pack; generic requests without an available model return `mission_supervisor_model_unavailable` instead of silently fabricating a plan.

- [ ] **Step 5: Run tests and commit**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest -q`  
Expected: all runtime tests PASS.  
Commit: `feat: add grounded mission supervisor planning`

---

### Task 4: Compile generic and composite-safe plan proposals in TypeScript

**Files:**
- Modify: `backend/src/modules/action-engine/planner.ts`
- Modify: `backend/src/modules/action-engine/mission-wire-validator.ts`
- Modify: `backend/src/modules/action-engine/generated/mission-wire.ts`
- Modify: `backend/src/modules/action-engine/action-pack.ts`
- Test: `backend/tests/action-engine-general-planner.test.ts`

**Interfaces:**
- Consumes: Harness `MissionSupervisorProposal`, frozen context snapshot, pack registry and capability registry v2.
- Produces: `compileSupervisorPlan(input): CompiledMissionPlan | ClarificationRequired`.

- [ ] **Step 1: Write adversarial compiler tests**

Test source allowlist, unknown pack, removed protected step, cycle, future output binding, catalog hash mismatch, expired autonomy envelope, unsupported mode and excess economics. Test legacy `compileMissionPlan` compatibility.

- [ ] **Step 2: Run the planner tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-general-planner.test.ts tests/action-engine-planner.test.ts`  
Expected: FAIL with missing compiler.

- [ ] **Step 3: Implement discriminated result types**

```ts
export type SupervisorCompileResult =
  | { kind: 'clarification'; interpretation: Record<string, unknown>; questions: ClarificationQuestion[] }
  | { kind: 'plan'; compiled: CompiledMissionPlan; selectedPacks: SelectedPack[]; sourceIds: string[] }
```

Validate the unknown payload with the Release 0 Ajv wire validator, then revalidate every security/policy check; derive the plan hash from exact pack and capability manifests, steps, bindings, economics, source IDs and context hash.

- [ ] **Step 4: Persist clarification or plan atomically**

A clarification returns the Mission to `qualifying` and stores questions without creating `action_plans`. A valid plan creates a revision and exact-hash approval as today.

- [ ] **Step 5: Run tests, type-check and commit**

Run: `cd backend && npx vitest run tests/action-engine-general-planner.test.ts tests/action-engine-planner.test.ts tests/action-engine-replan.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: compile generic supervisor plans safely`

---

### Task 5: Enforce autonomy modes and capability policy v2

**Files:**
- Modify: `backend/src/modules/action-engine/capability-registry.ts`
- Modify: `backend/src/modules/action-engine/capability-policy.ts`
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/action-engine/readiness.ts`
- Test: `backend/tests/action-engine-autonomy-modes.test.ts`
- Test: `backend/tests/action-engine-execution.test.ts`

**Interfaces:**
- Consumes: Mission mode/envelope, capability effect class, actor permission, entitlement, ownership, consent, budget and connection health.
- Produces: `CapabilityDefinitionV2`, `resolveExecutionMode()` and a final `CapabilityDecision` containing `dryRun`, `allowedEffect` and `requiresApproval`.

- [ ] **Step 1: Write the complete mode matrix test**

For each mode and each effect (`none`, `draft`, `internal`, `external`, `destructive`), assert allow, dry-run, approval or deny. Add races where the envelope expires, Mission pauses or kill switch turns on after queueing but before invocation.

- [ ] **Step 2: Run tests and verify the current `dryRun: false` behavior fails**

Run: `cd backend && npx vitest run tests/action-engine-autonomy-modes.test.ts tests/action-engine-execution.test.ts`  
Expected: FAIL for shadow and prepare mutation cases.

- [ ] **Step 3: Extend capability metadata and policy**

```ts
type CapabilityEffectV2 = 'none' | 'draft' | 'internal' | 'external' | 'destructive'
type CapabilityDefinitionV2<TInput, TOutput> = CapabilityDefinition<TInput, TOutput> & {
  domain: string
  effect: CapabilityEffectV2
  requiredPermissions: string[]
  supportsModes: Array<'shadow' | 'prepare' | 'assisted' | 'autonomous'>
  readiness(context: CapabilityReadinessContext, input: TInput): Promise<CapabilityReadiness>
  recovery: CapabilityRecovery<TOutput>
}
type ExecutionModeDecision = {
  outcome: 'allow' | 'deny' | 'unavailable'
  dryRun: boolean
  requiresApproval: boolean
  reason: string
}
```

Map legacy `effect: 'none' | 'internal' | 'external'` safely while capabilities migrate.

- [ ] **Step 4: Execute the final preflight immediately before registry invocation**

Load current Mission, envelope, approval, policy, resource claim/fencing token, budget, granular kill switches and exact capability definition hash; pass the derived `dryRun` to the capability. For a real mutation, issue the Release 0 single-attempt lease immediately before registry invocation. Never trust the value stored when the job was queued.

- [ ] **Step 5: Run suites and commit**

Run: `cd backend && npx vitest run tests/action-engine-autonomy-modes.test.ts tests/action-engine-policy.test.ts tests/action-engine-execution.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: enforce mission autonomy envelopes at execution`

---

### Task 6: Replace the Revenue Recovery wizard with generic Mission intake

**Files:**
- Create: `frontend/src/components/action-engine/MissionIntake.tsx`
- Create: `frontend/src/components/action-engine/MissionClarificationPanel.tsx`
- Create: `frontend/src/components/action-engine/AutonomyEnvelopeForm.tsx`
- Modify: `frontend/src/components/action-engine/MissionsWorkspace.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/pages/client-portal/PortalMissionsPage.tsx`
- Modify: `frontend/src/pages/client-portal/PortalMissionDetailPage.tsx`
- Modify: `frontend/src/lib/platform/accessControl.ts`
- Modify: `frontend/src/services/actionEngineService.ts`
- Modify: `frontend/src/types/actionEngine.ts`
- Test: `frontend/src/components/action-engine/MissionIntake.test.tsx`

**Interfaces:**
- Consumes: generic Mission create/readiness APIs and clarification questions.
- Produces: natural-language objective, confirmed interpretation, constraints, envelope and exact approval-ready request.

- [ ] **Step 1: Write failing interaction tests**

Cover a natural-language request, clarification answers, budget and deadline validation, role restrictions, mode descriptions, readiness blockers and a legacy Revenue Recovery quick-start option.

- [ ] **Step 2: Run the focused frontend test and verify failure**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionIntake.test.tsx`  
Expected: FAIL because the generic intake is absent.

- [ ] **Step 3: Add frontend contracts and service methods**

```ts
createMissionIntent(input: CreateMissionIntentInput): Promise<ActionMission>
answerMissionClarification(missionId: string, input: ClarificationAnswerInput): Promise<ActionMission>
previewMissionContext(missionId: string): Promise<MissionContextPreview>
```

Render source titles and categories, never raw internal-only context in a client-visible view.

- [ ] **Step 4: Implement the intake and detail states**

Keep the existing dashboard. Replace the hard-coded wizard opening with Mission Intake; retain “Revenue Recovery” as a quick-start template. Show interpretation and questions before plan generation. Replace the hard-coded `role !== 'client'` write check with explicit Mission permissions resolved from platform access control.

- [ ] **Step 5: Run tests, build and commit**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionIntake.test.tsx src/lib/action-engine/missionRules.test.ts && npm run build`  
Expected: PASS.  
Commit: `feat: add conversational mission intake`

---

### Task 7: Add foundation observability, compatibility and browser acceptance

**Files:**
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/worker.ts`
- Modify: `docs/runbooks/yux-action-engine-pilot.md`
- Create: `docs/runbooks/yux-mission-supervisor-foundation.md`
- Test: `backend/tests/action-engine-foundation-e2e.test.ts`
- Test: `workers/marketing-studio-agent-runtime/tests/test_live_mission_supervisor.py`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: health signals, rollout flags, objective rollback evidence and Release 1A acceptance evidence.

- [ ] **Step 1: Write an end-to-end fake-provider test**

Create a generic Mission, freeze context, obtain a plan, approve it, start in `shadow`, run all actions and assert zero domain mutation, one trace per model call and one evidence chain per action.

- [ ] **Step 2: Run backend, frontend and Python suites**

Run: `cd backend && npm test && npm run build`; `cd frontend && npm test && npm run build`; `cd workers/marketing-studio-agent-runtime && python -m pytest -q`  
Expected before completion: the new end-to-end test FAILS while existing suites PASS.

- [ ] **Step 3: Add health and rollout reporting**

Expose planner availability, context retrieval status, pinned catalog hash, stale envelopes, mode-specific action counts and measured intake/planning p95/p99 from `/operations/health`; send fields through Release 0 telemetry redaction and never expose PII or prompts.

- [ ] **Step 4: Perform browser acceptance through the real UI**

Test: admin creates generic Mission; client without write permission only views; clarification is answered; plan sources render; shadow execution completes without changing CRM. Capture URLs, Mission ID, golden profile, schema/catalog hashes and health output in the runbook. Describe this release as engineering validation rather than autonomous customer value.

- [ ] **Step 5: Run full verification and commit**

Run all three suites again plus production builds, contract drift, golden missions and a rollback rehearsal. The runbook uses objective triggers from the spec: cross-tenant/secret exposure, unauthorized effect, two consecutive 15-minute SLO breaches, golden safety regression or migration-integrity failure.  
Expected: PASS with no new lint errors in modified files; rollback preserves snapshots/plans/evidence and disables new planning without stopping already compiled deterministic work.  
Commit: `feat: complete grounded mission foundation`
