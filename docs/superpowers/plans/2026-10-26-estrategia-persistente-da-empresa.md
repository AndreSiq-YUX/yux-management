# Estratégia persistente da empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar, editar e publicar estratégias flexíveis em Empresa, compartilhadas pelo Harness e propostas por Missões.

**Architecture:** O domínio `company-strategy` mantém revisões e publicações por organização. `CustomerContextService` acrescenta projeção autorizada ao workflow existente; a doutrina global e o RAG documental continuam com seus seletores atuais. Missões propõe conteúdo tipado e a página aplica/publica após revisão, sem executar ações comerciais.

**Tech Stack:** PostgreSQL 17, Fastify, TypeScript, Zod, React 18/Vite, Pydantic, pytest, Vitest e testes de integração existentes. Sem dependências ou provedores novos.

**Spec:** `docs/superpowers/specs/2026-10-26-estrategia-da-empresa-e-representadas.md`, seções 1–7, 9–11.

## Global Constraints

- "Organização é o escopo canônico. Contrato pertence ao contexto de acesso e execução, não fragmenta a estratégia da mesma empresa."
- "Publicar uma estratégia não cria campanha, não inicia pesquisa e não autoriza contato."
- "Salvar gera revisão de rascunho. A publicação anterior continua ativa."
- "Ausência de orientação externa não autoriza fallback para conteúdo interno."
- "Uma alteração não reescreve missões ou campanhas já aprovadas; nova execução ou replanejamento usa fonte atual e suas próprias aprovações."
- Cumprir `AGENTS.md`; zero chamadas pagas e nenhuma mudança de produção neste plano sem autorização específica.
- Estado inicial examinado: `a2c3feb`; confirmar base/branch, `git status` e próximo número de migration antes de executar. Não alterar checkout com trabalho de Projetos nem os documentos preexistentes de experimento Radar.

## Review Focus

- Duas pessoas editam/publicam ao mesmo tempo: conflito 409 preserva texto e nunca aplica a proposta sobre uma base diferente. Coberto em Task 1 e Task 4.
- SDR pede plano interno ou não há orientação externa: retorna somente projeção liberada, sem fallback. Coberto em Task 3.
- Mesma empresa tem dois contratos e outra empresa tem um: estratégia é compartilhada só dentro da primeira, sem cópia por contrato. Coberto em Task 1 e Task 3.
- Página recebe proposta ou edição incompleta após timeout/retry: idempotência mantém um rascunho e uma publicação. Coberto em Task 1 e Task 4.
- Conversa é consultiva, sem orçamento, módulos ou Action Pack: estratégia pode ser elaborada e publicada sem forçar execução. Coberto em Task 2, Task 4 e Task 5.

---

## Mapa de arquivos e limites

Criar `backend/src/modules/company-strategy/{schemas,repository,routes,context}.ts`: contrato, persistência/transações, HTTP e projeção autorizada. Registrar rotas em `backend/src/server.ts`. Criar migration `backend/src/db/migrations/0240_company_strategy.sql` (renumerar antes de executar se outro trabalho ocupar 0240; não renumerar migrations aplicadas).

Frontend novo: `frontend/src/types/companyStrategy.ts`, `frontend/src/services/companyStrategyService.ts`, `frontend/src/pages/client-portal/company/PortalCompanyStrategyPage.tsx`, componentes `frontend/src/components/company-strategy/{StrategyOverview,StrategyEditor,StrategyProposalReview}.tsx` e testes colocalizados. Reusar `PortalPage`, `SectionCard`, botões e proteção de edição existentes.

Runtime novo: `workers/marketing-studio-agent-runtime/yux_agent_runtime/company_strategy_context.py`. Modificar `customer_context.py`, `runtime_store.py`, `workflow.py`, `mission_contracts.py`, `mission_conversation.py`. Não criar outro Harness nem duplicar consulta no `context-builder.ts`.

