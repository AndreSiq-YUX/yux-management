# YUX Verification Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os achados V01–V07 do relatório pós-implantação, exceto backup/restauração explicitamente adiado pelo proprietário.

**Architecture:** O Compose separa migração, aplicação e preparação de volumes; API, workers e Harness usam logins PostgreSQL distintos e sem privilégios elevados. Backend e frontend passam a expor disponibilidade, navegação e diagnóstico operacional coerentes, enquanto a UI de conhecimento distingue aprovação de publicação efetivamente elegível.

**Tech Stack:** Docker Compose/Dokploy, PostgreSQL 17, Fastify/TypeScript, React 18/Vite, Vitest e testes de integração PostgreSQL/Redis.

**Spec:** `C:/Users/andre/.codex/visualizations/2026/09/05/01a072ea-81e0-7d33-81f8-18a482903fe9/verificacao-2026-09-07/relatorio-verificacao.md`

## Global Constraints

- Não alterar migrations SQL já aplicadas; qualquer esquema novo usa migration aditiva.
- Não expor segredos em código, logs, commits ou respostas.
- Preservar os cinco volumes nomeados e executar a aplicação como UID/GID `1000:1000`.
- Manter capacidades de novos efeitos desligadas até os gates de piloto serem concluídos.
- Backup/restauração permanece fora deste lote por decisão explícita do proprietário.
- Cada correção deve ter teste de regressão antes do deploy.

---

### Task 1: Tornar o deploy compatível com least privilege e volumes antigos

**Files:**
- Modify: `docker-compose.dokploy.yml`
- Modify: `scripts/run-release-checks.ps1`
- Create: `backend/tests/deployment-contract.test.ts`
- Modify: `docs/backend-vps-runbook.md`

**Interfaces:**
- Consumes: `MIGRATOR_DATABASE_URL`, `YUX_API_DATABASE_URL`, `YUX_WORKER_DATABASE_URL`, `YUX_RUNTIME_DATABASE_URL` provisionadas no Dokploy.
- Produces: serviços one-shot `yux-backend-migrate` e `yux-volume-permissions`; aplicações sem fallback para o superusuário.

- [ ] **Step 1: Write the failing deployment contract test**

```ts
expect(compose).toContain('yux-backend-migrate:')
expect(compose).toContain('yux-volume-permissions:')
expect(compose).toContain('DATABASE_URL: ${YUX_API_DATABASE_URL:?YUX_API_DATABASE_URL is required}')
expect(compose).not.toContain('MIGRATOR_DATABASE_URL: ${MIGRATOR_DATABASE_URL:-${DATABASE_URL}}')
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd backend && npx vitest run tests/deployment-contract.test.ts`

- [ ] **Step 3: Add migration and volume preparation services**

```yaml
yux-backend-migrate:
  command: ["node", "dist/scripts/apply-migrations.js"]
  environment:
    MIGRATOR_DATABASE_URL: ${MIGRATOR_DATABASE_URL:?MIGRATOR_DATABASE_URL is required}
  depends_on:
    yux-postgres:
      condition: service_healthy
  restart: "no"

yux-volume-permissions:
  user: "0:0"
  command:
    - "sh"
    - "-c"
    - "mkdir -p /app/storage /app/storage/.quarantine /app/inbox /app/intelligence /app/runtime-state && chown -R 1000:1000 /app/storage /app/inbox /app/intelligence /app/runtime-state"
  restart: "no"
```

- [ ] **Step 4: Gate application services on both one-shot services**

API, workers e Harness usam `condition: service_completed_successfully`; Postgres recebe `pg_isready` como healthcheck. O segredo do migrador não é passado aos processos normais.

- [ ] **Step 5: Validate Compose and tests**

Run: `$env:POSTGRES_PASSWORD='test'; $env:MIGRATOR_DATABASE_URL='postgresql://migrator:test@yux-postgres:5432/yux'; $env:YUX_API_DATABASE_URL='postgresql://api:test@yux-postgres:5432/yux'; $env:YUX_WORKER_DATABASE_URL='postgresql://worker:test@yux-postgres:5432/yux'; $env:YUX_RUNTIME_DATABASE_URL='postgresql://runtime:test@yux-postgres:5432/yux'; docker compose -f docker-compose.dokploy.yml config; Remove-Item Env:POSTGRES_PASSWORD,Env:MIGRATOR_DATABASE_URL,Env:YUX_API_DATABASE_URL,Env:YUX_WORKER_DATABASE_URL,Env:YUX_RUNTIME_DATABASE_URL; cd backend; npx vitest run tests/deployment-contract.test.ts`.

### Task 2: Classificar falha de armazenamento como recuperável

**Files:**
- Modify: `backend/src/modules/strategy-engine/ingestion.ts`
- Modify: `backend/tests/strategy-ingestion.test.ts`

**Interfaces:**
- Consumes: volume gravável preparado pela Task 1.
- Produces: erro de `mkdir` capturado pelo mesmo fluxo que persiste `failure_class=recoverable`.

- [ ] **Step 1: Add a failing test for quarantine directory creation failure**

O teste injeta falha de filesystem antes da escrita e exige que o job não permaneça em `uploading` sem erro classificado.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd backend && npx vitest run tests/strategy-ingestion.test.ts`.

- [ ] **Step 3: Move directory preparation inside the protected try/catch**

```ts
try {
  await mkdir(quarantine, { recursive: true })
  // persist and enqueue
} catch (error) {
  // existing recoverable failure recording
}
```

- [ ] **Step 4: Run the focused test**

Run: `cd backend && npx vitest run tests/strategy-ingestion.test.ts`.

### Task 3: Bloquear criação de missão quando o Supervisor está desligado

**Files:**
- Modify: `backend/src/modules/workspace/context.ts`
- Modify: `backend/tests/workspace-context.test.ts`
- Modify: `frontend/src/components/action-engine/MissionsWorkspace.test.tsx`

**Interfaces:**
- Consumes: `MISSION_SUPERVISOR_ENABLED`.
- Produces: `missionCreation={mode:'unavailable',reasonCode:'mission_supervisor_disabled'}` antes de oferecer entrada de dados.

- [ ] **Step 1: Add the failing flag-matrix test**

```ts
expect(resolveMissionCreation({ ...env, MISSION_SUPERVISOR_ENABLED: false }, org, true, true))
  .toEqual({ mode: 'unavailable', reasonCode: 'mission_supervisor_disabled' })
