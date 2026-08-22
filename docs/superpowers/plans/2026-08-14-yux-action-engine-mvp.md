# YUX Action Engine MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma primeira missão outcome-first, assistida e auditável, capaz de planejar e operar a recuperação de receita no workspace Crescimento YUX sobre as capacidades existentes do YUX Hub.

**Architecture:** Postgres mantém packs, missões, planos, ações, ownership, custos, aprovações, observações e avaliações. O Agent Harness instancia `revenue_recovery@0.1.0` dentro de extension points tipados; o backend Fastify valida a conformidade, autoriza e executa capabilities registradas em código. BullMQ agenda trabalho, o outbox distribui eventos, automações respeitam o ownership da Mission e o React adiciona Missões com outcome e economia acima dos módulos atuais.

**Tech Stack:** Node.js 22, Fastify, TypeScript, PostgreSQL 17, Redis/BullMQ, Python/FastAPI Agent Harness, React 18, Vite, Tailwind/shadcn, Zod, Vitest e unittest/pytest.

**Spec:** `docs/superpowers/specs/2026-08-14-yux-action-engine-mvp-design.md`

**Status em 2026-08-21:** Tasks 1–18 implementadas localmente, incluindo tarefa humana durável e replan versionado; jobs duráveis, leitura operacional e runbook da Task 20 implementados. O piloto `0.1.0` publica somente capabilities com executor real — envio direto por e-mail/WhatsApp e Automation mission-bound ficam fora do catálogo até seus adaptadores. Gates de código executados. Permanecem externos ao repositório: aplicar a migration em ambiente alvo, configurar o Agent Harness, fazer deploy, executar QA autenticado contra infraestrutura real e autorizar o canary Crescimento YUX. O checklist detalhado está em `docs/yux-action-engine-implementation.md`.

## Global Constraints

- O Action Engine é aditivo; páginas e módulos atuais permanecem disponíveis.
- O MVP instancia `revenue_recovery@0.1.0`; o planner não cria DAG livre fora dos extension points do pack.
- Pack version publicada e planos aprovados são imutáveis.
- O Action Engine é proprietário da intenção; automações mission-bound são capabilities/subprocessos com versão congelada.
- Automação independente consulta ownership antes de atuar sobre entidade sob missão.
- Cada action/tarefa registra custo real em ledger imutável; correção usa reversal entry.
- Cada checkpoint calcula outcome e economia: custo total, valor líquido, valor/custo, valor/hora humana e execução sem intervenção.
- Postgres é a fonte de verdade; Redis/BullMQ não pode ser o único local de nenhum estado de negócio.
- Agent Harness nunca produz efeito externo diretamente.
- Todo efeito passa por capability registrada em código e command de domínio server-side.
- Planos aprovados são imutáveis; replan cria nova revisão.
- Métricas, budgets, thresholds e state transitions são determinísticos.
- O default do MVP é `assisted`; efeitos externos sempre exigem aprovação explícita.
- Retry não pode repetir efeito de negócio.
- Pause, cancel e kill switch são verificados imediatamente antes do efeito.
- Toda mutation e seu evento de domínio são gravados na mesma transação.
- Toda linha é isolada por organização e, quando aplicável, contrato.
- O envelope de evento preserva profundidade máxima 12, correlation e causation.
- O plano piloto limita o lote externo inicial a 20 contatos.
- Valores financeiros usam `NUMERIC`/decimal, nunca float.
- Custos são normalizados em BRL, preservando moeda/valor/taxa originais quando aplicável.
- Métrica indisponível é `unknown`, nunca zero por conveniência.
- A migration inicial será `backend/src/db/migrations/0128_action_engine_foundation.sql`.
- O frontend ativo usa `/api/*`; referências históricas a Supabase não são runtime novo.

---

## File Structure

### Backend — novo módulo

- `backend/src/modules/action-engine/types.ts` — contratos canônicos de mission, plan, action, approval, observation e evaluation.
- `backend/src/modules/action-engine/state-machine.ts` — transições puras e invariantes.
- `backend/src/modules/action-engine/repository.ts` — persistência transacional e locks.
- `backend/src/modules/action-engine/capability-registry.ts` — registry e metadados serializáveis.
- `backend/src/modules/action-engine/capability-policy.ts` — resolução de availability, risk, approval e kill switch.
- `backend/src/modules/action-engine/readiness.ts` — diagnóstico de dados, módulos e conexões.
- `backend/src/modules/action-engine/action-pack.ts` — contratos, publicação e conformidade de packs.
- `backend/src/modules/action-engine/packs/revenue-recovery-v0.ts` — definição canônica do pack piloto.
- `backend/src/modules/action-engine/execution-ownership.ts` — ownership e conflito com automações.
- `backend/src/modules/action-engine/economics.ts` — cost ledger e KPIs econômicos.
- `backend/src/modules/action-engine/planner.ts` — chamada do Agent Harness e compilação do plano.
- `backend/src/modules/action-engine/executor.ts` — scheduling e execução de action runs.
- `backend/src/modules/action-engine/evaluator.ts` — metric snapshots e decisões determinísticas.
- `backend/src/modules/action-engine/observer.ts` — conversão idempotente de eventos em observations.
- `backend/src/modules/action-engine/routes.ts` — API Fastify.
- `backend/src/modules/action-engine/capabilities/` — adapters iniciais por domínio.

### Persistência e runtime

- `backend/src/db/migrations/0128_action_engine_foundation.sql` — schema, constraints, indexes e RLS/context policies.
- `backend/src/modules/events/types.ts` — aggregate types de missão.
- `backend/src/modules/events/catalog.ts` — event types de missão.
- `backend/src/modules/events/dispatcher.ts` — consumer `mission_observer`.
- `backend/src/jobs/queue.ts` — jobs `action-engine.*` e `events.consume.missionObserver`.
- `backend/src/jobs/handlers/action-engine.ts` — handlers BullMQ.
- `backend/src/worker.ts` — registro e schedulers.
- `backend/src/server.ts` — registro `/api/action-engine`.

### Agent Harness

- `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py` — input/output e workflow de planning/replanning.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py` — validação de `ProposedMissionPlan`.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py` — endpoint interno.
- `workers/marketing-studio-agent-runtime/tests/test_mission.py` — testes do contrato.

### Frontend

- `frontend/src/types/actionEngine.ts` — contratos de UI/API.
- `frontend/src/services/actionEngineService.ts` — client tipado.
- `frontend/src/lib/action-engine/missionRules.ts` — helpers puros de progresso, estados e permissões.
- `frontend/src/components/action-engine/MissionDashboard.tsx` — lista e filtros.
- `frontend/src/components/action-engine/MissionCreateWizard.tsx` — criação/readiness/planning.
- `frontend/src/components/action-engine/MissionDetail.tsx` — shell do detalhe.
- `frontend/src/components/action-engine/MissionPlanPanel.tsx` — revisão e aprovação.
- `frontend/src/components/action-engine/MissionExecutionTimeline.tsx` — ações/tentativas/deep links.
- `frontend/src/components/action-engine/MissionMetricsPanel.tsx` — métricas e avaliações.
- `frontend/src/components/action-engine/MissionEconomicsPanel.tsx` — custos, horas, valor líquido e ratios.
- `frontend/src/components/action-engine/MissionApprovalsPanel.tsx` — fila e histórico.
- `frontend/src/pages/action-engine/MissionsPage.tsx` — rota interna.
- `frontend/src/pages/action-engine/MissionDetailPage.tsx` — detalhe interno.
- `frontend/src/pages/client-portal/PortalMissionsPage.tsx` — rota portal/workspace.
- `frontend/src/pages/client-portal/PortalMissionDetailPage.tsx` — detalhe portal/workspace.
- `frontend/src/App.tsx` e `frontend/src/lib/platform/navigation.ts` — rotas e navegação.

### Testes e operação