Integração de Missões em `backend/src/modules/action-engine/{mission-conversations,mission-source-verifier}.ts`, `backend/src/jobs/handlers/action-engine.ts`, `frontend/src/types/actionEngine.ts`, `frontend/src/components/action-engine/{MissionConversationWorkspace,MissionConversationThread}.tsx`, contratos gerados e registro de navegação/rotas.

### Task 1: Domínio versionado e API manual

**Files:** criar módulos/migration acima; modificar `backend/src/server.ts`; testes `backend/tests/company-strategy.test.ts`, `backend/tests/integration/company-strategy.test.ts`.

**Interfaces:**
- `CompanyStrategyContentV1`: exatamente a seção 4 da spec; `CompanyStrategy` inclui `id,organizationId,clientId,version,isPrimary,archivedAt,draftRevision,publishedRevision`.
- `db` das operações públicas é `pg.Pool`; `CompanyStrategyRevision={id,strategyId,revisionNumber,content,contentHash,origin,createdBy,createdAt}`. `getCompanyStrategy(db,access,strategyId):Promise<CompanyStrategy>` fornece detalhe. Helpers transacionais internos recebem `pg.PoolClient`, de modo que aplicar proposta, gravar draft e marcar proposta aplicada usem o mesmo commit.
- `CompanyStrategyAccess={organizationId,actorId,role}` é resolvido na sessão; não aceitar role/autor do body.
- `listCompanyStrategies(db,access,{includeDrafts:boolean}):Promise<CompanyStrategy[]>`.
- `saveCompanyStrategyDraft(db,access,{strategyId?:string,expectedVersion:number|null,content:CompanyStrategyContentV1,idempotencyKey:string,origin:{kind:'manual'|'mission',proposalId?:string}}):Promise<CompanyStrategy>`.
- `publishCompanyStrategy(db,access,{strategyId:string,revisionId:string,expectedVersion:number,expectedContentHash:string,idempotencyKey:string}):Promise<CompanyStrategy>`.
- `setPrimaryCompanyStrategy(db,access,{strategyId:string,expectedVersion:number}):Promise<CompanyStrategy>` e `setCompanyStrategyArchived(db,access,{strategyId:string,expectedVersion:number,archived:boolean}):Promise<CompanyStrategy>`.
- HTTP raiz `/api/company-intelligence/organizations/:organizationId/strategies`: GET lista; POST cria draft; GET `/:strategyId`; PUT `/:strategyId/draft`; POST `/:strategyId/publish`, `/primary`, `/archive`, `/restore`. Contratos de input usam as funções acima; POST create não aceita strategyId e exige expectedVersion=null. includeDrafts não supera permissão.

- [ ] **Step 1: Escrever RED** nos dois arquivos de teste: `draft_keeps_published_revision`, `publish_rejects_stale_version`, `replay_does_not_duplicate`, `same_company_two_contracts`, `foreign_org_reference_denied`, `member_cannot_write_or_read_draft`, `publication_and_event_rollback_together`. Usar três títulos e seções diferentes dos exemplos da spec, sem enum de objetivo setorial.

  Asserções centrais, com fixtures `strategyId`, `revision1`, `revision2` e `actorA`:

  ```ts
  expect(saved.publishedRevision?.id).toBe(revision1.id)
  expect(saved.draftRevision?.id).toBe(revision2.id)
  expect(stalePublish.statusCode).toBe(409)
  expect(foreignOrganizationRead.statusCode).toBe(404)
  expect(memberWrite.statusCode).toBe(403)
  expect((await listCompanyStrategies(db, actorA, { includeDrafts: true })).length).toBe(1)
  ```
