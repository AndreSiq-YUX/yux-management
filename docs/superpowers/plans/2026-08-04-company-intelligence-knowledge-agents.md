# Company Intelligence, Knowledge and Agent Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar Perfil da Empresa, Marca e Tom de Voz e Base de Conhecimento em áreas editáveis e fazer o contexto aprovado da organização chegar, por padrão, ao Marketing Studio, às automações e aos agentes de IA, inclusive o agente de conversa no WhatsApp.

**Architecture:** O contexto canônico será organizacional, mas continuará associado ao cliente e ao contrato ativo quando o módulo exigir essas chaves. Um módulo backend `company-intelligence` concentrará autorização, perfil, marca, ingestão, publicação, busca e montagem do contexto seguro. O runtime carregará esse contexto por `organization_id` em toda execução, combinando-o com a doutrina YUX sem misturar dados entre organizações.

**Tech Stack:** React 18, TypeScript, Fastify 5, PostgreSQL 17, BullMQ/Redis, Python/FastAPI agent runtime, Vitest e pytest.

## Global Constraints

- O workspace `Crescimento YUX` usa a organização `650e8400-e29b-41d4-a716-446655440001`, o cliente `550e8400-e29b-41d4-a716-44665544a001` e o contrato `660e8400-e29b-41d4-a716-44665544a001` já provisionados pela migration `0105_strategy_packs_yux_workspace.sql`.
- Informações de uma organização nunca podem aparecer no contexto de outra organização.
- Apenas conhecimento publicado pode alimentar respostas externas; rascunhos podem aparecer somente no preview administrativo.
- Restrições, assuntos proibidos e observações de compliance têm precedência sobre instruções de campanha, automação e mensagens recebidas.
- Uploads devem validar conteúdo real, tamanho, extensão segura e caminho resolvido dentro do diretório configurado.
- Textos recuperados e mensagens recebidas são dados não confiáveis, nunca instruções de sistema.
- A primeira entrega cobre Perfil, Marca e Base de Conhecimento. Usuários/Equipe e configuração operacional de Integrações ficam em planos independentes, pois possuem autorização e provedores próprios.

---

## Current-state findings to preserve

- `PortalCompanyProfilePage`, `PortalBrandVoicePage` e `PortalKnowledgeBasePage` são somente leitura.
- `marketingStudioService` já possui `upsertBrandProfile`, `createKnowledgeDocument` e `createKnowledgeChunk`, mas nenhuma tela chama essas operações.
- Existem duas bases paralelas: `knowledge_entries` para omnichannel/assistentes e `marketing_knowledge_documents` + `marketing_knowledge_chunks` para Marketing Studio.
- `marketing_knowledge_chunks.entry_id` e `marketing_knowledge_documents.source_id` já permitem relacionar as duas estruturas; a implementação deve usar esses vínculos em vez de criar uma terceira base.
- A busca `match_marketing_knowledge` existe e usa full-text search, mas os arquivos ainda não são extraídos nem indexados por um fluxo de produto.
- O runtime carrega apenas `yux_strategy_*`; ele não lê `marketing_brand_profiles`, `knowledge_entries` ou `marketing_knowledge_chunks`.
- O handler do WhatsApp chama o runtime sem `assistant_id`, marca, guardrails ou trechos da base da organização.
- `initializeClientWorkspace` define `activeContract: null` para o workspace YUX, apesar de o contrato interno existir. O hook `usePortalMarketingContext` retorna vazio quando não há contrato.

## File structure

