# Scoring de Leads por Ações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada cliente configure pontos positivos ou negativos ligados a ações e atributos do lead, mantendo score de fit separado do score de intenção, score combinado e histórico auditável.

**Architecture:** Cada instância CRM possui um modelo ativo com pesos e regras. Eventos de domínio (`lead.created`, `landing_page.form_submitted`, `lead.stage_changed`, eventos de tarefas e `lead.interaction_recorded`) entram em um job idempotente `crm.score-event`. O worker avalia regras, grava eventos append-only e recalcula `fit_score`, `intent_score` e `score` sob lock transacional.

**Tech Stack:** React 18, TypeScript, Tailwind/shadcn, Fastify, BullMQ/job queue existente, PostgreSQL, Vitest.

## Global Constraints

- Este plano consome os eventos e helper dos planos de Funis e Tarefas.
- `fit_score` e `intent_score` permanecem separados, ambos entre 0 e 100.
- `score` é o valor combinado arredondado: `(fit * fit_weight + intent * intent_weight) / 100`.
- Pesos devem ser inteiros entre 0 e 100 e somar exatamente 100.
- Eventos de score são append-only; correção manual cria evento inverso, nunca altera histórico.
- A mesma regra não pontua duas vezes para o mesmo `event_key`.
- Todo evento identifica `actorType: 'lead' | 'user' | 'system'`; a interface alerta quando uma ação interna da equipe é usada para alterar intenção.
- Apenas `manager`, `client_admin`, `yux_admin` e `yux_operator` configuram regras; sellers visualizam histórico.
- Reprocessamento em massa exige confirmação e fica limitado à instância CRM atual.

---

## File Structure

- Create: `backend/src/db/migrations/0121_lead_scoring_rules.sql` — modelos, regras, eventos e índices.
- Create: `backend/src/modules/crm/scoring-repository.ts` — CRUD e leitura do histórico.
- Create: `backend/src/modules/crm/scoring-engine.ts` — avaliação determinística e transacional.
- Create: `backend/src/jobs/handlers/crm-scoring.ts` — consumidor de eventos.
- Modify: `backend/src/jobs/queue.ts` — nome `crm.score-event`.
- Modify: `backend/src/worker.ts` — registro do handler.
- Modify: `backend/src/modules/crm/routes.ts` — configuração, simulação, ajuste manual e histórico.
- Modify: `backend/src/modules/crm/repository.ts` — publicar `lead.interaction_recorded`.
- Modify: `backend/src/modules/lead-forms/routes.ts` — publicar `landing_page.form_submitted`.
- Modify: `backend/tests/crm-scoring.test.ts` — engine e idempotência.
- Modify: `backend/tests/crm-routes.test.ts` — API e autorização.
- Modify: `frontend/src/types/crm.ts` — fit, intenção, modelo, regra e evento.
- Create: `frontend/src/services/crmScoringService.ts` — API tipada.
- Create: `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.tsx` — configuração.
- Create: `frontend/src/components/crm/scoring/ScoringModelForm.tsx` — pesos e faixas.
- Create: `frontend/src/components/crm/scoring/ScoringRuleEditor.tsx` — regras por ação.
- Create: `frontend/src/components/crm/scoring/LeadScoreBreakdown.tsx` — histórico no Lead 360.
- Modify: `frontend/src/components/crm/Lead360Panel.tsx` — aba Pontuação.
- Modify: `frontend/src/lib/platform/navigation.ts` — item “Pontuação de leads”.
- Modify: `frontend/src/App.tsx` — rota `/portal/comercial/scoring` e equivalente contextual.

### Task 1: Modelo de dados e backfill

**Files:**
- Create: `backend/src/db/migrations/0121_lead_scoring_rules.sql`
- Test: `backend/tests/schema-smoke.test.ts`

**Interfaces:**
- Produces tables: `lead_scoring_models`, `lead_scoring_rules`, `lead_score_events`.

- [ ] **Step 1: Write failing schema assertions**

```ts
expect(scoringMigration).toContain('CREATE TABLE public.lead_scoring_models')
expect(scoringMigration).toContain('CREATE TABLE public.lead_scoring_rules')
expect(scoringMigration).toContain('CREATE TABLE public.lead_score_events')
expect(scoringMigration).toContain('UNIQUE (rule_id, event_key)')
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts`