- `backend/tests/action-engine-schema.test.ts`
- `backend/tests/action-engine-state-machine.test.ts`
- `backend/tests/action-engine-capabilities.test.ts`
- `backend/tests/action-engine-routes.test.ts`
- `backend/tests/action-engine-execution.test.ts`
- `backend/tests/action-engine-evaluator.test.ts`
- `backend/tests/action-engine-pack.test.ts`
- `backend/tests/action-engine-ownership.test.ts`
- `backend/tests/action-engine-economics.test.ts`
- `backend/tests/action-engine-integration.test.ts`
- `frontend/src/lib/action-engine/missionRules.test.ts`
- `frontend/src/services/actionEngineService.test.ts`
- `frontend/src/components/action-engine/MissionDashboard.test.tsx`
- `frontend/src/components/action-engine/MissionCreateWizard.test.tsx`
- `frontend/src/components/action-engine/MissionDetail.test.tsx`
- `docs/action-engine-operations.md`

---

### Task 1: Contratos canônicos e máquinas de estado

**Files:**

- Create: `backend/src/modules/action-engine/types.ts`
- Create: `backend/src/modules/action-engine/state-machine.ts`
- Create: `backend/tests/action-engine-state-machine.test.ts`

**Interfaces:**

- Produces: `MissionStatus`, `PlanStatus`, `ActionRunStatus`, `MissionCommand`, `assertMissionTransition()`, `assertPlanTransition()`, `assertActionTransition()`.
- Consumes: nenhum módulo de infraestrutura; esta task deve permanecer pura.

- [ ] **Step 1: Escrever testes de transição e terminalidade**

Cobrir no mínimo:

```ts
expect(() => assertMissionTransition('draft', 'planning')).not.toThrow()
expect(() => assertMissionTransition('draft', 'active')).toThrowError('mission_transition_not_allowed')
expect(() => assertMissionTransition('succeeded', 'active')).toThrowError('mission_terminal')
expect(() => assertPlanTransition('approved', 'active')).not.toThrow()
expect(() => assertPlanTransition('approved', 'proposed')).toThrowError('plan_transition_not_allowed')
expect(() => assertActionTransition('running', 'succeeded')).not.toThrow()
expect(() => assertActionTransition('succeeded', 'running')).toThrowError('action_terminal')
```

- [ ] **Step 2: Rodar o teste e confirmar falha por módulos ausentes**

Run:

```powershell
cd backend
npx vitest run tests/action-engine-state-machine.test.ts
```

Expected: falha de import até os arquivos serem criados.

- [ ] **Step 3: Definir unions e contratos sem `any`**

Incluir:

```ts
export type MissionStatus =
  | 'draft' | 'qualifying' | 'planning' | 'pending_plan_approval'
  | 'ready' | 'active' | 'paused' | 'blocked' | 'evaluating'
  | 'pending_replan_approval' | 'succeeded' | 'failed' | 'expired' | 'cancelled'

export type PlanStatus =
  | 'proposed' | 'validating' | 'invalid' | 'pending_approval'
  | 'approved' | 'active' | 'superseded' | 'completed' | 'cancelled'

export type ActionRunStatus =
  | 'pending' | 'ready' | 'waiting_approval' | 'queued' | 'running'
  | 'retry_scheduled' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled'
```

Definir também metric value discriminado para representar `known` e `unknown`, evitando `null` ambíguo.

- [ ] **Step 4: Implementar tabelas explícitas de transição**

Usar `Record<Status, readonly Status[]>`; não aceitar string arbitrária. Estados terminais de missão: `succeeded`, `failed`, `expired`, `cancelled`.

- [ ] **Step 5: Rodar testes e type-check**

```powershell
cd backend
npx vitest run tests/action-engine-state-machine.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/modules/action-engine/types.ts backend/src/modules/action-engine/state-machine.ts backend/tests/action-engine-state-machine.test.ts
git commit -m "feat: define action engine state contracts"
```

---

### Task 2: Schema Postgres e repository transacional

**Files:**

- Create: `backend/src/db/migrations/0128_action_engine_foundation.sql`
- Create: `backend/src/modules/action-engine/repository.ts`
- Create: `backend/tests/action-engine-schema.test.ts`
- Modify: `backend/tests/migration-runner.test.ts`
- Modify: `backend/tests/schema-smoke.test.ts`

**Interfaces:**

- Consumes: types e state machine da Task 1; database request context existente.
- Produces: `createMission()`, `getMission()`, `listMissions()`, `transitionMission()`, `insertPlanRevision()`, `activatePlan()`, `createActionRuns()`, `claimActionRun()`, `recordApproval()`, `recordMissionEntity()`, `recordCostEntry()`, `recordObservation()`, `recordEvaluation()`, `publishActionPackVersion()`.

- [ ] **Step 1: Escrever schema tests antes da migration**

Validar que o SQL contém as quatorze tabelas especificadas, forced RLS/context policies, unique constraints de revisão/idempotência/ownership e indexes de scheduler. O teste deve rejeitar `REAL`/`DOUBLE PRECISION` em campos monetários.

- [ ] **Step 2: Criar migration idempotente**

Criar:

```text
action_packs
action_pack_versions
action_missions
action_mission_metrics
action_plans
action_plan_steps
action_runs
action_run_attempts
action_cost_entries
action_approvals
action_observations
action_mission_entities
action_evaluations
action_capability_policies
```

Constraints obrigatórias:

```sql
UNIQUE (mission_id, revision)
UNIQUE (pack_id, semantic_version)
UNIQUE (plan_id, step_key)
UNIQUE (run_id, attempt_number)
UNIQUE (idempotency_key)
UNIQUE (mission_id, entity_type, entity_id, role)
```

Usar partial unique indexes para uma revisão ativa por missão e ownership `exclusive` ativo por entidade/organização. Usar check constraints com os estados da Task 1 e trigger/guard de imutabilidade para pack version publicada.

- [ ] **Step 3: Implementar repository com locks e optimistic version**

Assinatura de transição:

```ts
export async function transitionMission(
  client: Queryable,
  input: {
    missionId: string
    organizationId: string
    expectedVersion: number
    toStatus: MissionStatus
    actor: DomainEventActor
    reason: string
  },
): Promise<ActionMission>
```

O update usa `WHERE id = $1 AND organization_id = $2 AND version = $3`, incrementa version e chama `recordDomainEvent()` na mesma transação controlada pelo caller.

- [ ] **Step 4: Preservar histórico externo**

FKs de `action_observations.source_record_id` e `action_mission_entities.entity_id` não apontam genericamente para entidades; usar type + ID e validar organization no repository. Deletar lead/proposta não deve apagar plano, vínculo, observation, cost entry ou aprovação. `action_cost_entries` não aceita update/delete operacional; reversão é nova linha com referência ao lançamento original.

- [ ] **Step 5: Rodar gates focados**

```powershell
cd backend
npx vitest run tests/action-engine-schema.test.ts tests/migration-runner.test.ts tests/schema-smoke.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/db/migrations/0128_action_engine_foundation.sql backend/src/modules/action-engine/repository.ts backend/tests/action-engine-schema.test.ts backend/tests/migration-runner.test.ts backend/tests/schema-smoke.test.ts
git commit -m "feat: persist action engine missions and plans"
```

---

### Task 3: Capability Registry e catálogo serializável

**Files:**

- Create: `backend/src/modules/action-engine/capability-registry.ts`
- Create: `backend/src/modules/action-engine/capabilities/system.ts`
- Create: `backend/src/modules/action-engine/capabilities/crm.ts`
- Create: `backend/src/modules/action-engine/capabilities/growth.ts`
- Create: `backend/src/modules/action-engine/capabilities/human.ts`
- Create: `backend/tests/action-engine-capabilities.test.ts`

**Interfaces:**

- Consumes: Zod, CRM repositories/commands existentes, platform module context.
- Produces: `CapabilityDefinition`, `CapabilityContext`, `CapabilityResult`, `registerCapability()`, `getCapability()`, `listCapabilityMetadata()`.

- [ ] **Step 1: Escrever testes do registry**

Testar duplicate key/version, input inválido, output inválido, registry metadata sem função/secrets e capability desconhecida:

```ts
expect(() => registry.register(definition)).not.toThrow()
expect(() => registry.register(definition)).toThrowError('capability_duplicate')
expect(() => registry.get('crm.unknown', 1)).toThrowError('capability_not_found')
expect(JSON.stringify(registry.listMetadata())).not.toContain('execute')
```

- [ ] **Step 2: Implementar registry fechado em código**

Definir Zod schemas no mesmo arquivo da capability ou em arquivo adjacente. `organizationId`, `missionId`, `actor` e idempotency nunca fazem parte do input gerado pelo planner; são injetados via context.

