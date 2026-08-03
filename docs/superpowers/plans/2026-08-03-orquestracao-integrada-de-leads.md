# Orquestração Integrada de Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base confiável e flexível que conecta formulários, CRM, funis, tarefas, sequências de comunicação, e-mails, scoring e múltiplas automações em uma única jornada auditável do lead.

**Architecture:** Toda mutation de negócio grava seu estado e um evento de domínio na mesma transação PostgreSQL por meio de um transactional outbox. Um dispatcher distribui cada evento para consumidores independentes; o consumidor de automações cria uma execução separada para cada fluxo compatível, permitindo fan-out sem acoplamento. Ações automáticas chamam comandos de domínio, nunca SQL direto, para que mudanças de funil, sequência, tarefa, e-mail e score produzam novos eventos com idempotência, correlação e proteção contra loops.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, BullMQ/Redis, React 18, Tailwind/shadcn, SMTP2GO, Vitest.

## Global Constraints

- Este plano é a Fase 0 e deve ser executado antes dos planos de Funis, Tarefas e Scoring de 2026-08-03.
- “Funil” significa pipeline/etapas do CRM; “sequência” significa uma cadência programada de e-mails, WhatsApp ou tarefas; automações conectam os dois.
- Uma mutation e seu evento são atômicos: ou ambos persistem, ou nenhum persiste.
- A resposta do formulário público não depende da disponibilidade do Redis; eventos pendentes permanecem no outbox.
- Um evento pode iniciar zero, uma ou várias automações publicadas.
- Cada automação recebe execução, retry, limite e erro independentes.
- Uma ação com retry não pode repetir seu efeito de negócio.
- A profundidade máxima de uma cadeia automática é 12.
- O mesmo fluxo não reentra na mesma cadeia, salvo quando `allow_reentry = TRUE` e o cooldown configurado tiver expirado.
- Todo evento carrega `organizationId`, `crmInstanceId` quando aplicável, `correlationId`, `causationId`, `actor`, `schemaVersion` e payload sanitizado.
- Todos os recursos referenciados por automação devem pertencer à mesma organização e instância CRM.
- E-mail de marketing exige opt-in válido, template publicado e URL de descadastro; supressões sempre prevalecem.
- Novas tabelas usam RLS forçada e não concedem acesso a `anon`.
- O runtime executa versões publicadas imutáveis; alterações em rascunho não afetam execuções em andamento.

---

## Event and Command Contracts

```ts
export type DomainEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string
  eventType: string
  schemaVersion: 1
  organizationId: string
  crmInstanceId?: string
  aggregateType: 'lead' | 'form_submission' | 'task' | 'sequence_enrollment' | 'email'
  aggregateId: string
  leadId?: string
  correlationId: string
  causationId?: string
  depth: number
  actor: { type: 'lead' | 'user' | 'system' | 'provider'; id?: string }
  occurredAt: string
  automationTrace: string[]
  payload: TPayload
}

export type LeadCommandContext = {
  organizationId: string
  crmInstanceId: string
  leadId: string
  idempotencyKey: string
  correlationId: string
  causationId: string
  depth: number
  automationTrace: string[]
  actor: DomainEventEnvelope['actor']
}
```

Eventos normalizados da primeira entrega:

- `lead.created`
- `form.submitted`
- `lead.pipeline_changed`
- `lead.stage_changed`
- `lead.owner_changed`
- `lead.task_created`
- `lead.task_completed`
- `lead.task_cancelled`
- `lead.interaction_recorded`
- `lead.sequence_enrolled`
- `lead.sequence_completed`
- `email.queued`
- `email.sent`
- `email.failed`
- `email.delivered`
- `email.opened`
- `email.clicked`
- `email.bounced`
- `email.complained`
- `email.unsubscribed`
- `lead.score_changed`
- `lead.score_threshold_reached`

## File Structure