- [ ] **Step 2: Executar RED:** em backend, `npm test -- tests/company-strategy.test.ts`; esperado falhar pelo módulo ausente. Integração usa `createIntegrationRig({queueMode:'stub'})` e banco isolado verificado pelo rig.
- [ ] **Step 3: Implementar contratos e migration** com as quatro tabelas da spec, FKs compostas, índices por organização/estado, unique parcial de principal e gatilho de imutabilidade de revisões/publicações. API e runtime com privilégios distintos; RLS e guards seguem helpers existentes. REVOKE de acesso público. Origem/referências são validadas por organização e IDs reais.
- [ ] **Step 4: Implementar repository/routes** com lock na estratégia, CAS de version e idempotência transacional. Publicar somente draft atual e hash exato; principal e arquivamento incrementam versão e têm auditoria. Restaurar deixa sem publicação vigente até ato explícito. Sanitizar leitura de membro para somente conteúdo publicado. Erros: 403 para operação sem permissão, 404 para ID fora do escopo e 409 para versão/base obsoleta.
- [ ] **Step 5: Verificar GREEN:** comandos anteriores; `npm run test:integration -- tests/integration/company-strategy.test.ts`; `npm run type-check`. Papéis reais `yux_api/yux_runtime`, quatro atores e chamada HTTP direta; nenhuma chamada paga.
- [ ] **Step 6: Commit** somente arquivos da tarefa: `feat(company): add versioned company strategies`.

### Task 2: Página flexível e edição manual em Empresa

**Files:** tipos/serviço/página/componentes novos do mapa; modificar `frontend/src/App.tsx`, `frontend/src/lib/platform/navigation.ts`; testes `PortalCompanyStrategyPage.test.tsx`, `StrategyEditor.test.tsx`, `frontend/src/lib/platform/navigation.test.ts`.

**Interfaces:** serviço expõe `list,get,createDraft,saveDraft,publish,setPrimary,archive,restore` com input/output da Task 1. `StrategyEditor({content,onChange,saving})` edita o contrato V1; `StrategyOverview({strategy,onEdit,onPublish})` mostra publicação vigente e aviso de draft separado. URLs e labels exatamente seção 3 da spec.

- [ ] **Step 1: Escrever RED:** `manual_strategy_without_action_engine`, `sections_are_optional_and_reorderable`, `member_sees_published_only`, `failed_save_keeps_editor_text`, `stale_publish_shows_comparison`, `both_workspace_paths_use_same_record`. Formulários de oficina, sites e representante não exibem campos obrigatórios exclusivos de outro caso.

  ```ts
  expect(createStrategyButton.disabled).toBe(false) // fixture sem action_engine
  expect(editorTextAfterFailure).toBe('Priorizar revisões e agendamento na oficina')
  expect(sectionTitlesAfterReorder).toEqual(['Próximos passos', 'Públicos'])
  expect(memberHtml).not.toContain('Alterações em rascunho')
  ```
- [ ] **Step 2: Executar RED:** em frontend, `npm test -- src/pages/client-portal/company/PortalCompanyStrategyPage.test.tsx src/components/company-strategy/StrategyEditor.test.tsx src/lib/platform/navigation.test.ts`.
- [ ] **Step 3: Implementar página e navegação**, leitura por padrão, seções adicionáveis/reordenáveis, modo de edição, botões Salvar rascunho/Publicar para os agentes e histórico. Renderização segura reutiliza Markdown existente; sem HTML arbitrário ou novo editor/dependência. Sem chamada de IA ao abrir, editar, salvar ou publicar. Links usam `usePortalWorkspacePath`; validar disponibilidade de Missões antes de oferecer botão de conversa.
- [ ] **Step 4: Verificar GREEN**, `npm run type-check`, uso em viewport móvel e desktop via browser. Preservar componentes e rotas de Projetos, perfil, marca e conhecimento.
- [ ] **Step 5: Commit:** `feat(company): add strategy page and section editor`.

### Task 3: Contexto publicado compartilhado e proveniência