- [ ] **Step 3: Registrar capabilities read-only**

Implementar primeiro:

```text
system.readiness.check
crm.pipeline.snapshot
crm.recovery_candidates.search
crm.lead.timeline.read
growth.segment.preview
```

`crm.recovery_candidates.search` aceita `inactiveDays`, pipeline/stage allowlist, limit máximo 500 e exclusões; retorna IDs e campos mínimos, sem secrets.

- [ ] **Step 4: Registrar capabilities internas de baixo risco**

Implementar adapters para:

```text
human.task.create
crm.task.create
crm.lead.assign_owner
```

Reutilizar command/repository atual; não escrever SQL de CRM duplicado no adapter.

- [ ] **Step 5: Testar dry-run e idempotência declarada**

Queries suportam dry-run naturalmente. Commands retornam preview sem mutation quando `context.dryRun` é true. Commands declaram `idempotency: 'required'`.

- [ ] **Step 6: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-capabilities.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/modules/action-engine/capability-registry.ts backend/src/modules/action-engine/capabilities backend/tests/action-engine-capabilities.test.ts
git commit -m "feat: add governed capability registry"
```

---

### Task 4: Revenue Recovery Pack v0

**Files:**

- Create: `backend/src/modules/action-engine/action-pack.ts`
- Create: `backend/src/modules/action-engine/packs/revenue-recovery-v0.ts`
- Create: `backend/tests/action-engine-pack.test.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/db/migrations/0128_action_engine_foundation.sql`

**Interfaces:**

- Consumes: capability metadata da Task 3 e repository/schema da Task 2.
- Produces: `ActionPackVersion`, `REVENUE_RECOVERY_PACK_V0`, `validatePackParameters()`, `validatePlanConformance()`, `getPublishedActionPackVersion()`.

- [ ] **Step 1: Escrever testes do pack antes da definição**

Cobrir identidade/hash, schema de parâmetros, topology protegida, capability allowlist, extension points e imutabilidade:

```ts
expect(REVENUE_RECOVERY_PACK_V0.key).toBe('revenue_recovery')
expect(REVENUE_RECOVERY_PACK_V0.semanticVersion).toBe('0.1.0')
expect(validatePackParameters({ targetRevenueBrl: '10000', canarySize: 20 }).success).toBe(true)
expect(() => validatePlanConformance(planWithoutConsent, pack)).toThrowError('action_pack_protected_step_missing')
expect(() => validatePlanConformance(planWithUnknownCapability, pack)).toThrowError('action_pack_capability_not_allowed')
```

- [ ] **Step 2: Rodar o teste e confirmar falha por módulo ausente**

```powershell
cd backend
npx vitest run tests/action-engine-pack.test.ts
```

Expected: FAIL de import.

- [ ] **Step 3: Definir o contrato versionado**

Incluir exatamente:

```ts
export type ActionPackVersion = {
  key: string
  semanticVersion: string
  schemaVersion: 1
  outcomeType: string
  status: 'draft' | 'published_for_internal_pilot' | 'published' | 'retired'
  parameterSchema: Record<string, unknown>
  readinessSpec: Record<string, unknown>
  topologyTemplate: { steps: PackStepTemplate[] }
  protectedStepKeys: string[]
  extensionPoints: PackExtensionPoint[]
  allowedCapabilities: Array<{ key: string; versions: number[]; required: boolean }>
  metricSpec: Record<string, unknown>
  economicsSpec: Record<string, unknown>
  policyDefaults: Record<string, unknown>
  contentHash: string
}
```

- [ ] **Step 4: Codificar a topology canônica**

Usar os step keys da spec de `pack.readiness` até `pack.evaluate`. Parâmetros obrigatórios: target, inatividade, stages/pipelines, canais, canary máximo 20, attribution window, budgets, human hour rate e thresholds. Nenhum prompt ou dado de cliente entra no pack publicado.

- [ ] **Step 5: Implementar conformance validation**

Validar protected nodes, reachability, ordem de segurança, extension point, capability/version, limites e presence do checkpoint econômico. Permitir approval adicional e redução de escopo sem deviation material.

- [ ] **Step 6: Publicar seed idempotente na migration**

Inserir identidade + versão `0.1.0` com hash do conteúdo canônico. `ON CONFLICT` deve confirmar o mesmo hash; hash diferente para versão já publicada falha com `action_pack_published_version_conflict` no repository.

- [ ] **Step 7: Rodar testes e type-check**

```powershell
cd backend
npx vitest run tests/action-engine-pack.test.ts tests/action-engine-schema.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/modules/action-engine/action-pack.ts backend/src/modules/action-engine/packs/revenue-recovery-v0.ts backend/src/modules/action-engine/repository.ts backend/src/db/migrations/0128_action_engine_foundation.sql backend/tests/action-engine-pack.test.ts
git commit -m "feat: add revenue recovery action pack v0"
```

---

### Task 5: Availability, policies, readiness e kill switches

**Files:**

- Create: `backend/src/modules/action-engine/capability-policy.ts`
- Create: `backend/src/modules/action-engine/readiness.ts`
- Create: `backend/tests/action-engine-policy.test.ts`
- Modify: `backend/src/modules/platform/repository.ts`

**Interfaces:**

- Consumes: registry da Task 3, `revenue_recovery@0.1.0` da Task 4, contratos/módulos e provider connections existentes, `action_capability_policies`.
- Produces: `resolveCapabilityDecision()`, `evaluateMissionReadiness()`.

- [ ] **Step 1: Escrever matriz de precedência em testes**

Cobrir:

```text
global kill switch > organization allow
capability disabled > mission guardrailed
legal/consent deny > admin approval
always approval > assisted profile
budget exceeded > ready action
missing connection > capability available in code
```

- [ ] **Step 2: Implementar decisão discriminada**

```ts
export type CapabilityDecision =
  | { outcome: 'allow'; requiresApproval: boolean; policyId?: string; reason: string }
  | { outcome: 'deny'; requiresApproval: false; policyId?: string; reason: string }
  | { outcome: 'unavailable'; requiresApproval: false; reason: string }
```

Não representar deny como booleanos contraditórios.

- [ ] **Step 3: Implementar readiness checks**

Checks do piloto:

```text
organization/contract valid
action_engine module enabled
CRM instance available
eligible opportunities query succeeds
revenue source configured
owner exists
deadline/target/budget valid
email connection and template readiness
WhatsApp connection/template readiness
permission evidence/suppression readiness
Agent Harness health for planning
Revenue Recovery Pack v0 publicado com hash esperado
parâmetros econômicos: budgets, human hour limit e human cost rate
```

Cada check retorna `pass`, `warn` ou `block`, `code`, `message` e optional `fixHref`.

- [ ] **Step 4: Garantir que provider ausente degrade corretamente**

Email/WhatsApp ausente bloqueia apenas o uso da capability correspondente; planning pode continuar se houver caminho humano ou canal alternativo. Ausência de fonte de success metric bloqueia a missão inteira.

- [ ] **Step 5: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-policy.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/modules/action-engine/capability-policy.ts backend/src/modules/action-engine/readiness.ts backend/src/modules/platform/repository.ts backend/tests/action-engine-policy.test.ts
git commit -m "feat: enforce mission capability policies"
```

---

### Task 6: API de missão e comandos de lifecycle

**Files:**

- Create: `backend/src/modules/action-engine/routes.ts`
- Create: `backend/tests/action-engine-routes.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/policies/authorization.ts`

**Interfaces:**

- Consumes: repository, state machine, readiness e policy.
- Produces: `/api/action-engine/capabilities`, `/action-packs`, `/readiness`, `/missions` e lifecycle commands.

- [ ] **Step 1: Escrever route tests de auth, tenant e concorrência**

Testar admin autorizado, client user sem permission, cross-organization, `expectedVersion` incorreta, idempotency key repetida e sanitização de economics: portal não recebe taxa humana interna, custo interno ou margem YUX.

- [ ] **Step 2: Definir Zod request schemas**

`POST /missions` não aceita status, progress ou output calculado do client. Campos financeiros entram como string decimal ou integer cents e são normalizados server-side.

- [ ] **Step 3: Implementar endpoints síncronos**