- Create: `backend/src/db/migrations/0119_lead_orchestration_foundation.sql` — outbox, entregas, idempotência, reentrada e vínculos de e-mail.
- Create: `backend/src/modules/events/types.ts` — envelope canônico.
- Create: `backend/src/modules/events/repository.ts` — gravação transacional e claim do outbox.
- Create: `backend/src/modules/events/dispatcher.ts` — fan-out para consumidores.
- Create: `backend/src/jobs/handlers/domain-events.ts` — jobs do outbox.
- Create: `backend/src/jobs/handlers/crm-scoring.ts` — consumidor inicialmente passivo, ativado pelo plano de Scoring.
- Modify: `backend/src/jobs/queue.ts` — jobs `events.dispatchPending`, `events.consume.automation`, `events.consume.scoring` e `automation.executeRun`.
- Modify: `backend/src/worker.ts` — handlers e scheduler do outbox.
- Create: `backend/src/modules/automations/runtime.ts` — matching, runs independentes e versão congelada.
- Create: `backend/src/modules/automations/action-handlers.ts` — registro tipado de ações.
- Create: `backend/src/modules/crm/commands.ts` — comandos reutilizáveis de lead, funil, tarefa e sequência.
- Modify: `backend/src/jobs/handlers/automation.ts` — delegar ao runtime/handlers.
- Modify: `backend/src/modules/automations/repository.ts` — publicação atômica e recursos válidos.
- Modify: `backend/src/modules/automations/routes.ts` — validação de publicação e catálogo conectado.
- Modify: `backend/src/modules/lead-forms/repository.ts` — outbox no commit da submissão.
- Modify: `backend/src/modules/lead-forms/routes.ts` — remover dependência síncrona da fila.
- Modify: `backend/src/modules/crm/repository.ts` — usar comandos e eventos.
- Modify: `backend/src/modules/crm/scheduler.ts` — efeitos idempotentes e e-mail interno.
- Create: `backend/src/modules/email-delivery/service.ts` — envio canônico via SMTP2GO.
- Create: `backend/src/jobs/handlers/email.ts` — implementar `email.send`.
- Modify: `backend/src/modules/webhooks/routes.ts` — eventos SMTP2GO completos e idempotentes.
- Modify: `frontend/src/types/automation.ts` — ações, envelope e validação.
- Modify: `frontend/src/lib/automations/automationCatalog.ts` — gatilhos normalizados.
- Create: `frontend/src/services/automationResourceService.ts` — formulários, funis, etapas, sequências, templates e membros.
- Modify: `frontend/src/components/automations/AutomationGuidedBuilder.tsx` — selects conectados e ações novas.
- Create: `frontend/src/components/automations/AutomationImpactPanel.tsx` — dependências, fan-out e riscos.
- Create: `frontend/src/components/automations/JourneySimulationPanel.tsx` — simulação ponta a ponta sem escrita.
- Modify: `frontend/src/components/landing-pages/ExternalLeadFormsWorkspace.tsx` — rota padrão para funil/etapa.
- Modify: `frontend/src/pages/client-portal/PortalExternalLeadFormsPage.tsx` — carregar recursos CRM.
- Test: `backend/tests/domain-event-outbox.test.ts`
- Test: `backend/tests/automation-orchestration.test.ts`
- Test: `backend/tests/email-engagement-events.test.ts`
- Test: `backend/tests/lead-journey-integration.test.ts`
- Test: `frontend/src/components/automations/AutomationGuidedBuilder.test.tsx`
- Test: `frontend/src/components/automations/JourneySimulationPanel.test.tsx`

### Task 1: Transactional outbox e ledger de consumo

**Files:**
- Create: `backend/src/db/migrations/0119_lead_orchestration_foundation.sql`
- Modify: `backend/tests/schema-smoke.test.ts`

**Interfaces:**
- Produces: `domain_events`, `domain_event_deliveries`, `automation_action_effects`.
- Produces: um índice parcial para uma matrícula ativa por lead/sequência.

- [ ] **Step 1: Write failing schema tests**

```ts
expect(orchestrationMigration).toContain('CREATE TABLE public.domain_events')
expect(orchestrationMigration).toContain('CREATE TABLE public.domain_event_deliveries')
expect(orchestrationMigration).toContain('CREATE TABLE public.automation_action_effects')
expect(orchestrationMigration).toContain('idx_crm_sequence_one_active_enrollment')
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts`

Expected: FAIL porque a migration não existe.

- [ ] **Step 3: Create immutable event and delivery tables**

```sql
CREATE TABLE public.domain_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL,
  causation_id UUID,
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 12),
  actor JSONB NOT NULL,
  automation_trace UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  dispatch_status TEXT NOT NULL DEFAULT 'pending' CHECK (dispatch_status IN ('pending','dispatching','dispatched','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.domain_event_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.domain_events(id) ON DELETE CASCADE,
  consumer_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, consumer_key)
);
```

- [ ] **Step 4: Add effect and orchestration constraints**