**Files:** novo `backend/src/modules/company-strategy/context.ts` e migration aditiva `backend/src/db/migrations/0241_company_strategy_context.sql` (confirmar número livre); runtime novo e cinco arquivos do mapa; modificar `backend/src/modules/action-engine/mission-source-verifier.ts` e `backend/src/jobs/handlers/action-engine.ts`; regenerar `contracts/mission-supervisor/v1/mission-wire.schema.json`, backend/frontend generated mission-wire; testes `backend/tests/integration/company-strategy-context.test.ts`, runtime `tests/test_company_strategy_context.py`, `tests/test_customer_context.py`, `tests/test_strategy.py`, `tests/test_mission_conversation.py`. Não editar a migration da Task 1 depois de aplicada, nem no banco de homologação local.

**Interfaces:**
- SQL `private.get_company_strategy_context_v1(target_organization_id uuid,target_contract_id uuid,target_profile_key text,target_audience text,target_query text,target_strategy_ids uuid[],target_max_chars integer) RETURNS jsonb`.
- Store `retrieve_company_strategy_context(*,organization_id,contract_id,profile_key,audience,query,strategy_ids,max_chars=6000)->dict`; implementações Postgres/InMemory e protocolo. Não adicionar tabelas de drafts à readable_tables genérica do runtime.
- `CompanyStrategyContextService.retrieve(...) -> {strategy_context:{index,selected,coverage,contextHash},sources:[]}` com argumentos do store. Cada selected tem `strategyId,revisionId,revisionNumber,projectionHash,title,objective?,summary?,sections`.
- `CustomerContextService.retrieve` acrescenta `company_strategy_context` e `company_strategy_sources`; ausência de estratégia retorna estrutura vazia comprovada, sem inventar defaults.
- `MissionSourceRefWire.kind` passa a aceitar `company_strategy` com identidade e sem IDs documentais falsos, exatamente seção 6 da spec.

- [ ] **Step 1: Escrever RED:** `published_only_across_contracts`, `sdr_receives_only_external_guidance`, `empty_external_guidance_has_no_internal_fallback`, `profile_and_audience_spoof_rejected`, `new_publication_changes_context_hash`, `archived_strategy_removed`, `constraints_survive_context_budget`, `actual_provider_payload_contains_strategy`. Testar requisição ao contexto sem acesso direto às tabelas com `yux_runtime` real.

  ```python
  assert 'Margem interna 25%' not in json.dumps(external_context, ensure_ascii=False)
  assert external_without_guidance['strategy_context']['selected'] == []
  assert new_context['strategy_context']['contextHash'] != old_context['strategy_context']['contextHash']
  assert provider_request['context']['company_strategy_context']['selected'][0]['revisionId'] == published_revision_id
  ```
- [ ] **Step 2: Executar RED:** runtime `python -m pytest tests/test_company_strategy_context.py tests/test_customer_context.py tests/test_strategy.py -q`; backend `npm run test:integration -- tests/integration/company-strategy-context.test.ts`.
- [ ] **Step 3: Implementar projeção SQL e store**, seguindo checks de sessão/contrato/perfil/audiência da migration 0238 e política de blocos. Seleção determinística principal/relevância e IDs validados, contagem de cobertura explícita, orçamento 6000. Sem embeddings ou chamadas pagas. Contexto da edição `workingDraft` nunca passa por esta função.
- [ ] **Step 4: Integrar serviço ao Harness** e encaminhar campo no payload de `_execute_harness_agent`, especialistas e síntese. Manter doutrina e documentos. Acrescentar fonte ao catálogo e verificador com reconstituição da projeção para nova proposta; resolver versão antiga somente na auditoria de plano congelado. Alterar validadores que verificam prefixo/namespace para aceitar `company_strategy` só no namespace customer.

  Preservar essa fonte em `composeVerifiedMissionContext` e nos dois caminhos de planejamento do handler, incluindo o caminho específico de `radar_prospecting`. Não inventar `sourceId` documental para uma revisão de estratégia. A seleção de audiência não pode depender apenas de `kind.startsWith('knowledge_')`. Usar o mesmo envelope canônico de hash do verificador existente (`id`, `version`, `content` da projeção autorizada integral), com teste de paridade Python/TypeScript. Adicionar `radar_plan_retains_company_strategy_revision` e verificar o conteúdo na requisição de planejamento enviada ao runtime simulado.
