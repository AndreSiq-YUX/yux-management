# Radar same lot completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution proposed: native in this session, without delegation.

**Goal:** Recover the ten already-discovered Villeman companies, distinguish confirmed commercial fit from mere data completion, and leave each company qualified, reversibly discarded with evidence, or explicitly inconclusive.

**Architecture:** Keep the current durable operation and its ten admissions. Reserve downstream decision capacity before G3, recover saved paid replies before any authorized replacement, and retain strict identity/citation validation. Preserve calibration requirements; uncalibrated decision probabilities do not become grounds for automatic exclusion. Conclusive case-specific exclusions can be reviewed and applied through the existing reversible administrative action.

**Tech Stack:** TypeScript/Fastify/Vitest, Python/pytest, PostgreSQL, React, Dokploy.

**Spec:** User request in this conversation on 2026-10-22 and the existing `2026-10-21-radar-funil-decisao-por-etapas.md` plan. Audited operation: `b0285306-6a60-4df6-8eeb-f65ca9d831e6`, campaign `958f87b1-96a1-45b5-a095-d9e9eb623f67`, organization `972e8163-81b7-4e3f-b964-777110b660b8`, configuration revision 6.

## Global Constraints

- Do not repeat company discovery, replace the lot, admit replacements, or increment its requested count of ten.
- Do not increase campaign/source budgets, change models, enable global uncalibrated exclusions, or bypass TLS validation.
- Retrying this lot is authorized by the user, but existing effect receipts remain immutable and each replacement paid attempt must use the existing scoped one-time authorization.
- A source failing to load is not evidence that its company is outside the target. Group contacts are not establishment contacts.
- No industrial CNAE, customer name or industry-specific exclusion is hardcoded in production logic.
- Internal source names, model names, costs and validation errors remain exclusive to `yux_admin`; clients receive commercial reasons and useful evidence.
- Do not modify the two existing untracked experimental-decision documents or unrelated application code.

## Baseline and acceptance