```sql
CREATE TABLE public.automation_action_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.automation_execution_runs(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.automation_actions(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_crm_sequence_one_active_enrollment
  ON public.crm_sequence_enrollments(lead_id, sequence_id)
  WHERE status IN ('active','paused','manual');
```

Antes do índice, mantenha a matrícula ativa mais recente e marque as demais como `cancelled`. Adicione em `automation_flows`: `allow_reentry BOOLEAN NOT NULL DEFAULT FALSE` e `reentry_cooldown_minutes INTEGER NOT NULL DEFAULT 0`. Adicione `event_id`, `flow_version_id`, `correlation_id` e `automation_trace` a `automation_execution_runs`, com `UNIQUE(flow_id, event_id)`.

- [ ] **Step 5: Add email event identity and RLS**

Adicione `provider_event_id TEXT` a `email_send_events`, índice único parcial por evento do provedor e `lead_id UUID` a `email_send_requests`. Ative RLS forçada em todas as novas tabelas; políticas usam `organization_id`/`crm_instance_id` e funções privadas existentes. `domain_events` e deliveries são somente leitura para usuários autenticados e graváveis apenas pelo backend/service role.

- [ ] **Step 6: Run migration tests and commit**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts tests/migration-runner.test.ts`

```bash
git add backend/src/db/migrations/0119_lead_orchestration_foundation.sql backend/tests/schema-smoke.test.ts
git commit -m "feat: add lead orchestration outbox"
```

### Task 2: Envelope e gravação transacional de eventos

**Files:**
- Create: `backend/src/modules/events/types.ts`
- Create: `backend/src/modules/events/repository.ts`
- Create: `backend/tests/domain-event-outbox.test.ts`

**Interfaces:**
- Produces: `recordDomainEvent(client, input): Promise<DomainEventEnvelope>`.
- Produces: `claimPendingEvents(pool, limit): Promise<DomainEventEnvelope[]>`.
- Produces: `completeEventDispatch`, `failEventDispatch`, `completeDelivery`, `failDelivery`.

- [ ] **Step 1: Write failing repository tests**

```ts
const event = await recordDomainEvent(client, {
  eventType: 'lead.created', organizationId: ids.org, crmInstanceId: ids.instance,
  aggregateType: 'lead', aggregateId: ids.lead, leadId: ids.lead,
  actor: { type: 'system' }, payload: { source: 'form' },
})
expect(event.correlationId).toBe(event.eventId)
expect(event.depth).toBe(0)
```

Teste rollback: após `ROLLBACK`, nem o lead nem o evento existem.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/domain-event-outbox.test.ts`

- [ ] **Step 3: Implement envelope normalization**

Gere UUIDs no backend. Quando há evento pai, herde `correlationId`, defina `causationId = parent.eventId`, incremente `depth` e preserve `automationTrace`. Rejeite `depth > 12` com `domain_event_max_depth_reached`.

- [ ] **Step 4: Implement safe claiming**

```sql
SELECT *
FROM public.domain_events
WHERE dispatch_status IN ('pending','failed') AND available_at <= NOW()
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

No mesmo commit, marque como `dispatching` e incremente tentativas. Falha usa backoff exponencial limitado a 15 minutos; após 10 tentativas, mantenha `failed` para recuperação manual.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- --run tests/domain-event-outbox.test.ts && npm run type-check`

```bash
git add backend/src/modules/events backend/tests/domain-event-outbox.test.ts
git commit -m "feat: record transactional domain events"
```

### Task 3: Dispatcher e consumidores independentes

**Files:**
- Create: `backend/src/modules/events/dispatcher.ts`
- Create: `backend/src/jobs/handlers/domain-events.ts`
- Create: `backend/src/jobs/handlers/crm-scoring.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/tests/domain-event-outbox.test.ts`

**Interfaces:**
- Produces jobs: `events.dispatchPending`, `events.consume.automation`, `events.consume.scoring`.
- Consumer keys: `automation` e `scoring`; scoring ignora eventos não catalogados sem falhar.

- [ ] **Step 1: Write failing fan-out tests**

```ts
expect(deliveries).toEqual(expect.arrayContaining([
  expect.objectContaining({ consumer_key: 'automation' }),
  expect.objectContaining({ consumer_key: 'scoring' }),
]))
expect(queue.jobs.filter(job => job.data.eventId === ids.event)).toHaveLength(2)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/domain-event-outbox.test.ts`

