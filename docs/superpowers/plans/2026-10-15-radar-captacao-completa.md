# Radar — captação completa com quantidade escolhida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escolher uma quantidade adicional e executar descoberta e aprofundamento das novas empresas como uma operação única, durável e acompanhável.

**Architecture:** Manter descoberta CNPJá, cursores regionais e pipeline individual existentes. Acrescentar uma operação Radar com itens e outbox transacional, admissão limitada/deduplicada e reconciliação de enfileiramento; pesquisas individuais continuam com seus próprios jobs, limites e recibos. A interface acompanha o estado persistido, não coordena chamadas pagas no navegador.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, BullMQ, React/Vite, Vitest e QA de navegador com provedores simulados.

**Spec:** `docs/superpowers/specs/2026-10-15-radar-captacao-completa.md`.

## Global Constraints

- Quantidade adicional inteira de 1–1.000, padrão 10; novas empresas únicas, não quantidade garantida de qualificadas/aprovadas.
- Não alterar limites, opções, rotas/modelos, licenças, credenciais ou TLS silenciosamente; pesquisa completa usa a campanha salva.
- Nenhuma chamada paga ou mutação de produção durante desenvolvimento. Publicar main após verificação; não executar deploy/piloto pago.
- Preservar isolamento por organização, revisão, aprovação humana, CRM e histórico; não ampliar privilégios de pesquisa paga dos clientes.
- Jobs individuais existentes: 1–5 consultas de busca e 1–10 páginas por empresa, conforme configuração; tetos existentes de descoberta e orçamento continuam aplicáveis.
- Revalidar disponibilidade do número da migração 0190 antes de criá-la; não editar migrações já aplicadas.

## Review Focus

1. Página retornada contém só duplicatas ou resultados além da quantidade: nenhuma perda de cursor, nenhum processamento além do alvo e nenhuma busca indefinida (Task 1).
2. Crash após admitir empresas e antes de enfileirar: itens/outbox recuperáveis sem duplicar chamadas pagas ou depender da UI aberta (Tasks 1–2).
3. Mudança de revisão, módulo revogado, Admin inativo ou quota esgotada após o início: pausar antes de novos efeitos, preservar fatos e permitir retomada somente autorizada (Tasks 1–2).
4. Falha de identidade/IA/certificado num item: outras conclusões não são inventadas nem a descoberta apresentada como pesquisa completa (Tasks 2–3).
5. Duplo clique, resposta HTTP perdida e nova quantidade durante operação ativa: request ID estável, quantidade imutável e uma operação ativa por campanha/revisão (Tasks 1–3).

---

### Task 1: Operação persistente e descoberta com quantidade exata

**Files:**
- Create: `backend/src/db/migrations/0190_radar_capture_operations.sql`, `backend/src/modules/radar/capture-operation.ts`, `backend/src/modules/radar/capture-discovery.ts`, `backend/tests/radar-capture-operation.test.ts`, `backend/tests/radar-capture-discovery.test.ts`.
- Modify: `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/types.ts`, `backend/tests/radar-cnpja-governance.test.ts`, `docs/releases/yux-remediation-manifest.json`.

**Interfaces:**
- `startRadarCaptureOperation(pool,user,{organizationId,campaignId,configurationRevision,requestId,requestedCount})` returns `{operationId,reused,status}`. `getRadarCaptureOperation(pool,user,organizationId,operationId)` returns persisted quantity, stage, counts, items and blockers. Request ID UUID; quantity 1–1.000; tenant-scoped uniqueness and payload conflict rejection.
- `advanceRadarCaptureDiscovery(pool,env,{organizationId,operationId},dependencies)` admits only new campaign candidates up to the remaining target and returns persisted progress. Extend `runRadarCnpjaAdvancedSearch` additively with an operation context and admission metadata; preserve legacy return fields/behavior when absent. Candidate admission, operation-item/outbox creation, overflow preservation and cursor update must share the provider-result transaction.

- [ ] Write RED tests: target 7 yields exactly 7 new operation items; duplicate/approved/current campaign records do not count; same request returns the original operation, different quantity with same ID conflicts; concurrent distinct requests cannot create two active operations.
- [ ] Write RED tests: 5 requested with page size 10, duplicate-only page, oversized provider response, source exhaustion and query cap. Assert no lost overflow/cursor, no extra calls once the target is met, no changes to previously approved facts/leads. Run `npm --prefix backend test -- tests/radar-capture-operation.test.ts tests/radar-capture-discovery.test.ts tests/radar-cnpja-governance.test.ts`; Expected: new assertions fail.
- [ ] Implement operation/items/outbox with scoped composite foreign keys, FORCE RLS and least-privilege service access. Use unique `(organization_id,request_id)` plus partial unique `(organization_id,campaign_id,configuration_revision)` for active operations; campaign-scoped transactional admission lock, never held during network calls. Index pending outbox dispatch. System reconciliation can read only dispatch metadata under its explicit service policy, not unscoped company/contact data. Persist requested quantity, configuration snapshot/revision, discovery counters, status/blockers and item/run links. Preserve legacy discovery endpoints. Admission and overflow must be recoverable after transaction/queue failures.
- [ ] Run the same tests; Expected: PASS. Verify additive migration inventory only; commit `feat(radar): persist quantity-controlled capture operations`.

### Task 2: Aprofundamento automático e retomada durável

