# Radar: continuidade com capacidade e limites autorizados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir concluir o mesmo lote após interrupção por limites, com autorização explícita e verificação prévia de capacidade, sem perder empresas ou apagar consumo.

**Architecture:** Preservar `queries`, `scope_pages` legados e consumo; apurar páginas realmente obtidas pelos recibos de descoberta concluídos com sucesso e vinculados ao lote. Acrescentar uma pré-checagem administrativa e autorização auditada de limites exclusivos do lote, vinculada ao estado conferido. O botão contextual continua o mesmo lote, inclusive parciais legados encerrados por limite; o processamento existente continua responsável por descoberta, deduplicação e aprofundamento.

**Tech Stack:** TypeScript, Fastify, PostgreSQL/RLS, React, componentes YUX existentes, Vitest e Playwright local com provedores simulados.

**Spec:** Pedido “verifique todos os pontos necessários para que a continuação da pesquisa funcione”, diagnóstico apresentado e aprovação “continue” após a proposta de implementar o conjunto. Diagnóstico reproduzível: `C:/Users/andre/.codex/visualizations/2026/10/17/radar-auditoria-continuacao/diagnostic.mts`. Complementa `docs/superpowers/plans/2026-10-17-radar-continuacao-expirada.md`; não substitui a recuperação de certificado nem a confirmação vinculada ao recibo de paginação.

## Global Constraints

- Sem chamadas pagas, deploy ou alterações de produção durante desenvolvimento e testes.
- Preservar empresas, lote, critérios, quantidade original, excedentes, recibos e consumo anteriores.
- Qualquer ampliação de consumo depende da confirmação do usuário na interface; não aumentar cotas diárias, orçamento da campanha ou créditos automaticamente.
- Somente `yux_admin` recebe diagnósticos, fontes, limites internos e custos; clientes recebem DTO comercial por allowlists explícitas do backend.
- Quantidade visível e uma única ação principal contextual de pesquisar/retomar; manter funcionalidades técnicas existentes na área administrativa.
- Resposta incerta, timeout e falha de persistência não autorizam repetição de chamada.
- Preservar limites atuais do schema: `pageSize` 1–10, `maxPagesPerScope` 1–10, `maxQueriesPerBatch` 1–100 e quantidade 1–1.000; rejeitar combinações impossíveis, não ampliá-los silenciosamente.
- Saldo externo e qualidade/completude dos resultados não podem ser garantidos por checagem local. Duplicatas e reinício da paginação podem exigir consultas adicionais.

## Review Focus

- Confirmação aberta antes de outra retomada, nova rejeição ou edição: rejeitar estado obsoleto antes de qualquer mutação ou despacho.
- Lote parcial antigo com uma pesquisa mais nova ativa: impedir dois lotes ativos, sem substituir ou excluir nenhum deles.
- Recibo antigo sem vínculo, escopo ambíguo ou tentativa incerta: não inventar páginas bem-sucedidas nem liberar repetição; exigir conferência.
- Limite atingido com empresas já admitidas: concluir o aprofundamento autorizado dessas empresas e pausar somente a descoberta faltante.
- Capacidade teórica, duplicatas e saldo externo desconhecido: não prometer a quantidade final nem apresentar diagnóstico não verificado como aprovado.

---

### Task 1: Contagem correta e pausa recuperável por limite

**Files:**
- Create: `backend/src/modules/radar/capture-capacity.ts`, `backend/tests/radar-capture-capacity.test.ts`.
- Modify: `backend/src/modules/radar/capture-discovery.ts`, `backend/src/modules/radar/capture-dispatch.ts`, `backend/src/modules/radar/repository.ts`.
- Test: `backend/tests/radar-capture-discovery.test.ts`, `backend/tests/radar-capture-dispatch.test.ts`, `backend/tests/radar-capture-continuation.test.ts`.

