# Radar: recuperação de continuação inválida ou expirada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir recuperar, no próprio “Retomar pesquisa”, uma continuação rejeitada por token inválido ou expirado, mediante confirmação explícita, sem perder empresas ou aumentar limites.

**Architecture:** A retomada consulta o recibo persistido e exige prova de rejeição HTTP 400 da continuação vinculada ao lote. Somente depois da confirmação, uma transação bloqueia campanha, lote e cursor e limpa exclusivamente o cursor rejeitado, auditando a autorização e reativando o mesmo lote pela fila existente. A interface mantém uma ação contextual e apresenta um diálogo de confirmação quando o servidor exigir.

**Tech Stack:** TypeScript, PostgreSQL, Fastify, React, componentes Dialog/Button existentes, Vitest e jornada local com provedores simulados.

**Spec:** Aprovação “pode” após a proposta de recuperar a paginação no próprio “Retomar pesquisa”, solicitando confirmação antes de reiniciar a descoberta. Evidências: chave validada nas integrações; consulta da campanha rejeitada com `HTTP 400: request validation failed; token is invalid or expired`; 40 empresas anteriores e lote de 20 preservados. Complementa `2026-10-17-radar-retomada-consulta-rejeitada.md`, sem substituir sua auditoria.

## Global Constraints

- Sem consultas pagas, alterações de limites, credenciais ou deploy nesta implementação.
- Preservar o lote, as empresas já encontradas e os limites atuais.
- Não zerar consumo, consultas do lote, páginas processadas, excedentes ou histórico para viabilizar a recuperação.
- Somente `yux_admin` recebe diagnósticos e ferramentas internas; clientes recebem DTO comercial.
- Timeout, resposta perdida e falha de persistência continuam bloqueados contra repetição automática.
- Manter quantidade visível e uma única ação principal contextual de pesquisar/retomar.
- Reiniciar a descoberta pode revisitar páginas e consumir consultas; duplicatas não contam como novas empresas. A confirmação deve explicar isso.

## Review Focus

- Chave inválida ou outra rejeição HTTP 400: não classificar como continuação expirada nem descartar cursor.
- Cursor avançado, região distinta, revisão alterada ou recibo sem vínculo: rejeitar confirmação obsoleta sem alterar dados.
- Reenvio da mesma confirmação, concorrência e resposta perdida: não reiniciar novamente nem duplicar despacho lógico.
- Interrupção na gravação: cursor, auditoria e reativação do lote devem confirmar ou reverter juntos.
- Troca de campanha durante o diálogo: não confirmar uma recuperação para outro lote ou escopo.

---

### Task 1: Recuperação transacional com confirmação obrigatória

**Files:**
- Create: `backend/src/modules/radar/capture-continuation.ts`.
- Modify: `backend/src/modules/radar/capture-dispatch.ts`, `backend/src/modules/radar/routes.ts`.
- Test: `backend/tests/radar-capture-continuation.test.ts`, `backend/tests/radar-capture-recovery.test.ts`, `backend/tests/integration/radar-capture-operation.test.ts`.

**Interfaces:**
- Extend `resumeRadarCaptureOperation` input with `restartExpiredContinuation?: boolean` and `continuationReceiptId?: string`, defaulting to no consent. The HTTP resume body validates boolean and receipt UUID. Confirmation-required HTTP409 returns only its code and opaque receipt UUID after Admin authorization. Confirmation must supply that UUID; missing or superseded receipts are stale.
- Produce `recoverExpiredRadarCaptureContinuation(client: pg.PoolClient, op: ContinuationCapture, approval: {confirmed: boolean; requestId: string; approvedBy: string; continuationReceiptId?: string}): Promise<boolean>` in the new module. `ContinuationCapture` contains the locked operation's id, organization_id, campaign_id, configuration_revision, status, created_at, lease_active and configuration_snapshot. Caller holds campaign then operation locks.
- Return `false` when no proven expired continuation exists and no special confirmation was supplied. Throw `radar_capture_continuation_confirmation_required` when proof exists without consent; throw `radar_capture_continuation_confirmation_stale` for consent without valid matching proof. These exceptions roll back the transaction.

