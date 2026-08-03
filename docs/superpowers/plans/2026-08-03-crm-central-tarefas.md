# Central de Tarefas Comerciais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/portal/comercial/tarefas` em uma central completa para criar, filtrar, atribuir, reagendar, concluir, cancelar e reabrir tarefas e follow-ups de todos os leads.

**Architecture:** `lead_tasks` será a fonte canônica de tarefas comerciais. Um endpoint agregado substituirá o carregamento N+1 limitado a 50 leads. Mutations atualizam `leads.next_follow_up_at`, preservam auditoria em metadata e publicam eventos CRM idempotentes para scoring e automações.

**Tech Stack:** React 18, TypeScript, Tailwind/shadcn, Fastify, Zod, PostgreSQL, Vitest.

## Global Constraints

- Executar primeiro `2026-08-03-orquestracao-integrada-de-leads.md` e o plano de Funis; este plano consome os comandos CRM e `recordDomainEvent` da Fase 0.
- Toda lista é filtrada por organização e instância CRM do usuário.
- Paginação padrão: 50 itens; máximo: 100.
- Datas são armazenadas em UTC e exibidas no fuso do navegador.
- `seller` altera apenas tarefas próprias ou não atribuídas; `manager`, `client_admin` e perfis internos alteram todas da instância.
- `lead_tasks` permanece canônica; `lead_next_actions` continua como recomendação e não deve ser misturada silenciosamente com tarefas.

---

## File Structure

- Create: `backend/src/db/migrations/0121_crm_task_center.sql` — auditoria e índices da central.
- Create: `backend/src/modules/crm/task-repository.ts` — listagem agregada e mutations.
- Modify: `backend/src/modules/crm/routes.ts` — endpoint global e PATCH de tarefa.
- Modify: `backend/tests/crm-routes.test.ts` — filtros, autorização e eventos.
- Modify: `frontend/src/types/crm.ts` — `CrmTaskListItem`, filtros e página.
- Modify: `frontend/src/services/crmService.ts` — listagem e mutations.
- Modify: `frontend/src/hooks/usePortalCrmContext.ts` — remover N+1.
- Create: `frontend/src/components/crm/tasks/TaskFilters.tsx` — filtros persistidos na URL.
- Create: `frontend/src/components/crm/tasks/TaskEditorDialog.tsx` — criar/editar.
- Create: `frontend/src/components/crm/tasks/TaskList.tsx` — fila operacional.
- Modify: `frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.tsx` — central funcional.
- Create: `frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.test.tsx` — fluxo da página.

### Task 1: Índices e auditoria de tarefas

**Files:**
- Create: `backend/src/db/migrations/0121_crm_task_center.sql`
- Test: `backend/tests/schema-smoke.test.ts`

**Interfaces:**
- Produces: filtros eficientes por organização, status, prazo e responsável.

- [ ] **Step 1: Write the failing schema assertions**

```ts
expect(taskCenterMigration).toContain('idx_lead_tasks_org_status_due')
expect(taskCenterMigration).toContain('ALTER TABLE public.lead_tasks')
expect(taskCenterMigration).toContain('cancelled_at')
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts`

- [ ] **Step 3: Add migration**

```sql
ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.lead_tasks
SET cancelled_at = updated_at
WHERE status = 'cancelled' AND cancelled_at IS NULL;

ALTER TABLE public.lead_tasks
  ADD CONSTRAINT lead_tasks_cancellation_state CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_lead_tasks_org_status_due
  ON public.lead_tasks(organization_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_assigned_status_due
  ON public.lead_tasks(assigned_to, status, due_at)
  WHERE assigned_to IS NOT NULL;
```

- [ ] **Step 4: Run migration tests and commit**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts tests/migration-runner.test.ts`

```bash
git add backend/src/db/migrations/0121_crm_task_center.sql backend/tests/schema-smoke.test.ts
git commit -m "feat: add CRM task center indexes"
```

### Task 2: Endpoint agregado e paginação

**Files:**
- Create: `backend/src/modules/crm/task-repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Test: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Produces: `GET /api/crm/tasks`.
- Query: `organizationId`, `crmInstanceId`, `status`, `priority`, `assignedTo`, `leadId`, `due`, `search`, `cursor`, `limit`.
- Response: `{ items: CrmTaskListItem[]; nextCursor?: string; total: number }`.