```text
GET  /capabilities
GET  /action-packs
GET  /action-packs/:packKey/versions/:semanticVersion
POST /readiness
GET  /missions
POST /missions
GET  /missions/:missionId
PATCH /missions/:missionId
POST /missions/:missionId/qualify
POST /missions/:missionId/pause
POST /missions/:missionId/resume
POST /missions/:missionId/cancel
```

Pause/resume/cancel usam commands com version e reason; não usar update genérico.

- [ ] **Step 4: Registrar permissões e rota**

Adicionar keys de action engine à policy mapping existente e registrar:

```ts
await app.register(registerActionEngineRoutes, { prefix: '/api/action-engine' })
```

- [ ] **Step 5: Retornar erros estáveis**

Mapear `mission_not_found`, `mission_transition_not_allowed`, `mission_version_conflict`, `mission_readiness_blocked`, `action_engine_forbidden` e `idempotency_conflict` para status apropriados.

- [ ] **Step 6: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/modules/action-engine/routes.ts backend/tests/action-engine-routes.test.ts backend/src/server.ts backend/src/policies/authorization.ts
git commit -m "feat: expose action mission lifecycle api"
```

---

### Task 7: Contrato de mission planning no Agent Harness

**Files:**

- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_mission.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py`

**Interfaces:**

- Consumes: Harness, retrieval, workflow, trace e provider existentes.
- Produces: `POST /missions/plan` e `validate_mission_plan()`.

- [ ] **Step 1: Escrever contrato Python antes do endpoint**

O teste fornece `revenue_recovery@0.1.0` e capabilities permitidas `crm.pipeline.snapshot` e `human.task.create`; um plano que retorna `campaign.change_budget` deve falhar com `mission_plan_capability_not_allowed`, e um plano sem `pack.collect_metrics_and_costs` deve falhar com `mission_plan_protected_step_missing`.

- [ ] **Step 2: Implementar validação estrutural sem confiar no provider**

Validar:

```text
schemaVersion == 1
missionId idêntico ao input
pack key/version/hash idênticos ao input
stepKey único
dependsOn existente
grafo acíclico
capability key/version na allowlist
timeoutSeconds entre 1 e 86400
maxAttempts entre 1 e 5
external command com approval required
checkpoint final presente
protected nodes e economics checkpoint presentes
```

O backend fará nova validação; esta validação reduz resposta inválida, mas não é fronteira de segurança.

- [ ] **Step 3: Compor prompt com dados minimizados**

Enviar mission, readiness, baseline, `Revenue Recovery Pack v0`, catálogo serializado, limites, Strategy Pack context e revisão anterior. Instruir o modelo a adaptar apenas parâmetros/extension points e retornar somente JSON compatível.

- [ ] **Step 4: Registrar trace e falha tipada**

O run usa profile `growth_strategist`, workflow key `mission_revenue_recovery_pack_v0`, registra planner/verifier steps e não persiste plano diretamente nas tabelas do Action Engine.

- [ ] **Step 5: Expor endpoint autenticado**

Request mutável exige bearer token e `organization_id`; validar ownership de contract/client pelo runtime store como nos endpoints existentes.

- [ ] **Step 6: Rodar suite Python**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest discover -s tests -v
```

Expected: todos os testes passam.

- [ ] **Step 7: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py workers/marketing-studio-agent-runtime/tests/test_mission.py
git commit -m "feat: add mission planning contract to agent harness"
```

---

### Task 8: Compilador de planos e aprovação versionada

**Files:**

- Create: `backend/src/modules/action-engine/planner.ts`
- Create: `backend/tests/action-engine-planner.test.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/jobs/queue.ts`
- Create: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/worker.ts`

**Interfaces:**

- Consumes: Agent Harness `/missions/plan`, registry, policy, readiness e repository.
- Produces: `requestMissionPlan()`, `compileMissionPlan()`, `approvePlan()` e job `action-engine.planMission`.

- [ ] **Step 1: Escrever testes de compilação adversarial**

Casos obrigatórios:

```text
capability inexistente
input fora do schema
pack hash/version divergente
nó protegido removido
deviation fora de extension point
ciclo A -> B -> A
dependency ausente
budget excedido
checkpoint econômico ausente
ação externa sem approval
wait sem timeout
output binding inexistente
plano válido com approval inserido
```

- [ ] **Step 2: Implementar chamada idempotente do planner**

`POST /missions/:missionId/plan` transiciona para `planning`, grava evento e enfileira job. Repetição com mesma mission version retorna a mesma referência enquanto o job estiver ativo.

- [ ] **Step 3: Implementar compilador determinístico**

Resolver pack/version/hash, executar `validatePlanConformance()`, resolver capability versions, Zod parse de inputs estáticos, topological sort, custo máximo por categoria, approvals e hash SHA-256 do documento normalizado. Persistir `proposed_payload`, `compiled_payload`, parâmetros e deviations separadamente.

- [ ] **Step 4: Implementar aprovação por hash**

Criar approval `plan`; decisão só pode aprovar quando `subject_version` e `subject_hash` ainda correspondem. Ao aprovar, plano fica `approved` e missão `ready` em uma transação.

Expor `GET /missions/:missionId/plans`, `GET /plans/:planId` e `POST /plans/:planId/submit` sem permitir mutation do documento compilado.

- [ ] **Step 5: Registrar job e handler**

Adicionar `action-engine.planMission` ao `JOB_NAMES`. O worker carrega missão atual, aborta de forma idempotente se terminal/cancelada e persiste errors tipados sem plano parcial ativo.

- [ ] **Step 6: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-planner.test.ts tests/action-engine-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/modules/action-engine/planner.ts backend/tests/action-engine-planner.test.ts backend/src/modules/action-engine/routes.ts backend/src/jobs/queue.ts backend/src/jobs/handlers/action-engine.ts backend/src/worker.ts
git commit -m "feat: compile and approve mission plans"
```

---

### Task 9: Executor persistente e scheduling de ações

**Files:**

- Create: `backend/src/modules/action-engine/executor.ts`
- Create: `backend/tests/action-engine-execution.test.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`

**Interfaces:**

- Consumes: plan steps/runs, registry, policy, approval, BullMQ.
- Produces: `startMission()`, `scheduleReadyActions()`, `executeActionRun()`, jobs `action-engine.scheduleReadyActions`, `action-engine.executeAction`, `action-engine.expireWaits`.

- [ ] **Step 1: Escrever testes de dependência e corrida**

Cobrir fan-out paralelo, dependency failure, duas claims concorrentes, pause antes do effect, cancel com job enfileirado, approval pendente, retry após timeout e duplicate job.

- [ ] **Step 2: Criar action runs ao iniciar**

`startMission()` verifica plano aprovado, cria uma run por step, ativa plano/missão e publica `mission.started` na mesma transação. Steps raiz passam a `ready` somente após commit.

Expor `POST /missions/:missionId/start`, `GET /missions/:missionId/actions` e `GET /actions/:actionId` com tenant/permission checks.

- [ ] **Step 3: Implementar scheduler por topologia**

Selecionar `pending` cujas dependências estão `succeeded`/`skipped` conforme regra. Condição falsa marca `skipped`. Capability com approval requerido cria approval e muda para `waiting_approval`.

- [ ] **Step 4: Implementar claim e preflight final**

`claimActionRun()` usa `FOR UPDATE SKIP LOCKED`. Antes de chamar `execute`, recarregar missão, plano, approval, policy, budget e kill switches. Qualquer mudança bloqueia sem side effect.

- [ ] **Step 5: Persistir tentativa e efeito idempotente**

Criar attempt com idempotency key derivada de `missionId/planId/actionId/attempt intent`. A capability/command deve usar a mesma key. Persistir output validado, evidências, deep links, event IDs e custos tipados; a atomicidade do ledger é concluída na Task 13.

- [ ] **Step 6: Diferenciar retry de bloqueio**

Erro transitório dentro de deadline cria `retry_scheduled`; erro de policy/readiness vira `blocked`; erro de schema é não-retryable; efeito confirmado com falha de resposta é reconciliado pela idempotency key.