- [ ] **Step 5: Gerar contratos:** em backend `npm run generate:mission-contracts`; verificar diff e executar no runtime `python -m pytest tests/test_mission_contract_export.py tests/test_mission_conversation_contract.py -q`; backend `npm test -- tests/mission-wire-contract.test.ts`. Os três arquivos existem na base examinada.
- [ ] **Step 6: Verificar GREEN** das provas anteriores, contrato/schema e testes de fonte adulterada/tenant estrangeiro. Usar provedor simulado para Missões, criação de conteúdo e SDR; capturar payloads e fontes, não só resposta textual.
- [ ] **Step 7: Commit:** `feat(harness): share published company strategy context`.

### Task 4: Propostas de estratégia e revisões pelo agente de Missões

**Files:** schemas/repository/routes de company-strategy; `backend/src/modules/action-engine/{mission-conversations,mission-conversation-schemas}.ts`, handler; runtime `mission_contracts.py`, `mission_conversation.py`, `workflow.py`; frontend thread/workspace/types; novo `StrategyProposalReview.tsx`; contratos gerados; testes `backend/tests/company-strategy-proposals.test.ts`, `backend/tests/integration/company-strategy-proposals.test.ts`, runtime `tests/test_company_strategy_proposals.py`, frontend `StrategyProposalReview.test.tsx`.

**Interfaces:**
- Resposta `strategyProposal?:{strategyId?:string,baseRevisionId?:string,baseStrategyVersion?:number,content:CompanyStrategyContentV1,sourceRefs:string[]}`. Edição exige três campos base coerentes. Proposta nova não os inventa.
- `persistMissionStrategyProposal(db,access,{conversationId,messageId,responseHash,proposal}):Promise<{proposalId,strategyId?,status}>` recebe IDs da mensagem persistida do servidor e é idempotente por mensagem/hash.
- `applyCompanyStrategyProposal(db,access,{proposalId,expectedStrategyVersion:number|null,idempotencyKey}):Promise<CompanyStrategy>` usa `saveCompanyStrategyDraft` da Task 1 e valida base atual.
- GET `/api/company-intelligence/organizations/:organizationId/strategy-proposals/:proposalId`; POST no mesmo caminho `/apply` com input acima; fonte da proposta é a mensagem persistida, não conteúdo refeito no browser.
- POST `.../strategies/:strategyId/review-conversation` com `{expectedVersion,revisionId,message,clientMessageId}` valida configuração/permissão e passa referência de edição ao fluxo de criar conversa existente. `workingDraft` é contexto de edição separado, nunca fonte publicada.

- [ ] **Step 1: Escrever RED:** `consultation_without_pack_or_budget`, `proposal_does_not_publish_or_start_actions`, `propose_update_uses_current_base`, `stale_proposal_never_overwrites_manual_draft`, `message_retry_reuses_proposal`, `member_cannot_apply_forged_proposal`, `old_turn_without_proposal_still_valid` e teste de edição autorizada do draft sem vazamento aos outros agentes.

  ```ts
  expect(proposalTurn.brief.packKeys).toEqual([])
  expect(applied.publishedRevision?.id).toBe(previousPublishedRevision.id)
  expect(replayed.proposalId).toBe(firstAttempt.proposalId)
  expect(staleApply.statusCode).toBe(409)
  expect(await rig.providerCalls()).toHaveLength(0)
  ```