**Interfaces:**
- Export `RadarCaptureLimits = Pick<RadarSearchConfiguration['batch'], 'pageSize' | 'maxPagesPerScope' | 'maxQueriesPerBatch'>`.
- Export `loadRadarCapturePageAccounting(client: RadarQueryable, operation: CaptureAccountingInput): Promise<{successfulPagesByScope: Record<string, number>; historyCertain: boolean}>`; `CaptureAccountingInput` contains id, organization_id, campaign_id, configuration_revision, configuration_snapshot, queries and scope_pages. `RadarQueryable` exposes `query` compatible with Pool/PoolClient.
- Export `calculateRadarCaptureCapacity(input: {limits: RadarCaptureLimits; remaining: number; attemptedQueries: number; scopes: Array<{key: string; completed: boolean}>; successfulPagesByScope: Record<string, number>; usableOverflowCount: number}): {optimisticAdditionalCapacity: number; minimumAdditionalQueries: number; exhausted: 'page_cap' | 'query_cap' | null}`.

- [ ] **Step 1: Write failing accounting/capacity tests.**
  Assert: HTTP400 rejected once yields `queries=1`, legacy scope_pages=1, successful pages=0; a successful page containing only duplicates counts as one page; a rejected/uncertain/running/foreign-operation/foreign-revision receipt does not count as a successful page. A missing or ambiguous receipt history cannot silently authorize extra work. With pageSize=10, one available page and request=20, optimistic capacity is10 and minimum queries is2; two pages/two queries permit theoretical20, not a guarantee of20 unique companies.
- [ ] **Step 2: Verify tests fail before implementation.**
  Run `node node_modules/vitest/vitest.mjs run tests/radar-capture-capacity.test.ts tests/radar-capture-discovery.test.ts tests/radar-capture-dispatch.test.ts --reporter=dot` in backend with the isolated `YUX_RADAR_TEST_DATABASE_URL`. Expected: new accounting/capacity assertions fail.
- [ ] **Step 3: Implement receipt-derived accounting and transactional admission guards.**
  Count only `succeeded` completed discovery receipts with explicit matching captureOperationId, revision, organization and campaign. Map receipt regionalState/regionalCity to exactly one scope from the operation snapshot. Preserve legacy attempt counters and usage without decrementing or resetting them. Persist `scopeKey` in new discovery input receipts for unambiguous future attribution. Select eligible scopes by successful pages, but enforce maxQueriesPerBatch against all attempts. Recheck effective limits inside repository's campaign→operation→cursor transaction before reserving a new request. Exclude completed scopes; include preserved overflow before new network work.
- [ ] **Step 4: Implement recoverable limit semantics without starving admitted companies.**
  Keep `discovery_stopped=true` and `discovery_reason=page_cap/query_cap`; allow existing queued/researching children to finish under their existing authorization. Once those children are terminal and admitted<requested, leave the operation `blocked` with a specific discovery-limit reason, not terminal `partial`. Retire the outbox while awaiting user confirmation. Source exhaustion, requested target reached and terminal insufficient-quality results retain their distinct behavior.
- [ ] **Step 5: Verify safety and regression tests.**
  Assert no new request when query cap is exhausted, even after expired-token consent. Assert a rejected attempt does not exhaust successful-page capacity, but still consumes an attempt. Assert duplicate-only pages remain bounded; admitted children complete before the pause; uncertain requests remain blocked; successful receipt/admission/cursor commit is atomic; concurrent workers cannot exceed effective limits. Expected: all focused suites pass.
- [ ] **Step 6: Commit Task 1.**
  Commit only this deliverable with `fix(radar): separate discovery attempts from obtained pages`.

### Task 2: Pré-checagem e autorização auditada no mesmo lote

**Files:**
- Create: `backend/src/modules/radar/capture-preflight.ts`, `backend/src/modules/radar/capture-limit-authorization.ts`, `backend/src/db/migrations/0193_radar_capture_limit_authorizations.sql`, `backend/tests/radar-capture-preflight.test.ts`, `backend/tests/radar-capture-limit-authorization.test.ts`.
- Modify: `backend/src/modules/radar/capture-operation.ts`, `backend/src/modules/radar/capture-dispatch.ts`, `backend/src/modules/radar/capture-continuation.ts`, `backend/src/modules/radar/routes.ts`, `backend/src/modules/radar/types.ts`.
- Test: `backend/tests/radar-routes.test.ts`, `backend/tests/integration/radar-capture-operation.test.ts`, `backend/tests/integration/radar-commercial-audience.test.ts`, `backend/tests/radar-commercial-view.test.ts`; update `backend/tests/support/radar-capture-fixture.ts` with explicit synthetic credentials and a uniquely identified external-worker heartbeat, removed only by its owning fixture, so tests do not depend on prior database residue.