- [ ] **Step 7: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-execution.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/modules/action-engine/executor.ts backend/tests/action-engine-execution.test.ts backend/src/jobs/handlers/action-engine.ts backend/src/jobs/queue.ts backend/src/worker.ts
git commit -m "feat: execute mission actions persistently"
```

---

### Task 10: Ownership do Action Engine e automações subordinadas

**Files:**

- Create: `backend/src/modules/action-engine/execution-ownership.ts`
- Create: `backend/src/modules/action-engine/capabilities/automation.ts`
- Create: `backend/tests/action-engine-ownership.test.ts`
- Modify: `backend/src/modules/action-engine/capability-registry.ts`
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/automation/runtime.ts`
- Modify: `backend/src/modules/events/catalog.ts`
- Modify: `backend/src/db/migrations/0128_action_engine_foundation.sql`

**Interfaces:**

- Consumes: mission entities/repository, executor da Task 9 e automation runtime existente.
- Produces: `acquireMissionOwnership()`, `releaseMissionOwnership()`, `resolveAutomationConflict()`, capability `automation.flow.execute`.

- [ ] **Step 1: Escrever testes de conflito antes da implementação**

Casos obrigatórios:

```ts
expect(resolveAutomationConflict(exclusiveMission, standaloneMoveStage)).toEqual({ outcome: 'block', reason: 'mission_exclusive_ownership' })
expect(resolveAutomationConflict(sharedMission, standaloneAddNote)).toEqual({ outcome: 'allow', reason: 'disjoint_action' })
expect(resolveAutomationConflict(sharedMission, standaloneSendEmail)).toEqual({ outcome: 'block', reason: 'action_key_conflict' })
expect(resolveAutomationConflict(sameMission, missionBoundSendEmail)).toEqual({ outcome: 'allow', reason: 'same_mission_subprocess' })
```

- [ ] **Step 2: Rodar teste e confirmar falha de import**

```powershell
cd backend
npx vitest run tests/action-engine-ownership.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar aquisição/release transacional**

`acquireMissionOwnership()` valida organização, entity, mode, conflict policy e partial unique index. Reaquisição idempotente pela mesma missão retorna o vínculo. Outra missão recebe `mission_entity_ownership_conflict`. Release preserva histórico e preenche `released_at`.

- [ ] **Step 4: Registrar `automation.flow.execute`**

Input obrigatório:

```ts
{
  flowId: string
  publishedVersionId: string
  entityIds: string[]
  ownershipMode: 'observe' | 'shared' | 'exclusive'
  allowedActionKeys: string[]
  timeoutSeconds: number
}
```

O adapter congela snapshot/version, injeta mission/action correlation e retorna subprocess run ID. Flow não recebe command para mudar Mission.

- [ ] **Step 5: Integrar preflight ao automation runtime**

Antes de criar run standalone e imediatamente antes de cada action effect, consultar ownership. Execução mission-bound da mesma mission/correlation passa; `mission_wins`/`block_new` bloqueiam a execução conflitante, enquanto `allow_disjoint` libera somente action key fora da allowlist ocupada. O runtime preserva comportamento atual quando não há ownership.

- [ ] **Step 6: Propagar pause/cancel/kill switch**

Preflight da action do flow verifica Mission ativa. Pause/cancel impede novo efeito, mas não apaga efeito confirmado. Emitir `mission.automation_subprocess_started/completed` e `mission.ownership_conflict` pelo outbox.

- [ ] **Step 7: Rodar testes de ownership e regressão de automações**

```powershell
cd backend
npx vitest run tests/action-engine-ownership.test.ts tests/automation-dispatch.test.ts tests/automation-agent-context.test.ts tests/automation-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/modules/action-engine/execution-ownership.ts backend/src/modules/action-engine/capabilities/automation.ts backend/src/modules/action-engine/capability-registry.ts backend/src/modules/action-engine/executor.ts backend/src/modules/automation/runtime.ts backend/src/modules/events/catalog.ts backend/src/db/migrations/0128_action_engine_foundation.sql backend/tests/action-engine-ownership.test.ts
git commit -m "feat: make missions own automation intent"
```

---

### Task 11: Capabilities de sequência, e-mail, WhatsApp e métricas

**Files:**

- Create: `backend/src/modules/action-engine/capabilities/communications.ts`
- Create: `backend/src/modules/action-engine/capabilities/reports.ts`
- Modify: `backend/src/modules/action-engine/capability-registry.ts`
- Modify: `backend/tests/action-engine-capabilities.test.ts`
- Modify: `backend/src/modules/automation/command-adapters.ts`
- Modify: `backend/src/modules/email-delivery/service.ts`

**Interfaces:**

- Consumes: commands de sequência, SMTP2GO, Meta WhatsApp, reports/CRM.
- Produces: capabilities externas e `reports.recovered_revenue.snapshot`.

- [ ] **Step 1: Escrever contract tests por capability**

Validar input/output, entitlement, consentimento, suppression, published template, connection health, dry-run, idempotency e `costEntries` por chamada/mensagem.

- [ ] **Step 2: Extrair commands reutilizáveis onde necessário**

Se `command-adapters.ts` contém lógica privada necessária, exportar função de domínio estreita em vez de importar internals ou copiar SQL. Preservar chamadas das automações.

- [ ] **Step 3: Registrar commands externos com approval `always`**

```text
crm.sequence.enroll
email.message.queue
whatsapp.template.queue
```

No MVP, WhatsApp aceita apenas template aprovado e permission evidence; primeiro contato outbound nunca autoenvia.

- [ ] **Step 4: Implementar snapshot de receita recuperada**

`reports.recovered_revenue.snapshot` usa fonte canônica de proposta/contrato, mission touches e janela de atribuição. Retorna separadamente `attributedRevenue` e `confirmedRevenue`; não chama estimativa de receita confirmada.

- [ ] **Step 5: Garantir evidence e deep links**

Cada result inclui entity IDs, provider reference quando existir, rota do CRM/conversa/proposta e cost entries com source reference. Nunca incluir token/access secret.

- [ ] **Step 6: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-capabilities.test.ts tests/email-delivery-policy.test.ts tests/automation-dispatch.test.ts
npm run type-check
```

Expected: PASS e automações existentes sem regressão.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/modules/action-engine/capabilities backend/src/modules/action-engine/capability-registry.ts backend/tests/action-engine-capabilities.test.ts backend/src/modules/automation/command-adapters.ts backend/src/modules/email-delivery/service.ts
git commit -m "feat: connect mission communication capabilities"
```

---

### Task 12: Observer de eventos e Evaluator determinístico

**Files:**

- Create: `backend/src/modules/action-engine/observer.ts`
- Create: `backend/src/modules/action-engine/evaluator.ts`
- Create: `backend/tests/action-engine-evaluator.test.ts`
- Modify: `backend/src/modules/events/types.ts`
- Modify: `backend/src/modules/events/catalog.ts`
- Modify: `backend/src/modules/events/dispatcher.ts`
- Modify: `backend/src/jobs/handlers/domain-events.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`

**Interfaces:**

- Consumes: domain events, metric/attribution spec do pack, mission metrics, observations e report capability.
- Produces: consumer `mission_observer`, `collectMissionMetrics()`, `evaluateMission()` e jobs `events.consume.missionObserver`, `action-engine.collectMetrics` e `action-engine.evaluateMission`.

- [ ] **Step 1: Ampliar aggregate types com teste de compatibilidade**

Adicionar `mission`, `mission_action` e `approval` sem quebrar eventos de lead/form/task/sequence/email.

- [ ] **Step 2: Escrever testes de observation idempotente**

O mesmo `email.delivered` entregue duas vezes gera uma observation. Um evento de outra organização não é associado. Evento fora da attribution window não soma.

- [ ] **Step 3: Registrar consumer no dispatcher**

Adicionar `mission_observer` ao fan-out. O delivery ledger existente garante retry independente; handler procura missões ativas relevantes por correlation e `action_mission_entities`, nunca apenas por coincidência de lead/janela.

- [ ] **Step 4: Implementar metric values discriminados**

```ts
type MetricValue =
  | { status: 'known'; value: string; observedAt: string }
  | { status: 'unknown'; reason: string; observedAt: string }