- [x] **Step 1: Write failing PostgreSQL and HTTP tests.**
  Assert: matching linked failed receipt with `discoveryOutcome='rejected'`, `httpStatus=400`, zero candidates, nonempty pageToken and the explicit reason `token is invalid or expired` requires confirmation. Missing token, uncertain outcome, API-key failure, other HTTP codes and unrelated validation errors do not permit cursor reset. Without consent, cursor, receipt, operation and outbox remain unchanged.
- [x] **Step 2: Run the focused tests and verify assertion failures.**
  Run backend Vitest on the new continuation suite and existing recovery/integration suites using `YUX_RADAR_TEST_DATABASE_URL` pointing only to the isolated local test database. No external provider calls.
- [x] **Step 3: Implement proof, scoped reset and audit in `capture-continuation.ts`.**
  Require the latest relevant receipt to belong to this organization, campaign, operation and configuration revision, completed after the operation was created. Resolve exactly one discovery scope from the operation snapshot and receipt region; lock that cursor and require its current token to equal the rejected input token, with no live cursor lease. On approval, set only that cursor's next_token to NULL, completed to FALSE and clear expired lease fields. Preserve all counters. Append `captureContinuationRecovery` containing operationId, requestId, approvedBy, scopeKey and timestamp to the receipt; never copy tokens or credentials into the new audit record.
- [x] **Step 4: Integrate the helper and HTTP flag with existing resume.**
  Preserve authorization, revision and uncertain-request guards. For a blocked lot, before changing it or resetting a cursor, honor the existing resume_request_id idempotency check. Run rejection recovery and continuation recovery in the same transaction as queued status, requestId and durable outbox. Do not change unrelated blocked-item recovery or automatically call the provider.
- [x] **Step 5: Add adversarial and rollback tests, then verify all pass.**
  Test concurrent/repeated requestIds; another tenant/campaign/revision; cursor advanced or leased; ambiguous scope; forced audit/write failure rolling back every mutation; existing companies, requested count, overflow, usage, queries and scope_pages unchanged. Confirm resuming the fake worker uses a first-page request and deduplicates prior companies without extending caps. HTTP tests reject malformed consent and unauthorized roles; commercial responses do not expose the new audit or token.
- [x] **Step 6: Commit the backend deliverable.**
  Commit only listed implementation and test changes with message `fix(radar): recover expired continuation with explicit consent`.

### Task 2: Confirmação no fluxo atual e entrega validada

**Files:**
- Modify: `frontend/src/services/radarService.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/components/radar/RadarCaptureControls.tsx`, `frontend/src/components/radar/RadarCaptureProgress.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts`.
- Test: `frontend/src/components/radar/RadarCaptureControls.test.tsx`, tests accompanying the Radar messages/service/workspace.
- Modify: `backend/tests/journeys/start-radar-capture-server.ts`, this plan's verification section.

**Interfaces:**
- Extend `radarService.resumeCaptureOperation` body with the optional boolean from Task 1.
- Controls receive `onResume(options?: {restartExpiredContinuation?: boolean}): Promise<'confirmation_required' | void>`. Workspace returns the confirmation marker only for the server's exact confirmation-required code, preserving the same requestId; other failures retain the existing visible error path.

- [x] **Step 1: Write failing interaction tests.**
  Retomar first requests a normal resume; the server marker opens the standard Dialog. Cancel performs no confirmed call. Confirm sends exactly one call with true, preserves the lot/count and disables duplicate submissions. Ordinary blocked recovery remains unchanged; a campaign or operation change closes and invalidates the old confirmation. Server stale-confirmation errors remain visible and never start another lot.
- [x] **Step 2: Run focused frontend tests and verify failures.**
  Run Vitest on Radar controls and related message/service tests.
- [x] **Step 3: Implement the confirmation with existing YUX components.**
  Use Dialog, accessible title/description and Button; no new permanent research action. Explain that continuation is no longer valid, restarting may revisit earlier pages and consume configured queries, existing companies remain, duplicates do not count and the same lot/limits continue. Use “Cancelar” and “Confirmar e retomar”. Do not show provider names, raw technical details, tokens or internal costs in the dialog.