**Interfaces:**
- Export `getRadarCapturePreflight(pool: pg.Pool, user: AuthUser, input: {organizationId: string; campaignId: string; configurationRevision: number; requestedCount: number; operationId?: string}): Promise<RadarCapturePreflight>`.
- `RadarCapturePreflight` contains `stateId: string`, `allowed: boolean`, `requiresLimitsApproval: boolean`, `remaining: number`, `limits: RadarCaptureLimits`, `attemptedQueries: number`, `successfulPagesByScope: Record<string,number>`, `optimisticAdditionalCapacity: number`, `minimumAdditionalQueries: number`, `blockers: Array<{code:string;message:string}>`, `checks: Array<{key:string;status:'ok'|'blocked'|'not_applicable'|'not_checked';code?:string}>`, and optional `expiredContinuation: {receiptId:string;scopeLabel:string}`. It is Admin-only.
- Add `POST /campaigns/:id/capture-preflight` with organizationId, configurationRevision, requestedCount and optional operationId; no queue or paid calls.
- Extend existing resume input with `limitsAuthorization?: {expectedStateId:string; limits:RadarCaptureLimits}`. Preserve existing `restartExpiredContinuation` and `continuationReceiptId` for expiry recovery. Export `authorizeRadarCaptureLimits(client: pg.PoolClient, user: AuthUser, operation: CaptureAccountingInput, input: {requestId:string;expectedStateId:string;limits:RadarCaptureLimits}): Promise<void>`; caller holds campaign then operation locks.
- Add Admin-only `canContinue:boolean` to `RadarCaptureOperation`, true for incomplete blocked/legacy-partial lots stopped by page/query cap. Do not add internals to commercial capture schemas.

- [ ] **Step 1: Write failing preflight, authorization and HTTP tests.**
  Cover legacy partial20/admitted0/page_cap; edited campaign limits do not silently replace the old snapshot; matching explicit authorization updates only the lot's three discovery limits. Missing authorization, obsolete state, revised criteria, live lease, uncertain request or newer active lot rejects with no writes or queue. An operationId paired with another campaign or a requestedCount different from its original quantity is rejected. Replay of the same accepted requestId cannot apply a second extension. Missing/invalid consent inputs and unauthorized roles fail before writes.
- [ ] **Step 2: Verify tests fail.**
  Run backend Vitest on the new preflight/authorization suites and Radar routes with isolated PostgreSQL. Expected: missing preflight/reopen/authorization behavior fails assertions, not external-provider connectivity.
- [ ] **Step 3: Implement non-consuming preflight checks.**
  Reuse existing scope/module/active-admin checks, research/source governance, credential-presence checks and configured model routes. For an existing operation require its campaign, organization, revision and original requested quantity to match before computing remaining capacity. Inspect the external-class worker heartbeat using the existing90-second stale threshold. For enabled AI stages, inspect the current active contract's `ai_credit_wallets` using exact organization/client/contract scope: missing wallet or finite current_balance<1 blocks; is_unlimited permits without changing policy; internal runs without billable client/contract are not applicable. Check only relevant AI stages. External provider balance/credential acceptance and runtime connectivity not actually tested remain `not_checked`, never `ok`; actual per-call reservations remain authoritative. Do not call integration test buttons or provider models. Validate optimistic capacity before accepting a new lot; insufficient capacity yields a specific error, no operation/outbox, and guidance to existing campaign settings. Pending or uncertain discovery cannot be declared available.
- [ ] **Step 4: Implement exact-state consent and durable audit.**
  Compute stateId as a SHA256 of the canonical relevant state: organization/campaign/operation/revision, status and reason, resume_generation, admitted count, attempted queries, successful-page accounting, current/snapshot discovery limits, cursor state/leases and latest discovery receipt ID. Preflight is read-only; under campaign→operation→cursor locks recompute and compare before applying consent. Validate integer ranges from Global Constraints and require enough remaining theoretical capacity under the proposed totals. Amend only pageSize/maxPagesPerScope/maxQueriesPerBatch inside the lot snapshot, never criteria, source quotas, budget or wallet. Append old/new limits, stateId, counters, actor, requestId and timestamp to new audit table in the same transaction as reopen/outbox. Table has composite organization/campaign/operation FK, unique(operation_id,request_id), scoped RLS; API SELECT/INSERT and worker SELECT only. No tokens or credentials in audit. Add the scoped receipt-operation expression index in this migration for the accounting read path.