```

- [ ] **Step 2: Run the workspace-context test and confirm it fails**

Run: `cd backend && npx vitest run tests/workspace-context.test.ts`.

- [ ] **Step 3: Check Supervisor before conversation/form resolution**

O `Pick<AppEnv,...>` inclui `MISSION_SUPERVISOR_ENABLED`; `false` retorna indisponível e preserva as regras de entitlement e escrita.

- [ ] **Step 4: Verify backend and UI regressions**

Run: `cd backend && npx vitest run tests/workspace-context.test.ts`; `cd frontend && npx vitest run src/components/action-engine/MissionsWorkspace.test.tsx`.

### Task 4: Corrigir navegação dos indicadores do Marketing Studio

**Files:**
- Modify: `backend/src/modules/marketing-studio/journey.ts`
- Modify: `backend/tests/integration/marketing-journey.test.ts`
- Modify: `frontend/src/components/marketing-studio/StudioJourney.test.tsx`

**Interfaces:**
- Produces: links canônicos `/portal/marketing/studio#flows|contents|reviews|calendar|publishing`, convertidos para o workspace sem perder a organização.

- [ ] **Step 1: Change fixtures to the canonical path and assert every link**

```ts
expect(summary.links.activeFlows).toBe('/portal/marketing/studio#flows')
```

- [ ] **Step 2: Run backend/frontend focused tests and confirm the old path fails**

Run both marketing journey test files.

- [ ] **Step 3: Replace all five legacy paths and retain existing anchor IDs**

- [ ] **Step 4: Run both focused suites**

### Task 5: Integrar diagnóstico operacional sem falsos alertas

**Files:**
- Modify: `backend/src/modules/health/operational-snapshot.ts`
- Modify: `backend/tests/integration/operational-health.test.ts`
- Modify: `frontend/src/types/adminPlatform.ts`
- Modify: `frontend/src/services/adminPlatformService.ts`
- Modify: `frontend/src/pages/platform/AdminHealthPage.tsx`
- Create: `frontend/src/pages/platform/AdminHealthPage.test.tsx`

**Interfaces:**
- Consumes: `GET /health/operational` autenticado para papel interno.
- Produces: apenas o heartbeat mais recente por classe de fila participa do estado atual; UI distingue `ok`, `degraded`, `unavailable` e dados históricos.

- [ ] **Step 1: Add backend regression for a stale replaced worker plus a fresh successor**

O snapshot deve permanecer `ok` para a capacidade quando existe sucessor recente da mesma classe.

- [ ] **Step 2: Implement current-worker selection per queue class**

```ts
const currentWorkers = selectCurrentWorkerHeartbeats(heartbeats.rows, measuredAt)
const degraded = currentWorkers.some((worker) => worker.status === 'stale')
  || queues.some((queue) => queue.status === 'stale')
  || outbox.failed > 0
```

- [ ] **Step 3: Add the frontend operational snapshot type and service method**

```ts
async getOperationalHealth(): Promise<OperationalHealthSnapshot> {
  return apiRequest('/health/operational')
}
```

- [ ] **Step 4: Render workers, queues, outbox and Harness with explicit unavailable states**

- [ ] **Step 5: Run focused backend/frontend tests**

### Task 6: Corrigir a sinalização de conhecimento e validar o lote

**Files:**
- Modify: `frontend/src/types/strategyEngine.ts`
- Modify: `frontend/src/services/strategyEngineService.ts`
- Modify: `frontend/src/components/strategy-engine/StrategyPacksPanel.tsx`
- Modify: `frontend/src/components/strategy-engine/StrategyPacksPanel.test.tsx`
- Modify: `docs/execution/yux-remediation/journal.md`
- Modify: `docs/releases/yux-remediation-acceptance.md`

**Interfaces:**
- Consumes: `current_release_id` de cada pack.
- Produces: contagens separadas para itens aprovados para publicação e packs com release atual; nenhum texto afirma que item apenas aprovado já está no runtime.

- [ ] **Step 1: Add failing mapper and panel assertions**

```ts
expect(mapStrategyPack({ current_release_id: releaseId }).currentReleaseId).toBe(releaseId)
expect(screen).toContain('Aguardam publicação')
```

- [ ] **Step 2: Map `current_release_id` and update metrics/copy**

- [ ] **Step 3: Run focused frontend tests and type-check**

- [ ] **Step 4: Run the full release checks**

Run backend tests/type-check/build, frontend tests/type-check/build, Harness tests and Compose validation.

- [ ] **Step 5: Provision production service credentials without printing secrets**

Criar senhas aleatórias fora do repositório, aplicar `ALTER ROLE` pelo canal administrativo e salvar somente as URLs de cada serviço no secret store do Dokploy.

- [ ] **Step 6: Deploy, verify and record evidence**

Confirmar `current_user`, `rolsuper=false`, `rolbypassrls=false`, escrita nos três volumes, migration one-shot, quatro workers, `/health`, `/ready`, diagnóstico operacional, formulário de missão indisponível e os cinco links do Studio. A recuperação do livro exige reenvio dos bytes autorizados e não pode ser simulada.