- [ ] **Step 3: Create model and rules tables**

```sql
CREATE TABLE public.lead_scoring_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fit_weight INTEGER NOT NULL DEFAULT 40 CHECK (fit_weight BETWEEN 0 AND 100),
  intent_weight INTEGER NOT NULL DEFAULT 60 CHECK (intent_weight BETWEEN 0 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fit_weight + intent_weight = 100)
);

CREATE TABLE public.lead_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.lead_scoring_models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('fit', 'intent')),
  event_type TEXT NOT NULL,
  field_path TEXT,
  operator TEXT CHECK (operator IS NULL OR operator IN ('equals','not_equals','contains','greater_than','less_than','exists')),
  comparison_value JSONB,
  points INTEGER NOT NULL CHECK (points BETWEEN -100 AND 100 AND points <> 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_lead_scoring_one_active_model
  ON public.lead_scoring_models(crm_instance_id)
  WHERE is_active = TRUE;
```

- [ ] **Step 4: Create append-only event table and indexes**

```sql
CREATE TABLE public.lead_score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.lead_scoring_rules(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('fit', 'intent')),
  points INTEGER NOT NULL,
  previous_score INTEGER NOT NULL,
  resulting_score INTEGER NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, event_key)
);
```

Adicione índices `(lead_id, occurred_at DESC)` e `(crm_instance_id, event_type, occurred_at DESC)`. Crie um modelo padrão 40/60 para instâncias ativas que ainda não tenham modelo. Antes do índice único, mantenha ativo apenas o modelo mais recentemente atualizado por instância.

Ative `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` nas três tabelas. Para modelos e eventos, use políticas `USING`/`WITH CHECK` baseadas em `private.can_access_crm_instance(crm_instance_id)`. Para regras, valide o acesso por `EXISTS` no modelo pai. Conceda somente `SELECT, INSERT, UPDATE` a `authenticated` e `service_role`; não conceda `DELETE`, pois regras e modelos são desativados logicamente.

- [ ] **Step 5: Run migration tests and commit**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts tests/migration-runner.test.ts`

```bash
git add backend/src/db/migrations/0121_lead_scoring_rules.sql backend/tests/schema-smoke.test.ts
git commit -m "feat: add lead scoring model"
```

### Task 2: Engine determinístico e idempotente

**Files:**
- Create: `backend/src/modules/crm/scoring-engine.ts`
- Create: `backend/tests/crm-scoring.test.ts`

**Interfaces:**
- Produces: `applyLeadScoringEvent(pool, event): Promise<ScoringResult>`.
- Event contract: `{ eventKey, type, organizationId, crmInstanceId, leadId, actorType, occurredAt, payload }`.

- [ ] **Step 1: Write failing engine tests**

```ts
expect(await applyLeadScoringEvent(pool, taskCompleted)).toMatchObject({
  appliedRules: 1, fitScore: 40, intentScore: 15, combinedScore: 25,
})
expect((await applyLeadScoringEvent(pool, taskCompleted)).appliedRules).toBe(0)
```

Inclua clamp em 0/100, regra de atributo no `lead.created`, pontos negativos e duas regras em dimensões diferentes.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-scoring.test.ts`

- [ ] **Step 3: Implement condition evaluation as pure functions**

```ts
export function matchesScoringRule(rule: ScoringRule, context: Record<string, unknown>): boolean
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}
export function combinedScore(fit: number, intent: number, fitWeight: number, intentWeight: number): number {
  return Math.round((fit * fitWeight + intent * intentWeight) / 100)
}
```

Resolva `field_path` apenas por segmentos alfanuméricos e `_`; não execute expressões.

- [ ] **Step 4: Implement atomic application**