- [ ] **Step 1: Write failing list tests**

```ts
const response = await app.inject({
  method: 'GET',
  url: `/api/crm/tasks?organizationId=${ids.org}&crmInstanceId=${ids.instance}&status=pending&due=overdue`,
})
expect(response.json()).toMatchObject({
  total: 1,
  items: [{ id: ids.task, leadName: 'Ana', pipelineName: 'Vendas', stageName: 'Novo' }],
})
```

Inclua teste de cursor estável por `(due_at, id)` e bloqueio de instância alheia.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts`

- [ ] **Step 3: Implement one joined query**

```sql
SELECT task.*, lead.name AS lead_name, lead.company AS lead_company,
       pipeline.name AS pipeline_name, stage.name AS stage_name,
       assignee.name AS assigned_to_name
FROM public.lead_tasks task
JOIN public.leads lead ON lead.id = task.lead_id
LEFT JOIN public.crm_pipelines pipeline ON pipeline.id = lead.pipeline_id
LEFT JOIN public.crm_pipeline_stages stage ON stage.id = lead.stage_id
LEFT JOIN public.users assignee ON assignee.id = task.assigned_to
WHERE task.organization_id = $1 AND lead.crm_instance_id = $2
ORDER BY task.due_at ASC, task.id ASC
LIMIT $3;
```

Monte filtros somente com colunas permitidas e parâmetros; não interpolar valores de usuário.

- [ ] **Step 4: Add Zod query schema and run checks**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts && npm run type-check`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/crm/task-repository.ts backend/src/modules/crm/routes.ts backend/tests/crm-routes.test.ts
git commit -m "feat: add aggregated CRM task endpoint"
```

### Task 3: Editar, reagendar, concluir, cancelar e reabrir

**Files:**
- Modify: `backend/src/modules/crm/task-repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Modify: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Produces: `PATCH /api/crm/tasks/:id` com `{ title?, description?, dueAt?, assignedTo?, priority?, status? }`.
- Produces events: `lead.task_created`, `lead.task_completed`, `lead.task_cancelled`, `lead.task_reopened`.

- [ ] **Step 1: Write failing mutation tests**

```ts
expect((await patchTask({ status: 'completed' })).json()).toMatchObject({ status: 'completed' })
expect(jobQueue.jobs.at(-1)?.data.event.type).toBe('lead.task_completed')
expect((await patchTask({ dueAt: '2026-08-05T15:00:00.000Z' })).json())
  .toMatchObject({ dueAt: '2026-08-05T15:00:00.000Z' })
```

Inclua transições inválidas: completar tarefa cancelada, reabrir tarefa pendente e data inválida.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts`

- [ ] **Step 3: Implement state transitions in a transaction**

Use:

```ts
const allowedTransitions = {
  pending: new Set(['completed', 'cancelled']),
  completed: new Set(['pending']),
  cancelled: new Set(['pending']),
}
```

Defina `completed_at`, `cancelled_at`, `updated_by` de forma coerente e atualize `leads.next_follow_up_at` para a próxima tarefa pendente do lead.

- [ ] **Step 4: Publish one idempotent event after commit**

`eventId` deve ser `${taskId}:${newStatus}:${updatedAt}`. Payload inclui `taskId`, `leadId`, `priority`, `dueAt`, `assignedTo`.

- [ ] **Step 5: Run backend checks and commit**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts tests/automation-dispatch.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/task-repository.ts backend/src/modules/crm/routes.ts backend/tests/crm-routes.test.ts
git commit -m "feat: add CRM task lifecycle"
```

### Task 4: Remover o carregamento N+1 do portal

**Files:**
- Modify: `frontend/src/types/crm.ts`
- Modify: `frontend/src/services/crmService.ts`
- Modify: `frontend/src/hooks/usePortalCrmContext.ts`
- Create: `frontend/src/hooks/usePortalCrmContext.test.tsx`

