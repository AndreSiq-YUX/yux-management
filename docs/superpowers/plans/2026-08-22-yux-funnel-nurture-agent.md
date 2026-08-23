# YUX Funnel and Nurture Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete autonomous-agent vertical slice: create, simulate, approve, publish and evaluate a CRM funnel plus an e-mail nurture sequence from a grounded natural-language objective.

**Architecture:** Add domain command services for CRM, e-mail templates and automations; wrap them in capability v2 definitions; publish a protected `funnel_nurture@1.0.0` Action Pack; and expose artifacts, diffs and approvals in the Mission cockpit. Draft creation works in `prepare`; publication and activation require assisted approval.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, BullMQ, Python Harness artifacts, React/Vite and Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Releases 0, 1A and 1B contracts, safety primitives and decision UX are prerequisites.
- CRM, template and automation invariants stay inside their domain command services.
- Funnel and sequence drafts are mission-linked and recoverable; no destructive replacement.
- Generated copy must cite published company/brand sources and pass compliance checks.
- Publication and activation use exact artifact-version hashes and explicit approval in the first release.
- The pack publishes the governed automation that enrolls future eligible leads into the sequence; it never bulk-enrolls existing leads during setup, and runtime dispatch still enforces consent, suppression and provider policy.
- Production-reviewable generated copy must pass the adversarial knowledge corpus; retrieved instructions cannot alter tools, policies, permissions or schemas.
- Funnel value remains `unknown` unless the pack's exact attribution-policy version/hash resolves eligible events.

---

### Task 1: Extract mission-safe domain command services

**Files:**
- Create: `backend/src/modules/crm/mission-commands.ts`
- Create: `backend/src/modules/emailTemplates/mission-commands.ts`
- Create: `backend/src/modules/automations/mission-commands.ts`
- Modify: `backend/src/modules/crm/pipeline-repository.ts`
- Modify: `backend/src/modules/emailTemplates/repository.ts`
- Modify: `backend/src/modules/automations/repository.ts`
- Test: `backend/tests/mission-domain-commands.test.ts`

**Interfaces:**
- Consumes: authenticated actor/service actor, organization, Mission correlation and idempotency key.
- Produces: `createPipelineDraft`, `publishPipelineDraft`, `createEmailTemplateDraft`, `publishEmailTemplateVersion`, `createSequenceDraft`, `publishSequenceDraft`, `simulateSequenceDraft`.

- [ ] **Step 1: Write failing invariant and idempotency tests**

Assert tenant scope, duplicate key reuse, stage uniqueness, immutable published template versions, sequence step ordering, disabled-provider behavior, correlation events and zero activation from a draft command.

- [ ] **Step 2: Run the command tests and verify failure**

Run: `cd backend && npx vitest run tests/mission-domain-commands.test.ts`  
Expected: FAIL because mission command services do not exist.

- [ ] **Step 3: Define explicit command inputs**

```ts
type MissionCommandContext = {
  organizationId: string
  missionId: string
  actionRunId: string
  actorId: string
  idempotencyKey: string
}
```

Each command returns `{ entityId, versionId?, status, evidence }`; it emits a domain event with `missionId` and never accepts raw table/column names.

- [ ] **Step 4: Implement commands by reusing domain validation**

Refactor shared internal functions only where needed. Keep HTTP routes calling the same repositories so UI and Mission behavior cannot diverge.

- [ ] **Step 5: Run tests, type-check and commit**

Run: `cd backend && npx vitest run tests/mission-domain-commands.test.ts tests/crm-routes.test.ts tests/email-template-routes.test.ts tests/automation-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `refactor: expose mission-safe revenue operations commands`

---

### Task 2: Register CRM funnel capabilities

**Files:**
- Create: `backend/src/modules/action-engine/capabilities/crm-funnel.ts`
- Modify: `backend/src/modules/action-engine/capabilities/index.ts`
- Modify: `backend/src/modules/action-engine/commands.ts`
- Test: `backend/tests/action-engine-crm-funnel-capabilities.test.ts`

**Interfaces:**
- Consumes: CRM mission commands and capability v2 policy.
- Produces: `crm.pipeline.inspect@1`, `crm.pipeline.create_draft@1`, `crm.pipeline.publish@1`, `crm.pipeline.simulate@1`.

- [ ] **Step 1: Write mode and schema tests**

Test inspection, valid draft with ordered stages, duplicate stage key, shadow preview, prepare draft, denied prepare publication, assisted exact-hash publication and stale-hash rejection.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-crm-funnel-capabilities.test.ts`  
Expected: FAIL with missing capabilities.

