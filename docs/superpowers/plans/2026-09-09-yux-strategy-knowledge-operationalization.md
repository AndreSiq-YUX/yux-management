# YUX Strategy Knowledge Operationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a ingestão privada do The Black Book operacional de ponta a ponta, preservando o arquivo integral, distinguindo uploads legados sem bytes e mostrando ao operador o progresso real até a publicação recuperável pelos agentes.

**Architecture:** O upload continuará binário, transmitido em streaming para volume persistente, com hash SHA-256 e processamento assíncrono. O backend passará a publicar suas capacidades reais e aceitará arquivos configuráveis até um teto seguro de 256 MiB; o frontend consumirá esse contrato, bloqueará arquivos inválidos antes da transmissão, acompanhará jobs ativos e explicará registros legados que precisam de reenvio. A curadoria, revisão humana, publicação imutável e retrieval autorizado existentes permanecem como a única cadeia canônica.

**Tech Stack:** TypeScript, Fastify 5, PostgreSQL, BullMQ, React 18, Vite, Vitest, Python/FastAPI harness, OpenRouter e Jina Embeddings.

**Spec:** `docs/superpowers/plans/2026-09-05-yux-hub-correcao-melhorias-integradas.md` (T16-T22) e `docs/audits/2026-09-05/relatorio-auditoria-yux.md` (YUX-01/YUX-02)

## Global Constraints

- Não apagar o registro legado nem os cinco itens `seed_example`; preservar rastreabilidade e permitir uma nova publicação apenas com artefatos respaldados por documento e evidência literal.
- Não resumir, dividir ou recomprimir o livro para contornar limites; o arquivo integral de 119.183.723 bytes deve ser aceito.
- Manter upload em streaming, verificação de tamanho, MIME e SHA-256, quarentena, volume persistente compartilhado e retomada por checkpoint.
- Manter curadoria por LLM separada de embeddings: OpenRouter produz artefatos estruturados; Jina gera vetores de passagem/consulta com dimensão configurada.
- Não permitir autopublicação por LLM; aprovação humana e motivo continuam obrigatórios antes da publicação atômica.
- Nenhum conteúdo literal do livro pode ser exposto em contexto de cliente; a publicação inicial deve usar `internal_only` e bindings explícitos.
- O frontend deve usar o limite informado pelo backend, nunca um número divergente codificado na tela.

---

### Task 1: Contrato de capacidade para ingestão de livros completos