- `backend/src/db/migrations/0125_company_intelligence_hub.sql`: perfil organizacional, metadados de ingestão e índices.
- `backend/src/modules/company-intelligence/types.ts`: contratos do domínio e DTOs seguros.
- `backend/src/modules/company-intelligence/repository.ts`: autorização, persistência, publicação, busca e contexto consolidado.
- `backend/src/modules/company-intelligence/file-storage.ts`: validação, paths, gravação e leitura dos arquivos.
- `backend/src/modules/company-intelligence/text-extraction.ts`: extração e chunking determinístico.
- `backend/src/modules/company-intelligence/routes.ts`: API autenticada `/api/company-intelligence`.
- `backend/src/jobs/handlers/company-intelligence.ts`: processamento assíncrono de URL e arquivo.
- `frontend/src/services/companyIntelligenceService.ts`: cliente tipado da API.
- `frontend/src/types/companyIntelligence.ts`: tipos usados pelas três páginas.
- `frontend/src/components/company-intelligence/*`: formulários e biblioteca reutilizáveis.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py`: seleção e compactação do contexto organizacional.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`: injeção do contexto em toda execução.

---

### Task 1: Restore the YUX growth workspace contract context

**Files:**
- Modify: `frontend/src/stores/platformStore.ts`
- Modify: `frontend/src/stores/platformStore.test.ts`

**Interfaces:**
- Consumes: `platformService.getPortalContractContextForClient(clientId)`.
- Produces: `activeContract` e `portalContractContext` válidos também quando `organization.isInternalGrowthWorkspace === true`.

- [ ] **Step 1: Write the failing store test**

Crie um teste que devolva a organização YUX com `clientId`, o papel `yux_admin` e o contrato interno. Execute `initializeClientWorkspace(YUX_ORGANIZATION_ID)` e espere:

```ts
expect(usePlatformStore.getState()).toMatchObject({
  mode: 'client_workspace',
  organization: { id: YUX_ORGANIZATION_ID, isInternalGrowthWorkspace: true },
  activeContract: { id: YUX_CONTRACT_ID, clientId: YUX_CLIENT_ID },
})
expect(usePlatformStore.getState().enabledModuleKeys).toContain('marketing_studio')
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/stores/platformStore.test.ts` from `frontend`.
Expected: FAIL because the internal branch sets `activeContract` to `null`.

- [ ] **Step 3: Load the internal contract instead of discarding it**

Inside `initializeClientWorkspace`, when the organization is the growth workspace and has `clientId`, call `getPortalContractContextForClient`. Preserve the `yux_admin` role and the complete internal module list, but populate `activeContract` and `portalContractContext` from the returned contract.

- [ ] **Step 4: Run the focused store tests**

Run: `npm test -- src/stores/platformStore.test.ts` from `frontend`.
Expected: PASS.

---

### Task 2: Add the canonical company profile and ingestion metadata

**Files:**
- Create: `backend/src/db/migrations/0125_company_intelligence_hub.sql`
- Create: `backend/tests/company-intelligence-schema.test.ts`

**Interfaces:**
- Produces: `organization_company_profiles`, richer `knowledge_sources`, and indexes used by Tasks 3-8.

- [ ] **Step 1: Write the migration contract test**

The test must assert that migration `0125` contains:

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.organization_company_profiles')
expect(sql).toContain('UNIQUE (organization_id)')
expect(sql).toContain('ADD COLUMN IF NOT EXISTS visibility')
expect(sql).toContain('ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys')
expect(sql).toContain('idx_knowledge_entries_org_published_fts')
```

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npm test -- tests/company-intelligence-schema.test.ts` from `backend`.
Expected: FAIL because migration `0125` does not exist.

- [ ] **Step 3: Create the schema**

Create `organization_company_profiles` with one row per organization and these columns:

