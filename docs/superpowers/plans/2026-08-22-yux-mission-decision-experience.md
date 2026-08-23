# YUX Mission Decision Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn grounded shadow plans into understandable, shareable and actionable decisions for business owners and expert operators without weakening immutable approval controls.

**Architecture:** The backend derives a deterministic impact summary from the compiled plan and exact artifacts, then signs the same revision the user sees. The UI renders a simple decision view first and progressively reveals technical evidence. Durable notification, external review, feedback taxonomy, readiness deep-links and budget alerts bring decisions to the user instead of requiring dashboard surveillance.

**Tech Stack:** TypeScript/Fastify/PostgreSQL/BullMQ, React/Vite, existing e-mail/WhatsApp delivery adapters, PDF-Lib, Vitest and browser acceptance tests.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- Releases 0 and 1A are prerequisites.
- A hash is secondary integrity evidence; the primary approval surface states concrete effects, audience, estimated/maximum cost and irreversible risk.
- Any change to artifact, audience, budget, provider target, capability version or recovery class invalidates approval.
- Intake asks at most three grouped clarification questions in total.
- External review feedback never grants execution authority.
- Notification payloads contain no sensitive lead data, secrets or raw provider references.
- Owner and operator views read the same immutable Mission state and differ only in disclosure level.
- Shadow reports expire after 7 days by default and are redacted before storage.

---

### Task 1: Derive an immutable human-readable Mission impact summary

**Files:**
- Create: `backend/src/modules/action-engine/decision-summary.ts`
- Modify: `backend/src/modules/action-engine/types.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Test: `backend/tests/action-engine-decision-summary.test.ts`

**Interfaces:**
- Consumes: compiled plan, artifact versions, population preview, economics, capability manifest and attribution policy.
- Produces: `MissionDecisionSummary`, `buildMissionDecisionSummary()` and `decisionSubjectHash`.

- [ ] **Step 1: Write failing quantity, risk and invalidation tests**

Assert a funnel plan says one pipeline/four stages/four e-mails, zero existing enrollments, estimated/max cost and irreversible effects. Assert identical input yields the same subject hash; changing one e-mail version, audience count, budget, provider, capability definition hash or recovery class changes it.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-decision-summary.test.ts`  
Expected: FAIL because the summary contract does not exist.

- [ ] **Step 3: Define the deterministic summary contract**

```ts
export type MissionDecisionSummary = {
  headline: string
  changes: Array<{ entityType: string; operation: string; quantity: number; label: string }>
  contactImpact: { existingContacts: number; futureEligibleContacts: boolean; channels: string[] }
  economics: { estimatedCostBrl: string; maximumCostBrl: string; estimatedHumanMinutes: number }
  irreversibleEffects: Array<{ capabilityKey: string; description: string }>
  assumptions: Array<{ key: string; value: string; source: 'company_context' | 'user' | 'pack_default' }>
  technicalProof: { planRevision: number; planHash: string; manifestHash: string; sourceCount: number }
  decisionSubjectHash: string
}
```

- [ ] **Step 4: Build only from compiled and frozen inputs**

Reject summary creation when an artifact is unversioned or economics lack a maximum. Store the summary and subject hash with the approval subject; never ask the Harness to author the authoritative quantities.

- [ ] **Step 5: Run tests/type-check and commit**

Run: `cd backend && npx vitest run tests/action-engine-decision-summary.test.ts tests/action-engine-routes.test.ts tests/action-engine-planner.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: summarize mission decisions in business language`

---

### Task 2: Cap clarification and apply visible Company Context defaults

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_contracts.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py`
- Modify: `backend/src/modules/action-engine/planner.ts`
- Modify: `frontend/src/components/action-engine/MissionCreateWizard.tsx`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission.py`
- Test: `frontend/src/components/action-engine/MissionCreateWizard.test.tsx`

**Interfaces:**
- Consumes: intake request, Company Context defaults and prior answer set.
- Produces: one `ClarificationCard` with zero to three questions or a terminal readiness/human-review outcome.

- [ ] **Step 1: Write failing no-loop and default-provenance tests**

