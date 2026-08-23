# YUX Campaign Launch Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a governed Campaign Launch Agent that creates strategy, audience, creatives, acquisition assets, tracking and a provider campaign paused, then activates and monitors it only after exact approval.

**Architecture:** Introduce a campaigns command repository, acquisition artifact capabilities and provider-safe create-paused/activate commands. The Harness campaign specialists produce grounded typed artifacts; `campaign_launch@1.0.0` controls dependencies and approvals; the Action Engine owns budget, publication, monitoring and pause/replan decisions.

**Tech Stack:** TypeScript/Fastify/PostgreSQL/BullMQ, Python Harness/OpenRouter, existing campaign/landing-page/provider modules, React/Vite, Vitest and Pytest.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Releases 0, 1A and 1B are required; shared artifact and evaluation contracts from Release 2 are reused.
- Provider campaigns are always created paused before approval.
- No budget activation, audience upload or external publication occurs in shadow/prepare.
- Campaign copy and creative briefs use published company/brand knowledge and cited evidence.
- Provider requests use platform secret adapters; credentials never enter Mission context.
- Budget changes and campaign activation require explicit approval in this release.
- Provider dispatch uses pre-persisted effect intents, short-lived mutation leases and reconciliation; timeout is `unknown`, never an automatic retry-as-failure.
- Attributed campaign value displays the exact pack attribution-policy version/hash or remains `unknown`.

---

### Task 1: Add campaign and acquisition command/versioning layers

**Files:**
- Create: `backend/src/modules/campaigns/repository.ts`
- Create: `backend/src/modules/campaigns/commands.ts`
- Create: `backend/src/modules/landing-pages/mission-commands.ts`
- Create: `backend/src/modules/marketing-studio/mission-commands.ts`
- Modify: `backend/src/modules/campaigns/routes.ts`
- Modify: `backend/src/modules/landing-pages/routes.ts`
- Modify: `backend/src/modules/marketing-studio/routes.ts`
- Create: `backend/src/db/migrations/0135_campaign_mission_artifacts.sql`
- Test: `backend/tests/campaign-commands.test.ts`
- Test: `backend/tests/campaign-routes.test.ts`

**Interfaces:**
- Consumes: campaign tables, contract organization, provider connections and Mission command context.
- Produces: `inspectCampaignState`, `createCampaignDraft`, `generateCreativeDraft`, `createLandingPageDraft`, `createLeadFormDraft`, `attachAcquisitionAsset`, `createProviderCampaignPaused`, `activateProviderCampaign`, `pauseProviderCampaign`.

- [ ] **Step 1: Write command, tenant and idempotency tests**

Cover draft versioning, immutable approved version, organization/provider mismatch, duplicate command key, create-paused invariant, stale approval hash, budget limit, activate, pause and correlated events.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/campaign-commands.test.ts`  
Expected: FAIL because campaign command layer is absent.

- [ ] **Step 3: Add versioned local campaign artifacts**

Migration adds campaign, creative and acquisition-asset draft versions plus Mission correlation without changing existing client reads. Provider mutation rows store sanitized request hash, provider reference, status and idempotency key.

- [ ] **Step 4: Implement domain commands and route reuse**

Commands validate contract, platform, budget and provider health; provider activation accepts only a local approved version hash. Keep portal routes read-compatible.

- [ ] **Step 5: Run tests, type-check and commit**

Run: `cd backend && npx vitest run tests/campaign-commands.test.ts tests/campaign-routes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add versioned campaign command layer`

---

### Task 2: Add acquisition and provider capabilities

**Files:**
- Create: `backend/src/modules/action-engine/capabilities/campaigns.ts`
- Create: `backend/src/modules/action-engine/capabilities/acquisition.ts`
- Modify: `backend/src/modules/action-engine/capabilities/index.ts`
- Modify: `backend/src/modules/action-engine/commands.ts`
- Test: `backend/tests/action-engine-campaign-capabilities.test.ts`

**Interfaces:**
- Consumes: campaign commands, landing-page/form routes through domain commands, provider health and capability v2 policy.
- Produces: inspect, draft, landing/form, tracking, provider-paused, activate, pause and metrics capabilities.

- [ ] **Step 1: Write the capability mode/approval matrix**

Test `campaign.state.inspect`, `campaign.create_draft`, `marketing.creative.generate_draft`, `campaign.creative.attach_draft`, `landing_page.create_draft`, `lead_form.configure_draft`, `campaign.tracking.validate`, `campaign.provider.create_paused`, `campaign.provider.activate` and `campaign.provider.pause` across all modes.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-campaign-capabilities.test.ts`  
Expected: FAIL with missing capabilities.