```sql
organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
legal_name TEXT NOT NULL DEFAULT '',
trade_name TEXT NOT NULL DEFAULT '',
description TEXT NOT NULL DEFAULT '',
website_url TEXT,
industry TEXT NOT NULL DEFAULT '',
positioning TEXT NOT NULL DEFAULT '',
differentiators TEXT[] NOT NULL DEFAULT '{}',
emails TEXT[] NOT NULL DEFAULT '{}',
phones TEXT[] NOT NULL DEFAULT '{}',
address JSONB NOT NULL DEFAULT '{}',
business_hours JSONB NOT NULL DEFAULT '{}',
service_regions TEXT[] NOT NULL DEFAULT '{}',
social_links JSONB NOT NULL DEFAULT '{}',
internal_notes TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Extend `knowledge_sources` with `visibility` (`internal`, `external`, `both`), `allowed_agent_profile_keys`, `blocked_agent_profile_keys`, `mime_type`, `byte_size`, `checksum_sha256`, `processing_error` and `metadata`. Add a Portuguese FTS index to published/approved `knowledge_entries`. Do not alter existing rows destructively; use `ADD COLUMN IF NOT EXISTS` and safe defaults.

- [ ] **Step 4: Run schema tests**

Run: `npm test -- tests/company-intelligence-schema.test.ts` from `backend`.
Expected: PASS.

---

### Task 3: Build the authenticated company-intelligence API

**Files:**
- Create: `backend/src/modules/company-intelligence/types.ts`
- Create: `backend/src/modules/company-intelligence/repository.ts`
- Create: `backend/src/modules/company-intelligence/routes.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/company-intelligence-routes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/company-intelligence/organizations/:organizationId/profile`
  - `PUT /api/company-intelligence/organizations/:organizationId/profile`
  - `GET /api/company-intelligence/organizations/:organizationId/brand`
  - `PUT /api/company-intelligence/organizations/:organizationId/brand`
  - `GET /api/company-intelligence/organizations/:organizationId/context-preview?q=...`

- [ ] **Step 1: Write authorization and round-trip tests**

Cover: unauthenticated 401, unrelated client 403, client admin write, internal operator write, upsert/read of profile, upsert/read of all brand guardrails, and omission of internal notes from users lacking configure permission.

- [ ] **Step 2: Run the route tests and verify failure**

Run: `npm test -- tests/company-intelligence-routes.test.ts` from `backend`.
Expected: FAIL with missing routes.

- [ ] **Step 3: Implement organization access and DTO validation**

Use `requireOrganizationScope(request, organizationId)`. Allow writes for `yux_admin`, `yux_operator`, `client_admin` and `manager`; keep read access for active organization members. Validate URLs as HTTP(S), trim strings, deduplicate arrays case-insensitively and cap each free-text field at 20,000 characters.

- [ ] **Step 4: Implement profile persistence**

Upsert `organization_company_profiles`. When the organization has a `client_id`, mirror stable legacy fields into `clients` (`company_name`, `website`, `sector`, `phone`, `address`, `notes`) in the same transaction so existing reports remain compatible.

- [ ] **Step 5: Implement brand persistence**

Resolve the selected contract from the explicit `contractId` or the newest active contract belonging to `organizations.client_id`. Upsert `marketing_brand_profiles` using `organization_id`, `client_id` and `contract_id`. Return all fields including `complianceNotes` only to authorized configurators.

- [ ] **Step 6: Register the module and run tests**

Register with prefix `/api/company-intelligence`. Run the focused route test, then `npm run type-check` from `backend`.
Expected: PASS.

---

### Task 4: Make Company Profile and Brand Voice editable

**Files:**
- Create: `frontend/src/types/companyIntelligence.ts`
- Create: `frontend/src/services/companyIntelligenceService.ts`
- Create: `frontend/src/components/company-intelligence/CompanyProfileForm.tsx`
- Create: `frontend/src/components/company-intelligence/BrandVoiceForm.tsx`
- Create: `frontend/src/components/company-intelligence/TagListField.tsx`
- Modify: `frontend/src/pages/client-portal/company/PortalCompanyProfilePage.tsx`
- Modify: `frontend/src/pages/client-portal/company/PortalBrandVoicePage.tsx`
- Create: `frontend/src/pages/client-portal/company/PortalCompanyEditors.test.tsx`

**Interfaces:**
- Consumes: Task 3 profile and brand endpoints.
- Produces: forms with dirty state, validation, save feedback and reload.

- [ ] **Step 1: Write failing UI tests**

Test profile edits and brand guardrails. The brand test must fill `toneOfVoice`, `persona`, `brandVoiceSummary`, `vocabularyDo`, `vocabularyDont`, `forbiddenTopics`, `priorityTopics`, `visualGuidelines`, `complianceNotes`, save, and assert the exact service payload.

- [ ] **Step 2: Run focused UI tests and verify failure**

Run: `npm test -- src/pages/client-portal/company/PortalCompanyEditors.test.tsx` from `frontend`.
Expected: FAIL because forms do not exist.

- [ ] **Step 3: Implement the typed service**

Use `apiRequest`; do not use the generic table query client for these writes. Keep snake_case confined to the backend. Surface authorization and validation errors with user-facing Portuguese messages.

- [ ] **Step 4: Implement Company Profile editing**

Use sections `Identificação`, `Presença digital`, `Atendimento e região` and `Posicionamento`. Include Save/Cancel, unsaved-change protection and a read-only summary beside the form.

- [ ] **Step 5: Implement Brand Voice editing**

Use sections `Como a marca fala`, `Vocabulário e temas`, `Bloqueios e compliance` and `Direção visual`. Show a red, persistent guardrail panel for forbidden topics, forbidden vocabulary and compliance notes. Saving `status: active` makes the profile available to agents.

- [ ] **Step 6: Run UI tests, type-check and lint**

Run from `frontend`:

```bash
npm test -- src/pages/client-portal/company/PortalCompanyEditors.test.tsx
npm run type-check
npm run lint
```

Expected: PASS.

---

### Task 5: Implement text, URL and file knowledge ingestion

**Files:**
- Create: `backend/src/modules/company-intelligence/file-storage.ts`
- Create: `backend/src/modules/company-intelligence/text-extraction.ts`
- Modify: `backend/src/modules/company-intelligence/repository.ts`
- Modify: `backend/src/modules/company-intelligence/routes.ts`
- Modify: `backend/src/jobs/queue.ts`
- Create: `backend/src/jobs/handlers/company-intelligence.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/company-intelligence-ingestion.test.ts`
- Create: `backend/tests/company-intelligence-file-storage.test.ts`

**Interfaces:**
- Produces:
  - `GET /organizations/:organizationId/knowledge`
  - `POST /organizations/:organizationId/knowledge/text`
  - `POST /organizations/:organizationId/knowledge/url`
  - `POST /organizations/:organizationId/knowledge/files`
  - `PATCH /knowledge/:documentId`
  - `POST /knowledge/:documentId/publish`
  - `POST /knowledge/:documentId/archive`
  - `GET /knowledge/:documentId/file`
  - BullMQ job `company-intelligence.indexKnowledge`.

- [ ] **Step 1: Write ingestion tests**

Cover manual text, URL import through an injected `readJinaUrl`, TXT/Markdown, PDF, DOCX, empty extraction, duplicate checksum, 10 MB limit, MIME mismatch, path traversal, organization isolation, publication and archival.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/company-intelligence-ingestion.test.ts tests/company-intelligence-file-storage.test.ts` from `backend`.
Expected: FAIL with missing ingestion module.