Cover no missing fields, one grouped card with three questions, a fourth candidate omitted by priority, safe ICP/tone default with visible source, answered card never asked again, and unresolved consent/budget/provider ownership becoming a blocker instead of a second question round.

- [ ] **Step 2: Run Python and frontend focused tests and verify failure**

Run: `cd workers/marketing-studio-agent-runtime && python -m pytest tests/test_mission.py -q`; `cd frontend && npx vitest run src/components/action-engine/MissionCreateWizard.test.tsx`  
Expected: FAIL because clarification count/provenance is not enforced.

- [ ] **Step 3: Add priority and provenance to the wire contract**

Questions carry `key`, `label`, `whyNeeded`, `priority`, `answerType` and optional default with source ID. Server sorts safety, financial, outcome and style questions, returns the first three once, and records their keys in intake state.

- [ ] **Step 4: Render one compact card and terminal blocker state**

Show defaults as “Sugerido a partir do Contexto da Empresa” with change controls. After submission, the next response is interpretation/readiness/plan or a blocker with correction path; the UI has no “ask another batch” transition.

- [ ] **Step 5: Regenerate contracts, run tests and commit**

Run contract export/drift check, Python Mission tests, frontend wizard tests and both type-checks.  
Expected: PASS and no wire-contract diff after generation.  
Commit: `feat: bound mission clarification intake`

---

### Task 3: Build progressive owner and operator decision views

**Files:**
- Create: `frontend/src/components/action-engine/MissionDecisionSummary.tsx`
- Create: `frontend/src/components/action-engine/MissionTechnicalProof.tsx`
- Modify: `frontend/src/components/action-engine/MissionApprovalsPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionPlanPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/services/actionEngineService.ts`
- Test: `frontend/src/components/action-engine/MissionDecisionSummary.test.tsx`

**Interfaces:**
- Consumes: `MissionDecisionSummary`, actor permissions and approval state.
- Produces: owner-first decision UI, operator expansion and exact approval mutation.

- [ ] **Step 1: Write failing comprehension and permission tests**

Assert owner view leads with changes, contacts, cost and risks; the hash appears only under Technical Proof; operator expansion shows DAG/manifest/evidence; a changed subject disables approval; unauthorized client sees no action button; mobile layout retains all irreversible warnings.

- [ ] **Step 2: Run focused frontend test and verify failure**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionDecisionSummary.test.tsx`  
Expected: FAIL because decision components do not exist.

- [ ] **Step 3: Implement outcome-first rendering**

Use sentences and quantity cards, not raw JSON or capability keys, in the default view. Put assumptions and irreversible effects before Approve. The button posts `decisionSubjectHash`; 409 stale responses reload the new revision and require a fresh review.

- [ ] **Step 4: Add operator progressive disclosure**

The expanded section renders the existing plan DAG, bindings, source IDs, pack/capability versions, recovery class, claims and reconciliation state. Preserve keyboard navigation, focus on validation errors and accessible confirmation language.

- [ ] **Step 5: Run tests/build and commit**

Run: `cd frontend && npx vitest run src/components/action-engine/MissionDecisionSummary.test.tsx src/lib/action-engine/missionRules.test.ts && npm run type-check && npm run build`  
Expected: PASS.  
Commit: `feat: add progressive mission decision views`

---

### Task 4: Deliver pending decisions through configured channels

**Files:**
- Create: `backend/src/db/migrations/0132_mission_decision_experience.sql`
- Create: `backend/src/modules/action-engine/decision-notifications.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/modules/email-delivery/service.ts`
- Modify: `backend/src/lib/edge-compat/whatsappProvider.ts`
- Test: `backend/tests/action-engine-decision-notifications.test.ts`

**Interfaces:**
- Consumes: pending approval, organization notification preferences and client-safe deep-link.
- Produces: deduplicated in-product/e-mail/WhatsApp notifications at creation, 4 hours and 24 hours.

- [ ] **Step 1: Write failing preference, privacy and deduplication tests**

Cover in-product only, e-mail, opted-in WhatsApp, no WhatsApp consent fallback, duplicate job, approved-before-reminder, expired approval, 4/24-hour escalation and payload rejection when it contains lead e-mail/phone/provider reference.

- [ ] **Step 2: Run focused test and verify failure**

Run: `cd backend && npx vitest run tests/action-engine-decision-notifications.test.ts`  
Expected: FAIL because notification orchestration does not exist.

- [ ] **Step 3: Persist delivery intents and preferences**

Migration creates tenant-protected `action_decision_notifications` with `UNIQUE (approval_id, channel, escalation_stage)`. Read organization/user preferences and channel consent; payload contains Mission title, safe summary sentence, expiry and authenticated route only.

- [ ] **Step 4: Schedule and cancel reminders durably**

Enqueue creation, +4h and +24h jobs. Each handler reloads approval state and preferences before sending. Approval, rejection, cancellation or expiry makes pending reminders no-op without deleting history.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npx vitest run tests/action-engine-decision-notifications.test.ts tests/email-delivery.test.ts tests/action-engine-execution.test.ts && npm run type-check`  
Expected: PASS.  
Commit: `feat: notify users about mission decisions`