- [ ] **Step 3: Define funnel artifact schemas**

```ts
const funnelDraftInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000),
  stages: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_]+$/), name: z.string().min(1),
    exitCriteria: z.array(z.string().min(1)), isWon: z.boolean(), isLost: z.boolean(),
  })).min(2).max(20),
})
```

Return artifact/version IDs and a stable content hash.

- [ ] **Step 4: Implement via commands and register metadata**

Mark inspect/simulate `none`, create draft `draft`, publish `internal` with approval `always`. Record Mission entity ownership for the draft and published pipeline.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-crm-funnel-capabilities.test.ts tests/action-engine-capabilities.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add governed CRM funnel capabilities`

---

### Task 3: Register e-mail template and sequence capabilities

**Files:**
- Create: `backend/src/modules/action-engine/capabilities/email-nurture.ts`
- Modify: `backend/src/modules/action-engine/capabilities/index.ts`
- Modify: `backend/src/modules/action-engine/commands.ts`
- Test: `backend/tests/action-engine-email-nurture-capabilities.test.ts`

**Interfaces:**
- Consumes: generated copy artifacts, brand/compliance verdict, template and sequence mission commands.
- Produces: `email.templates.inspect@1`, `email.template.create_draft@1`, `email.template.publish@1`, `crm.sequence.create_draft@1`, `crm.sequence.simulate@1`, `crm.sequence.publish@1`, `automation.flow.create_draft@1`, `automation.flow.simulate@1`, `automation.flow.publish@1`.

- [ ] **Step 1: Write copy-governance and mode tests**

Cover missing citations, forbidden vocabulary, missing unsubscribe intent, excessive step count, invalid delay, invalid CRM trigger, consent/suppression preflight, shadow, prepare, assisted approval, stale template version and duplicate command key.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-email-nurture-capabilities.test.ts`  
Expected: FAIL with missing capability module.

- [ ] **Step 3: Define typed copy and sequence artifacts**

```ts
type NurtureEmailArtifact = {
  subject: string
  previewText: string
  bodyHtml: string
  bodyText: string
  sourceIds: string[]
  complianceNotes: string[]
}
```

Sequence steps reference created template version IDs, not mutable template names. The automation artifact references a typed CRM trigger, eligibility conditions, sequence version and exit conditions.

- [ ] **Step 4: Implement command-backed capabilities**

Draft effects are permitted in prepare. Publishing templates, sequence and the trigger flow is an internal activation requiring exact-hash approval. Existing leads are not enrolled by setup; future events enter only through the published automation runtime and its consent/suppression checks.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-email-nurture-capabilities.test.ts tests/email-template-rules.test.ts tests/automation-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add governed nurture capabilities`

---

### Task 4: Teach Harness specialists to produce funnel and nurture artifacts

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/funnel_nurture.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_supervisor.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_funnel_nurture.py`

**Interfaces:**
- Consumes: company offer/ICP/sales-cycle context, brand rules, current CRM baseline and capability schemas.
- Produces: `FunnelArtifact`, `NurtureSequenceArtifact` and evidence-bound specialist results.

- [ ] **Step 1: Write mocked-provider specialist tests**

Test normal generation, missing ICP clarification, existing-funnel reuse, forbidden brand term, unknown citation, invalid stage outcomes and invalid email sequence. Add direct “ignore previous instructions,” fake system text, base64 instruction, tool-escalation request and cross-tenant exfiltration bait inside retrieved knowledge; every case may influence cited business facts only and must preserve the response schema/tool allowlist.

- [ ] **Step 2: Run Pytest and verify failure**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_funnel_nurture.py -q`  
Expected: FAIL because specialist contracts are absent.

- [ ] **Step 3: Add specialist response models**

```python
class FunnelNurtureArtifacts(BaseModel):
    funnel: FunnelArtifact
    emails: list[NurtureEmailArtifact] = Field(min_length=1, max_length=12)
    sequence: SequenceArtifact
    automation: AutomationArtifact
    source_ids: list[str]
    risks: list[str]