- [ ] **Step 3: Implement dispatcher fan-out**

Crie deliveries com `ON CONFLICT DO NOTHING`; use `jobId = ${consumerKey}:${eventId}`. Marque o evento `dispatched` somente depois que todos os jobs forem aceitos pela fila. Se Redis falhar, o evento volta a `failed` e será retomado sem duplicar deliveries.

- [ ] **Step 4: Register worker, passive scoring consumer and scheduler**

O worker agenda `events.dispatchPending` a cada 5 segundos com `jobId` por janela de tempo. O job reclama no máximo 100 eventos e não faz polling bloqueante. Até a Fase de Scoring, `events.consume.scoring` marca a delivery como concluída com resultado `{ ignored: 'scoring_not_enabled' }`; o plano de Scoring substitui esse comportamento pelo engine real.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- --run tests/domain-event-outbox.test.ts && npm run type-check`

```bash
git add backend/src/modules/events/dispatcher.ts backend/src/jobs/handlers/domain-events.ts backend/src/jobs/handlers/crm-scoring.ts backend/src/jobs/queue.ts backend/src/worker.ts backend/tests/domain-event-outbox.test.ts
git commit -m "feat: dispatch domain events reliably"
```

### Task 4: Fan-out de automações e versão publicada imutável

**Files:**
- Create: `backend/src/modules/automations/runtime.ts`
- Modify: `backend/src/modules/automations/repository.ts`
- Modify: `backend/src/modules/automations/routes.ts`
- Modify: `backend/src/jobs/handlers/automation.ts`
- Create: `backend/tests/automation-orchestration.test.ts`

**Interfaces:**
- Produces: `matchAutomationFlows(pool, event): Promise<MatchedFlow[]>`.
- Produces: `createAutomationRuns(pool, event, flows): Promise<string[]>`.
- Produces job: `automation.executeRun` por fluxo.

- [ ] **Step 1: Write failing multi-flow tests**

```ts
const result = await consumeAutomationEvent(pool, queue, formSubmittedEvent)
expect(result.matchedFlowIds).toEqual([ids.flowAssign, ids.flowNurture])
expect(queue.jobs.filter(job => job.name === 'automation.executeRun')).toHaveLength(2)
```

Faça um fluxo falhar e confirme que o outro termina `completed`.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/automation-orchestration.test.ts`

- [ ] **Step 3: Match all flows, not only one**

Triggers do mesmo fluxo são OR. Condições do grupo padrão são AND; grupos futuros não alteram esta semântica. Cada fluxo compatível cria run com `UNIQUE(flow_id,event_id)` e job próprio.

- [ ] **Step 4: Execute frozen published snapshots**

Ao publicar, grave trigger/condições/ações no `automation_flow_versions.snapshot`, defina `active_version_id` e incremente `published_version` na mesma transação. O runtime lê exclusivamente esse snapshot; rejeite fluxo publicado sem versão ativa com `automation_active_version_required`.

- [ ] **Step 5: Add reentry and depth guard**

Se `flow.id` já estiver em `event.automationTrace`, bloqueie com `automation_loop_prevented`, exceto quando `allow_reentry` estiver ativo e não houver run do mesmo fluxo/correlation após o cooldown. Sempre bloqueie profundidade 12.

- [ ] **Step 6: Run tests and commit**

Run: `cd backend && npm test -- --run tests/automation-orchestration.test.ts tests/automation-routes.test.ts && npm run type-check`

```bash
git add backend/src/modules/automations backend/src/jobs/handlers/automation.ts backend/tests/automation-orchestration.test.ts backend/tests/automation-routes.test.ts
git commit -m "feat: fan out immutable automation runs"
```

### Task 5: Comandos de domínio e ações idempotentes

**Files:**
- Create: `backend/src/modules/crm/commands.ts`
- Create: `backend/src/modules/automations/action-handlers.ts`
- Modify: `backend/src/modules/crm/repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Modify: `backend/src/jobs/handlers/automation.ts`
- Modify: `backend/tests/automation-orchestration.test.ts`

**Interfaces:**
- Produces commands:
  - `moveLeadToPipeline(client, context, { pipelineId, stageId })`
  - `moveLeadToStage(client, context, { stageId })`
  - `assignLeadOwner(client, context, { ownerMemberId, teamId? })`
  - `createLeadTaskCommand(client, context, input)`
  - `enrollLeadInSequenceCommand(client, context, input)`
  - `pauseLeadSequenceCommand(client, context, input)`
  - `addLeadTagCommand(client, context, input)`
- Produces action types: `move_to_pipeline`, `change_stage`, `assign_owner`, `create_task`, `enroll_sequence`, `pause_sequence`, `add_tag`, `send_email`, `send_whatsapp`, `adjust_score`.

- [ ] **Step 1: Write failing cross-module action tests**

```ts
expect(await executeAction('move_to_pipeline', { pipelineId: ids.pipelineB, stageId: ids.stageB }, context))
  .toMatchObject({ pipelineId: ids.pipelineB, stageId: ids.stageB })