- [ ] **Step 2: Executar RED:** backend `npm test -- tests/company-strategy-proposals.test.ts`; runtime `python -m pytest tests/test_company_strategy_proposals.py -q`; frontend `npm test -- src/components/company-strategy/StrategyProposalReview.test.tsx`.
- [ ] **Step 3: Estender contrato Pydantic** com conteúdo V1 e opcional strategyProposal; regenerar tipos/schema. Não usar campos arbitrários de `understood` ou `brief.constraints` como mutação. Modo consultivo não confirma brief executável nem exige parâmetros de Radar.
- [ ] **Step 4: Persistir proposta no handler** depois das validações de fontes/tenant, sem alterar status de uma missão executável existente. Armazenar `proposalId` em metadata da mensagem, sem reescrever respostas antigas. Proposta malformada é rejeitada como proposta; não executar comandos inventados.
- [ ] **Step 5: Implementar cartão e revisão**, diferenças por seção, Salvar rascunho, link canônico ao registro e ação Pedir revisão ao agente. Falha de rede mantém a proposta/edição e reutiliza idempotencyKey; conteúdo deve continuar disponível ao recarregar.
- [ ] **Step 6: Verificar GREEN**, integração com `yux_worker/yux_api`, concorrência manual versus proposta e geração sem chamada paga. Publicação continua pela rota da Task 1; aplicar proposta não a publica.
- [ ] **Step 7: Commit:** `feat(missions): propose and revise company strategies`.

### Task 5: Homologação integrada e preparação da entrega

**Files:** criar `docs/runbooks/company-strategy-rollout.md`, teste `backend/tests/integration/company-strategy-journey.test.ts`; atualizar testes de navegação/contexto/conversa afetados e ledger neste plano.

**Interfaces:** somente as entregues nas Tasks 1–4; não criar fixtures em produção. Reusar rig e provedor local. Release manual registra commit de API/worker/runtime/frontend e migrations efetivamente aplicadas.

- [ ] **Step 1: Escrever e executar jornada** para representante, YUX e oficina: conversa simulada → proposta → draft → edição manual → publicação → novo turno de Missões → conteúdo → SDR seguro → revisão proposta concorrente → nova publicação. Asserções sobre registro/revisão/projeção no payload e zero chamadas externas, não só frases da resposta.

  ```ts
  expect(missionContextRevision).toBe(contentContextRevision)
  expect(contentContextRevision).toBe(publishedRevision.id)
  expect(sdrContextRevision).toBe(publishedRevision.id)
  expect(historicalPlanRevision).toBe(firstPublishedRevision.id)
  expect(await rig.providerCalls()).toHaveLength(0)
  ```
- [ ] **Step 2: Executar checks**: backend `npm test`, `npm run type-check`, integração de company-strategy; frontend testes novos e conversas/navegação mais `npm run type-check` e `npm run build`; runtime `python -m pytest -q`. Corrigir regressões pertinentes sem reformatar módulos alheios.
- [ ] **Step 3: Verificar no browser local** páginas nos dois contextos, quatro perfis, celular/desktop, refresh, falha de API, link de proposta e volta à conversa. Nunca marcar tentativa de fonte/ação externa como teste necessário deste plano.
- [ ] **Step 4: Preparar runbook** com ordem migration → API/worker → runtime → frontend; em atualização mista, só oferecer propostas depois de todos aceitarem o contrato. Documentar retirada da navegação/propostas e preservação dos registros para recuperação, sem DROP de tabelas em rollback. Leitura antiga ignora campo opcional.
- [ ] **Step 5: Revisão final e entrega** do diff e evidências. Publicação em produção e piloto pago dependem de autorização específica; não ampliar allowlist do Radar. Atualizar checkboxes somente com provas realmente executadas.
- [ ] **Step 6: Commit:** `test(company): verify shared strategy journeys and rollout`.

## Autorrevisão do plano

As Tasks 1–5 cobrem cadastro, página, agentes, conversa e validação. Modelos de negócio e representadas estão no plano seguinte e não bloqueiam esta entrega. A versão da empresa não é Strategy Pack global nem conhecimento documental duplicado. A leitura do runtime é restrita e a proposta não é publicação. Implementação ainda não iniciada.
