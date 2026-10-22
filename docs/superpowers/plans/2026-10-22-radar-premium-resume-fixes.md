# Radar Premium resume fixes — Implementation Plan

> Execution: native in this session, as explicitly authorized by the user. No delegation.

**Goal:** Resume Premium Essential Kitchen through the deployed funnel without false policy mismatches, starvation of G1, or misleading blocking reasons.

**Architecture:** Persist existing effective defaults with the audited migration-owner helper; retain strict runtime authorization comparison. Reserve one decision per required downstream stage rather than the whole per-company ceiling. Surface allowlisted pre-provider failures and use the actual research assessment in the Admin report.

**Tech Stack:** TypeScript/Vitest, PostgreSQL, Python/FastAPI/pytest, Dokploy.

**Spec:** User request in this conversation, 2026-10-22: fix authorization policy, skipped triage and blocker message; push main, deploy, test Premium only.

## Global Constraints

- Do not change configured limits, models, credentials or calibration modes.
- Do not replay uncertain paid effects without the scoped retry authorization.
- Internal diagnostics are restricted to global `yux_admin`; clients receive commercial feedback only.
- Preserve unrelated work and existing strict model/tenant/version/one-time authorization checks.

## Review Focus

- Legacy JSON missing default fields: persist effective values, preserve explicit values, audit once.
- Actual policy/model change: old grants still fail; matching fresh grant succeeds in runtime transaction.
- Six decision slots with effective G3: G1 shadow executes; one slot still reserves G3.
- Policy rejection before provider: explicit safe error, no debit/provider call, no arbitrary database text leaked.
- An optional HTTP 404 before qualification failure: report the qualification blocker, not the first warning.

## Tasks

- [x] Add failing migration/default parity and PostgreSQL authorization tests; apply migration 0235 using `private.backfill_radar_operational_defaults`.
- [x] Add failing budget regression to `backend/tests/integration/radar-decisions-journey.test.ts`; bound the reservation in `decision-service.ts` and preserve skipped reason in `research-service.ts`.
- [x] Add failing Python claim-error test and report regression; return allowlisted HTTP 409 before provider, prioritize structured operational blockers in `capture-research-state.ts` / `funnel-report.ts`.
- [x] Recover an interrupted, unstarted retry only from its exact unconsumed grant, predecessor receipt and absence of a protected receipt for the attempted request. Test that a consumed grant or existing uncertain receipt cannot use this recovery.
- [x] Run focused suites, type/build checks and relevant real PostgreSQL integration tests with synthetic providers only. Backend: 1441 passed / 126 intentionally skipped; integration: 34 passed; runtime focused: 36 passed plus real receipt/store suite 24 passed; frontend messages: 5 passed; backend/frontend builds passed. Isolated PostgreSQL 17 on loopback port 55436, no production/provider credentials.
- [ ] Review diff, commit only scoped files, push main; verify Dokploy deploy and migration before paid test.
- [ ] Retest only Premium through existing Admin retry action; inspect current run, gate events, runtime logs, cost effects and visible dossier. Stop on an unresolved failure; do not claim end-to-end success from queue completion alone.