- [ ] **Step 5: Integrate reactivation and verify guards.**
  Recognize blocked limit pauses and legacy partial page_cap/query_cap with admitted<requested; reject if a newer active lot exists. On approval keep ID/requested count/results and resume generation semantics, clear only discovery stop/reason and the resolved cap blockers, preserve unresolved child blockers and histories. Revalidate access, current quotas and source readiness; never erase uncertain-request state. Expired pagination still requires its separately bound receipt consent, but preflight provides both requirements for one UI dialog. Test receipt replacement in same/another region, audit failure rollback, tenant isolation and RLS for API/worker/client roles. Validate old migration data and rerunning no external calls. Expected: focused PostgreSQL and HTTP suites pass.
- [ ] **Step 6: Commit Task 2.**
  Commit with `feat(radar): authorize bounded continuation of existing capture lots`. Migration number must be checked against current main before adding; preserve intervening migrations rather than overwrite them.

### Task 3: Ação contextual, validação completa e publicação

**Files:**
- Modify: `frontend/src/components/radar/RadarCaptureControls.tsx`, `frontend/src/components/radar/RadarCaptureProgress.tsx`, `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`, `frontend/src/lib/radar/radarResearchMessages.ts`.
- Create: `frontend/src/components/radar/RadarCaptureContinuationDialog.tsx`, `frontend/src/components/radar/RadarCaptureContinuationDialog.test.tsx`.
- Test: existing Radar controls/progress/workspace/messages tests, `backend/tests/journeys/start-radar-capture-server.ts`; this plan's final verification record.

**Interfaces:**
- Frontend `RadarCapturePreflight` and `RadarCaptureLimits` mirror Task2's explicit Admin DTOs. `radarService.capturePreflight(campaignId,input)` posts to the new route. Extend `radarService.resumeCaptureOperation` with the exact limitsAuthorization shape.
- `RadarCaptureContinuationDialog` props: `{open:boolean;preflight:RadarCapturePreflight;busy:boolean;error?:string;onCancel:()=>void;onConfirm:(limits:RadarCaptureLimits)=>Promise<void>}`. Workspace owns preflight/stateId and requestId; it forwards expiry receipt consent only when shown and explicitly approved.

- [ ] **Step 1: Write failing UI tests and verify RED.**
  A legacy partial-by-limit lot retains original quantity and offers one “Continuar pesquisa” action rather than pretending a new lot is required. A new20-company request with capacity10 does not start; show actionable capacity guidance. Continuation shows current totals, consumed attempts and remaining target to Admin only; no automatic increase. Cancel/Escape sends no resume. Confirm submits exactly the shown three limits and stateId with the same requestId. A combined expired-cursor/limit case uses one confirmation, not competing dialogs. Scope/operation change invalidates the dialog; stale response cannot overwrite a different operation. Invalid input and duplicate click never dispatch.
- [ ] **Step 2: Implement using existing YUX components.**
  Keep visible quantity and one contextual main button. Use the project's existing Dialog/Input/Button pattern; no redesign or removed technical controls. Explain that duplicates do not count as new, earlier pages may be revisited, and completion depends on available companies and remaining approved quota. Do not represent missing contact data as a completed enrichment. Expose no provider/cost/accounting internals in customer views. Campaign edits alone do not authorize applying new limits to an existing lot.
- [ ] **Step 3: Verify targeted tests and real local journey.**
  Extend opt-in synthetic journey to reproduce the original20/0 legacy partial with expired history, existing40-company history and insufficient original limits. Demonstrate cancel→explicit revised limits→same lot→discovery beyond duplicates→real fake-provider child jobs→truthful completed/partial status→reload. Also verify quota exhaustion, inactive worker, missing AI wallet, duplicate-only pages, uncertain response, another active lot, repeated confirmation and terminal source exhaustion. Assert precise call ceilings and no discovery replay for uncertain receipts. Test desktop/mobile/keyboard and console; use Browser plugin if available, otherwise documented Playwright local fallback. No paid production test or claims of production availability.