- [ ] **Step 3: Define typed campaign artifacts**

```ts
type CampaignLaunchArtifact = {
  objective: string
  offer: string
  audience: Record<string, unknown>
  platform: 'meta' | 'google'
  dailyBudgetBrl: string
  totalBudgetBrl: string
  creatives: Array<{ format: string; headline: string; body: string; sourceIds: string[] }>
  landingPageId?: string
  leadFormId?: string
  trackingPlan: Record<string, string>
}
```

- [ ] **Step 4: Implement command-backed capabilities**

Draft capabilities use effect `draft`; provider create-paused and activate use `external` with approval `always`; emergency pause is external but may be policy-preapproved as a safety action.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-campaign-capabilities.test.ts tests/action-engine-autonomy-modes.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: add governed campaign launch capabilities`

---

### Task 3: Add grounded campaign specialists to the Harness

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/campaign_launch.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_supervisor.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_campaign_launch_mission.py`

**Interfaces:**
- Consumes: company offer, ICP, brand, compliance, funnel outputs, current campaign baseline and provider constraints.
- Produces: `CampaignBriefArtifact`, `AudienceArtifact`, `CreativeSetArtifact`, `AcquisitionPlanArtifact` and `MeasurementPlanArtifact`.

- [ ] **Step 1: Write mocked-provider contract tests**

Cover insufficient offer clarification, supported platform selection, brand citation, prohibited claim, budget over envelope, missing tracking, Funnel Pack artifact reuse and unknown evidence.

- [ ] **Step 2: Run Pytest and verify failure**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_campaign_launch_mission.py -q`  
Expected: FAIL because campaign Mission contracts are absent.

- [ ] **Step 3: Define bounded specialist artifacts**

Use Campaign Strategist, Copywriter, Brand/Compliance Guardian and Measurement Analyst. Each output is Pydantic-validated and contains evidence IDs; no specialist receives provider tools.

- [ ] **Step 4: Add verifier rules**

Reject unsupported claims, uncited offer facts, budgets outside envelope, missing UTM/tracking, external actions without approval and provider platforms absent from readiness.

- [ ] **Step 5: Run Python suite and commit**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest -q`  
Expected: PASS.  
Commit: `feat: add grounded campaign launch specialists`

---

### Task 4: Publish the Campaign Launch Action Pack

**Files:**
- Create: `backend/src/modules/action-engine/packs/campaign-launch-v1.ts`
- Create: `backend/src/db/migrations/0136_campaign_launch_pack.sql`
- Test: `backend/tests/campaign-launch-pack.test.ts`
- Test: `backend/tests/campaign-launch-schema.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 capabilities and artifacts.
- Produces: `campaign_launch@1.0.0`, protected topology, metric contract and guardrails.

- [ ] **Step 1: Write topology and policy invariants**

Require readiness, brief, audience preview, creative drafts, landing/form, tracking validation, provider create-paused, launch approval, activation, metric collection and evaluation. Provider activation cannot precede approval.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npx vitest run tests/campaign-launch-pack.test.ts tests/campaign-launch-schema.test.ts`  
Expected: FAIL because pack and migration are missing.

- [ ] **Step 3: Define metrics and guardrails**

Primary metrics: leads, qualified leads and attributed revenue. Leading metrics: impressions, clicks, CTR and landing conversion. Economics: spend, provider/AI/human cost, CPL and MROI. Guardrails: total budget, daily budget, consent, tracking failure and complaint rate. Publish a versioned 30-day `last_touch` attribution policy using exact campaign/UTM or declared lead binding; unresolved identity or tracking makes revenue/MROI unknown.

- [ ] **Step 4: Seed disabled-by-default activation policies**

Migration publishes the immutable pack/hash but leaves provider create/activate capabilities disabled until organization rollout. Read/draft/tracking capabilities may be enabled separately.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/campaign-launch-pack.test.ts tests/campaign-launch-schema.test.ts tests/action-engine-pack.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: publish campaign launch action pack`

---

### Task 5: Generalize observation and evaluation for campaign metrics

**Files:**
- Modify: `backend/src/modules/action-engine/observer.ts`
- Modify: `backend/src/modules/action-engine/evaluator.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Create: `backend/src/modules/action-engine/metrics/campaign-launch.ts`
- Test: `backend/tests/campaign-launch-evaluator.test.ts`

**Interfaces:**
- Consumes: pack metric spec, provider/campaign/domain events and cost ledger.
- Produces: typed campaign metric snapshots and conclusions `continue|pause|block|propose_replan|succeed|fail|expire`.

