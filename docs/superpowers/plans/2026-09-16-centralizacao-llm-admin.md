# Centralização de LLMs no Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrar todos os modelos, provedores e fallbacks de LLM do sistema em `/admin/ai`, preservando as rotas e funções existentes.

**Architecture:** Reutilizar `model_routing_rules` como fonte de configuração única. Um catálogo dinâmico inclui perfis estratégicos, agentes de marketing e serviços técnicos; um resolvedor no runtime aplica a rota específica e seus fallbacks ordenados antes da rota global. Embeddings têm configuração e fallback global próprios, com proteção de identidade do espaço vetorial.

**Tech Stack:** Fastify, PostgreSQL, Zod, React/Vite, Python/FastAPI, Vitest, pytest.

**Spec:** Pedido do usuário nesta conversa de 2026-09-16: todos os modelos usados pelo sistema, incluindo principal, fallback manual por função e fallback global, devem ser configuráveis em uma única página administrativa.

## Global Constraints

- Não executar chamadas reais de LLM durante implementação ou testes; usar transportes simulados.
- Não escolher nem autorizar novos modelos pagos; manter apenas escolhas existentes ou configurações explícitas do Admin.
- Não apagar nem substituir rotas já salvas, inclusive tiers e overrides de organização, cliente, contrato e agente.
- Não modificar regras comerciais, ferramentas autorizadas, governança de conhecimento ou envio automático de mensagens.
- Segredos ficam no servidor, criptografados conforme o padrão existente; a página central inclui a gestão de provedores já existente.
- Não usar fallback global de texto para embeddings. Vetores de modelos distintos nunca são comparados como se pertencessem ao mesmo espaço.
- Implementar e verificar na branch dedicada existente `codex/yux-remediation-integrated`; preservar arquivos não relacionados. Não fazer deploy ou push sem a autorização aplicável.

---

### Task 1: Configuração central e consumo de todas as rotas

Este é um único entregável integrado: API, interface e runtime compartilham o mesmo contrato. Revisar o conjunto antes de encerrar.

**Files:**
- Create: `backend/src/modules/platform/llm-routing.ts` (catálogo/resolução/credenciais para embeddings; nomes podem ser especializados mantendo o contrato abaixo).
- Create: `backend/src/db/migrations/0173_centralized_llm_routing.sql` (próximo número disponível confirmado).
- Modify: `backend/src/modules/platform/adminRepository.ts`, `backend/src/modules/platform/routes.ts`.
- Modify: `backend/src/modules/company-intelligence/openrouter-embeddings.ts`, `backend/src/modules/company-intelligence/routes.ts`, `backend/src/jobs/handlers/company-intelligence.ts`, `backend/src/modules/strategy-engine/ingestion.ts`.
- Modify: `frontend/src/services/adminPlatformService.ts`, `frontend/src/pages/platform/AdminAiPage.tsx`, `frontend/src/components/platform/admin/LlmUseCaseRoutingPanel.tsx`, `frontend/src/pages/platform/StrategyEnginePage.tsx`.
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/llm_routing.py` (resolvedor e cliente compatível com as interfaces de chat/embeddings existentes).
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`, `providers.py`, `api.py`, `embedding.py`, `runtime_store.py`, e os serviços de curadoria/especialistas quando necessário.
- Test: testes de API/repositório Admin, embeddings backend, página Admin e Strategy Engine, resolução de rotas Python, curadoria, harness, supervisor e especialistas.

**Interfaces:**
- `AdminLlmRoute.agentType: string | null`; null preserva rotas legadas exclusivas por agente; preservar `routingTier: cheap | default | premium | fallback` e escopos `organizationId`, `clientId`, `contractId`, `agentId` opcionais/nulos.
- `fallbackRoutes: Array<{ provider: 'openrouter' | 'openai_direct'; modelName: string }>` representa fallbacks manuais ordenados, inclusive entre provedores. Preservar `fallbackModelName` como compatibilidade e migrá-lo sem duplicar tentativas.
- `AdminLlmUseCaseDefinition = { key: string; title: string; description: string; kind: 'chat' | 'embedding'; group: string }`.
- `GET /platform/admin/llm-use-cases` retorna catálogo fixo de serviços + perfis estratégicos + agentes de marketing + chaves de rotas existentes, sem duplicatas.
- `GET/POST /platform/admin/llm-routes` continua compatível, mas cobre todos os casos, escopos e tiers. Somente Admin escreve/testa.
- Chaves técnicas: `global_llm`, `global_embeddings`, `action_engine_strategist`, `mission_supervisor`, `strategy_curator`, `knowledge_curator`, `knowledge_embeddings`, `campaign_launch_specialist`, `funnel_nurture_specialist`, `automation_lead_classification`, `automation_message_generation`, `automation_proposal_generation`.
- As três ações AI das automações têm rotas próprias para classificar leads, gerar mensagens e gerar propostas. Sem configuração própria, herdam o perfil da automação para preservar o comportamento existente; esse roteamento não altera o perfil de conhecimento nem as permissões.
- Curadoria de Strategy Packs usa `strategy_curator`; inteligência empresarial/extrair perfil usa `knowledge_curator`; ingestão e busca vetorial de ambas as bases usam `knowledge_embeddings` (um mesmo modelo base, para compatibilidade).
- Especialistas de campanhas e nutrição ganham rotas próprias; quando ainda não configurados, herdam a rota já existente do supervisor para preservar comportamento.
- Todos os perfis do Strategy Engine, incluindo SDR/Closer/Suporte/Marketing, continuam sendo selecionados pelo mecanismo atual de vínculo assistente/perfil. Apenas a resolução do modelo muda.
- Precedência: override específico válido de escopo/tier → configuração da função → fallbacks manuais da função → principal/fallbacks globais. Sem rota da função, usar a global. Respeitar isolamento entre tenants, sem selecionar rotas alheias.
- Uma rota pausada/arquivada não autoriza chamadas. Modelos pagos só entram em allowlists a partir de rotas ativas explicitamente configuradas ou allowlist preexistente do ambiente. Não contornar negação de autorização com fallback.
- Recarregar rotas/credenciais na próxima execução, inclusive workflows, curadoria e embeddings (não deixar singleton antigo ignorando alterações do Admin).
- Manter limites, temperatura e rastreio do modelo realmente utilizado; seleção de provider não pode cair silenciosamente em outro provider.
- Importar configurações legadas do ambiente para rotas persistidas somente quando a rota correspondente não existir, sem sobrescrever escolhas do Admin, inclusive pausadas. O import deve respeitar a aprovação preexistente de modelos pagos, ser idempotente e ficar visível na página. Se isso não puder ser feito com segurança, retornar a configuração efetiva como origem legada claramente visível e permitir salvar para substituir; não esconder env atrás de campos vazios.
- Embeddings: fixar uma configuração efetiva por lote; fallback implica repetir o lote inteiro, nunca misturar modelos dentro de uma saída. Registrar identidade real do modelo. Consulta utiliza filtros de modelo/dimensão, e índices antigos permanecem intactos. Mostrar aviso de que trocar o modelo exige reindexação para manter cobertura da busca. Não iniciar reindexação paga automaticamente.