Abra transação, bloqueie lead `FOR UPDATE`, carregue modelo/regras ativas, insira `lead_score_events` com `ON CONFLICT (rule_id, event_key) DO NOTHING`, some apenas inserções novas e atualize os três scores.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- --run tests/crm-scoring.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/scoring-engine.ts backend/tests/crm-scoring.test.ts
git commit -m "feat: add idempotent lead scoring engine"
```

### Task 3: Job de scoring e publicação dos eventos restantes

**Files:**
- Create: `backend/src/jobs/handlers/crm-scoring.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/modules/crm/domain-events.ts`
- Modify: `backend/src/modules/crm/repository.ts`
- Test: `backend/tests/crm-scoring.test.ts`
- Test: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Consumes: eventos de Funis e Tarefas.
- Produces: job `crm.score-event` e evento `lead.interaction_recorded`.

- [ ] **Step 1: Write failing queue tests**

```ts
expect(jobQueue.jobs.map(job => job.name)).toContain('crm.score-event')
expect(jobQueue.jobs.at(-1)?.data.event.type).toBe('lead.interaction_recorded')
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-scoring.test.ts tests/crm-routes.test.ts`

- [ ] **Step 3: Register job and handler**

```ts
if (job.name === 'crm.score-event') {
  return handleCrmScoring(pool, job.data)
}
```

O helper `enqueueCrmDomainEvent` deve enviar o mesmo evento para `automation.dispatch` e `crm.score-event`, cada consumidor com idempotência própria.

- [ ] **Step 4: Publish interaction events**

Ao criar um lead manualmente, publique `lead.created`. Ao criar `call`, `email`, `meeting` ou `note`, publique `lead.interaction_recorded` com `interactionId`, `interactionType`, `leadId` e `eventId = interactionId`. Ao aceitar formulário externo, publique também `landing_page.form_submitted` com `eventId = ${formId}:${idempotencyKey}`; mantenha o `lead.created` já existente apenas para leads novos. Preserve as respostas HTTP atuais.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- --run tests/crm-scoring.test.ts tests/crm-routes.test.ts tests/automation-dispatch.test.ts && npm run type-check`

```bash
git add backend/src/jobs backend/src/worker.ts backend/src/modules/crm/domain-events.ts backend/src/modules/crm/repository.ts backend/src/modules/lead-forms/routes.ts backend/tests
git commit -m "feat: score leads from CRM domain events"
```

### Task 4: API de configuração, simulação e histórico

**Files:**
- Create: `backend/src/modules/crm/scoring-repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Modify: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/crm/scoring/model?crmInstanceId=`
  - `PATCH /api/crm/scoring/model/:id`
  - `POST /api/crm/scoring/rules`
  - `PATCH /api/crm/scoring/rules/:id`
  - `DELETE /api/crm/scoring/rules/:id` (desativa)
  - `POST /api/crm/scoring/simulate`
  - `GET /api/crm/leads/:id/score-events`
  - `POST /api/crm/leads/:id/score-adjustments`

- [ ] **Step 1: Write failing API tests**

```ts
expect((await createRule({ dimension: 'intent', eventType: 'lead.task_completed', points: 10 })).statusCode).toBe(201)
expect((await simulate({ leadId: ids.lead, eventType: 'lead.task_completed' })).json())
  .toMatchObject({ resultingIntentScore: 10, persisted: false })
```

Inclua pesos que não somam 100, regra sem nome, pontos zero, acesso seller e ajuste manual sem motivo.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts`

- [ ] **Step 3: Implement CRUD and permissions**

Use Zod com enum de dimensões/eventos conhecidos, mas permita eventos futuros somente para perfis internos. Exclusão grava `is_active = FALSE`.

- [ ] **Step 4: Implement simulation and manual adjustment**

Simulação usa o mesmo `matchesScoringRule`, mas não abre transação nem grava. Ajuste manual exige `{ dimension, points, reason }`, cria `event_type = 'lead.score_manual_adjustment'` e `event_key = manual:${uuid}`.

- [ ] **Step 5: Run backend checks and commit**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts tests/crm-scoring.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/scoring-repository.ts backend/src/modules/crm/routes.ts backend/tests/crm-routes.test.ts
git commit -m "feat: add lead scoring configuration API"
```

### Task 5: Tipos, serviço e tela de configuração

**Files:**
- Modify: `frontend/src/types/crm.ts`
- Create: `frontend/src/services/crmScoringService.ts`
- Create: `frontend/src/components/crm/scoring/ScoringModelForm.tsx`
- Create: `frontend/src/components/crm/scoring/ScoringRuleEditor.tsx`
- Create: `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.test.tsx`

**Interfaces:**
- Consumes: API da Task 4.
- Produces: rota visível “Pontuação de leads”.

- [ ] **Step 1: Write failing page tests**