expect(recordedEvents.map(event => event.event_type)).toEqual(expect.arrayContaining([
  'lead.pipeline_changed', 'lead.stage_changed',
]))
```

Repita o mesmo `idempotencyKey` e confirme um único efeito/evento.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/automation-orchestration.test.ts`

- [ ] **Step 3: Implement commands transactionally**

Cada comando abre ou recebe transação, bloqueia o lead, valida organização/instância e grava o evento pelo `recordDomainEvent`. Ao mover entre funis, atualize `pipeline_id` e `stage_id` juntos e grave histórico com origem/destino.

- [ ] **Step 4: Implement action effect claims**

Antes do comando, insira `automation_action_effects` com chave `${runId}:${versionActionId}`. Conflito com status `completed` retorna o resultado anterior; `processing` recente gera retry; `failed` pode ser reclamado e incrementa tentativa.

- [ ] **Step 5: Remove direct CRM SQL from automation handler**

`dispatchAction` passa a resolver um handler no registro e nunca executa `UPDATE leads`, `INSERT lead_tasks` ou `INSERT crm_sequence_enrollments` diretamente. As rotas manuais de criar lead, mover etapa, criar/concluir tarefa e registrar interação também chamam os mesmos comandos, garantindo eventos iguais para ações humanas e automáticas.

- [ ] **Step 6: Run tests and commit**

Run: `cd backend && npm test -- --run tests/automation-orchestration.test.ts tests/crm-routes.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/commands.ts backend/src/modules/crm/repository.ts backend/src/modules/crm/routes.ts backend/src/modules/automations/action-handlers.ts backend/src/jobs/handlers/automation.ts backend/tests/automation-orchestration.test.ts
git commit -m "feat: execute idempotent lead commands"
```

### Task 6: Formulários como origem configurável da jornada

**Files:**
- Modify: `backend/src/modules/lead-forms/repository.ts`
- Modify: `backend/src/modules/lead-forms/routes.ts`
- Modify: `backend/src/modules/landing-pages/routes.ts`
- Modify: `backend/tests/lead-form-routes.test.ts`
- Modify: `backend/tests/external-lead-form-management.test.ts`
- Modify: `frontend/src/components/landing-pages/ExternalLeadFormsWorkspace.tsx`
- Modify: `frontend/src/pages/client-portal/PortalExternalLeadFormsPage.tsx`
- Modify: `frontend/src/services/landingPageService.ts`

**Interfaces:**
- Produces: formulário com `pipelineId?` e `initialStageId?` editáveis.
- Produces event `form.submitted` para toda submissão única aceita e `lead.created` apenas para lead novo.

- [ ] **Step 1: Write failing form journey tests**

```ts
expect(response.statusCode).toBe(201)
expect(outboxEvents.map(event => event.event_type)).toEqual(['lead.created', 'form.submitted'])
expect(outboxEvents.at(-1)?.payload).toMatchObject({ formId: ids.form, submissionId: ids.submission })
expect(jobQueue.jobs).toHaveLength(0)
```