The lot contains two operational completions (Novita and L'Allegro, both only possible fit), five incomplete results, and three technical failures. Qualita has useful site/contact evidence but a rejected qualification; Grupocine was outside-profile in shadow triage and has a rejected presence response; Galbiatti's site has an expired certificate. Eight companies end with final-fit reason `decision_limit_reached`. Discovery used seven paid queries; this count must remain seven throughout recovery.

Success is not ten positive leads. Each of the same ten must have a truthful final commercial state and reasons. A promising but unverified company must remain inconclusive, not be discarded to make the counters green. No validation failure may be hidden as commercial insufficiency. Persisted results, not only queue acknowledgements, prove completion.

## Review Focus

- Existing runs have already consumed all six decision slots: recovery cannot assume the reservation fix retroactively creates capacity.
- Literal excerpts can be genuinely invented, not just whitespace variants: normalization must never turn a paraphrase into a valid citation.
- A site may describe corporate meals without the literal words industrial kitchen or proof of an owned factory: use the campaign objective, not an invented stricter target.
- A child can be technically finished but commercially inconclusive; a useful phone does not make qualification complete.
- Resuming an incomplete child must refresh the same lot counters without repurchasing successful searches, Agent effects or stable valid analyses.

### Task 1: Reserve decision stages and recover exhausted rounds

**Files:** `backend/src/modules/radar/decision-service.ts:184`, `funnel-discovery.ts:181`, `research-service.ts:243`, `funnel-round-seed.ts`; tests `radar-decision-service.test.ts`, `radar-funnel-discovery.test.ts`, `radar-funnel-round-seed.test.ts`, `integration/radar-decisions-journey.test.ts`.

**Interfaces:** Add pure `radarDecisionStageCapacity({task,calls,funnel,maximum})`, returning `{allowed,reason,reservedForFinal}`. The transaction in `decideRadarAction` is authoritative; the discovery loop uses the same stage rule rather than a separate guessed ceiling. Count real saved effects, not loop iterations or replays. Reuse final-fit decisions whose evidence binding remains valid.

- [ ] Add failing cases: six-slot fresh round permits G1 and a final G5 even when G5 is shadow; replayed G3 does not consume another slot; unrelated decision tasks remain unchanged; an existing six-used round does not silently get a seventh paid call.
- [ ] Run `npm test -- tests/radar-decision-service.test.ts tests/radar-funnel-discovery.test.ts tests/radar-funnel-round-seed.test.ts` in `backend`, confirm RED.
- [ ] Implement stage reservation and a bounded explicit recovery round for already-exhausted children. Carry eligible pages, successful searches/Agent receipts and valid conclusions; archive old decision events instead of deleting them. Link the recovery run to the existing capture item under its existing organization/campaign/revision.
- [ ] Verify GREEN and PostgreSQL journey assertions for same operation/item, no additional discovery, preserved receipt IDs and unchanged budget.
- [ ] Commit this independently tested correction.

### Task 2: Fix citation handling without accepting fabricated facts

**Files:** `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_presence.py`, `radar_qualification.py`, new `radar_evidence_quotes.py`; `backend/src/modules/radar/presence-resolution.ts`, `research-service.ts:881`; tests `test_radar_presence.py`, `test_radar_qualification.py`, `radar-presence-resolution.test.ts`, `radar-effect-receipts.test.ts`.

**Interfaces:** Add `resolve_evidence_quote(source, excerpt)` and TypeScript equivalent: return the original contiguous source span only when exact or safe Unicode/whitespace normalization matches; otherwise reject. No fuzzy semantic matching, removed words or reordered words. Paid invalid responses remain invalid unless this deterministic rule proves their original quote.

- [ ] Obtain the exact stored input/reply for the two scoped invalid receipts through an authorized administrative read. Create sanitized offline regression fixtures; do not export secrets or unrelated tenant data. Record whether each failure is an excerpt mismatch, wrong evidence ID, disallowed candidate type or another schema error before choosing its fix.
- [ ] Add failing tests for those actual causes plus NBSP/newlines, invented excerpts, wrong page ID, directory selected as official, group/establishment conflict and truncated JSON. Malicious page instructions remain data.
- [ ] Implement only justified normalization and prompt changes. Teach the qualifier to interpret configured corporate/collective meal services semantically; do not require an exact industry phrase or owned kitchen unless the campaign requires it. Require positive evidence for a negative verdict; absence alone returns review/insufficient.
- [ ] Revalidate saved replies with no provider call or debit. If a reply is genuinely invalid, retain it and use at most one scoped replacement attempt after authorization, rather than weakening the validator.
- [ ] Run focused Python/backend suites and commit after GREEN.

### Task 3: Make final commercial states truthful

**Files:** `backend/src/modules/radar/capture-research-state.ts`, `research-quality.ts`, `research-service.ts:534`, `company-projection.ts`, `funnel-report-summary.ts`; tests `radar-research-quality.test.ts`, `radar-research-feedback.test.ts`, `radar-funnel-state.test.ts`, `radar-funnel-report-summary.test.ts`.

**Interfaces:** Preserve the legacy queue statuses. Derive the funnel's commercial outcome from current validated qualification, identity and configured completion policy. Keep the distinction between contact-ready review, confirmed target, commercial insufficiency and technical failure in the existing DTOs.

- [ ] Add failing cases: useful contacts plus invalid qualification cannot be ready/complete; possible fit is not confirmed fit; unknown identity is insufficient, not outside; actual infrastructure failure remains technical; validated rejection does not disappear into the generic gaps count; non-funnel legacy campaigns keep their configured behavior.
- [ ] Implement status projection without fabricating certainty. Keep uncalibrated G1/G5 observation and reversible human overrides intact. Do not convert Almanara's absence-of-industrial evidence into a conclusive negative automatically.
- [ ] Run the quality/state/report suites and audience isolation tests for all four roles. If a frontend label changes, test its rendered commercial and Admin variants; no internal identifiers enter client DTOs.
- [ ] Commit after GREEN.

### Task 4: Remove unrelated contacts from commercial channels

**Files:** `backend/src/modules/radar/contact-consolidation.ts`, `contact-evidence.ts`, `public-presence.ts`, `source-identity.ts`, `public-social-evidence.ts`; existing contact/public-presence tests.

**Interfaces:** Consolidation returns only actual profile URLs as social channels; post/video URLs remain source evidence. Commercial contacts require a proven ownership chain to the establishment or explicitly marked group. Retain all raw source evidence in Admin audit.

- [ ] Add failing fixtures from this lot: directory support email/social footer is not a prospect contact; individual Instagram posts are not separate social profiles; LPQBR global US site does not establish Brazilian unit identity; Qualita's LinkedIn administrative path is not published as a canonical public profile; Novita's contact form with a Compras subject remains a useful supplier-purpose alternative without claiming a supplier email.
- [ ] Implement evidence-based filtering/canonicalization. Do not synthesize an unobserved contact or guess that a similar social username belongs to the company.
- [ ] Run contact, identity, quality and disclosure tests; commit after GREEN.

### Task 5: Resume every pending stage in the same operation

**Files:** `backend/src/modules/radar/capture-operation.ts`, `capture-recovery.ts`, `capture-dispatch.ts`, `capture-reconciliation.ts`, `capture-analysis-authorization.ts`, `administrative-research.ts`, `research-service.ts:674`; corresponding capture/recovery/integration tests.

**Interfaces:** Existing resume endpoints retain request idempotency. Resume returns item-level scheduling/reuse/authorization requirements and refreshes capture counters after every child update. A same-lot recovery round updates the capture item's run binding with history preserved. Discovery remains stopped with `target_reached`.

- [ ] Add an integration fixture with exactly this shape: two completions, five insufficient, two paid invalid replies and one TLS restriction. Resume must recover pending stages, not report an old partial run as new work. Concurrent double-click must enqueue each intended round once.
- [ ] Keep completed valid effects reusable. Invalid replies get free revalidation first; replacements require scoped grants. Previously completed Agent calls must not run again merely because a contact was missing.
- [ ] Preserve TLS validation. Try other already-authorized sources; if verified readable evidence cannot resolve Galbiatti, report the specific reading restriction. A fresh expiring exception requires separate explicit approval for that hostname; do not create one from general retry authorization.
- [ ] Verify original ten candidate IDs, same operation ID, seven discovery queries, accurate parent counts, immutable prior receipts and isolated tenant scope. Commit after GREEN.

### Task 6: Publish and retest the same ten

**Files:** `docs/releases/2026-10-22-radar-same-lot-validation.md` and ignored audit JSON under `.superpowers/sdd/2026-10-22-villeman-lote-10/`.

- [ ] Run full backend tests and build, full runtime tests, focused real-PostgreSQL integration tests with synthetic providers, plus frontend type/build and changed UI tests if applicable. No production credentials in development tests.
- [ ] Review `git diff --check` and the scoped diff, preserve unrelated untracked work, fetch remote main and integrate safely. Push the tested commits to main as requested.
- [ ] Verify Dokploy actually deployed that exact commit and that API, worker and runtime are healthy. Confirm any migration result before starting paid work. Do not infer deploy completion from push success.
- [ ] Revalidate Qualita/Grupocine saved replies first. Resume the same lot through the existing administrative controls; apply a single bounded replacement per still-invalid necessary analysis under the user's retry authorization and existing budgets. Do not spend on the clearly off-target cinema merely to obtain a green technical status; review its evidence and use a reversible discard if conclusive.
- [ ] Monitor persisted output for all ten. Stop and diagnose the first new broken boundary instead of repeating paid retries. Leave missing-evidence companies inconclusive with an actionable commercial reason.
- [ ] Report before/after outcomes, actual G1/G3/G5 modes and calls, Agent reuse/new usage, per-company quality and incremental costs including invalid paid replies. State any remaining blocker; no claim of 100% success based on queue termination.

## Self review

All observed failures map to a task: decision ceiling to Task 1, invalid quotations to Task 2, false completeness to Task 3, third-party contact noise to Task 4, incomplete child reuse and TLS restriction to Task 5, and deployment/runtime proof to Task 6. Market expansion, new providers and new company discovery are excluded. Confidence is tied to evidence and existing calibration governance, not to a new hardcoded numerical threshold.

### Task 7: Finish the authorized TLS recovery's identity handoff

Production follow-up within Tasks 2/5: the specifically authorized Galbiatti homepage was read successfully but lay after fifteen unrelated pages. The eight-page identity window omitted it, and the positive-site reuse helper also reused unresolved answers with no website/claims across changed evidence. No new scope, model, budget, TLS permission or discovery is implied by this correction.

**Files:** `backend/src/modules/radar/research-service.ts`, `backend/tests/radar-research-service.test.ts`; release report above.

**Interfaces:** `presenceMaterial(pages,hits,identity?,provenWebsite?)` keeps original evidence IDs, legacy input order when identity is omitted, and the existing eight-page cap. Current material prioritizes a previously proven institutional origin and then company-domain candidates, without treating rank as identity proof. `revalidateSavedRadarPresence` is a positive-site fallback only; exact unchanged unresolved inputs remain reusable through the normal material binding.

- [x] RED: a newly readable company homepage after fifteen publishers must reach identity; an unresolved result must be reconsidered on new material but reused on unchanged material.
- [x] GREEN: implement bounded selection and positive-only fallback, retaining citation/source/CNPJ validators.
- [x] RED/GREEN: a proven differently named brand site must not be displaced by fifteen unverified name-matching domains.
- [x] Full backend, type-check/build, real PostgreSQL TLS/audience tests; separate author review, no subagents under the user's explicit execution preference.
- [x] Publish and verify exact deploy; reschedule the existing request `9b7037b1-3f2d-44a8-bb75-92e071c204f8` with unchanged budget, so the unused authorized analyses can run against the page already collected. Preserve the original run, receipts and Agent result. Verify final persisted identity/contacts/fit and same-lot counters before reporting.