- [ ] **Step 3: Implement safe storage**

Use `KNOWLEDGE_STORAGE_DIR` with fallback `storage/company-knowledge`. Resolve every file under `<base>/<organizationId>/`; reject any resolved path outside that prefix. Reuse the existing organization upload limit. Accept PDF, DOCX, TXT and Markdown. Verify binary MIME with `file-type`; validate UTF-8 text separately. Store SHA-256 and reject a second active source with the same checksum in the organization.

- [ ] **Step 4: Implement deterministic extraction and chunking**

Add `pdf-parse` for PDFs and `mammoth` for DOCX. Normalize whitespace without removing paragraph boundaries. Split at headings/paragraphs into chunks of at most 4,000 characters with 300-character overlap. Return:

```ts
type ExtractedKnowledge = {
  title: string
  body: string
  chunks: Array<{ title?: string; body: string; tokenCount: number }>
}
```

- [ ] **Step 5: Persist one logical source in both existing consumers**

In one transaction create/update:

1. `knowledge_sources` as the canonical source;
2. `knowledge_entries` as the published/reviewable full text used by omnichannel;
3. `marketing_knowledge_documents` linked by `source_id`;
4. `marketing_knowledge_chunks` linked by both `document_id` and `entry_id`.

Never duplicate the extracted body into a third schema. Set documents to `indexing`, then `indexed`; publishing changes the entry and document to published-compatible statuses.