Para e-mail já existente, espere apenas `form.submitted` e histórico novo de submissão.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/lead-form-routes.test.ts tests/external-lead-form-management.test.ts`

- [ ] **Step 3: Record events inside the submission transaction**

Use `eventId` determinístico por submissão/idempotência. `form.submitted` inclui form, origem, UTMs, perfil, país e consentimento sanitizado; nunca inclua token público. Remova `app.jobQueue.add` da rota pública. Preserve rate limit, validação de origem/CORS, tamanho máximo do payload e resposta pública sem detalhes internos.

- [ ] **Step 4: Expose default pipeline routing**

Criação/edição do formulário aceita pipeline e etapa da mesma instância. Se ausentes, use pipeline padrão apenas para criar o lead; automações podem movê-lo depois. Rejeite combinação de etapa pertencente a outro pipeline.

- [ ] **Step 5: Add connected frontend selectors**

No formulário externo, carregue pipelines/etapas e mostre “Funil inicial” e “Etapa inicial”. Explique que automações disparadas por `form.submitted` podem substituir essa rota e iniciar múltiplas sequências.

- [ ] **Step 6: Run checks and commit**

Run: `cd backend && npm test -- --run tests/lead-form-routes.test.ts tests/external-lead-form-management.test.ts && npm run type-check && cd ../frontend && npm test -- --run src/components/landing-pages/ExternalLeadFormsWorkspace.test.tsx && npm run type-check`

```bash
git add backend/src/modules/lead-forms backend/src/modules/landing-pages/routes.ts backend/tests/lead-form-routes.test.ts backend/tests/external-lead-form-management.test.ts frontend/src/components/landing-pages/ExternalLeadFormsWorkspace.tsx frontend/src/pages/client-portal/PortalExternalLeadFormsPage.tsx frontend/src/services/landingPageService.ts
git commit -m "feat: connect forms to lead journeys"
```

### Task 7: Matrícula em sequências e execução interna de e-mail

**Files:**
- Modify: `backend/src/modules/crm/commands.ts`
- Modify: `backend/src/modules/crm/scheduler.ts`
- Create: `backend/src/modules/email-delivery/service.ts`
- Create: `backend/src/jobs/handlers/email.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/tests/crm-scheduler.test.ts`
- Create: `backend/tests/email-engagement-events.test.ts`

**Interfaces:**
- `enroll_sequence` payload: `{ sequenceId, existingEnrollment: 'skip' | 'resume' | 'restart' }`.
- `send_email` payload: `{ templateId, emailKind, variables, delayMinutes? }`.
- Produces events `lead.sequence_enrolled`, `email.queued`, `email.sent`, `lead.sequence_completed`.

- [ ] **Step 1: Write failing enrollment and e-mail tests**

```ts
expect(await enroll({ existingEnrollment: 'skip' })).toMatchObject({ duplicate: true })
expect(await enroll({ existingEnrollment: 'restart' })).toMatchObject({ currentStepIndex: 0, status: 'active' })
expect(emailRequest).toMatchObject({ lead_id: ids.lead, template_version_id: ids.publishedTemplateVersion })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-scheduler.test.ts tests/email-engagement-events.test.ts`

- [ ] **Step 3: Implement explicit enrollment behavior**

Valide sequência ativa da organização. `skip` retorna matrícula ativa; `resume` reativa preservando passo; `restart` zera passo e agenda agora. Cada efeito grava evento idempotente.

- [ ] **Step 4: Route sequence e-mails through email.send**

O scheduler não chama N8N para `email`. Crie `email_send_requests` com `lead_id`, template/version publicados, consentimento e chave `${executionId}:email`; grave `email.queued` e enfileire `email.send`. WhatsApp continua no adaptador atual até receber serviço interno equivalente.

- [ ] **Step 5: Implement email.send**

Cheque supressão e opt-in, renderize versão publicada, envie via `sendConfiguredSmtp2GoEmail`, atualize request e grave `email.sent` ou `email.failed` conforme resultado imediato. Retry usa a mesma request e chave.

- [ ] **Step 6: Run tests and commit**

Run: `cd backend && npm test -- --run tests/crm-scheduler.test.ts tests/email-engagement-events.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/commands.ts backend/src/modules/crm/scheduler.ts backend/src/modules/email-delivery/service.ts backend/src/jobs/handlers/email.ts backend/src/worker.ts backend/tests/crm-scheduler.test.ts backend/tests/email-engagement-events.test.ts
git commit -m "feat: connect automations sequences and email"
```

### Task 8: Eventos de engajamento do SMTP2GO

**Files:**
- Modify: `backend/src/modules/webhooks/routes.ts`
- Modify: `backend/tests/webhook-routes.test.ts`
- Modify: `backend/tests/email-engagement-events.test.ts`

**Interfaces:**
- Produces normalized events: delivered, opened, clicked, bounced, complained, unsubscribed.
- Resolves request/lead by `provider_message_id` or header `X-YUX-Send-Request-ID`.

- [ ] **Step 1: Write failing webhook tests**

```ts
expect((await postSmtp2Go({ event: 'open', message_id: 'provider-1', event_id: 'event-open-1' })).statusCode).toBe(200)
expect(emailEvents).toContainEqual(expect.objectContaining({ event_type: 'opened', provider_event_id: 'event-open-1' }))
expect(domainEvents).toContainEqual(expect.objectContaining({ event_type: 'email.opened', lead_id: ids.lead }))
```

Repita o webhook e confirme `duplicate: true` sem score/evento extra.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/webhook-routes.test.ts tests/email-engagement-events.test.ts`

