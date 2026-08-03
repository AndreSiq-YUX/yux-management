# Funis Comerciais Funcionais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/portal/comercial/funis` em uma área operacional para visualizar, criar, editar, ordenar e desativar funis e etapas, com métricas reais e histórico confiável de movimentação dos leads.

**Architecture:** O backend Fastify continua como única fronteira de escrita. O cadastro usa `crm_pipelines` e `crm_pipeline_stages`; exclusões são lógicas para preservar leads e histórico. Toda mudança de etapa grava `lead_stage_history` na mesma transação e publica `lead.stage_changed` após o commit por um helper reutilizável.

**Tech Stack:** React 18, TypeScript, Tailwind/shadcn, Fastify, Zod, PostgreSQL, Vitest.

## Global Constraints

- Executar primeiro `2026-08-03-orquestracao-integrada-de-leads.md`; este plano consome `recordDomainEvent` e os comandos de CRM definidos na Fase 0.
- Manter isolamento por `organization_id` e `crm_instance_id` em todas as consultas.
- Cliente só altera funis quando `allow_client_pipeline_customization = TRUE` e seu papel CRM é `client_admin` ou `manager`.
- `seller` pode visualizar e mover leads, mas não alterar a estrutura do funil.
- `yux_admin` e `yux_operator` mantêm acesso interno conforme as guardas atuais.
- Não excluir fisicamente pipeline ou etapa que possua leads ou histórico.
- Não adicionar biblioteca de drag-and-drop; usar controles acessíveis de mover para cima/baixo.
- Cada mutation retorna erros de domínio estáveis, nunca mensagens do PostgreSQL.

---

## File Structure

- Create: `backend/src/db/migrations/0120_crm_pipeline_management.sql` — unicidade do funil padrão e índices de histórico.
- Create: `backend/src/modules/crm/pipeline-repository.ts` — consultas e mutations de funis/etapas.
- Modify: `backend/src/modules/crm/commands.ts` — comandos manuais reutilizam o outbox da Fase 0.
- Modify: `backend/src/modules/crm/routes.ts` — rotas validadas de configuração e movimentação.
- Modify: `backend/src/modules/crm/repository.ts` — mover lead transacionalmente e registrar histórico.
- Modify: `backend/tests/crm-routes.test.ts` — autorização, CRUD, reordenação e histórico.
- Modify: `frontend/src/types/crm.ts` — inputs de funil/etapa e métricas.
- Modify: `frontend/src/services/crmService.ts` — cliente das novas rotas.
- Create: `frontend/src/components/crm/funnels/PipelineSummaryBoard.tsx` — distribuição real por etapa.
- Create: `frontend/src/components/crm/funnels/PipelineEditorDialog.tsx` — criação/edição de funil.
- Create: `frontend/src/components/crm/funnels/StageEditorList.tsx` — etapas, resultados e ordem.
- Modify: `frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.tsx` — página operacional.
- Create: `frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.test.tsx` — comportamento da página.

### Task 1: Garantias de banco para configuração de funis

**Files:**
- Create: `backend/src/db/migrations/0120_crm_pipeline_management.sql`
- Test: `backend/tests/schema-smoke.test.ts`

**Interfaces:**
- Produces: no máximo um pipeline ativo e padrão por instância CRM; índice para consultar histórico por lead.

- [ ] **Step 1: Write the failing migration contract test**

```ts
const pipelineManagement = readFileSync(path.join(migrationsDir, '0120_crm_pipeline_management.sql'), 'utf8')
expect(pipelineManagement).toContain('idx_crm_pipelines_one_default_per_instance')
expect(pipelineManagement).toContain('idx_lead_stage_history_lead_changed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts`

Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Add the migration**

```sql
WITH ranked_defaults AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY crm_instance_id
           ORDER BY updated_at DESC, created_at ASC, id ASC
         ) AS position
  FROM public.crm_pipelines
  WHERE crm_instance_id IS NOT NULL AND is_default = TRUE AND is_active = TRUE
)
UPDATE public.crm_pipelines target
SET is_default = FALSE, updated_at = NOW()
FROM ranked_defaults ranked
WHERE target.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_pipelines_one_default_per_instance
  ON public.crm_pipelines(crm_instance_id)
  WHERE crm_instance_id IS NOT NULL AND is_default = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_changed
  ON public.lead_stage_history(lead_id, changed_at DESC);
```

- [ ] **Step 4: Run migration and schema tests**

Run: `cd backend && npm test -- --run tests/schema-smoke.test.ts tests/migration-runner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/0120_crm_pipeline_management.sql backend/tests/schema-smoke.test.ts
git commit -m "feat: add pipeline management constraints"
```

### Task 2: CRUD autorizado de pipelines e etapas