- [ ] **Step 6: Implement URL ingestion**

Reuse `readJinaUrl` and persist the normalized URL, title and returned Markdown. Do not crawl linked pages in this task; each URL is a separate, reviewable source.

- [ ] **Step 7: Queue file/URL extraction and register the worker**

Add `company-intelligence.indexKnowledge` to `JOB_NAMES`, enqueue it after the source record and file are durably stored, and make the handler idempotent by source/document ID. On failure, set `processing_error` and return the document to `draft` without publishing partial chunks.

- [ ] **Step 8: Run focused tests and backend checks**

Run from `backend`:

```bash
npm test -- tests/company-intelligence-ingestion.test.ts tests/company-intelligence-file-storage.test.ts
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 6: Build the Knowledge Base workspace

**Files:**
- Create: `frontend/src/components/company-intelligence/KnowledgeCreateDialog.tsx`
- Create: `frontend/src/components/company-intelligence/KnowledgeLibrary.tsx`
- Create: `frontend/src/components/company-intelligence/KnowledgeDocumentDrawer.tsx`
- Modify: `frontend/src/pages/client-portal/company/PortalKnowledgeBasePage.tsx`
- Modify: `frontend/src/services/companyIntelligenceService.ts`
- Create: `frontend/src/pages/client-portal/company/PortalKnowledgeBasePage.test.tsx`

**Interfaces:**
- Consumes: Task 5 endpoints.
- Produces: criação por texto, URL e arquivo; revisão, publicação, arquivamento e busca de preview.

- [ ] **Step 1: Write failing interaction tests**

Test: create manual text, upload two supported files, import URL, show indexing state, open extracted preview, publish, archive, filter by type/status and display processing error with retry action.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/pages/client-portal/company/PortalKnowledgeBasePage.test.tsx` from `frontend`.
Expected: FAIL because the page has no actions.

- [ ] **Step 3: Implement the creation dialog**

Provide tabs `Escrever conteúdo`, `Importar URL` and `Enviar documentos`. Text requires title and body; URL requires a valid HTTP(S) URL; upload supports PDF, DOCX, TXT and MD with per-file progress and the server-provided size limit.

- [ ] **Step 4: Implement review and governance**

The drawer displays source, extracted text preview, visibility (`Interno`, `Externo`, `Ambos`), allowed agent profiles, blocked agent profiles and status. Only explicit Publish makes it available to external agents. Archive is recoverable and replaces destructive deletion.

- [ ] **Step 5: Make downstream visibility explicit**

For each document show chips for `Marketing`, `Automação`, `WhatsApp/Atendimento` and `Estratégia`. These chips reflect the real publication and profile rules returned by the backend, not static marketing copy.

- [ ] **Step 6: Run frontend checks**

Run the focused test, `npm run type-check` and `npm run lint` from `frontend`.
Expected: PASS.

---