- [ ] **Step 3: Normalize and persist provider events**

Mapeie `delivered`, `open`, `click`, `bounce`, `spam/complaint`, `unsubscribe`. Deduplique pelo identificador do provedor; quando ele não existir, gere uma chave determinística com hash de tipo, message ID, destinatário e timestamp informado pelo provedor. Insira em `email_send_events` com `ON CONFLICT(provider_event_id) DO NOTHING`, atualize status da request quando aplicável e mantenha supressão para bounce/complaint/unsubscribe.

- [ ] **Step 4: Emit lead engagement events transactionally**

Quando request tiver `lead_id`, grave evento no outbox com `actor.type = 'provider'`, `aggregateType = 'email'`, `aggregateId = request.id`, URL clicada sanitizada e sem corpo/provider payload completo.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- --run tests/webhook-routes.test.ts tests/email-engagement-events.test.ts && npm run type-check`

```bash
git add backend/src/modules/webhooks/routes.ts backend/tests/webhook-routes.test.ts backend/tests/email-engagement-events.test.ts
git commit -m "feat: emit SMTP2GO engagement events"
```

### Task 9: Builder conectado, validação de impacto e simulação

**Files:**
- Modify: `frontend/src/types/automation.ts`
- Modify: `frontend/src/lib/automations/automationCatalog.ts`
- Create: `frontend/src/services/automationResourceService.ts`
- Modify: `frontend/src/components/automations/AutomationGuidedBuilder.tsx`
- Create: `frontend/src/components/automations/AutomationImpactPanel.tsx`
- Create: `frontend/src/components/automations/JourneySimulationPanel.tsx`
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Modify: `frontend/src/components/automations/AutomationGuidedBuilder.test.tsx`
- Create: `frontend/src/components/automations/JourneySimulationPanel.test.tsx`

**Interfaces:**
- Produces resources: `{ forms, pipelines, stages, sequences, emailTemplates, members, teams, tags }`.
- Produces publish validation: `{ valid, errors, warnings, matchedAutomationCount, possibleCycleFlowIds }`.

- [ ] **Step 1: Write failing connected-builder tests**

```tsx
expect(screen.getByLabelText(/formulário de origem/i)).toHaveTextContent('Formulário YUXQuant')
expect(screen.getByLabelText(/funil de destino/i)).toHaveTextContent('Comercial')
expect(screen.getByLabelText(/sequência/i)).toHaveTextContent('Nutrição 7 dias')
expect(screen.queryByPlaceholderText(/stage-id|sequence-id|template-id/i)).not.toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd frontend && npm test -- --run src/components/automations/AutomationGuidedBuilder.test.tsx src/components/automations/JourneySimulationPanel.test.tsx`

- [ ] **Step 3: Add connected actions and triggers**

Trigger `form.submitted` oferece select de formulário. `move_to_pipeline` oferece funil e etapa dependente. `enroll_sequence` oferece sequência e comportamento de matrícula. `send_email` oferece template publicado e categoria. `adjust_score` oferece dimensão, pontos e motivo.

- [ ] **Step 4: Implement impact validation**

Antes de publicar, bloqueie recursos ausentes/inativos, etapa fora do funil, template sem versão, marketing sem opt-in policy, fluxo sem ação, referência de outra organização e ciclo direto sem reentrada/cooldown. Mostre que um gatilho pode iniciar outras automações publicadas.

- [ ] **Step 5: Implement dry-run journey simulation**

Selecione um lead e evento, resolva todos os fluxos compatíveis, condições e ações em ordem sem gravar. Exiba mudanças previstas de pipeline/etapa, matrículas, mensagens, tarefas e score, além de bloqueios e fan-out.

- [ ] **Step 6: Run tests and commit**

Run: `cd frontend && npm test -- --run src/components/automations/AutomationGuidedBuilder.test.tsx src/components/automations/JourneySimulationPanel.test.tsx && npm run type-check`

```bash
git add frontend/src/types/automation.ts frontend/src/lib/automations/automationCatalog.ts frontend/src/services/automationResourceService.ts frontend/src/components/automations/AutomationGuidedBuilder.tsx frontend/src/components/automations/AutomationImpactPanel.tsx frontend/src/components/automations/JourneySimulationPanel.tsx frontend/src/components/automations/AutomationWorkspace.tsx frontend/src/components/automations/AutomationGuidedBuilder.test.tsx frontend/src/components/automations/JourneySimulationPanel.test.tsx
git commit -m "feat: connect the lead journey automation builder"
```

### Task 10: Observabilidade e teste ponta a ponta

**Files:**
- Create: `backend/tests/lead-journey-integration.test.ts`
- Modify: `backend/src/modules/automations/routes.ts`
- Modify: `backend/src/modules/automations/repository.ts`
- Create: `frontend/src/components/automations/LeadJourneyTimeline.tsx`
- Modify: `frontend/src/components/crm/Lead360Panel.tsx`
- Create: `frontend/src/components/automations/LeadJourneyTimeline.test.tsx`

**Interfaces:**
- Produces: `GET /api/automations/leads/:leadId/journey`.
- Response groups events, deliveries, runs, steps, effects, sequence executions, email events and scoring events by `correlationId`.

- [ ] **Step 1: Write the full integration test**

```ts
expect(journey.events.map(event => event.eventType)).toEqual(expect.arrayContaining([
  'lead.created', 'form.submitted', 'lead.sequence_enrolled', 'email.sent',
  'email.opened', 'lead.score_changed', 'lead.stage_changed',
]))
expect(journey.automationRuns.filter(run => run.triggerEventType === 'form.submitted')).toHaveLength(2)
expect(journey.lead).toMatchObject({ pipelineId: ids.salesPipeline, stageId: ids.qualifiedStage })
```

O cenário usa um formulário, dois fluxos disparados pelo mesmo evento, matrícula em sequência, e-mail aberto, aumento de intenção e um terceiro fluxo movendo o lead.

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npm test -- --run tests/lead-journey-integration.test.ts`

