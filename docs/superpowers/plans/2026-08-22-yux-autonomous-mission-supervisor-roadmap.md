# YUX Autonomous Mission Supervisor Program Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a knowledge-grounded Mission Supervisor that safely plans, executes and evaluates cross-module business operations through versioned Action Engine capabilities.

**Architecture:** The Agent Harness interprets intent and proposes typed plans grounded in frozen Company Intelligence and Strategy Pack context. The TypeScript Action Engine remains the trust boundary and executes only domain commands exposed as authorized capabilities. The program is split into seven cumulative release gates, each deployable and independently testable: safety, general foundation, decision experience, two functional verticals, composition and bounded autonomy.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, BullMQ/Redis, React/Vite, Python, FastAPI, Pydantic, OpenRouter, Jina embeddings, Vitest and Pytest.

**Spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`

## Global Constraints

- The Harness never executes mutations or receives provider credentials.
- The Action Engine owns Mission state, approval, ownership, budgets, retries, pause, cancellation and replan.
- Domain modules own their invariants; mutation capabilities call domain commands, never raw domain-table SQL.
- Only published, tenant-scoped, profile-allowed knowledge enters agent context.
- Free-form DAG generation is forbidden; plans instantiate published packs and declared extension points.
- Every external effect is idempotent, correlated and checked again immediately before execution.
- Mission wire contracts are generated from Pydantic JSON Schema and checked for drift in CI.
- External effects persist intent before dispatch and reconcile `unknown` outcomes before dependent work.
- Exact capability versions/hashes, resource fencing tokens and mutation leases survive approval-to-execution races.
- Each release meets the spec's latency, availability, durability, retention, redaction and rollback gates.
- Model, prompt, retrieval, pack and planner changes pass the frozen golden-mission corpus.
- Existing `revenue_recovery@0.1.0` missions remain readable and executable during the migration.
- No phase may introduce unrestricted SQL, generic HTTP, browser-control or arbitrary-code capabilities.

---

## Program releases

| Release | Plan | Independently usable outcome | Exit gate |
|---|---|---|---|
| 0 | `2026-08-22-yux-mission-safety-foundation.md` | Shared safety primitives without new customer effects | Contract drift, unknown-effect, catalog, claim, privacy and golden gates pass |
| 1A | `2026-08-22-yux-mission-foundation-knowledge.md` | Generic, grounded Mission planning with real autonomy semantics | Shadow creates zero mutations; plan records frozen knowledge and baseline |
| 1B | `2026-08-22-yux-mission-decision-experience.md` | Understandable decisions and shareable shadow simulation | Owner/operator/external-review flows pass without weakening approval authority |
| 2 | `2026-08-22-yux-funnel-nurture-agent.md` | Natural-language funnel plus governed email nurture | Draft, simulate, approve, publish and observe end to end |
| 3 | `2026-08-22-yux-campaign-launch-agent.md` | Complete governed campaign launch | Provider campaign is created paused and activates only after exact approval |
| 4 | `2026-08-22-yux-composite-mission-supervisor.md` | Multi-pack supervisor with specialists and cross-module dependencies | One Mission composes CRM, nurture and campaign packs |
| 5 | `2026-08-22-yux-bounded-autonomy-learning.md` | Time-bound autonomy, continuous evaluation and governed learning | Canary completes with kill-switch, cost, tenant and incident gates |

## Dependency graph

```text
Release 0: contracts + effect safety + claims + NFR/model gates
   -> Release 1A: context + planner + policy + generic UI
      -> Release 1B: decision UX + notifications + shadow report
         -> Release 2: CRM and nurture capabilities + pack
            -> Release 3: campaign capabilities + pack
               -> Release 4: composite pack resolver + specialists
                  -> Release 5: autonomous envelope + learning + rollout
```

Release 0 must complete before Release 1A changes shared Mission contracts. Release 1A is engineering validation and must not be represented as autonomous customer value. Release 1B supplies the first decision artifact visible outside engineering; Release 2 supplies the first complete operational vertical. Release 3 may begin its campaign command-layer work after Release 1A, but provider activation tests wait for Releases 1B and 2 shared approval, artifact and generalized evaluator contracts. Release 4 cannot begin until both vertical slices have stable capability contracts. Release 5 cannot enable autonomous effects until Release 4 passes cross-pack cancellation, fencing and unknown-effect reconciliation tests.

## Program-level verification matrix

| Boundary | Required verification |
|---|---|
| Harness contract | Pydantic contract tests plus malformed/untrusted model output tests |
| Contract drift | deterministic JSON Schema export, generated TypeScript diff and Ajv runtime validation |
| Knowledge | tenant isolation, publication/visibility, citation allowlist and snapshot hash tests |
| Planner | pack conformity, cycle, binding, source, planning budget and exact capability-manifest validation |
| Capability | mode, permission, entitlement, provider health, consent, recovery class, attribution and idempotency tests |
| Worker | retry, duplicate, stale-plan, claims/fencing, mutation lease, pause/cancel and kill-switch race tests |
| Provider | pre-dispatch intent, `unknown` outcome, reconciliation, manual-review and containment tests |
| Domain | command-level invariant and correlation tests in CRM, automations, e-mail and campaigns |
| UI | three-question cap, human impact summary, progressive disclosure, notifications, share report and stale-approval tests |
| Privacy/NFR | fail-closed PII redaction, retention, p95/p99 latency, availability and durability tests |
| Regression | ≥15 golden missions on every model, prompt, retrieval, pack or planner promotion |
| Production | migration, health, shadow, prepare, assisted canary and per-release rollback rehearsal |

## Integration checkpoints

- [ ] **Checkpoint 1: approve the spec and Release 0 safety contracts**

Read the spec and verify generated wire-schema ownership, recovery classes, external-effect states, exact manifests, claims/fencing, planning-cycle budget, attribution policy and mutation lease contracts.

- [ ] **Checkpoint 2: execute Release 0 and rehearse safety rollback**

Pass schema drift, recovery, unknown-effect reconciliation, catalog drift, resource claim, planning budget, attribution, privacy/NFR and 15-case golden gates. Rehearse the objective rollback triggers.

- [ ] **Checkpoint 3: execute Release 1A and freeze capability contract v2**

Run backend, frontend and Harness suites; create one generic Mission in `shadow`; assert no domain mutation and inspect its knowledge snapshot.

- [ ] **Checkpoint 4: execute Release 1B and validate decision comprehension**

Verify the three-question cap, concrete impact summary, stale-revision invalidation, owner/operator views, outbound notification, redacted share report and external reviewer authority boundary.

- [x] **Checkpoint 5: execute Release 2 and publish `funnel_nurture@1.0.0`**

Run the Funnel + Nurture acceptance scenario against a disposable organization before enabling its contract flag.

- [ ] **Checkpoint 6: execute Release 3 and publish `campaign_launch@1.0.0`**

Use a provider sandbox/test account; verify create-paused, approval and activation correlation.

- [ ] **Checkpoint 7: execute Release 4 and freeze composite-plan contract**

Run a Mission where the Campaign Pack consumes published Funnel + Nurture artifacts and cancellation stops both branches.

- [ ] **Checkpoint 8: execute Release 5 canary and close the program**

Complete shadow, prepare, assisted and bounded-autonomous stages; record produced value, total cost, human hours, approvals, incidents and rollback evidence.

## Program completion

The functionality is complete only when all seven release plans are implemented and every acceptance criterion in the spec passes. Release 0 is invisible safety infrastructure. Release 1A is engineering validation. Release 1B is a decision/simulation experience. Release 2 is the first bounded operational vertical. None of them alone may be described as a general autonomous agent.