**Files:**
- Create: `backend/src/modules/crm/pipeline-repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Test: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Produces: `createPipeline`, `patchPipeline`, `createPipelineStage`, `patchPipelineStage`, `reorderPipelineStages`.
- Produces routes:
  - `POST /api/crm/pipelines`
  - `PATCH /api/crm/pipelines/:id`
  - `POST /api/crm/pipelines/:id/stages`
  - `PATCH /api/crm/pipeline-stages/:id`
  - `PUT /api/crm/pipelines/:id/stages/order`

- [ ] **Step 1: Write failing route tests**

```ts
expect((await app.inject({ method: 'POST', url: '/api/crm/pipelines', payload: {
  organizationId: ids.org, crmInstanceId: ids.instance, name: 'Novos negócios', isDefault: false,
} })).statusCode).toBe(201)

expect((await app.inject({ method: 'PUT', url: `/api/crm/pipelines/${ids.pipeline}/stages/order`, payload: {
  stageIds: [ids.stageQualified, ids.stageNew],
} })).statusCode).toBe(200)
```

Inclua casos `403 pipeline_customization_forbidden`, `409 pipeline_limit_reached`, `409 pipeline_name_conflict` e `409 pipeline_stage_in_use`.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts`

Expected: FAIL com rotas não encontradas.

- [ ] **Step 3: Implement authorization and repository mutations**

Use o contrato:

```ts
export type PipelineInput = {
  organizationId: string
  crmInstanceId: string
  name: string
  description?: string
  isDefault?: boolean
}

export type PipelineStageInput = {
  name: string
  key: string
  color: string
  isWon?: boolean
  isLost?: boolean
}
```

Antes de qualquer escrita, carregue `crm_instances`, `crm_instance_members` e conte pipelines ativos. Ao tornar um pipeline padrão, desmarque o anterior na mesma transação. Ao “excluir”, grave `is_active = FALSE`; rejeite se isso deixar a instância sem pipeline ou etapa ativa.

- [ ] **Step 4: Add Zod schemas and stable error mapping**

```ts
const pipelineInputSchema = z.object({
  organizationId: z.string().uuid(),
  crmInstanceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
})
```

Para ordem, valide `stageIds` como array de UUIDs únicos e confirme que todos pertencem ao pipeline.