**Files:**
- Create: `backend/src/modules/radar/capture-dispatch.ts`, `backend/tests/radar-capture-dispatch.test.ts`, `backend/tests/integration/radar-capture-operation.test.ts`.
- Modify: `backend/src/jobs/handlers/radar.ts`, `backend/src/jobs/registry.ts`, `backend/src/jobs/queue.ts`, `backend/src/jobs/handlers/maintenance.ts`, `backend/src/worker.ts`, `backend/src/modules/radar/routes.ts`; `backend/tests/radar-routes.test.ts`, `backend/tests/radar-b2b-batches.test.ts`.

**Interfaces:**
- `dispatchRadarCaptureOperation(pool,env,{organizationId,operationId},queue,signal?)` consumes persisted operation/outbox. Starts research only for its admitted items with `requestId=item.id`; reuses `startRadarCandidateResearch` and `radar.researchCandidate` runs/checkpoints/receipts. Bounded processing, not one long worker for N companies.
- Jobs `radar.advanceCaptureOperation {organizationId,operationId}` and `maintenance.reconcileRadarCaptures {window}`. Maintenance only reconciles pending dispatch of already authorized operations; tenant jobs recheck scope/revision/Admin/availability before effects. Deterministic outbox job IDs make queue redelivery safe.
- POST `/campaigns/:id/capture-operations` with org/revision/requestId/count, GET `/capture-operations/:id?organizationId=...`, POST `/capture-operations/:id/resume` with org/revision/requestId. Start returns 202 and stable operation ID; reads perform no effects. Resume keeps original target/items and cannot replace an uncertain paid request.
- Statuses: `queued|discovering|researching|completed|partial|blocked`; counts `requested|admitted|researching|completed|insufficient|blocked`. Completion requires discovery stopped and all admitted items terminal; missing data is distinct from infrastructure/permission blockers.

- [ ] Write RED tests for automatic dispatch of admitted IDs only (not ten oldest records), disabled/missing research preflight rejection before discovery, lost queue ack/restart, concurrent reconciliation and same-item research reuse. Expected: no duplicate call, request IDs stable.
- [ ] Write RED tests for changed revision, inactive requester, exhausted budget/credits, certificate approval pending and uncertain AI receipt. Expected: persisted blocker/partial state, no fake completion, no outreach or CRM writes. Run `npm --prefix backend test -- tests/radar-capture-dispatch.test.ts tests/radar-routes.test.ts tests/radar-b2b-batches.test.ts`; Expected: FAIL on new behavior.
- [ ] Implement dispatch/reconciliation and APIs; recheck actual child-run terminal outcomes, not merely successful enqueuing. Preserve existing endpoints and limits. Reconciliation must not authorize new searches or cross tenant boundaries.
- [ ] Run focal tests and real isolated PostgreSQL integration `tests/integration/radar-capture-operation.test.ts` with simulated providers. Expected: PASS, tenant isolation, durable recovery and no automatic messages/approvals/delivery. Commit `feat(radar): orchestrate discovery through complete candidate research`.

### Task 3: Quantidade, confirmação e acompanhamento na interface

**Files:**
- Create: `frontend/src/components/radar/RadarCaptureDialog.tsx`, `frontend/src/components/radar/RadarCaptureProgress.tsx` and corresponding `.test.tsx` files.
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`, `frontend/src/components/radar/RadarWorkspace.test.tsx`, `docs/runbooks/radar-pesquisa-configuravel.md`; this plan.

**Interfaces:**
- Dialog props `{campaign,availability,onStart,onClose}`; submit once with stable UUID retained across uncertain HTTP retry. Copy: **Quantas novas empresas você quer pesquisar?**, **Buscar e pesquisar empresas**. Show saved enabled stages, discovery/search cost ceilings and separate IA notice; blockers link to configuration/Admin.
- Progress props `{operation,onResume,onRefresh}`; poll persisted API only while active, recover on navigation/reload, show requested/admitted/researching/completed/insufficient/blocked and next action. Preserve existing list/details/selection; advanced Admin options retain discovery-only and existing-candidate verification with explicit names.

- [ ] Write RED UI tests: choose 7, validate 0/fraction/1.001, confirm one start request with 7, retry with same UUID; correct cost separation; active operation prevents a second conflicting start; queued/partial/blocked never shows successful completion. Run `npm --prefix frontend test -- src/components/radar/RadarCaptureDialog.test.tsx src/components/radar/RadarCaptureProgress.test.tsx src/components/radar/RadarWorkspace.test.tsx`; Expected: FAIL on new controls/flow.
- [ ] Implement YUX-standard dialog/progress and replace only the primary action with the complete workflow. Keep advanced legacy features, individual/batch research and manual approval/CRM delivery intact. Expected: focal tests PASS.
- [ ] Run complete backend/frontend/runtime suites, both builds and isolated Radar PostgreSQL tests. QA local browser desktop/mobile: quantity, confirmation, reload, progress, blocker/resume, no paid calls. Expected: PASS with truthful remaining limitations.
- [ ] Fresh-context final branch review, important corrections RED→GREEN, update plan/runbook, publish main without force push under standing authorization. Do not deploy or launch a paid pilot. Commit `feat(radar): choose and track complete capture batches`.

## Self-review / handoff

- Spec items 1/7 → Tasks 1/3; 2/3/5/6 → Tasks 1/2/3; 4 → Task 1; 8 → Tasks 2/3. Review-focus cases mapped to explicit regression steps.
- User already chose native execution previously; preserve that method. New behavior and quantity semantics await user review before implementation, per writing-plans.