### Task 7: Inject organization context into every agent workflow

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_store.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/harness.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_customer_context.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_live_workflows.py`

**Interfaces:**
- Produces: `CustomerContextService.retrieve(organization_id, contract_id, profile_key, query, assistant_id=None)`.
- Produces in `retrieval_context`: `brand_summary`, `brand_rules`, `knowledge_snippets`, `product_summaries`, `customer_context` and evidence IDs.

- [ ] **Step 1: Write isolation and prompt tests**

Seed two organizations with different brand profiles and forbidden topics. Execute a workflow for organization A and assert that its compiled context contains only A. Assert that draft/archived knowledge is absent and that a profile blocked by `blocked_agent_profile_keys` cannot retrieve the source.

- [ ] **Step 2: Run pytest and verify failure**

Run: `python -m pytest tests/test_customer_context.py tests/test_live_workflows.py -q` from `workers/marketing-studio-agent-runtime`.
Expected: FAIL because runtime-readable tables and the service do not exist.

- [ ] **Step 3: Allow read-only runtime access to organization context tables**

Add these to `PostgresAgentRuntimeStore.readable_tables`: `organization_company_profiles`, `marketing_brand_profiles`, `marketing_products_services`, `knowledge_sources`, `knowledge_entries`, `marketing_knowledge_chunks`, `ai_assistant_knowledge_links` and `ai_assistant_safety_rules`. Do not add them to `writable_tables`.

- [ ] **Step 4: Build the tenant-safe selector**

Filter every row by `organization_id`. Prefer the requested contract brand profile; otherwise use the newest active profile for the same organization. Rank published chunks by query token overlap and recency, cap at four chunks and 6,000 total characters, and attach source IDs for traceability.

- [ ] **Step 5: Merge company context with YUX strategy retrieval**

In `StrategyWorkflowEngine.execute`, retrieve organization context after classification and merge it with the supplied context. Preserve the distinction:

```python
retrieval_context = {
    **strategy_context,
    **company_context,
    **supplied_context,
    "cards": strategy_cards + supplied_cards,
    "chunks": strategy_chunks + company_chunks + supplied_chunks,
}
```

Do not allow supplied request data to erase `forbidden_topics`, `compliance_notes` or blocked actions from persisted brand context.

- [ ] **Step 6: Compile brand and knowledge into prompts**

Pass `brand_summary`, products and knowledge snippets to `compose_prompt`. Add a `Guardrails obrigatórios` block containing forbidden topics, forbidden vocabulary and compliance notes. Keep the existing `<retrieved_context>` untrusted-data boundary.

- [ ] **Step 7: Run runtime tests**

Run: `python -m pytest tests/test_customer_context.py tests/test_harness.py tests/test_live_workflows.py -q`.
Expected: PASS.

---

### Task 8: Make WhatsApp use the configured assistant, brand and knowledge

**Files:**
- Modify: `backend/src/jobs/handlers/omnichannel.ts`
- Create: `backend/src/modules/omnichannel/assistant-context.ts`
- Modify: `backend/tests/omnichannel-ai-loop.test.ts`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_live_workflows.py`

**Interfaces:**
- Produces: `resolveConversationAssistant(pool, organizationId, conversationId)` returning `assistantId`, `profileKey`, `tone`, active safety rules and knowledge policy.

- [ ] **Step 1: Write the failing WhatsApp integration tests**

Create two active assistants with different `routing_priority`. Verify that inbound WhatsApp selects the lowest priority number, sends `assistant_id`, the assistant profile key and organization/contract IDs to the runtime. Verify that high-severity safety rules force approval or handoff when violated.

- [ ] **Step 2: Run the focused backend test and verify failure**

Run: `npm test -- tests/omnichannel-ai-loop.test.ts` from `backend`.
Expected: FAIL because the handler hardcodes `ai_sdr_comercial_1` and omits `assistant_id`.

- [ ] **Step 3: Resolve the active assistant**

Select an active assistant for the organization ordered by `routing_priority ASC, updated_at DESC`. Join `yux_strategy_agent_profiles` for `profile_key`. Include the organization client and active contract. If no assistant is active, keep the safe fallback and require human approval.

- [ ] **Step 4: Send complete tenant context to the runtime**

Pass `assistant_id`, `client_id`, `contract_id`, resolved `profile_key` and `conversation_id`. Let Task 7 retrieve brand/knowledge centrally; do not serialize entire documents in the webhook job payload.

- [ ] **Step 5: Enforce guardrails after generation**

Before automatic dispatch, reject a generated reply containing any normalized forbidden topic or forbidden vocabulary. Store `blockedByBrandGuardrail` and matched rules in message metadata, mark it `blocked`, and create a handoff event. This deterministic post-check protects against model noncompliance.

- [ ] **Step 6: Run backend and runtime tests**

Run the focused backend test and `python -m pytest tests/test_live_workflows.py -q`.
Expected: PASS.

---

### Task 9: Verify Marketing Studio, Radar and automations consume the same context