- [ ] **Step 3: Implement journey query**

Consulta por lead e organização, limita 200 eventos recentes e hidrata apenas registros relacionados. Nunca retorne `protected_error`, provider payload bruto, conteúdo completo do e-mail ou segredos.

- [ ] **Step 4: Add Lead 360 timeline**

Mostre evento, automações iniciadas, ações, sequência, e-mail, score e mudança de funil numa linha temporal. Falhas exibem código sanitizado, tentativas e botão de retry apenas para papéis autorizados.

- [ ] **Step 5: Verify loop and failure isolation**

No teste integrado, adicione um fluxo circular e confirme `automation_loop_prevented`; faça uma das duas automações falhar e confirme que a outra continua e que o evento permanece auditável.

- [ ] **Step 6: Run complete verification**

Run: `cd backend && npm test -- --run && npm run build && cd ../frontend && npm test -- --run && npm run build`

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/automations/routes.ts backend/src/modules/automations/repository.ts backend/tests/lead-journey-integration.test.ts frontend/src/components/automations/LeadJourneyTimeline.tsx frontend/src/components/automations/LeadJourneyTimeline.test.tsx frontend/src/components/crm/Lead360Panel.tsx
git commit -m "feat: add observable lead journeys"
```

## Required End-to-End Acceptance Scenario

1. O formulário externo “YUXQuant” recebe uma submissão única.
2. Lead e submissão são persistidos junto com `lead.created` e `form.submitted`; Redis pode estar indisponível sem perder o evento.
3. `form.submitted` inicia duas automações publicadas independentes:
   - Automação A move o lead para Funil Comercial / Novo, atribui responsável e cria tarefa.
   - Automação B matricula o lead em “Nutrição 7 dias”.
4. A sequência envia e-mail por template publicado e SMTP2GO, respeitando opt-in e supressão.
5. SMTP2GO informa abertura; `email.opened` é gravado uma vez mesmo com webhook repetido.
6. Scoring aplica regra de intenção e emite `lead.score_changed`/`lead.score_threshold_reached`.
7. Uma terceira automação reage ao limiar e move o lead para Qualificado, atualizando funil e etapa de forma consistente.
8. Timeline do lead mostra toda a correlação, as três automações, ações, e-mail, score e mudanças de CRM.
9. Reprocessar qualquer job não duplica lead, tarefa, matrícula, e-mail, score ou transição.
10. Um ciclo configurado é bloqueado e não impede outros fluxos do mesmo evento.