**Files:**
- Modify: `backend/src/modules/strategy-engine/ingestion.ts`
- Modify: `backend/src/modules/strategy-engine/routes.ts`
- Modify: `backend/src/jobs/registry.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `docker-compose.dokploy.yml`
- Test: `backend/tests/strategy-ingestion.test.ts`
- Test: `backend/tests/strategy-ingestion-capabilities.test.ts`

**Interfaces:**
- Consumes: `effectiveStrategyIngestionLimit(maxMb?: number): number`, `AppEnv`, rota autenticada `/api/strategy-engine/*`.
- Produces: `STRATEGY_INGESTION_DEFAULT_LIMIT_BYTES = 150 * 1024 * 1024`, `STRATEGY_INGESTION_HARD_LIMIT_BYTES = 256 * 1024 * 1024`, timeout dedicado de 30 minutos e `GET /api/strategy-engine/ingestion-capabilities` com `{ maxBytes, maxMb, acceptedMimeTypes, structuredIngestion: { curationEnabled, runtimeConfigured, embeddingConfigured, ready } }`.

- [ ] **Step 1: Escrever testes que fixam o teto, o padrão e o contrato sem expor secrets**

```ts
it('aceita o livro integral dentro do padrão de 150 MiB', () => {
  expect(effectiveStrategyIngestionLimit()).toBe(150 * 1024 * 1024)
  expect(effectiveStrategyIngestionLimit(200)).toBe(200 * 1024 * 1024)
  expect(effectiveStrategyIngestionLimit(300)).toBe(256 * 1024 * 1024)
})

it('expõe somente prontidão e limite', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/strategy-engine/ingestion-capabilities', headers: adminHeaders })
  expect(response.json()).toEqual(expect.objectContaining({
    maxBytes: 150 * 1024 * 1024,
    maxMb: 150,
    structuredIngestion: { curationEnabled: true, runtimeConfigured: true, embeddingConfigured: true, ready: true },
  }))
  expect(response.body).not.toContain('test-secret')
})
```

- [ ] **Step 2: Executar os testes e confirmar a falha pelo teto atual de 50 MiB e pela rota ausente**

Run: `npm test -- --run tests/strategy-ingestion.test.ts tests/strategy-ingestion-capabilities.test.ts`
Expected: FAIL com diferença `52428800` versus `157286400` e resposta 404 para capabilities.

- [ ] **Step 3: Implementar limites configuráveis e capabilities autenticadas**

```ts
export const STRATEGY_INGESTION_DEFAULT_LIMIT_BYTES = 150 * 1024 * 1024
export const STRATEGY_INGESTION_HARD_LIMIT_BYTES = 256 * 1024 * 1024

export function effectiveStrategyIngestionLimit(maxMb?: number) {
  const configured = Number.isFinite(maxMb)
    ? Math.max(1, Math.floor(maxMb!)) * 1024 * 1024
    : STRATEGY_INGESTION_DEFAULT_LIMIT_BYTES
  return Math.min(STRATEGY_INGESTION_HARD_LIMIT_BYTES, configured)
}
```

Registrar a rota com `requireInternalRole`, `getAuthenticatedUser`, `maxBytes = effectiveStrategyIngestionLimit(app.config.STRATEGY_INGESTION_MAX_MB)` e `structuredIngestion.ready = curationEnabled && runtimeConfigured && embeddingConfigured`. Configurar o `bodyLimit` da rota binária com o mesmo `maxBytes`. Alterar o schema de `STRATEGY_INGESTION_MAX_MB` para `.max(256)` e o padrão Dokploy/example para `150`.

Alterar somente `strategy.indexKnowledge` no registry para `1_800_000` ms. O worker de ingestão já é isolado e mantém heartbeat/checkpoints; os demais jobs conservam seus timeouts atuais.

- [ ] **Step 4: Executar testes unitários e type-check do backend**

Run: `npm test -- --run tests/strategy-ingestion.test.ts tests/strategy-ingestion-capabilities.test.ts && npm run type-check`
Expected: PASS em todos os testes e zero erros TypeScript.

- [ ] **Step 5: Commitar o contrato de capacidade**

```bash
git add backend/src/modules/strategy-engine/ingestion.ts backend/src/modules/strategy-engine/routes.ts backend/src/config/env.ts backend/src/jobs/registry.ts backend/.env.example docker-compose.dokploy.yml backend/tests/strategy-ingestion.test.ts backend/tests/strategy-ingestion-capabilities.test.ts
git commit -m "fix: support full strategy knowledge books"
```

### Task 2: Experiência guiada, legado explícito e acompanhamento automático

**Files:**
- Modify: `frontend/src/types/strategyEngine.ts`
- Modify: `frontend/src/services/strategyEngineService.ts`
- Modify: `frontend/src/pages/platform/StrategyEnginePage.tsx`
- Modify: `frontend/src/components/strategy-engine/StrategyPacksPanel.tsx`
- Test: `frontend/src/services/strategyEngineService.test.ts`
- Test: `frontend/src/components/strategy-engine/StrategyPacksPanel.test.tsx`
- Test: `frontend/src/pages/platform/StrategyEnginePage.test.tsx`

**Interfaces:**
- Consumes: `GET /strategy-engine/ingestion-capabilities`, `getStrategyIngestionJobs()` e os campos existentes `documentId`, `sha256`, `status`, `currentStep`, `proposedCounts`.
- Produces: `StrategyIngestionCapabilities`, `strategyEngineService.getStrategyIngestionCapabilities()`, `strategyEngineService.retryStrategyIngestion(id)`, callbacks `onRefreshJobs(): Promise<void>`/`onRetryJob(id): Promise<void>` e classificação `isLegacyMetadataOnly(job): boolean`.

- [ ] **Step 1: Escrever testes para limite dinâmico, prontidão e upload legado**

```tsx
expect(screen.getByText('PDF, TXT, Markdown ou DOCX, até 150 MB.')).toBeTruthy()
expect(screen.getByText('Reenvio necessário: este registro antigo guardou somente o nome do arquivo.')).toBeTruthy()
expect(screen.getByRole('button', { name: 'Enviar e processar' })).toBeDisabled()
```

Adicionar um teste de arquivo de `151 * 1024 * 1024` que não chama `onCreateJob`, mostra `O arquivo excede o limite de 150 MB`, e outro em que um job `queued` dispara `onRefreshJobs` pelo acompanhamento automático.

- [ ] **Step 2: Executar os testes e confirmar a falha pela interface atual fixa em 50 MB**

Run: `npm test -- --run src/components/strategy-engine/StrategyPacksPanel.test.tsx src/services/strategyEngineService.test.ts src/pages/platform/StrategyEnginePage.test.tsx`
Expected: FAIL porque o tipo/capabilities, a mensagem de legado e o polling ainda não existem.

- [ ] **Step 3: Implementar tipos, mapeamento e carregamento das capabilities**

```ts
export interface StrategyIngestionCapabilities {
  maxBytes: number
  maxMb: number
  acceptedMimeTypes: string[]
  structuredIngestion: {
    curationEnabled: boolean
    runtimeConfigured: boolean
    embeddingConfigured: boolean
    ready: boolean
  }
}
```

Adicionar `ingestionCapabilities` ao `StrategyAdminData`, carregá-lo no `Promise.all` principal e manter um fallback conservador `{ maxBytes: 50 * 1024 * 1024, maxMb: 50, acceptedMimeTypes: [], structuredIngestion: { curationEnabled: false, runtimeConfigured: false, embeddingConfigured: false, ready: false } }` apenas quando o endpoint realmente falhar.

- [ ] **Step 4: Implementar validação pré-upload e representação inequívoca do legado**

```ts
export function isLegacyMetadataOnly(job: StrategyIngestionJob) {
  return job.status === 'uploaded' && !job.documentId && !job.sha256
}
```

Na seleção e no submit, rejeitar `file.size > capabilities.maxBytes`. Quando `structuredIngestion.ready` for falso, desabilitar envio e mostrar quais dependências estão sem configuração. Para `isLegacyMetadataOnly(job)`, renderizar a mensagem de reenvio, sem oferecer publicação e sem chamar o registro de processado. Para jobs com documento preservado em `failed` ou `curation_unavailable`, mostrar **Retomar processamento**; a ação chama `POST /strategy-engine/ingestions/:id/retry`, que troca o estado para `queued` somente sem lease ativo e reaproveita hash/storage/checkpoints existentes.

- [ ] **Step 5: Implementar acompanhamento sem recarregar toda a página**

No `StrategyEnginePage`, criar `refreshIngestionState()` que busca em paralelo jobs, pack items, packs e estatísticas. Enquanto a aba `packs` estiver ativa e existir job em `awaiting_upload`, `uploading`, `queued` ou `extracting`, iniciar intervalo de 3 segundos; limpar o intervalo ao sair da aba ou quando todos alcançarem `completed`, `failed`, `extraction_requires_ocr` ou `curation_unavailable`. Depois do upload, manter o job visível com `proposedCounts.chunks/items/curationBatchesCompleted/curationBatchesTotal` e mensagens de etapa em português.

- [ ] **Step 6: Executar testes, lint focado e build do frontend**

Run: `npm test -- --run src/components/strategy-engine/StrategyPacksPanel.test.tsx src/services/strategyEngineService.test.ts src/pages/platform/StrategyEnginePage.test.tsx && npm run type-check && npm run build`
Expected: PASS; bundle budget dentro do limite.

- [ ] **Step 7: Commitar a experiência operacional**

```bash
git add frontend/src/types/strategyEngine.ts frontend/src/services/strategyEngineService.ts frontend/src/pages/platform/StrategyEnginePage.tsx frontend/src/components/strategy-engine/StrategyPacksPanel.tsx frontend/src/services/strategyEngineService.test.ts frontend/src/components/strategy-engine/StrategyPacksPanel.test.tsx frontend/src/pages/platform/StrategyEnginePage.test.tsx
git commit -m "fix: clarify and track strategy ingestion"
```

### Task 3: Prova de regressão da cadeia canônica

**Files:**
- Modify: `backend/tests/integration/strategy-upload.test.ts`
- Modify: `backend/tests/integration/curation-recovery.test.ts`
- Modify: `backend/tests/integration/knowledge-publications.test.ts`
- Modify: `backend/tests/integration/harness-grounding.test.ts`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_retrieval.py`
- Modify: `docs/company-intelligence-operations.md`

**Interfaces:**
- Consumes: upload binário, `strategy.indexKnowledge`, revisão, publicação, projeção e retrieval autorizado existentes.
- Produces: evidência automatizada de `arquivo -> documento -> chunks -> propostas -> revisão -> release -> cards/embeddings -> retrieval -> contexto do agente`.

- [ ] **Step 1: Adicionar um cenário de integração com PDF multipágina e artefato respaldado**

```ts
expect(job).toMatchObject({ status: 'completed', current_step: 'review' })
expect(document.source_hash).toMatch(/^[a-f0-9]{64}$/)
expect(chunks.map(row => row.metadata.sourceLocator)).toEqual(expect.arrayContaining(['page:1:chunk:1', 'page:2:chunk:1']))
expect(proposal.payload.evidence[0]).toEqual(expect.objectContaining({ documentId, documentHash: document.source_hash, locator: 'page:1:chunk:1' }))
```

- [ ] **Step 2: Adicionar asserções de que seed legado não pode ser publicado na projeção nova**

```ts
await expect(publishStrategyPack(pool, { packId, approvedItemIds: [seedItemId], expectedVersion: 1, publishedBy: userId }))
  .rejects.toThrow('strategy_publication_item_source_required')
```

- [ ] **Step 3: Executar integrações e testes do runtime**

Run: `npm run test:integration -- --run tests/integration/strategy-upload.test.ts tests/integration/curation-recovery.test.ts tests/integration/knowledge-publications.test.ts tests/integration/harness-grounding.test.ts`
Expected: PASS quando PostgreSQL e Redis de teste estiverem disponíveis.

Run: `python -m pytest tests/test_retrieval.py tests/test_grounding_consumers.py -q`
Expected: PASS com filtros de release atual, binding, perfil e visibilidade preservados.

- [ ] **Step 4: Documentar a operação exata do livro privado**

Adicionar a `docs/company-intelligence-operations.md`: limite padrão 150 MiB/teto 256 MiB; volume compartilhado; requisito de OpenRouter no harness e Jina no worker; estados do job; necessidade de reenviar uploads `uploaded` sem `document_id`/`sha256`; revisão amostral por página; publicação `internal_only`; perguntas de smoke test e inspeção das referências recuperadas.

- [ ] **Step 5: Commitar as provas e o runbook**

```bash
git add backend/tests/integration/strategy-upload.test.ts backend/tests/integration/curation-recovery.test.ts backend/tests/integration/knowledge-publications.test.ts backend/tests/integration/harness-grounding.test.ts workers/marketing-studio-agent-runtime/tests/test_retrieval.py docs/company-intelligence-operations.md
git commit -m "test: prove governed strategy knowledge flow"
```

### Task 4: Implantação e validação controlada em produção

**Files:**
- Modify: `docs/execution/yux-remediation/journal.md`

**Interfaces:**
- Consumes: imagem implantada, migrations existentes, arquivo local `The Black Book.pdf` de 119.183.723 bytes e SHA-256 `DDCB88BF2C11DFD6DCE510ABD1DB6D2FA20E38CBB235B8010658A8D7904C396B`.
- Produces: release publicada com hash imutável, cards projetados, embeddings e traces de retrieval usados pelo `growth_strategist` e pelo Actual Engine.

- [ ] **Step 1: Rodar verificação completa antes do push**

Run: `npm test && npm run type-check && npm run build` em `backend` e `frontend`, seguido dos testes Python do runtime.
Expected: todos os comandos PASS; nenhum arquivo privado adicionado ao Git.

- [ ] **Step 2: Fazer push da branch e implantar pelo Dokploy**

Run: `git push origin codex/yux-remediation-integrated`
Expected: commit remoto igual ao HEAD local e serviços API, worker de ingestão, harness e frontend saudáveis após o deploy.

- [ ] **Step 3: Confirmar configuração operacional antes de transmitir o livro**

Abrir Strategy Packs e confirmar `Limite: 150 MB`, `Curadoria: configurada`, `Embeddings: configurados` e `Harness: configurado`. Confirmar volume persistente montado em API e worker e ausência de jobs ativos antigos.

- [ ] **Step 4: Solicitar confirmação humana no momento exato do upload privado**

Informar: “O próximo clique enviará `The Black Book.pdf` (119.183.723 bytes, SHA-256 `DDCB…396B`) do computador local para o Strategy Pack privado `Doutrina YUX Growth Blackbook` em produção. Posso enviar agora?” Não selecionar nem transmitir o arquivo antes da resposta afirmativa.

- [ ] **Step 5: Acompanhar extração e curadoria até estado terminal**

Esperar o job passar por `queued -> extracting/extraction -> curation -> embedding -> completed/review`. Validar no banco que existem um `source_document` com o hash esperado, chunks com locators de página, propostas com evidência válida e embeddings de 1024 dimensões. Se falhar, preservar arquivo/documento e usar a retomada recuperável; não criar upload duplicado sem investigar.

- [ ] **Step 6: Revisar e publicar uma primeira versão interna**

Revisar uma amostra distribuída pelo começo, meio e fim do livro, rejeitar duplicidades/conflitos, aprovar somente itens com evidência literal conferida e motivo. Publicar `internal_only` para `growth_strategist` e perfis explicitamente escolhidos, mantendo perfis de atendimento externo bloqueados.

- [ ] **Step 7: Validar retrieval e consumo pelos dois agentes**

Executar perguntas distintivas de diagnóstico, desenho de funil, recuperação de clientes e estratégia de oferta. Confirmar que o trace referencia o release atual e cards respaldados, que o agente estratégico usa as regras na recomendação, que o Actual Engine usa os mesmos identificadores publicados e que nenhum trecho literal interno aparece para contexto de cliente.

- [ ] **Step 8: Registrar evidências sem copiar conteúdo protegido**

Anotar no journal: commit, horário do deploy, ingestion id, document id, hash do arquivo, contagens de chunks/propostas/aprovados/rejeitados, release id/hash, bindings testados e resultados dos traces. Não registrar texto integral nem trechos longos do livro.