```tsx
expect(screen.getByLabelText(/peso de fit/i)).toHaveValue(40)
expect(screen.getByRole('button', { name: /nova regra/i })).toBeEnabled()
expect(screen.getByText(/tarefa concluída.*\+10 intenção/i)).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalLeadScoringPage.test.tsx`

- [ ] **Step 3: Implement configuration service and types**

```ts
export type LeadScoreDimension = 'fit' | 'intent'
export type LeadScoringOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'
export interface LeadScoringRule {
  id: string
  name: string
  dimension: LeadScoreDimension
  eventType: string
  fieldPath?: string
  operator?: LeadScoringOperator
  comparisonValue?: unknown
  points: number
  isActive: boolean
}
```

- [ ] **Step 4: Implement rule builder without raw IDs**

Gatilhos exibidos: lead criado, formulário enviado, etapa alterada, tarefa criada/concluída/cancelada/reaberta e nota/ligação/e-mail/reunião registrada. Campos e etapas são selects carregados da instância; pontos aceitam `-100..100`, exceto zero.

- [ ] **Step 5: Add simulation preview**

Usuário escolhe um lead real e vê regras aplicadas, score atual e resultado previsto. Botão “Salvar regra” permanece separado de “Simular”.

- [ ] **Step 6: Run frontend checks and commit**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalLeadScoringPage.test.tsx && npm run type-check`

```bash
git add frontend/src/types/crm.ts frontend/src/services/crmScoringService.ts frontend/src/components/crm/scoring frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.tsx frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.test.tsx frontend/src/lib/platform/navigation.ts frontend/src/App.tsx
git commit -m "feat: add lead scoring rule builder"
```

### Task 6: Explicar o score dentro do Lead 360

**Files:**
- Create: `frontend/src/components/crm/scoring/LeadScoreBreakdown.tsx`
- Modify: `frontend/src/components/crm/Lead360Panel.tsx`
- Modify: `frontend/src/services/crmService.ts`
- Test: `frontend/src/components/crm/scoring/LeadScoreBreakdown.test.tsx`

**Interfaces:**
- Consumes: `GET /api/crm/leads/:id/score-events`.
- Produces: aba “Pontuação” com fit, intenção, combinado e histórico.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(screen.getByText('Fit 70/100')).toBeInTheDocument()
expect(screen.getByText('Intenção 45/100')).toBeInTheDocument()
expect(screen.getByText('Tarefa concluída +10')).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --run src/components/crm/scoring/LeadScoreBreakdown.test.tsx`

- [ ] **Step 3: Expose separated scores on CrmLead**

Adicione `fitScore?: number` e `intentScore?: number` ao tipo e mapeie `fit_score`/`intent_score` em backend e frontend. Não substituir `score`; ele continua combinado.

- [ ] **Step 4: Implement breakdown and manual adjustment**

Histórico mostra data, regra, dimensão, pontos, valor anterior/resultante e motivo. Ajuste manual só aparece para papéis autorizados e exige justificativa de 5 a 300 caracteres.

- [ ] **Step 5: Run tests and commit**

Run: `cd frontend && npm test -- --run src/components/crm/scoring/LeadScoreBreakdown.test.tsx src/components/crm/CrmWorkspace.test.tsx && npm run type-check`

```bash
git add frontend/src/components/crm/scoring/LeadScoreBreakdown.tsx frontend/src/components/crm/Lead360Panel.tsx frontend/src/services/crmService.ts frontend/src/types/crm.ts
git commit -m "feat: explain lead scores in Lead 360"
```

### Task 7: Verificação integrada

- [ ] **Step 1: Run backend suite and build**

Run: `cd backend && npm test -- --run && npm run build`

- [ ] **Step 2: Run frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`

- [ ] **Step 3: Verify the full scoring journey**

1. Configurar pesos 40% fit e 60% intenção.
2. Criar regra “País BR: +20 fit”.
3. Criar regra “Tarefa concluída: +10 intenção”.
4. Criar regra “Nota registrada: +5 intenção”.
5. Simular sobre um lead sem persistir.
6. Concluir tarefa e registrar nota; confirmar eventos únicos e scores 20/15.
7. Reprocessar o mesmo evento e confirmar ausência de duplicação.
8. Conferir combinado 17 e histórico no Lead 360.