```

Decimal permanece string/Decimal internamente até persistência/cálculo seguro.

- [ ] **Step 5: Implementar regras do piloto**

Calcular conforme o pack: `contacted_opportunities`, `positive_responses`, `meetings_booked`, `proposals_sent`, `signed_revenue`, `unsubscribe_rate`, `complaint_count`, `external_messages_sent` e `human_hours`. Fórmulas econômicas são adicionadas na Task 13.

- [ ] **Step 6: Implementar conclusão determinística**

Ordem:

```text
critical guardrail -> pause/block
kill switch -> pause
success target met -> succeed
deadline passed -> expire
required metric unknown -> continue/block conforme criticidade
off-track after minimum sample -> propose_replan
otherwise -> continue
```

Persistir decisão e publicar `mission.evaluated`. Análise do agente é campo opcional e não altera conclusion.

Expor `POST /missions/:missionId/evaluate`; a resposta retorna a evaluation persistida ou job reference, sem calcular métricas longas dentro da request.

- [ ] **Step 7: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-evaluator.test.ts tests/domain-event-outbox.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/modules/action-engine/observer.ts backend/src/modules/action-engine/evaluator.ts backend/tests/action-engine-evaluator.test.ts backend/src/modules/events/types.ts backend/src/modules/events/catalog.ts backend/src/modules/events/dispatcher.ts backend/src/jobs/handlers/domain-events.ts backend/src/jobs/handlers/action-engine.ts backend/src/jobs/queue.ts
git commit -m "feat: evaluate missions from domain observations"
```

---

### Task 13: Ledger econômico e KPIs de productização

**Files:**

- Create: `backend/src/modules/action-engine/economics.ts`
- Create: `backend/tests/action-engine-economics.test.ts`
- Modify: `backend/src/modules/action-engine/types.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/action-engine/evaluator.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/db/migrations/0128_action_engine_foundation.sql`

**Interfaces:**

- Consumes: action attempts da Task 9, capability results da Task 11, metrics/evaluator da Task 12.
- Produces: `CostEntryInput`, `recordCapabilityCosts()`, `recordHumanTaskCost()`, `reverseCostEntry()`, `calculateMissionEconomics()`.

- [ ] **Step 1: Escrever testes de ledger e fórmulas**

Cobrir:

```ts
expect(calculateMissionEconomics({ value: '10000', costs: ['300', '225'], humanHours: '3', completedActions: 10, humanActions: 2 })).toMatchObject({
  totalExecutionCostBrl: '525.00',
  netValueBrl: '9475.00',
  valueCostRatio: '19.0476',
  valuePerHumanHourBrl: '3333.33',
  humanFreeExecutionRate: '0.8000',
})
expect(calculateMissionEconomics({ value: '0', costs: [], humanHours: '0', completedActions: 0, humanActions: 0 }).valueCostRatio).toBe('not_applicable')
```

Testar também duplicate idempotency key, reconciliação `reserved -> reversal + actual`, moeda original e custo humano `180 minutos × R$75/h = R$225`.

- [ ] **Step 2: Rodar o teste e confirmar falha**

```powershell
cd backend
npx vitest run tests/action-engine-economics.test.ts
```

Expected: FAIL de import.

- [ ] **Step 3: Implementar decimal e cost types sem float**

Usar decimal strings nas interfaces e helpers BigInt locais: `parseScaledDecimal(value, scale)`, `formatScaledDecimal(value, scale)`, `multiplyScaled(left, right, scale)` e `divideScaled(numerator, denominator, scale)`. BRL usa scale 2; ratios usam scale 4; taxa de câmbio usa scale 8. Definir categorias/naturezas exatamente como a spec. Não usar `Number` para soma, multiplicação ou divisão monetária.

- [ ] **Step 4: Persistir custo atomicamente com a tentativa**

Ao concluir attempt, inserir todos os `costEntries` (`reserved` ou `actual`) validados e marcar attempt/run `succeeded` na mesma transação. Idempotency key inclui `actionRunId`, source reference, natureza e categoria. Retry reconcilia entries existentes. Custo confirmado posteriormente cria `actual` e reversal da reserva.

- [ ] **Step 5: Registrar trabalho humano**

`POST /actions/:actionId/resolve-human-task` passa a exigir `actualMinutes` inteiro positivo quando a tarefa foi iniciada e usa `human_cost_rate_brl` congelada na Mission. O cost entry e a resolução são atômicos.

- [ ] **Step 6: Implementar reversal e economia agregada**

`reverseCostEntry()` cria linha `reversal` com valor negativo, link para original e permission de auditor. `calculateMissionEconomics()` separa AI/provider, media, human, external services e total; calcula net value/ratios com estado `not_applicable`.

- [ ] **Step 7: Integrar checkpoints econômicos ao evaluator**

Persistir metrics `ai_provider_cost`, `human_cost`, `total_execution_cost`, `net_value`, `value_cost_ratio`, `value_per_human_hour` e `human_free_execution_rate`. Budget excedido produz `pause` ou approval econômico conforme policy antes do próximo efeito.

- [ ] **Step 8: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-economics.test.ts tests/action-engine-evaluator.test.ts tests/action-engine-execution.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add backend/src/modules/action-engine/economics.ts backend/src/modules/action-engine/types.ts backend/src/modules/action-engine/repository.ts backend/src/modules/action-engine/executor.ts backend/src/modules/action-engine/evaluator.ts backend/src/modules/action-engine/routes.ts backend/src/db/migrations/0128_action_engine_foundation.sql backend/tests/action-engine-economics.test.ts
git commit -m "feat: account for mission execution economics"
```

---

### Task 14: Replanning, approvals de ação e operações de exceção

**Files:**

- Modify: `backend/src/modules/action-engine/planner.ts`
- Modify: `backend/src/modules/action-engine/executor.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Create: `backend/tests/action-engine-replan.test.ts`

**Interfaces:**

- Consumes: evaluation conclusion, revisão ativa e observations.
- Produces: `proposeReplan()`, `decideApproval()`, `retryAction()`, `skipAction()`, `resolveHumanTask()`.

- [ ] **Step 1: Escrever testes de revision safety**

Plano v1 continua ativo enquanto v2 está proposto. Aprovar v2 supersede v1 atomicamente, mas não cancela efeito já concluído. Rejeitar v2 mantém v1/mission no estado coerente. Ambas as revisões preservam pack `0.1.0` e template hash; troca de pack version é proibida em missão ativa no MVP.

- [ ] **Step 2: Implementar diff material**

Classificar mudanças de capability, population, channel, budget, economics projection, risk, approval, ownership e steps removidos/adicionados. Validar deviations contra extension points; alteração de nó protegido falha, e qualquer ampliação material permitida exige `replan` approval.

- [ ] **Step 3: Implementar approval decision endpoint**

```text
POST /approvals/:approvalId/decide
```

Input: decision, comment, expected subject hash/version. `changes_requested` bloqueia subject e registra comentário sem mutar payload aprovado.

- [ ] **Step 4: Implementar action exception endpoints**

```text
POST /actions/:actionId/retry
POST /actions/:actionId/skip
POST /actions/:actionId/resolve-human-task
```

Skip exige reason e permission; não é permitido para step obrigatório sem failure policy compatível.

- [ ] **Step 5: Rodar testes**

```powershell
cd backend
npx vitest run tests/action-engine-replan.test.ts tests/action-engine-execution.test.ts tests/action-engine-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/modules/action-engine/planner.ts backend/src/modules/action-engine/executor.ts backend/src/modules/action-engine/routes.ts backend/tests/action-engine-replan.test.ts
git commit -m "feat: govern mission replanning and exceptions"
```

---

### Task 15: Tipos, service e regras puras do frontend

**Files:**

- Create: `frontend/src/types/actionEngine.ts`
- Create: `frontend/src/services/actionEngineService.ts`
- Create: `frontend/src/services/actionEngineService.test.ts`
- Create: `frontend/src/lib/action-engine/missionRules.ts`
- Create: `frontend/src/lib/action-engine/missionRules.test.ts`

**Interfaces:**

- Consumes: APIs das Tasks 6, 8, 10, 13 e 14.
- Produces: `actionEngineService`, display models e helpers de UI.

- [ ] **Step 1: Escrever mapping tests**

Cobrir snake_case backend para camelCase frontend, decimal strings, pack/version/hash, deviations, ownership, economics, metric `unknown`, approvals e deep links.

- [ ] **Step 2: Definir tipos alinhados ao backend**

Não criar states extras na UI. `MissionDetailResponse` inclui mission, actionPackVersion, activePlan, actions, ownership/conflicts, metrics, economics permitido para o viewer, latestEvaluation e pendingApprovals. A UI não calcula margem a partir de campos internos ocultos.

- [ ] **Step 3: Implementar service por `apiClient`**