- [ ] **Step 1: Write metric and guardrail tests**

Test unknown tracking, known zero, budget threshold, CPL off-track after minimum sample, tracking loss, duplicate provider event, campaign pause, achieved target, attribution-policy hash display and unresolved identity returning unknown revenue/MROI.

- [ ] **Step 2: Run tests and verify hard-coded signed-revenue evaluator failure**

Run: `cd backend && npx vitest run tests/campaign-launch-evaluator.test.ts`  
Expected: FAIL because evaluation is Revenue Recovery-specific.

- [ ] **Step 3: Introduce a pack metric collector registry**

```ts
type PackMetricCollector = {
  packKey: string
  collect(client: Queryable, mission: ActionMission): Promise<Record<string, MetricValue>>
  evaluate(input: PackEvaluationInput): EvaluationConclusion
}
```

Retain Revenue Recovery as one collector and register Campaign Launch separately.

- [ ] **Step 4: Route scheduled collection by active pack**

Persist metric provenance plus attribution policy/event evidence and enqueue evaluation once per checkpoint idempotency key. Emergency guardrails pause before optional LLM analysis.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/campaign-launch-evaluator.test.ts tests/action-engine-evaluator.test.ts tests/action-engine-economics.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: evaluate missions through pack metric contracts`

---

### Task 6: Add campaign artifact and monitoring cockpit

**Files:**
- Create: `frontend/src/components/action-engine/CampaignMissionArtifacts.tsx`
- Create: `frontend/src/components/action-engine/MissionGuardrailsPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionArtifactsPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionMetricsPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Test: `frontend/src/components/action-engine/CampaignMissionArtifacts.test.tsx`

**Interfaces:**
- Consumes: campaign artifacts, provider paused/active state, pack-defined metrics, guardrails and approval hash.
- Produces: campaign review, activation approval and monitoring UI.

- [ ] **Step 1: Write UI tests**

Cover brief, audience, creatives, landing/form links, tracking status, paused provider reference, budget approval, activation, metrics, guardrail pause and client visibility.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd frontend && npx vitest run src/components/action-engine/CampaignMissionArtifacts.test.tsx`  
Expected: FAIL with missing components.

- [ ] **Step 3: Add pack-driven metric rendering**

Replace the fixed five Revenue Recovery metric keys with definitions returned by the Mission detail API, preserving unknown/not-applicable semantics.

- [ ] **Step 4: Implement exact activation review**

Reuse the Release 1B decision summary: show provider, budget, dates, audience, creative/landing/form quantities, contact impact and irreversible risks before approval. Place subject hash and attribution-policy version under Technical Proof. Never show provider secrets.

- [ ] **Step 5: Run tests/build and commit**

Run: `cd frontend && npx vitest run src/components/action-engine/CampaignMissionArtifacts.test.tsx src/lib/action-engine/missionRules.test.ts && npm run build`  
Expected: PASS.  
Commit: `feat: add campaign mission control cockpit`

---

### Task 7: Complete provider-sandbox acceptance and rollout

**Files:**
- Create: `backend/tests/campaign-launch-e2e.test.ts`
- Create: `docs/runbooks/yux-campaign-launch-agent.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: Tasks 1–6 and prior releases.
- Produces: production-gated Campaign Launch capability set and acceptance evidence.

- [ ] **Step 1: Add provider-fake end-to-end tests**

Create Mission, ground plan, prepare all local drafts, create provider campaign paused, approve exact hash, activate, ingest metrics, breach budget guardrail and assert pause.

- [ ] **Step 2: Add race and duplicate tests**

Cancel between approval and provider call, duplicate activation job, provider timeout to `unknown`, reconciliation to created/failed/manual review, callback duplication, stale local/catalog version, resource fencing conflict, expired mutation lease and exact capability kill switch.

- [ ] **Step 3: Run all automated suites and builds**

Expected: backend, frontend and Python suites PASS; modified-file lint PASS.

- [ ] **Step 4: Run provider sandbox browser acceptance**

Use a test ad account. Verify the provider campaign exists paused before approval, activates once, metrics return and emergency pause is reconciled.

- [ ] **Step 5: Document incident rollback and commit**

Runbook includes objective rollback triggers, exact capability kill switch, local Mission pause, provider reconciliation SLO/manual review, budget containment, cost reversal, claim release last and evidence preservation. Rehearse a provider-unknown incident and two consecutive 15-minute SLO breaches.  
Commit: `feat: complete campaign launch agent vertical slice`