---

### Task 5: Generate expiring shareable shadow simulation reports

**Files:**
- Create: `backend/src/modules/action-engine/simulation-reports.ts`
- Create: `backend/src/modules/action-engine/simulation-report-pdf.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `frontend/src/components/action-engine/MissionSimulationShareDialog.tsx`
- Create: `frontend/src/pages/public/MissionSimulationReviewPage.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/action-engine-simulation-reports.test.ts`
- Test: `frontend/src/components/action-engine/MissionSimulationShareDialog.test.tsx`
- Test: `frontend/src/pages/public/MissionSimulationReviewPage.test.tsx`

**Interfaces:**
- Consumes: completed shadow plan, redacted decision summary and technical proof.
- Produces: signed 7-day review link, redacted PDF and non-authoritative external review response.

- [ ] **Step 1: Write failing expiry, redaction and authority tests**

Assert only shadow plans can be shared; token expiry/revocation works; another tenant cannot fetch; PDF/link omit lead PII, secrets and raw provider references; external reviewer feedback is stored but cannot approve execution; downloading twice returns the same report revision.

- [ ] **Step 2: Run backend/frontend focused tests and verify failure**

Run both simulation-report test files.  
Expected: FAIL because report services and UI do not exist.

- [ ] **Step 3: Render immutable HTML/PDF from the decision summary**

Add `pdf-lib@^1.17.1`. Report includes objective, concrete changes, assumptions, estimated/maximum cost, risks, sources/versions and “simulação — nenhum efeito executado.” Persist report hash, expiry, revocation and redaction version; never render from mutable live Mission state after creation.

- [ ] **Step 4: Add sharing and external feedback UI**

Dialog defaults to 7 days, permits earlier expiry and revocation, copies the signed link and downloads the same revision PDF. Public review accepts reviewer name, `support|request_changes|reject`, rejection taxonomy and comment; it states that an authorized YUX user must perform final approval.

- [ ] **Step 5: Run tests/build and commit**

Run focused backend/frontend tests, backend type-check and frontend production build.  
Expected: PASS.  
Commit: `feat: share redacted mission simulations`

---

### Task 6: Capture structured rejection reasons as learning evidence

**Files:**
- Create: `backend/src/modules/action-engine/decision-feedback.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `frontend/src/components/action-engine/MissionApprovalsPanel.tsx`
- Test: `backend/tests/action-engine-decision-feedback.test.ts`
- Test: `frontend/src/components/action-engine/MissionApprovalsPanel.test.tsx`

**Interfaces:**
- Consumes: authenticated/external review decision and exact subject hash.
- Produces: versioned `DecisionFeedback` events usable by Release 5 learning recommendations.

- [ ] **Step 1: Write failing taxonomy and immutable-subject tests**

Cover all ten reason keys, required comment for `other`, optional comment elsewhere, exact subject hash, multiple reviewers, unauthorized execution approval and aggregation that excludes hidden identity/PII from learning context.

- [ ] **Step 2: Run focused backend/frontend tests and verify failure**

Run both decision-feedback test files.  
Expected: FAIL because structured feedback is absent.

- [ ] **Step 3: Persist append-only feedback events**

Store reviewer type, decision, reason key, redacted comment, subject hash and timestamp. A new plan revision never reuses prior feedback as approval; learning export includes reason counts and redacted themes with evidence IDs.