- [x] **Step 1: RED — testes de contrato e comportamento antes das alterações.**

```python
def test_fallback_order_and_provider_identity():
    # transport mock: primary fails, local fallback fails, global succeeds
    assert attempted_models == ["primary", "local", "global"]
    assert result["model"] == "global"
    assert result["provider"] == "openai_direct"

def test_tenant_route_isolation():
    assert resolve_for("organization-a") != route_for_organization_b
```

```typescript
// Existing growth_strategist premium route remains editable, without mutation.
expect(await getAdminLlmRoutes(pool)).toContainEqual(expect.objectContaining({ agentType: 'growth_strategist', routingTier: 'premium' }))
// Admin page exposes all service keys and fallback editor; legacy page links centrally.
expect(screen.getByRole('link', { name: /configurar.*IA\/LLM/i })).toHaveAttribute('href', '/admin/ai')
```

Run focused Vitest/pytest tests; record the expected RED output in the report. Implement concrete fixtures using existing test conventions, with no live provider calls.

- [x] **Step 2: Banco/API — ampliar o contrato sem excluir dados.**

```sql
ALTER TABLE public.model_routing_rules
  ADD COLUMN IF NOT EXISTS fallback_routes jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Preserve fallback_model_name for old consumers and existing data.
```

Validate ordered fallback objects and supported provider keys, trimmed nonempty names, existing scopes/tier/status/limits. List all existing routes; safely update by validated scope/id (do not reassign a route across tenants accidentally), and avoid inserting duplicate logical routes when saving twice without an id. Extend model test to use embeddings endpoint for embedding cases and return only safe metadata. The test button must explain that clicking it requests a real provider call and may incur cost; do not invoke it during development.

- [x] **Step 3: Python — uma cadeia efetiva para todos os serviços.**

```python
class RoutedLlmClient:
    def chat_completion(self, *, model, messages, **kwargs):
        # Delegate sequential attempts through explicit provider clients.
        # Return actual provider/model metadata; only provider failures trigger fallback.
        ...
    def embed_texts(self, texts, *, input_type, model, dimensions):
        # One model per complete batch, and compatible model/dimension filtering.
        ...
```

Implement actual code (the snippets specify the interface, not production bodies). Apply to Harness route calls, mission supervisor, independent campaign/funnel specialists, both curators and QueryEmbeddingService. Prefer shared builders in runtime_factory. Keep dependency injection of isolated stores and mocked services compatible. Refresh configuration lazily per request, without making health checks require providers or a database query.

- [x] **Step 4: Backend embeddings — usar a mesma rota persistida.**

Resolve selected provider, credential and model from `knowledge_embeddings`/`global_embeddings`, preserving legacy function callers and injected test transports. Wire database-aware configuration into all embedding call sites and checkpoint input hashes. Do not load a new route midway through a checkpointed batch. Keep approvals and vector validation. Retrieval records the actual query model/dimensions, not an unrelated environment default.

- [x] **Step 5: Interface — centralizar sem reduzir controles.**

Load providers/routes/catalogue concurrently in AdminAiPage. Use a selectable/filterable grouped catalogue rather than rendering dozens of huge editors. Preserve edits per exact scope/tier and display configured/inherited/legacy status. Expose main provider/model, ordered fallback providers/models, existing token/temperature/cost/status controls, and scope/tier overrides. Include global text and global embedding editors and warning about vector reindexing. Leave provider API-key save/test controls in this central page. Replace Strategy Engine model editor with an explanatory link to `/admin/ai`, preserving other tabs and profile settings. Update links/copy pointing at the old editor.

- [x] **Step 6: GREEN — verificar e revisar o conjunto.**

Run focused Admin API/repository, backend embeddings/ingestion, frontend Admin/Strategy tests and Python routing/runtime/curation/supervisor tests. Then run full backend/frontend type checks and Python suite, package tests/builds proportionate to touched code. Confirm no secrets logged, no live calls, no existing data overwritten, no hidden hardcoded active model path. Update release manifest if it requires the new migration. Record exact results and any preexisting failures separately. Commit only feature-owned files on the current branch; do not push/deploy.