- [x] **Step 4: Verify focused tests and the rendered journey.**
  Add an opt-in expired-continuation scenario to the existing local fake server without changing its default behavior. In a local browser, demonstrate paused lot → Retomar → Cancelar (unchanged) → Retomar → Confirmar → same lot advances, previous companies remain, reload persists state. Check keyboard/dialog behavior and absence of application errors. Browser plugin unavailable: use the frontend-testing skill's local Playwright fallback, not authenticated production browser access.
- [x] **Step 5: Run final regression gates and review.**
  Run full backend suite with isolated PostgreSQL, full frontend suite, backend compilation and frontend build/budget. Complete the execution skill's independent final review; fix actionable findings and rerun affected gates. Record exact results and distinguish simulated QA from production. No paid calls or deployment.
- [ ] **Step 6: Commit and publish to main.**
  Fetch and preserve intervening remote changes, commit the frontend/tests/plan, push the correction branch and main, and verify remote hashes. Do not claim production is repaired until deployment and an authorized real test occur.

## Plan Self-Review

Scope matches the approved recovery, without redesigning research, resetting quotas or changing credentials. Each review focus is assigned a test above. The API flag and callback share the same name; the error marker never supplies consent itself. No schema migration is required: existing cursor, receipt and operation tables retain the audit. Human approved execution with “ok, prossiga”.

## Verification — implementation

- TDD: continuation/reset/consent and HTTP validation failed before backend changes; six new UI/message behaviors failed before frontend changes. Existing control and resume tests remain green.
- Backend focused 72/72; actual HTTP authorization/consent in the new PostgreSQL suite; separate integration capture/commercial suites 17/17.
- Full backend with isolated PostgreSQL: 1,141/1,141; full frontend: 727/727. Backend compilation and frontend build/bundle budget passed. Existing frontend test harness emits act warnings and expected mocked error logs; no failed assertions.
- The new HTTP scenario timed out at the default five seconds under full-suite CPU contention. It now reuses its login sessions and allows twenty seconds for five real password-verifying logins; no production timeout changed.
- An existing integration assertion counted another persisted fixture's outbox. Scoped it to its own operation without changing the global reconciler or deleting the unrelated fixture.
- Local Chrome/Playwright (`Browser plugin not available`), frontend 127.0.0.1:4174/API 4182, 1440×1000 and dialogue at 390×844: same paused operation → Retomar → Cancelar, Retomar → Escape, Retomar → explicit approval → one new synthetic company → full child processing → partial terminal result. Existing company and operation survive reload. Partial is expected without a real analysis model; it is not presented as full enrichment success.
- Page identity/content, no framework overlay, desktop/mobile dialog layout, keyboard cancellation and actual interaction verified. No uncaught page errors. Console: expected 401 `/auth/me` before login, 409 confirmation-required responses, existing React Router migration warnings. No unexpected failing application request observed.
- Evidence outside repository: `C:/Users/andre/.codex/visualizations/2026/10/17/radar-continuacao-expirada/` (screenshots, repeatable QA script, result.json).
- Progress explanatory copy updated to describe the explicit restart exception, instead of claiming discovery is never restarted. All existing functions remain.
- No paid calls, production operations, deployment, credential changes or limit increases.
- Final independent review: one Important finding, no Critical/Minor or declined findings. Consent was not bound to the receipt originally displayed. Reproduced with real PostgreSQL: another admin recovers X, a later request rejects Y, and old consent incorrectly restarted Y (same scope and another scope). Fixed by returning an opaque receipt UUID in the authorized HTTP409 and requiring the same UUID under locks on approval. No mutation or persisted challenge before consent; no cursor token returned. Workspace preserves the receipt alongside its existing requestId.
- Fix TDD: five backend regressions and the frontend forwarding regression failed first; focused suites passed 75/75 and 41/41 afterward. Final full backend 1,144/1,144, frontend 727/727, separate integration 17/17; backend compilation and frontend build/bundle budget passed. The browser journey was repeated with the receipt binding: approval carried the opaque receipt ID, retained requestId and operation, processed the synthetic child, preserved the previous company and persisted the terminal partial result. No new application errors; expected console responses unchanged. No unresolved review findings.