- [ ] **Step 4: Run full gates and independent final review.**
  Backend full Vitest with isolated PostgreSQL; separate capture/commercial integration suites; frontend full Vitest; both builds/bundle budget; migration/RLS verification. Expected: zero failed tests and builds exit0. Complete executing-plans' single fresh reviewer, fix Important/Critical findings with RED→GREEN and full regression; record all decisions, deferred findings and any not-checked external conditions.
- [ ] **Step 5: Commit, publish and hand off.**
  Commit UI/tests/plan, fetch main and preserve remote updates, publish main and correction branch without force, verify remote hashes. Record exact counts and evidence in this plan. No deploy, paid model/provider call or real production limit change. Production continuation remains an explicit user action after deployment; do not claim the current real campaign advanced.

## Self-review and execution status

This is one continuity feature with three reviewable deliverables, not a redesign of the Radar. The completed-page counter is derived from existing linked receipts, avoiding destructive backfill or reinterpretation of legacy attempt fields. Financial controls stay separate from successful-page limits. Start-capacity guidance and existing-lot authorization are distinct; no default is silently increased. All five Review Focus risks have owning tests. Opaque stateId/receipt binding protects consent against changed state; role-aware backend projection remains required. Method: inline execution in the isolated correction worktree, with one final reviewer before publication.

## Verification — 2026-10-17

- Backend: 219 suites / 1,185 tests passed with isolated PostgreSQL17; separate capture/commercial integration: 17 tests passed.
- Frontend: 165 suites / 737 tests passed; both TypeScript builds and frontend bundle budget passed.
- Migration0193 applied locally with stop-on-error; HTTP tests exercise scoped API consent, tenant isolation, worker SELECT-only audit access, atomic rollback and duplicate approvals. Release migration inventory updated without promoting production gates.
- Browser plugin not available; local Playwright1.63 / Chrome fallback. Tested localhost4174/API4182 at1440×1000 and390×844: identity, meaningful render, no framework overlay, cancellation, Escape, edited limits, one combined dialog, one resume POST, reload and preserved previous companies.
- Synthetic journey starts with40 prior companies and a legacy partial20/0 lot, one proven expired-token rejection and insufficient limits. Approval of8 pages/8 queries preserves the same operation/target. Four duplicate pages do not admit companies; two subsequent pages admit20 distinct new companies. Total7 attempts including the earlier rejection; all20 real child jobs reach review. Their deliberately incomplete evidence remains `insufficient`, not falsely completed. No automatic review approval, CRM conversion or contact.
- Browser warnings: existing React Router future flags and two expected unauthenticated `/auth/me`401 checks before login. No page runtime error or failed Radar request in the accepted journey. Screenshots/JSON are outside the repository at `C:/Users/andre/.codex/visualizations/2026/10/17/radar-limites-capacidade/`.
- External balances, actual credential acceptance, provider/network quality and production execution remain untested. No paid call, deployment, credential change or real campaign limit change.

### Final independent review and decisions

One fresh read-only whole-branch review identified two Important issues and no Critical/Minor findings. Both were reproduced with failing tests and fixed in one pass: preflight now permits evaluating an authorized larger page without an obsolete quota estimate blocking the dialog; the exact proposed quota/budget is still enforced before commit. A second tab's stale approval is rejected even after another request queued the operation, without a new dispatch; replay of the same accepted UUID remains idempotent. Final backend1,185, frontend737 and separate integration17 tests passed; backend build passed and frontend build/budget remained green. Frontend lint baseline passed at558 errors/25 warnings versus the existing ceiling560/27, without changing that baseline.

Decisions carried from execution:

1. `canContinue` is optional in shared TypeScript DTOs, always supplied to Admin by the new backend; absent means false for backward compatibility. Cost if wrong: an old backend still needs the new deployment to expose legacy continuation.
2. Historic counters inconsistent with receipts block continuation instead of queueing another no-op. Cost: such inconsistent lots need administrative reconciliation rather than automatic retry.
3. The review deliberately did not test live providers, balances or production. These remain `not_checked` because this development approval excludes paid calls/deployment. Cost: actual credential, balance or connectivity faults can still block production; local success is not claimed as production success.

No deferred Minor findings. Main publication is authorized by the user; it does not authorize deployment or a paid production pilot.