**Interfaces:**
- Consumes: `GET /api/crm/tasks`.
- Produces: `crmService.getTaskPage(filters)` e contexto sem limite de 50 leads.

- [ ] **Step 1: Write the failing hook test**

```ts
expect(crmService.getTaskPage).toHaveBeenCalledTimes(1)
expect(crmService.getTasks).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --run src/hooks/usePortalCrmContext.test.tsx`

- [ ] **Step 3: Add types and service**

```ts
export type CrmTaskPage = { items: CrmTaskListItem[]; total: number; nextCursor?: string }
export type CrmTaskFilters = {
  organizationId: string
  crmInstanceId: string
  status?: CrmTaskStatus
  due?: 'overdue' | 'today' | 'upcoming'
  assignedTo?: string
  search?: string
  cursor?: string
  limit?: number
}
```

- [ ] **Step 4: Replace per-lead requests**

Carregue a instância com `crmGovernanceService.getActiveInstanceForOrganization(organization.id)` e depois busque tarefas com uma chamada agregada. Preserve `tasks` no retorno do hook para `PortalCommercialAccountsPage` e `usePortalActionSummary`.

- [ ] **Step 5: Run frontend checks and commit**

Run: `cd frontend && npm test -- --run src/hooks/usePortalCrmContext.test.tsx src/services/crmService.test.ts && npm run type-check`

```bash
git add frontend/src/types/crm.ts frontend/src/services/crmService.ts frontend/src/hooks/usePortalCrmContext.ts frontend/src/hooks/usePortalCrmContext.test.tsx
git commit -m "perf: load CRM tasks with one request"
```

### Task 5: Central de tarefas funcional

**Files:**
- Create: `frontend/src/components/crm/tasks/TaskFilters.tsx`
- Create: `frontend/src/components/crm/tasks/TaskEditorDialog.tsx`
- Create: `frontend/src/components/crm/tasks/TaskList.tsx`
- Modify: `frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.tsx`
- Create: `frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 e contexto de membros da instância CRM.
- Produces: fila com abas `Atrasadas`, `Hoje`, `Próximas`, `Concluídas`, `Todas`.

- [ ] **Step 1: Write failing page tests**

```tsx
expect(screen.getByRole('button', { name: /nova tarefa/i })).toBeEnabled()
expect(screen.getByRole('button', { name: /concluir ligar para ana/i })).toBeEnabled()
expect(screen.getByRole('tab', { name: /atrasadas 1/i })).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalCommercialTasksPage.test.tsx`

- [ ] **Step 3: Implement filters and URL state**

Use `status`, `due`, `assignedTo`, `priority`, `search` como query params. “Minhas tarefas” usa o `userId` do membro CRM atual. Debounce de busca: 300 ms.

- [ ] **Step 4: Implement task actions**

Nova tarefa exige lead, título e prazo. Edição permite descrição, prioridade, responsável e reagendamento. Cada linha oferece concluir, editar, cancelar e reabrir conforme o estado; mutations mostram toast e recarregam a página corrente.

- [ ] **Step 5: Add empty/loading/error states**

Estado vazio deve explicar o filtro e oferecer “Limpar filtros” ou “Nova tarefa”. Erro mantém filtros e oferece “Tentar novamente”.

- [ ] **Step 6: Run frontend checks and commit**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalCommercialTasksPage.test.tsx && npm run type-check`

```bash
git add frontend/src/components/crm/tasks frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.tsx frontend/src/pages/client-portal/commercial/PortalCommercialTasksPage.test.tsx
git commit -m "feat: make commercial task center operational"
```

### Task 6: Verificação integrada

- [ ] **Step 1: Run backend suite and build**

Run: `cd backend && npm test -- --run && npm run build`

- [ ] **Step 2: Run frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`

- [ ] **Step 3: Verify manually**

1. Criar tarefa para o lead recebido pelo formulário externo.
2. Filtrar por “Hoje” e “Minhas tarefas”.
3. Reagendar, alterar prioridade e responsável.
4. Concluir e confirmar timeline, métrica e evento `lead.task_completed`.
5. Reabrir, cancelar e confirmar permissões de `seller` versus `manager`.