- [ ] **Step 5: Run backend checks**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts && npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/crm/pipeline-repository.ts backend/src/modules/crm/routes.ts backend/tests/crm-routes.test.ts
git commit -m "feat: add CRM pipeline management API"
```

### Task 3: Histórico e evento de mudança de etapa

**Files:**
- Modify: `backend/src/modules/crm/commands.ts`
- Modify: `backend/src/modules/crm/repository.ts`
- Modify: `backend/src/modules/crm/routes.ts`
- Test: `backend/tests/crm-routes.test.ts`

**Interfaces:**
- Consumes: `recordDomainEvent(client, event)` da Fase 0.
- Produces event `lead.stage_changed` com `eventId`, `organizationId`, `leadId`, `fromStageId`, `stageId`, `pipelineId`.

- [ ] **Step 1: Write the failing transition test**

```ts
expect(fakeClient.queries.some(query => query.sql.includes('INSERT INTO public.lead_stage_history'))).toBe(true)
expect(jobQueue.jobs.at(-1)?.data.event).toMatchObject({
  type: 'lead.stage_changed', leadId: ids.lead, payload: { stageId: ids.stageQualified },
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts`

- [ ] **Step 3: Make stage movement transactional**

Dentro de uma transação: bloqueie o lead `FOR UPDATE`, valide que a etapa de destino pertence à mesma organização/instância, atualize o lead e insira:

```sql
INSERT INTO public.lead_stage_history
  (crm_instance_id, lead_id, from_stage_id, to_stage_id, changed_by, changed_at)
VALUES ($1, $2, $3, $4, $5, NOW());
```

Retorne `{ record, event }` após persistir tanto a mudança quanto o evento na mesma transação.

- [ ] **Step 4: Persist the event in the outbox**

```ts
await recordDomainEvent(client, result.event)
```

O evento é inserido antes do `COMMIT` da mudança de etapa. A rota retorna o lead atualizado sem acessar Redis; o dispatcher da Fase 0 entrega o evento posteriormente para todas as automações e para scoring.

- [ ] **Step 5: Run backend checks and commit**

Run: `cd backend && npm test -- --run tests/crm-routes.test.ts tests/automation-dispatch.test.ts && npm run type-check`

```bash
git add backend/src/modules/crm/commands.ts backend/src/modules/crm/repository.ts backend/src/modules/crm/routes.ts backend/tests/crm-routes.test.ts
git commit -m "feat: record and dispatch lead stage changes"
```

### Task 4: Cliente frontend e componentes de configuração

**Files:**
- Modify: `frontend/src/types/crm.ts`
- Modify: `frontend/src/services/crmService.ts`
- Create: `frontend/src/components/crm/funnels/PipelineEditorDialog.tsx`
- Create: `frontend/src/components/crm/funnels/StageEditorList.tsx`
- Test: `frontend/src/services/crmService.test.ts`
- Test: `frontend/src/components/crm/funnels/PipelineEditorDialog.test.tsx`

**Interfaces:**
- Consumes: rotas da Task 2.
- Produces: `crmService.createPipeline`, `updatePipeline`, `createPipelineStage`, `updatePipelineStage`, `reorderPipelineStages`.

- [ ] **Step 1: Write failing service and component tests**

```ts
expect(buildPipelinePayload({ organizationId: 'o', crmInstanceId: 'i', name: ' Vendas ' }))
  .toMatchObject({ name: 'Vendas' })
```

No componente, valide nome obrigatório, apenas um estágio ganho/perdido por marcação e botões acessíveis “Mover etapa para cima/baixo”.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd frontend && npm test -- --run src/services/crmService.test.ts src/components/crm/funnels/PipelineEditorDialog.test.tsx`

- [ ] **Step 3: Add typed service methods**

```ts
async createPipeline(input: CrmPipelineCreateInput): Promise<CrmPipeline>
async updatePipeline(id: string, patch: CrmPipelinePatch): Promise<CrmPipeline>
async reorderPipelineStages(pipelineId: string, stageIds: string[]): Promise<CrmPipeline>
```

- [ ] **Step 4: Implement editor components**

O diálogo deve mostrar limite usado (`pipelines.length / maxPipelineCount`), nome, descrição, padrão e estado ativo. A lista de etapas permite editar nome/cor/resultado, criar etapa e reordenar; desativação exige confirmação quando houver leads.

Carregue `crmGovernanceService.getActiveInstanceForOrganization(organizationId)` e `getGovernanceContext(instance.id)` para decidir se os controles aparecem. Em modo sem permissão, mantenha métricas e estrutura visíveis, mas não renderize botões de mutation.

- [ ] **Step 5: Run frontend checks and commit**

Run: `cd frontend && npm test -- --run src/services/crmService.test.ts src/components/crm/funnels/PipelineEditorDialog.test.tsx && npm run type-check`

```bash
git add frontend/src/types/crm.ts frontend/src/services/crmService.ts frontend/src/components/crm/funnels
git commit -m "feat: add pipeline configuration components"
```

### Task 5: Página de funis operacional

**Files:**
- Create: `frontend/src/components/crm/funnels/PipelineSummaryBoard.tsx`
- Modify: `frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.tsx`
- Create: `frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.test.tsx`

**Interfaces:**
- Consumes: `usePortalCrmContext`, componentes da Task 4 e `crmService.moveLeadToStage`.
- Produces: visão por etapa com contagem, valor, conversão e leads parados.

- [ ] **Step 1: Write failing page tests**

```tsx
expect(screen.getByRole('button', { name: /configurar funil/i })).toBeEnabled()
expect(screen.getByText('2 leads · R$ 15.000,00')).toBeInTheDocument()
expect(screen.getByText(/sem atividade há mais de 7 dias/i)).toBeInTheDocument()
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalCommercialFunnelsPage.test.tsx`

- [ ] **Step 3: Implement real stage metrics and lead rows**

Calcule por pipeline e etapa: `leadCount`, `openValue`, `staleCount`, `wonCount`, `lostCount`. Conversão é `won / (won + lost)`, exibida como “sem base” quando o denominador for zero. Cada etapa deve listar os leads compactamente com nome, empresa, valor, score e seletor “Mover para”; a mutation usa `crmService.moveLeadToStage`.

- [ ] **Step 4: Connect mutations and refresh**

Após salvar estrutura ou mover lead, chame `reload()`, preserve o pipeline selecionado e mostre toast de sucesso/erro. Não faça optimistic update para mudanças estruturais.

- [ ] **Step 5: Run page tests and commit**

Run: `cd frontend && npm test -- --run src/pages/client-portal/commercial/PortalCommercialFunnelsPage.test.tsx src/components/crm/CrmWorkspace.test.tsx && npm run type-check`

```bash
git add frontend/src/components/crm/funnels/PipelineSummaryBoard.tsx frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.tsx frontend/src/pages/client-portal/commercial/PortalCommercialFunnelsPage.test.tsx
git commit -m "feat: make commercial funnels operational"
```

### Task 6: Verificação integrada

**Files:**
- Modify only if a test exposes a defect in the files listed above.

- [ ] **Step 1: Run all backend tests and build**

Run: `cd backend && npm test -- --run && npm run build`

Expected: todos os testes e build passam.

- [ ] **Step 2: Run all frontend tests and build**

Run: `cd frontend && npm test -- --run && npm run build`

Expected: todos os testes e build passam.

- [ ] **Step 3: Verify the client journey manually**

1. Entrar como `client_admin` da YUXQuant.
2. Criar um funil, adicionar três etapas e reordená-las.
3. Tornar o funil padrão e confirmar que o anterior deixa de ser padrão.
4. Mover um lead e confirmar card, métricas, timeline e automação `lead.stage_changed`.
5. Entrar como `seller` e confirmar que configuração fica somente leitura.