**Files:**
- Modify: `backend/src/modules/radar/analysis-service.ts`
- Modify: `backend/src/modules/automation/action-handlers.ts`
- Modify: `backend/tests/radar-analysis-service.test.ts`
- Modify: `backend/tests/automation-dispatch.test.ts`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 7 automatic runtime context.
- Produces: evidence that Radar, agent-driven automation and Marketing Studio reference the same context version/source IDs.

- [ ] **Step 1: Write context propagation tests**

For Radar, assert `organization_id`, `client_id` and `contract_id` reach the runtime. For an automation AI action, assert the same tenant tuple and `profile_key` reach the runtime. For Marketing Studio, assert the UI displays the context readiness returned by the API rather than only local counts.

- [ ] **Step 2: Fix missing tenant fields in callers**

Load client/contract IDs from the organization/campaign/flow and pass them to `/workflows/execute`. Do not pass brand text manually; Task 7 is the single retrieval point.

- [ ] **Step 3: Add context evidence to outputs**

Persist `brandProfileId`, `knowledgeSourceIds` and context hash in workflow `context_snapshot`/trace metadata. Surface a compact `Contexto usado` section in Marketing Studio for auditability.

- [ ] **Step 4: Run focused tests**

Run from `backend`:

```bash
npm test -- tests/radar-analysis-service.test.ts tests/automation-dispatch.test.ts
```

Run from `frontend`:

```bash
npm test -- src/components/marketing-studio/MarketingStudioWorkspace.test.tsx
```

Expected: PASS.

---

### Task 10: End-to-end verification, deployment notes and documentation

**Files:**
- Modify: `docs/implementation-status.md`
- Create: `docs/company-intelligence-operations.md`
- Modify: `.env.example`
- Modify: the production Compose file that mounts backend persistent storage

**Interfaces:**
- Produces: deployable and verifiable company intelligence hub.

- [ ] **Step 1: Add deployment configuration**

Document `KNOWLEDGE_STORAGE_DIR=/app/storage/company-knowledge` and mount that directory as a persistent volume in backend API and worker containers. The API and worker must see the same files.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
cd backend && npm test && npm run type-check && npm run build
cd ../frontend && npm test && npm run type-check && npm run lint && npm run build
cd ../workers/marketing-studio-agent-runtime && python -m pytest -q
```

Expected: all suites pass.

- [ ] **Step 3: Execute the manual YUX smoke test**

1. Open Crescimento YUX → Empresa → Perfil and save website, segment and positioning.
2. Open Marca e Tom de Voz and save tone, persona, preferred vocabulary, forbidden topic and compliance note.
3. Create one manual knowledge item, import one YUX site URL and upload one PDF/DOCX.
4. Wait for indexed status, preview the extracted text and publish all three.
5. Search for a term unique to each source and confirm the matching excerpt.
6. Run a Marketing Strategist workflow and inspect the context trace.
7. Run a Radar analysis and inspect the context trace.
8. Send a WhatsApp test message; confirm the suggested reply uses the configured tone.
9. Send a prompt that invites a forbidden claim; confirm blocking/handoff and no automatic external dispatch.
10. Open a second organization and confirm no YUX-only text appears.

- [ ] **Step 4: Update truthful product documentation**

Mark only verified flows as implemented. Document that FTS is active and vector embeddings remain optional until pgvector is enabled. Record supported file types, size limit, publication workflow, agent scope rules and recovery steps for failed indexing.

---

## Self-review

- Spec coverage: profile text, brand/tone, desired and forbidden language, compliance, manual content, URLs, file upload, publication, search, YUX internal workspace, Marketing, automation, Radar, WhatsApp and tenant isolation are each assigned to a task.
- No third knowledge store is introduced; existing omnichannel and Marketing tables are linked transactionally.
- The runtime performs central retrieval, while WhatsApp also has a deterministic post-generation guardrail.
- Users/Equipe and provider Integrations are intentionally separated because they are independent access/provider projects, not company knowledge.
- Type names and tenant tuple remain consistent: `organizationId`, optional `clientId`, optional `contractId`, optional `assistantId`, and `profileKey` at API boundaries; snake_case only in database/runtime payloads.