Methods:

```ts
listMissions(filters)
listActionPacks()
getActionPackVersion(key, semanticVersion)
getMission(id)
createMission(input, idempotencyKey)
checkReadiness(input)
requestPlan(id, expectedVersion)
decideApproval(id, input)
startMission(id, expectedVersion)
pauseMission(id, expectedVersion, reason)
resumeMission(id, expectedVersion, reason)
cancelMission(id, expectedVersion, reason)
retryAction(id, reason)
resolveHumanTask(id, input)
```

- [ ] **Step 4: Implementar regras puras**

Helpers para progress, deadline, status labels, trajectory tone, pack conformance, economics ratios, allowed actions por state/permission e ordenação da timeline. `unknown`/`not_applicable` mostra `—` com explicação, nunca `0` ou infinito.

- [ ] **Step 5: Rodar testes**

```powershell
cd frontend
npx vitest run src/services/actionEngineService.test.ts src/lib/action-engine/missionRules.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/types/actionEngine.ts frontend/src/services/actionEngineService.ts frontend/src/services/actionEngineService.test.ts frontend/src/lib/action-engine/missionRules.ts frontend/src/lib/action-engine/missionRules.test.ts
git commit -m "feat: add action engine frontend contracts"
```

---

### Task 16: Dashboard e wizard de criação/readiness

**Files:**

- Create: `frontend/src/components/action-engine/MissionDashboard.tsx`
- Create: `frontend/src/components/action-engine/MissionDashboard.test.tsx`
- Create: `frontend/src/components/action-engine/MissionCreateWizard.tsx`
- Create: `frontend/src/components/action-engine/MissionCreateWizard.test.tsx`
- Create: `frontend/src/pages/action-engine/MissionsPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalMissionsPage.tsx`

**Interfaces:**

- Consumes: service/rules da Task 15, platform context e workspace path hooks.
- Produces: lista outcome-first e fluxo de criação do piloto.

- [ ] **Step 1: Escrever component tests de estados críticos**

Testar loading, empty, error, metric unknown, deadline, approvals, readiness block, provider warning, pack version/hash, economia e criação idempotente.

- [ ] **Step 2: Implementar dashboard compartilhado**

Props diferenciam internal/portal/client workspace sem duplicar lógica. Filtros: status, owner, outcome e prazo. Cards mostram target/progress, trajectory, budget, próximo passo e blockers.

- [ ] **Step 3: Implementar wizard em seis passos**

```text
Revenue Recovery Pack v0
target/prazo/população
baseline/readiness
budgets/taxa humana/guardrails
autonomia/ownership
revisão/criação
```

Default do pack: recovery revenue, versão `0.1.0`, 30 dias, inactive 14 dias, canary 20, mídia zero e taxa humana visível. O usuário confirma target, budgets e taxa; nenhum default invisível é executado.

- [ ] **Step 4: Mostrar fixes acionáveis**

Readiness item com `fixHref` abre a configuração relevante. `block` impede request plan; `warn` exige confirmação visível.

- [ ] **Step 5: Rodar testes**

```powershell
cd frontend
npx vitest run src/components/action-engine/MissionDashboard.test.tsx src/components/action-engine/MissionCreateWizard.test.tsx
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/components/action-engine/MissionDashboard.tsx frontend/src/components/action-engine/MissionDashboard.test.tsx frontend/src/components/action-engine/MissionCreateWizard.tsx frontend/src/components/action-engine/MissionCreateWizard.test.tsx frontend/src/pages/action-engine/MissionsPage.tsx frontend/src/pages/client-portal/PortalMissionsPage.tsx
git commit -m "feat: add mission dashboard and creation flow"
```

---

### Task 17: Detalhe, plano, execução, métricas e aprovações

**Files:**

- Create: `frontend/src/components/action-engine/MissionDetail.tsx`
- Create: `frontend/src/components/action-engine/MissionPlanPanel.tsx`
- Create: `frontend/src/components/action-engine/MissionExecutionTimeline.tsx`
- Create: `frontend/src/components/action-engine/MissionMetricsPanel.tsx`
- Create: `frontend/src/components/action-engine/MissionEconomicsPanel.tsx`
- Create: `frontend/src/components/action-engine/MissionApprovalsPanel.tsx`
- Create: `frontend/src/components/action-engine/MissionDetail.test.tsx`
- Create: `frontend/src/pages/action-engine/MissionDetailPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalMissionDetailPage.tsx`

**Interfaces:**

- Consumes: detail response e lifecycle methods.
- Produces: cockpit completo da missão.

- [ ] **Step 1: Escrever teste de jornada do operador**

Renderizar proposed plan com pack/hash/deviations/economia estimada, aprovar por hash/version, iniciar, ver action waiting approval, aprovar, abrir subprocesso/deep link, pausar e ver evaluation `off_track` com replan proposto e economia real.

- [ ] **Step 2: Implementar summary e controles de lifecycle**

Botões derivam de state + permission. Pause/cancel solicitam reason. Controles usam expectedVersion e tratam `409` recarregando detail antes de nova decisão.

- [ ] **Step 3: Implementar Plan panel**

Mostrar revision, pack key/version/hash, conformance, parameters, deviations, assumptions, risks, custo, DAG em lista por dependência, capability/version e diff de replan. Aprovação exibe exatamente hashes/versions.

- [ ] **Step 4: Implementar execution timeline**

Mostrar estado, tentativas, policy, evidence, custos, ownership e deep links. Automation flow aparece aninhado como subprocesso da action. Payload técnico completo fica em disclosure autorizado; nunca renderizar secrets.

- [ ] **Step 5: Implementar Metrics, Economics e Approvals**

Separar success, leading, guardrail e budget metrics. Economics mostra breakdown, horas, custo total, valor líquido, valor/custo, valor/hora e taxa sem intervenção com tratamento de `unknown/not_applicable`. Mostrar “Decisão computada” separada de “Análise da IA”. Approval cards exibem subject, impacto econômico, expiração e histórico.

- [ ] **Step 6: Rodar testes**

```powershell
cd frontend
npx vitest run src/components/action-engine/MissionDetail.test.tsx
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/action-engine frontend/src/pages/action-engine/MissionDetailPage.tsx frontend/src/pages/client-portal/PortalMissionDetailPage.tsx
git commit -m "feat: add mission control cockpit"
```

---

### Task 18: Rotas, navegação outcome-first e módulo contratado

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`
- Modify: `frontend/src/types/platform.ts`
- Modify: `backend/src/db/migrations/0128_action_engine_foundation.sql`

**Interfaces:**

- Consumes: pages das Tasks 16–17 e module activation atual.
- Produces: rotas internas, portal e client workspace; module key `action_engine`.

- [ ] **Step 1: Escrever navigation tests antes das rotas**

Verificar que Missões aparece quando ativo, não aparece sem entitlement, usa base path correto em portal/client workspace e breadcrumbs incluem a missão.

- [ ] **Step 2: Adicionar módulo `action_engine`**

Seed/catalog metadata deve classificá-lo como optional inicialmente. Crescimento YUX recebe o módulo habilitado na migration de forma idempotente, usando IDs/contexto existente sem criar organização duplicada.

- [ ] **Step 3: Registrar rotas**

```text
/missions
/missions/:missionId
/portal/missoes
/portal/missoes/:missionId
/client-workspaces/:organizationId/missoes
/client-workspaces/:organizationId/missoes/:missionId
```

- [ ] **Step 4: Preservar o Hub atual**

CRM, Marketing, Automations e Reports continuam navegáveis. Mission actions apontam para essas rotas pelo workspace path correto.

- [ ] **Step 5: Rodar testes e build**

```powershell
cd frontend
npx vitest run src/lib/platform/navigation.test.ts
npm run type-check
npm run build
```

Expected: PASS com apenas warnings de build já conhecidos.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts frontend/src/types/platform.ts backend/src/db/migrations/0128_action_engine_foundation.sql
git commit -m "feat: add objectives to yux navigation"
```

---

### Task 19: Integração ponta a ponta, degradação e isolamento

**Files:**

- Create: `backend/tests/action-engine-integration.test.ts`
- Modify: `backend/tests/tenant-route-access.test.ts`
- Modify: `backend/tests/domain-event-outbox.test.ts`
- Modify: `backend/tests/jobs.test.ts`
- Modify: `frontend/src/components/action-engine/MissionDetail.test.tsx`