- [ ] **Step 4: Add guided rejection UI**

Request Changes and Reject open the same accessible reason selector. Show actionable Portuguese labels such as “Público/ICP incorreto” and “Custo acima do aceitável”; `other` reveals a required text field.

- [ ] **Step 5: Run tests and commit**

Run focused tests, Action Engine route tests and frontend build.  
Expected: PASS.  
Commit: `feat: structure mission decision feedback`

---

### Task 7: Add budget burn-down, readiness correction links and kill-switch controls

**Files:**
- Create: `backend/src/modules/action-engine/budget-alerts.ts`
- Modify: `backend/src/modules/action-engine/economics.ts`
- Modify: `backend/src/modules/action-engine/readiness.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Create: `frontend/src/components/action-engine/MissionBudgetBurnDown.tsx`
- Create: `frontend/src/components/action-engine/MissionReadinessBlockers.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Test: `backend/tests/action-engine-budget-alerts.test.ts`
- Test: `frontend/src/components/action-engine/MissionOperationalControls.test.tsx`

**Interfaces:**
- Consumes: actual/reserved cost, envelope ceiling, readiness blockers, route permissions and granular policy state.
- Produces: deduplicated 50/80/95% alerts, permission-safe correction links and scoped kill-switch UI.

- [ ] **Step 1: Write failing threshold, link and scope tests**

Test exact 50/80/95 crossings, a jump from 49 to 96 emitting each threshold once, reservation reversal, another currency, blocker deep-link hidden without destination permission, and `email.send@1` disable leaving CRM draft controls active.

- [ ] **Step 2: Run focused backend/frontend tests and verify failure**

Run both operational-control test files.  
Expected: FAIL because alerts/components do not exist.

- [ ] **Step 3: Compute burn-down from actual plus active reservations**

Use decimal arithmetic and an append-only alert ledger keyed by Mission/threshold/envelope version. A reduced budget creates a new envelope version and reevaluates thresholds without duplicating old-version alerts.

- [ ] **Step 4: Render actionable controls safely**

Owner sees current/remaining/maximum cost and alert state. Each readiness blocker may include a backend-issued route from an allowlist after permission check. Operators with policy permission can pause Mission or exact capability version with explicit confirmation and audit reason.

- [ ] **Step 5: Run tests/build and commit**

Run focused tests, economics/policy tests and frontend build.  
Expected: PASS.  
Commit: `feat: add mission budget and readiness controls`

---

### Task 8: Verify decision UX, NFRs and Release 1B rollback

**Files:**
- Create: `backend/tests/mission-decision-experience-e2e.test.ts`
- Create: `docs/runbooks/yux-mission-decision-experience-rollback.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: Tasks 1–7 plus Releases 0 and 1A.
- Produces: Release 1B acceptance evidence and objective rollback procedure.

- [ ] **Step 1: Add end-to-end decision tests**

Create a shadow Mission, accept one grouped clarification card, resolve a readiness deep-link, build summary, share report, submit external change request, update revision, notify authorized owner, approve exact summary and verify stale approval is rejected.

- [ ] **Step 2: Add accessibility, privacy and latency assertions**

Assert keyboard decision flow, visible irreversible warnings, mobile owner view, expanded operator evidence, no PII in notifications/report, progress within 1 second and stored server timings against intake/planning NFR thresholds.

- [ ] **Step 3: Run complete automated verification and browser acceptance**

Run backend/frontend/Python suites, type-checks, builds, contract drift and golden missions. In the browser, test internal operator, client owner and external reviewer views against a disposable organization.

- [ ] **Step 4: Rehearse objective rollback triggers**

Disable report/notification/decision capabilities independently, revoke all share links, pause new decision delivery and preserve existing approvals/feedback. Simulate a two-window SLO breach and PII-redaction failure; verify rollout stops and audit records remain readable.

- [ ] **Step 5: Record release evidence and commit**

Runbook records test Mission/report/approval IDs, NFR measurements, redaction evidence, notification delivery, external-authority boundary, feature flags and rollback rehearsal. Update status only after authenticated production verification.  
Commit: `feat: complete mission decision experience`