```

The verifier rejects evidence IDs outside the context and requires the brand/compliance specialist verdict.

- [ ] **Step 4: Route the selected pack through bounded specialists**

Invoke CRM Architect, Copywriter, Automation Architect and Brand/Compliance Guardian as logical workflow nodes. Merge typed artifacts; specialists receive no mutation tools.

- [ ] **Step 5: Run the Python suite and commit**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest -q`  
Expected: PASS.  
Commit: `feat: generate grounded funnel and nurture artifacts`

---

### Task 5: Publish the protected Funnel + Nurture Action Pack

**Files:**
- Create: `backend/src/modules/action-engine/packs/funnel-nurture-v1.ts`
- Create: `backend/src/db/migrations/0133_funnel_nurture_pack.sql`
- Modify: `backend/src/modules/action-engine/action-pack.ts`
- Test: `backend/tests/funnel-nurture-pack.test.ts`
- Test: `backend/tests/funnel-nurture-schema.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 capabilities and artifacts.
- Produces: published `funnel_nurture@1.0.0` with protected topology and metric/economics specifications.

- [ ] **Step 1: Write pack invariants**

Require inspect, draft funnel, draft templates, draft sequence, draft automation, simulate funnel/sequence/flow, approval, publish funnel/templates/sequence/flow, baseline metrics and evaluate. Assert no protected node can be removed and publication nodes always require approval.

- [ ] **Step 2: Run pack tests and verify failure**

Run: `cd backend && npx vitest run tests/funnel-nurture-pack.test.ts tests/funnel-nurture-schema.test.ts`  
Expected: FAIL because pack and migration are missing.

- [ ] **Step 3: Implement the pack and hash**

Use extension points only for optional scoring fields and internal owner tasks. Define metrics: published artifacts, simulated contacts, enrollment readiness, funnel conversion baseline, expected reply rate, opt-out guardrail, AI cost and human review time. Define a versioned 30-day `last_touch` attribution policy for qualified lead/reply/opportunity events with exact contact or declared Mission binding; value stays unknown when identity cannot be resolved.

- [ ] **Step 4: Seed the immutable published version**

Migration `0133` inserts the pack/version with the compiled content and attribution-policy hashes; capability policies remain disabled by default except read/draft capabilities. Activation capabilities require a contract rollout flag.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/funnel-nurture-pack.test.ts tests/funnel-nurture-schema.test.ts tests/action-engine-pack.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: publish funnel nurture action pack`

---

### Task 6: Add artifact review, diff and real human-time capture to Missions UI

**Files:**
- Create: `frontend/src/components/action-engine/MissionArtifactsPanel.tsx`
- Create: `frontend/src/components/action-engine/ArtifactDiff.tsx`
- Create: `frontend/src/components/action-engine/HumanTaskResolutionDialog.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/components/action-engine/MissionExecutionTimeline.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetailWorkspace.tsx`
- Test: `frontend/src/components/action-engine/MissionArtifactsPanel.test.tsx`

**Interfaces:**
- Consumes: plan artifact summaries, evidence sources, approval subject hashes and human-task resolution API.
- Produces: exact draft/published diff review and operator-entered actual minutes.

- [ ] **Step 1: Write failing UI tests**

Cover funnel stages, email previews, sequence timeline, automation trigger/conditions/exits, citations, compliance warnings, exact version hash, stale approval refresh, read-only client role and actual-minutes validation.

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionArtifactsPanel.test.tsx`  
Expected: FAIL because artifact components are absent.

- [ ] **Step 3: Extend frontend contracts and service calls**

Add `MissionArtifact`, `MissionArtifactVersion`, `listArtifacts()` and change `resolveHumanTask()` to accept an operator-supplied positive integer instead of hard-coded `30`.

- [ ] **Step 4: Render review and approval context**

Show exact versions, diffs, source labels and approval impact. Never render internal-only knowledge excerpts to client roles.

- [ ] **Step 5: Run frontend suites/build and commit**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionArtifactsPanel.test.tsx src/lib/action-engine/missionRules.test.ts && npm run build`  
Expected: PASS.  
Commit: `feat: review mission artifacts and actual human time`

---