**Interfaces:**

- Consumes: stack completa.
- Produces: prova automatizada do cenário de aceite sem provider real.

- [ ] **Step 1: Criar cenário E2E server-side**

Executar:

```text
create mission
readiness pass
Revenue Recovery Pack v0 loaded
plan valid and pack-conformant
approve by hash
start
acquire entity ownership
run read capabilities
create human task once
request external approval
approve canary
run versioned automation subprocess
simulate provider lifecycle events
record proposal/contract revenue
record AI/provider and human costs
evaluate success
```

- [ ] **Step 2: Testar falhas de infraestrutura**

Simular Redis enqueue failure após commit; confirmar evento pendente. Simular Agent Harness 500; missão volta/permanece em estado repetível. Simular provider timeout após idempotent effect; retry reconcilia sem duplicar.

- [ ] **Step 3: Testar kill switch e cancel race**

Enfileirar action, acionar kill switch/cancel antes do handler e confirmar zero chamadas ao command/provider.

- [ ] **Step 4: Testar pack, ownership e economia ponta a ponta**

Remover nó protegido e confirmar rejeição. Tentar automação standalone conflitante e confirmar bloqueio antes do efeito. Repetir callback/cost source e confirmar um cost entry. Resolver tarefa de 180 minutos a R$75/h e confirmar R$225, total/ratios e `not_applicable` quando denominador zero.

- [ ] **Step 5: Testar isolamento**

Admin/client de organização B não lista, lê, aprova nem descobre IDs da organização A. Capability input tentando injetar organization B é ignorado/rejeitado.

- [ ] **Step 6: Rodar backend completo**

```powershell
cd backend
npm test
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 7: Rodar frontend completo**

```powershell
cd frontend
npm test
npm run type-check
npm run build
```

Expected: PASS com warnings conhecidos documentados.

- [ ] **Step 8: Rodar Agent Harness completo**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest discover -s tests -v
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add backend/tests frontend/src/components/action-engine/MissionDetail.test.tsx
git commit -m "test: validate action engine end to end"
```

---

### Task 20: Runbook, observabilidade e canary Crescimento YUX

**Files:**

- Create: `docs/action-engine-operations.md`
- Modify: `docs/implementation-status.md`
- Modify: `backend/src/modules/health/routes.ts`
- Modify: `frontend/src/pages/platform/AdminHealthPage.tsx`
- Create: `backend/tests/action-engine-health.test.ts`

**Interfaces:**

- Consumes: scheduler, provider health, Agent Harness health e métricas operacionais.
- Produces: runbook e readiness operacional do rollout.

- [ ] **Step 1: Escrever health test**

Health deve distinguir Postgres, Redis, Agent Harness, mission scheduler, pack/hash ativo, ownership conflicts, cost ledger reconciliation e required providers. Provider opcional degradado não derruba health global, mas aparece no readiness da capability.

- [ ] **Step 2: Expor indicadores operacionais**

Admin Health mostra pending/blocked/failed actions, approvals expiradas, último scheduler tick, dead-letter deliveries, kill switches, ownership conflicts, cost entries sem source reconciliado e capability failure rate sem PII.

- [ ] **Step 3: Escrever runbook executável**

Incluir comandos/procedimentos exatos para:

```text
aplicar migration 0128
validar schema/context isolation
confirmar worker/schedulers
confirmar Agent Harness
ativar action_engine no Crescimento YUX
confirmar revenue_recovery@0.1.0 e hash
rodar shadow
ativar prepare
aprovar canary de 20
monitorar ownership/conflitos de automação
reconciliar custos de IA/provider e minutos humanos
pausar/cancelar missão
acionar kill switch
inspecionar/reconciliar tentativa
reprocessar delivery seguro
encerrar e revisar atribuição
```

- [ ] **Step 4: Atualizar status sem confundir repo e produção**

Registrar separadamente código implementado, migration/pack aplicados, providers configurados, ownership preflight habilitado, cost ledger reconciliado e canary concluído. Não afirmar live readiness apenas por testes locais.

- [ ] **Step 5: Executar release gates**

Rodar suites completas da Task 19, migration em banco descartável, browser QA das seis rotas e canary somente após checklist operacional aprovado.

- [ ] **Step 6: Commit**

```powershell
git add docs/action-engine-operations.md docs/implementation-status.md backend/src/modules/health/routes.ts frontend/src/pages/platform/AdminHealthPage.tsx backend/tests/action-engine-health.test.ts
git commit -m "docs: add action engine operations runbook"
```

---

## Required End-to-End Acceptance Scenario

O release não termina sem esta evidência auditável:

1. Admin abre Crescimento YUX, seleciona `revenue_recovery@0.1.0` e cria objetivo com target R$ 10.000, deadline 30 dias, lote canário 20, budgets e taxa humana.
2. Readiness encontra CRM e fonte de receita; uma conexão externa ausente aparece claramente sem virar métrica zero.
3. Agent Harness instancia o pack usando somente parâmetros/extension points e catálogo disponível.
4. Backend rejeita capability inválida, nó protegido ausente e deviation fora do pack; compila o plano válido.
5. Admin aprova exatamente pack version/hash, plan revision/hash, parâmetros, deviations e economia estimada exibidos.
6. Start cria action runs e evento na mesma transação.
7. Query identifica candidatos elegíveis respeitando exclusões e adquire ownership do canário.
8. Tarefas internas são criadas uma única vez mesmo com retry.
9. Mensagens externas aguardam aprovação.
10. Lote aprovado gera no máximo 20 efeitos, respeita suppression/consentimento e executa automation flow somente como subprocesso versionado.
11. Automação independente conflitante é bloqueada antes do efeito; flow da mesma missão mantém correlation.
12. Eventos duplicados de provider produzem uma observation e um cost entry por chave.
13. Tarefas humanas registram minutos reais com taxa congelada; reversão não edita lançamento original.
14. Pause/kill switch impede action/subprocesso já enfileirado de produzir novo efeito.
15. Métricas mostram known/unknown corretamente e apontam registros fonte.
16. Evaluation calcula custo total, valor líquido, valor/custo, valor/hora humana e taxa sem intervenção.
17. Evaluation abaixo do checkpoint propõe revisão 2 dentro do mesmo pack sem alterar revisão 1.
18. Approval de revisão 2 gera diff, supersede v1 e preserva histórico.
19. Receita confirmada atribuível atinge o target e conclui a missão, liberando ownership após reconciliação.
20. Usuário de outra organização não acessa qualquer artefato.
21. Relatório final mostra pack, outcome, economia, ações humanas, approvals, guardrails, ownership e atribuição.

## Self-Review Checklist

- [ ] Cada requisito funcional da spec está associado a pelo menos uma task.
- [ ] Nenhuma capability aspiracional aparece no catálogo executável.
- [ ] Planner instancia `revenue_recovery@0.1.0`; não existe caminho de DAG livre no piloto.
- [ ] Protected nodes, extension points, pack hash e pack immutability têm testes.
- [ ] Types de backend, Python output e frontend usam os mesmos states e schema version.
- [ ] Toda ação externa exige approval no MVP.
- [ ] Toda mutation de estado emite evento na mesma transação.
- [ ] Todos os efeitos usam idempotency key ponta a ponta.
- [ ] Automação mission-bound é subprocesso; automação independente consulta ownership.
- [ ] Attempt/tarefa e cost ledger são atômicos e reversões são append-only.
- [ ] Plan hash/version são verificados na aprovação e na execução.
- [ ] Pause/cancel/kill switch são checados no preflight final.
- [ ] Métrica unknown permanece distinta de zero.
- [ ] Ratios econômicos com denominador zero são `not_applicable`.
- [ ] Replan não muta revisão aprovada.
- [ ] Deep links respeitam portal versus client workspace.
- [ ] Testes cobrem isolamento entre organizações.
- [ ] Documentação distingue implementação local, deploy e canary.

## Execution Order

```text
Foundation: Tasks 1-6
Planning: Tasks 7-8
Execution: Tasks 9-14
Product UI: Tasks 15-18
Release proof: Tasks 19-20
```

Cada grupo deve terminar verde antes do próximo. Não habilitar effects externos durante Foundation/Planning. Não iniciar canary antes da Task 20 e revisão humana do runbook.