### Task 7: Complete Funnel + Nurture end-to-end acceptance and rollout

**Files:**
- Create: `backend/tests/funnel-nurture-e2e.test.ts`
- Create: `docs/runbooks/yux-funnel-nurture-agent.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: Tasks 1–6 and Releases 0, 1A and 1B.
- Produces: production-gated `funnel_nurture` capability flag and acceptance evidence.

- [ ] **Step 1: Build the full disposable-tenant scenario**

Seed published company/brand knowledge, an active CRM, role and contract. Request a funnel+nurture Mission; assert grounded sources, create drafts in prepare, simulate, approve, publish and collect costs/events.

- [ ] **Step 2: Add negative end-to-end scenarios**

Assert tenant isolation, all adversarial knowledge cases, forbidden copy, stale decision summary, duplicate worker job, paused Mission, missing CRM entitlement, resource-claim conflict, attribution unknown and exact capability kill-switch before publication.

- [ ] **Step 3: Run full automated verification**

Run backend, frontend and Python full suites and production builds.  
Expected: all PASS.

- [ ] **Step 4: Perform authenticated browser acceptance**

Use a disposable organization and verify Mission intake, artifacts, exact approval, published CRM funnel, published templates/sequence and client read-only rendering. Do not enroll real leads.

- [ ] **Step 5: Document rollback and commit**

Runbook must include objective rollback triggers, exact capability disable, Mission pause, draft preservation, active sequence containment, unknown-effect reconciliation, claim release last and evidence/cost preservation. Rehearse rollback after an injected redaction failure and after two consecutive 15-minute SLO breaches.  
Commit: `feat: complete funnel nurture agent vertical slice`

---

### Task 8: Publish sector Recipes and disposable day-one sandbox data

**Files:**
- Create: `backend/src/db/migrations/0134_mission_recipes_sandbox.sql`
- Create: `backend/src/modules/action-engine/recipes.ts`
- Create: `backend/src/modules/action-engine/sandbox-seeder.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Create: `frontend/src/components/action-engine/MissionRecipePicker.tsx`
- Modify: `frontend/src/components/action-engine/MissionCreateWizard.tsx`
- Test: `backend/tests/action-engine-recipes-sandbox.test.ts`
- Test: `frontend/src/components/action-engine/MissionRecipePicker.test.tsx`

**Interfaces:**
- Consumes: published compatible pack versions and a sandbox-enabled organization.
- Produces: versioned `MissionRecipe`, recorded `SandboxSeedManifest` and page-zero Recipe selection.

- [ ] **Step 1: Write failing recipe, isolation and cleanup tests**

Cover a “Funil + nutrição para imobiliária” Recipe pinned to `funnel_nurture@1.0.0`, safe editable defaults, unpublished/incompatible pack rejection, idempotent tenant-scoped seed, clear `is_demo` labels, exclusion from production metrics and manifest-based cleanup that cannot delete non-seeded records.

- [ ] **Step 2: Run backend/frontend focused tests and verify failure**

Run both Recipe/sandbox test files.  
Expected: FAIL because Recipe and sandbox services do not exist.

- [ ] **Step 3: Implement immutable Recipe resolution**

```ts
type MissionRecipe = {
  key: string
  version: number
  title: string
  sector: string
  packSelections: Array<{ key: string; version: string; contentHash: string }>
  defaultGoal: Record<string, unknown>
  editableKeys: string[]
}
```

Recipe selection pre-fills intake but still compiles exact packs and passes all readiness, permission, budget and approval gates.

- [ ] **Step 4: Seed and remove disposable demo entities by manifest**

Migration `0134` creates immutable Recipe versions and tenant-protected seed manifests. Create labeled leads, stages, historical events and metrics inside the selected organization only after explicit sandbox permission. Store every created type/ID/hash in `SandboxSeedManifest`; metrics collectors ignore `is_demo`; cleanup deletes only unchanged IDs owned by that manifest and reports modified rows for manual review.

- [ ] **Step 5: Run tests/build and commit**

Run focused tests, tenant-isolation suite, Funnel + Nurture E2E and frontend build.  
Expected: PASS; a new disposable tenant runs a meaningful shadow Recipe without affecting production metrics.  
Commit: `feat: add mission recipes and sandbox seeding`
