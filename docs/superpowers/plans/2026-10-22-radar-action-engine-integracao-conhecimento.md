# Radar Comercial no Action Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma missão compreenda o Radar, crie uma campanha adequada, solicite e acompanhe pesquisas autorizadas e apresente resultados reais, usando os comandos canônicos do Radar e conhecimento publicado com evidência.

**Architecture:** Conhecimento operacional aprovado orienta a decisão; capabilities versionadas e um Action Pack próprio autorizam os comandos. Um adaptador entre a missão e o domínio Radar conserva identidade do solicitante, organização, revisões e idempotência. Lotes continuam no orquestrador durável existente; a missão acompanha os IDs reais por uma espera persistida e apresenta uma projeção comercial.

**Tech Stack:** TypeScript/Fastify, PostgreSQL, BullMQ, Zod, Action Engine, React/Vite, Python/Pydantic Harness, Vitest, pytest e Playwright. Sem novo fornecedor ou framework de agentes.

**Spec:** docs/knowledge/radar-commercial-action-engine.md e docs/radar-commercial-execution-reference.md, versão 1.0 de 22/10/2026; AGENTS.md deste worktree. As decisões de integração abaixo completam o contrato de implementação.

**Base analisada na elaboração do plano:** worktree radar-brave-state-fixes, HEAD 831bc1e, em 22/10/2026. O checkout principal da conversa está em outro commit e tem alterações de projetos em andamento. Este plano se refere ao worktree dos dois documentos. Não comprova configuração ou deploy em produção.

**Execução autorizada posterior:** implementação assistida na branch codex/radar-action-engine-assisted, com preparação do guia para revisão. Código local e testes executados; conhecimento real ainda não publicado. Os checkboxes abaixo preservam os gates do plano completo, incluindo homologação/publicação, e não significam que todo o plano foi liberado. Estado por etapa:

| Etapa | Estado da entrega assistida |
| --- | --- |
| 1 | Guia v1.1, oito propostas com evidências/hash e checklist preparados; ingestão e publicação reais pendentes. |
| 2–4 | Contratos, identidade, projeções, dez capacidades, idempotência e aprovação concreta implementados. Somente assisted; sem compensador fictício. |
| 5 | Espera persistida e recuperação implementadas; reinício, falha de confirmação e crash após aceite testados com PostgreSQL e fila injetada. Redis distribuído pendente. Polling fixo de 15s nesta versão, sem backoff adaptativo. |
| 6 | Retrieval governado e revalidação integrados às entradas de planejamento; publicação/binding/revogação testados com fixture e worker real. Qualidade com Harness/LLM real pendente. |
| 7 | Pack próprio e roteamento implementados; criação ou seleção explícita de campanha, um lote novo, sem DAG alternativo de retomada. Claim de criação é por missão e mantido até o término, junto ao claim de campanha. |
| 8 | Briefing, artefatos, aprovação e métricas comerciais implementados; adaptadores secundários registrados, jornadas completas pós-criação ficam para extensão versionada. |
| 9 | Adiada: autonomia e recorrência não habilitadas nesta entrega. |
| 10 | Testes locais, revisão independente e roteiro de rollout executados/preparados. Publicação, deploy, Redis real e canário pago pendentes; gate permanece desligado. |

Evidências, comandos, limitações e correções da revisão: [runbook da liberação assistida](../../runbooks/radar-action-engine-rollout.md).

## Global Constraints

Requisitos literais das fontes:

- “Salvar não inicia pesquisa.”
- “Documentação, permissão de leitura ou conhecimento recuperado não concedem execução.”
- “Nunca usar uma ação de campanhas de publicidade para simular a criação de campanha do Radar.”
- “Retries de transporte do **mesmo pedido** reutilizam seu `requestId` e payload. Uma **nova intenção** recebe outro UUID.”
- “Não ingerir este documento em conhecimento comum de clientes/operadores.” — referência técnica.
- “Somente o papel global `yux_admin` pode receber/ver ferramentas, fornecedores, modelos, rotas LLM, licenças, custos internos e diagnósticos técnicos do Radar.”
- “Não executar chamadas a provedores/LLMs externos pagos nem trocar/ativar um modelo pago sem autorização explícita do usuário para o serviço/modelo.”
- “Publicar código não autoriza deploy, piloto pago ou mudança de credenciais/limites.”

Decisões desta integração:

- Release inicial de execução regional limitada ao Admin YUX global, respeitando as restrições atuais. Clientes/operadores podem receber explicação comercial e preparar pedido, sem herdar a identidade de Admin do worker.
- Autonomia significa executar uma autorização delimitada. Não permite aumentar limites, repetir cobrança incerta, dispensar revisão ou iniciar contato comercial.
- Criar, duplicar, editar critérios, pesquisar novas empresas, retomar e atualizar/reanalisar são comandos distintos.
- Preservar as regras de defaults de criação, sem ativar campanhas históricas pela leitura.
- Não reimplementar descoberta, enriquecimento, capacidade, deduplicação ou recibos dentro do Action Engine.
- Não expor a referência técnica nem diagnósticos brutos em contexto compartilhado do modelo, timeline, artefatos, exportações ou retorno do agente a clientes/operadores.
- Reutilizar os quatro modos existentes: shadow/prepare sem efeitos externos; assisted com aprovação concreta; autonomous somente com grant vigente e limites verificáveis. Na release inicial, pesquisa paga exige aprovação sempre.

## Review Focus

1. “Campanha” pode significar publicidade ou pesquisa comercial: intenção Radar explícita nunca seleciona campaign_launch; ambiguidade pede esclarecimento. Teste da tarefa 7.
2. Um worker interno pode inadvertidamente assumir yux_admin: revalidar identidade/permissões do responsável no momento da execução, inclusive revogação após aprovação. Testes das tarefas 2 e 4.
3. HTTP 202, reinício ou resposta perdida podem produzir duplicação ou sucesso prematuro: o mesmo pedido recupera o mesmo ID; pesquisa só termina após estado canônico. Testes das tarefas 3 e 5.
4. Uma campanha pode mudar entre preflight e execução: revisão e hash aprovados precisam continuar iguais; mudança exige nova avaliação/aprovação. Testes das tarefas 2 e 4.
5. A documentação está correta mas não chega ao planejamento: comprovar binding real, fonte publicada, compatibilidade dos caminhos de criação e revogação. Testes das tarefas 1 e 6.

---

## 1. Diagnóstico confirmado

| Fronteira | Estado nesta base | Consequência |
| --- | --- | --- |
| Catálogo executável | 46 capabilities; nenhuma radar.* | Saber o procedimento não permite executar o Radar |
| Roteador Python | A palavra campanha seleciona campaign_launch | Pedido explícito de campanha Radar foi roteado para publicidade na reprodução local |
| Pacotes de missão | Catálogos/rotas têm listas explícitas de revenue_recovery, funnel_nurture, campaign_launch; o worker inclui também optimization | Registrar uma capability isolada não basta; pack e seleção também precisam mudar |
| Radar | Comandos e operações duráveis já existem | Integrar essas fronteiras, sem criar um segundo motor de pesquisa |
| Autorização regional | createRadarCampaign e preflight exigem yux_admin | Uma capability não pode contornar essa restrição |
| Projeção comercial | commercial-view.ts tem allowlists explícitas | Chamar o serviço diretamente pode pular a projeção aplicada na rota HTTP |
| Conhecimento | Publicação, evidência, bindings e revalidação existem | Utilizar o fluxo governado, verificando o consumo real |
| Contexto de intake | growth_strategist / marketing_studio / mission_intake_conversation | Binding apenas no módulo radar não atende o intake atual |
| Planejamento legado | buildMissionOperationalContext retorna strategyItems vazio; contexto verificado só é composto quando existe conversa vinculada com trace | Não prometer grounding a toda missão por simples upload |
| Executor assíncrono | Espera especial para system.signal.wait e human.task.create | Uma nova capability que retorna operationId seria finalizada imediatamente sem uma espera própria |
| Confidencialidade | internal_only não significa Admin global exclusivo | O documento técnico não deve ser colocado no mesmo pack de operação |

**Reproduções executadas, sem provedor externo:**

    createActionEngineCapabilityRegistry().listMetadata()
    => total=46, radar=[], campaign.create_draft=true

    MissionRouter.route("Crie uma campanha no Radar Comercial para pesquisar 100 empresas")
    catálogo atual de três packs
    => selected_pack_keys=["campaign_launch"]

A função Radar que já usa Harness para analisar uma oportunidade não representa acesso inverso do Action Engine aos comandos do Radar.

## 2. Como inserir o conhecimento

### 2.1 Guia funcional: publicar como conhecimento operacional da plataforma

Usar **Admin → Strategy Engine → Strategy Packs**, não cadastrar o manual como fato comercial de uma empresa cliente, nem misturá-lo ao pack de metodologia de livros.

1. Criar pack **Radar Comercial — Operação governada**, chave proposta **radar_commercial_operations**, categoria operacional. Escopo compartilhado da plataforma, com bindings por organização; não usar um owner que torne o pack invisível aos demais clientes autorizados.
2. Enviar o arquivo integral **docs/knowledge/radar-commercial-action-engine.md** como playbook interno ou tipo documental equivalente. Conferir prontidão da ingestão antes de enviar.
3. Acompanhar upload real, documentId, SHA-256, extração, curadoria e embeddings. Metadata do arquivo e status uploaded não encerram essa etapa.
4. Revisar os artefatos estruturados abaixo. Conservar evidências literais com documentId, hash e localização; não publicar um resumo livre sem vínculo com a fonte.
5. Publicar versão imutável com visibilidade **client_safe**, somente após verificar que não contém mecanismos técnicos, fornecedores ou custos. O documento técnico fica fora desse upload.
6. Para o consumidor atual, permitir **growth_strategist** e criar binding com organização piloto explícita, módulo **marketing_studio**, workflow **mission_intake_conversation**, canal vazio. São as chaves usadas pelo código atual, não uma recomendação de chamar Radar de marketing no produto.
7. A tarefa 6 introduz escopo Radar explícito sem romper o intake; quando isso estiver entregue, acrescentar bindings **radar / radar_commercial_mission** aos consumidores correspondentes. Não substituir o binding atual antes de atualizar e provar o consumidor.
8. Testar uma consulta de operação e rastrear publicationId/itemId/hash/queryId até o contexto da resposta. Depois revogar o binding e provar que nova consulta/decisão deixa de usar a fonte.

**Owner versus binding:** uma publicação cujo pack pertence exclusivamente à organização interna pode ficar inelegível para clientes, mesmo com binding para eles. Não corrigir isso abrindo tudo como global sem revisão. Para o piloto interno, owner/binding interno são suficientes; para distribuição, usar pack operacional compartilhado e bindings explícitos.

Artefatos sugeridos:

| Artefato | Conteúdo a conservar | Evidência de origem |
| --- | --- | --- |
| Playbook — Criar campanha | Objetivo, público, região, oferta, critérios, quantidade; salvar separado de pesquisar | Seções 2, 4 e 5 |
| Card — Campanha, lote e lead | Objetos diferentes; encontrado não significa aprovado | Seções 1 e 6 |
| Playbook — Nova pesquisa e retomada | Novo lote, continuação, duplicatas e registros existentes | Seções 6 e 7 |
| Card — Refresh versus reanalyze | Informação nova versus análise dos dados salvos | Seção 7 |
| Rubrica — Qualidade | Identidade, aderência, contatos, lacunas e evidências | Seções 4 e 8 |
| Card — Direitos e contato | Descoberta/exportação/lead não autorizam mensagem | Seções 1 e 9 |
| Card — Disponibilidade | Conferir capacidade; não inventar execução pela documentação | Seções 9 e 10 |
| Playbook — Explicar resultado | Aceito, em execução, parcial, bloqueado e completo | Seções 6, 8 e 10 |

A curadoria existente admite playbook, concept_card, rubric e prompt_rule, mas a projeção publicada para cards processa **concept_card/playbook/rubric**. Usar esses três tipos para os itens essenciais. Restrições executáveis também devem estar em schemas/políticas, nunca depender da recuperação de um prompt_rule.

Não colocar limites numéricos mutáveis ou fornecedores em cards. Configuração, entitlement, quantidade disponível, capacidades registradas e orçamento são fatos vivos consultados no backend.

### 2.2 Documento técnico: referência de implementação e governança

Manter **docs/radar-commercial-execution-reference.md** versionado no repositório e acessível à equipe/Admin. Não enviar ao conhecimento comum de clientes ou operadores.

Mesmo internal_only pode ser recuperado em audiência internal_operator; o perfil growth_strategist também é usado por outros fluxos. Se futuramente for necessário RAG técnico para Admin, criar um repositório/consulta com ACL de **yux_admin global** comprovada até prompt, trace e projeção. Essa expansão não é requisito para executar Radar: a integração pode funcionar com contratos tipados e o guia funcional seguro.

### 2.3 O que o conhecimento não substitui

- **Conhecimento:** explica quando escolher uma operação e quais perguntas fazer.
- **Capability:** define entrada/saída, risco, efeito, autorização e execução.
- **Action Pack:** permite combinações revisadas dessas capabilities e fixa a sequência.
- **Estado vivo:** informa configurações, revisões, autorização, capacidade e progresso.
- **Comandos Radar:** executam sobre os serviços reais e conservam histórico.

Após entregar capabilities, atualizar a seção 10 do guia e republicar a versão: a frase de indisponibilidade vale para a versão atual. O novo texto deve mandar consultar o catálogo efetivo. Não remover as restrições só porque apareceu um pack.

## 3. Catálogo proposto e contrato de segurança

**Todos os nomes abaixo são novos/propostos; nenhum está disponível hoje.** Versão inicial das capabilities: 1.

| Capability | Entrada comercial principal | Resultado | Efeito/aprovação inicial |
| --- | --- | --- | --- |
| radar.campaign.inspect | campaignId opcional; filtros comerciais de listagem | Configuração e revisões elegíveis | none / never |
| radar.campaign.create | Nome, segmento, estados/cidades, oferta, critérios comerciais | campaignId e duas revisões; pesquisa não iniciada | internal / never, após autorização do plano |
| radar.campaign.duplicate | campaignId, nome opcional | Nova campanha sem resultados/cursor/calibração | internal / risk_based |
| radar.campaign.criteria.update | campaignId, expectedCriteriaRevision, critérios | Nova revisão ou conflito | internal / always |
| radar.capture.preflight | campaignId, configurationRevision, requestedCount | Prontidão e impedimentos comerciais; hash opaco | none / never |
| radar.capture.start | Mesmo pedido aprovado + autorização persistida | operationId, requestId, status accepted | external / always |
| radar.capture.resume | operationId, configurationRevision | Mesmo lote retomado ou pendência | external / always |
| radar.research.request | campaignId, criteriaRevision, candidateIds, intent | requestId e referência persistida | external / always |
| radar.operation.await | operationType, operationId, deadlineAt | Aguardando, bloqueado, parcial ou terminal | none / never |
| radar.results.inspect | campaignId, candidateIds opcionais, paginação | Resultados comerciais com cobertura/evidência | none / never |

**Módulo:** radar. Leituras exigem radar.read, mutações radar:manage e action_engine.write no acesso de missão. Modos respeitam CapabilityDefinition e política existente. Não criar permissões paralelas com grafia divergente.

Criar campanha persiste configuração, mas não dispara pesquisa. Não é chamado de create_draft se o comando canônico não garantir estado draft. No modo prepare, o efeito internal vira simulação pela política atual; mostrar prévia sem afirmar que a campanha foi salva.

**Identidade confiável:** organizationId/missionId/actionRunId/actor/idempotencyKey vêm do executor. O schema do modelo não aceita organização, papel, token, fonte, modelo ou aumento de limite. Revalidar a organização de cada recurso também para Admin/operador; requireRadarScope faz early return nesses papéis e não substitui o escopo da missão.

**Exceções:** aumento de limites, autorização de repetição incerta, mudança de licença/modelo/fonte, descarte probabilístico, reinício expirado e exceção TLS ficam fora dessas entradas comerciais. Retornar needs_admin_action com código comercial estável. Não fabricar os recibos necessários.

**Pesquisa paga:** aprovação do início do lote vincula organização, campanha, revisão, quantidade, configuração e teto autorizado por hash. Alteração invalida o aceite. Teto ausente/indeterminado bloqueia pesquisa; não vira infinito. dailyLimit/budgetLimit e controles técnicos são derivados da política/grant autorizado, nunca escolhidos pelo modelo. Não chamar o provedor durante preflight de missão, shadow ou prepare. Auditar getRadarCapturePreflight e dependências; se algum probe pago existir, preparar uma inspeção local equivalente, sem simular provider.

**Entrega posterior:** exportação e entrega ao CRM continuam nos endpoints governados existentes, fora do primeiro pack. Acrescentá-las depois exige capability própria, direitos de entrega, revisão e destino; entregar em lotes de no máximo 25 conforme contrato atual. Mensagens e nutrição exigem fluxo e autorização próprios.

## 4. Interfaces novas entre componentes

Contratos propostos em **backend/src/modules/radar/action-engine-contracts.ts**; schemas strict, sem Record aberto como entrada do modelo.

    RadarMissionContext = {
      organizationId: string; missionId: string; actionRunId: string;
      actorUserId: string; idempotencyKey: string;
      mutationLease: string; fencingToken: string;
    }
    RadarOperationRef = {
      operationType: 'capture' | 'research';
      operationId: string; requestId: string; campaignId: string;
      configurationRevision: number; criteriaRevision: number;
    }
    RadarAccepted = { status: 'accepted'; ref: RadarOperationRef }
    RadarCommercialOutcome = {
      status: 'completed' | 'partial' | 'blocked';
      ref: RadarOperationRef;
      counts: {
        requested: number; found: number; complete: number;
        withGaps: number; outsideProfile: number; waiting: number;
        approved: number;
      };
      message: string; campaignHref: string;
    }

Os nomes de contagem são DTOs novos; mapear a partir do contrato Radar e declarar a semântica. Não somar insuficientes/bloqueados como conjuntos disjuntos sem verificar se se sobrepõem. Unknown fica ausente/null conforme schema; nada vira zero fictício.

Para research, operationId é o ID interno de radar_research_requests, enquanto requestId é o UUID da intenção usado pelas rotas. Resolver pelo vínculo persistido; não trocar essas identidades. Uma referência carrega ambas.

Serviços novos:

    resolveRadarMissionActor(pool, context): Promise<AuthUser>
    previewRadarCaptureForMission(pool, context, input): Promise<RadarMissionPreflight>
    executeRadarMissionCommand(pool, context, command): Promise<RadarCommandResult>
    inspectRadarMissionOperation(pool, context, ref): Promise<RadarOperationState>
    reconcileRadarMissionOperations(pool, queue, options): Promise<{checked:number;resolved:number}>

**RadarMissionPreflight:** objeto strict com allowed, public blockers/warnings, campaignId, configurationRevision, criteriaRevision e approvalSubjectHash. Material administrativo de capacidade/preflight é mantido no backend para validar o aceite e não é entregue ao contexto comercial.

**RadarCommandResult:** union tipada para campanha criada/duplicada/alterada ou RadarAccepted. A operação de leitura não usa comando mutante nem cria intenção.

**RadarOperationState:** union strict {kind:'pending',nextCheckAt} | {kind:'blocked',outcome} | {kind:'terminal',outcome}. Para capture, queued/discovering/researching são pending; blocked requer intervenção; completed/partial devem considerar itens ainda em andamento antes de fechar. Para research, accepted/running são pending; waiting requer intervenção; completed/unchanged encerram o pedido, conservando qualidade por empresa. Os estados reais vêm do domínio, não do texto do modelo.

## 5. Estrutura de arquivos e sequência de implementação

Convenções de caminho nas tarefas: **action-engine/** e arquivos desse módulo sem prefixo completo significam backend/src/modules/action-engine/; **radar/** significa backend/src/modules/radar/; **jobs/** significa backend/src/jobs/; **tests/** significa backend/tests/, exceto quando explicitamente runtime/frontend. **Runtime** significa workers/marketing-studio-agent-runtime/yux_agent_runtime/ e seus testes ficam em workers/marketing-studio-agent-runtime/tests/. Componentes e services de interface ficam em frontend/src/. As referências da seção 7 são links absolutos da base analisada.

| Unidade | Arquivos novos centrais | Responsabilidade |
| --- | --- | --- |
| Contrato/adaptador Radar | radar/action-engine-contracts.ts, action-engine-access.ts, action-engine-commands.ts | Schemas, identidade e delegação aos comandos existentes |
| Persistência | radar/action-engine-store.ts, migration 0236 | Idempotência e ligação entre missão/pedido/lote |
| Catálogo do agente | action-engine/capabilities/radar.ts, packs/radar-prospecting-v1.ts | Ações permitidas e topologia versionada |
| Acompanhamento | action-engine/radar-operation-waits.ts | Espera/reconciliação com estado real |
| Grounding | action-engine/radar-knowledge-context.ts | Conhecimento publicado nas entradas Radar |
| Aceite de resultado | action-engine/metrics/radar-prospecting.ts, RadarMissionArtifacts.tsx | Métricas e projeção comercial |
| Autonomia | action-engine/radar-autonomy.ts, automation/radar-action-handler.ts | Grants revogáveis e entrada de rotina recorrente |

As tarefas são sequenciais nas dependências indicadas. Arquivos gerados são atualizados pelos geradores existentes, sem edição manual. A migration **0236_action_radar_commands_and_links.sql** está livre na base analisada; se houver colisão na execução, reservar o próximo número antes de começar e atualizar a referência neste plano.

### Task 1 — Conhecimento operacional com evidência e binding demonstrado

**Files:** criar docs/knowledge/radar-commercial-curation-checklist.md; modificar docs/knowledge/radar-commercial-action-engine.md somente para corrigir eventual conteúdo identificado na revisão; criar backend/tests/integration/radar-action-knowledge.test.ts; estender workers/marketing-studio-agent-runtime/tests/test_mission_conversation.py.

**Interfaces:** consome a ingestão/publicação existentes; produz um manifesto de publicação para homologação com source SHA-256, documentId, publicationId, itemIds, perfil, organização, módulo, workflow e estado publicado. IDs de homologação não são reaproveitados em produção.

- [ ] Escrever teste de fonte funcional publicada recuperada por growth_strategist/marketing_studio/mission_intake_conversation; binding radar isolado não satisfaz a consulta atual. Confirmar falha do cenário sem publicação.
- [ ] Preparar checklist dos oito artefatos e fixture textual própria segura com evidência literal. Publicar na fixture usando as mesmas fronteiras de aprovação, embedding controlado e publicação reais.
- [ ] Fixar testes: arquivo enviado sem publicação não entra; draft/rejected não entra; pack de outra organização não entra; binding revogado impede nova decisão; documento técnico fica ausente também para yux_operator.
- [ ] Executar: backend npm run test:integration -- tests/integration/radar-action-knowledge.test.ts em PostgreSQL/Redis isolados; pytest tests/test_mission_conversation.py no runtime. PASS com publicationId/itemId/hash no contexto.
- [ ] Commit: docs(test): define and verify Radar operational knowledge. O upload/publicação reais aguardam autorização de consumo e ambiente; checklist pronto não é publicação concluída.

### Task 2 — Comandos compartilhados, identidade e projeção comercial

**Files:** criar radar/action-engine-contracts.ts, radar/action-engine-access.ts, radar/action-engine-commands.ts; modificar radar/repository.ts e radar/commercial-view.ts; criar backend/tests/radar-action-commands.test.ts e tests/integration/radar-action-access.test.ts.

**Interfaces:** produz resolveRadarMissionActor e executeRadarMissionCommand; consome funções canônicas createRadarCampaign, duplicateRadarCampaign, saveRadarCommercialCriteria, startRadarCaptureOperation, resumeRadarCaptureOperation e queueRadarResearchRequest. Reutiliza AuthUser real sem role fornecida pelo modelo.

- [ ] Escrever testes que falham para cross-organization, userId inexistente, yux_operator/client_admin/client_member em ação regional, contrato Radar ausente e autorização revogada após aprovação.
- [ ] Resolver o responsável da missão no banco, conferir organização/contrato/permissão atuais, actionRunId pertencente à missão e ownership/fencing. Worker system não vira Admin; contextos sem responsável autorizado falham fechados.
- [ ] Expor entradas comerciais estritas e projetar retornos pelo esquema comercial antes de chegar ao agente. Para novas superfícies, criar schemas de allowlist; não serializar RadarCapturePreflight nem objetos brutos.
- [ ] Testar yux_admin positivo e três papéis negativos/restritos via HTTP e comando; injetar campos aninhados de provider/modelo/custo/diagnóstico e comprovar ausência. Não remover CNPJ ou nomes comerciais legítimos por substituição de palavras.
- [ ] Executar npm test -- tests/radar-action-commands.test.ts e integração radar-action-access; npm run type-check. Commit feat: add scoped Radar mission command adapter.

### Task 3 — Idempotência da criação e ligação durável de operações

**Files:** criar db/migrations/0236_action_radar_commands_and_links.sql; criar radar/action-engine-store.ts; modificar radar/action-engine-commands.ts e repository.ts; criar tests/integration/radar-action-idempotency.test.ts.

**Interfaces:** produz ledger action_radar_commands e tabela action_radar_operation_links. API de store: reserveRadarMissionCommand(client, context, commandHash), completeRadarMissionCommand(client, commandId, result), attachRadarOperation(client, commandId, ref).

- [ ] Escrever testes concorrentes: dez execuções de mesma chave/payload criam uma campanha; mesma chave/payload diferente retorna radar_mission_idempotency_conflict; mesma chave em outra organização não reutiliza resultado.
- [ ] Ledger com UNIQUE(organization_id,idempotency_key), hash canônico, actor/mission/action, requestId persistido, resultado e estado; links guardam IDs/revisões/operação. Aplicar grants/RLS equivalentes aos dados de missão; não guardar credenciais.
- [ ] Para criação/duplicação/criteria, garantir alteração Radar e resultado no ledger na mesma transação. Refatorar os comandos canônicos para aceitar cliente transacional opcional sem mudar as rotas existentes; não passar PoolClient com cast inseguro de Pool.
- [ ] Para start/resume/research, persistir requestId antes do despacho e reutilizar idempotência do Radar; após crash entre aceite e link, recuperar por requestId sem criar uma segunda pesquisa. Reconciliar outbox perdida sem repetir chamada ao fornecedor.
- [ ] Executar integração radar-action-idempotency e radar-capture-reconciliation existentes, migrations concorrentes e type-check. Commit feat: persist idempotent Radar mission correlations.

### Task 4 — Capabilities versionadas e aprovação do efeito concreto

**Files:** criar action-engine/capabilities/radar.ts; modificar capabilities/index.ts, capability-registry.ts, commands.ts e radar/action-engine-commands.ts; criar tests/action-engine-radar-capabilities.test.ts e tests/integration/radar-action-approval.test.ts.

**Interfaces:** produz as nove capabilities da seção 3 que não são radar.operation.await; essa última entra na tarefa 5. Acrescentar commands tipados do Radar ao CapabilityContext, conservando o adaptador de domínio como autoridade.

- [ ] Escrever teste do registry esperando radar.campaign.create@1 e radar.capture.start@1; sem implementação, falha por capability ausente.
- [ ] Implementar schemas strict, módulos/permissões/modos, readiness e recovery honestos. Campo ou entidade não suportada deve falhar, não cair em campanha de publicidade.
- [ ] Relacionar aprovação a revisões, quantidade, configuração e hash do preflight; executar validações novamente antes do aceite durável. Em shadow/prepare, nenhum comando mutante nem chamada paga. Alteração posterior bloqueia sem gasto.
- [ ] Testar dryRun, ausência de grant, gate desligado, recurso fora do escopo, limite insuficiente e tentativa de injetar fonte/modelo/allowSemanticRefresh/TLS/limitsAuthorization. Resultado de start tem status accepted e não pesquisa concluída.
- [ ] Testar recovery: campanha criada só pode ser arquivada se ainda não foi utilizada, com revisão exata; pesquisa aceita não desfaz custo. Na ausência de cancelamento canônico, containment bloqueia novos comandos da missão e preserva operação/histórico, sem afirmar cancelamento remoto. Commit feat: register governed Radar capabilities.

**Check:** npm test -- tests/action-engine-radar-capabilities.test.ts e npm run test:integration -- tests/integration/radar-action-approval.test.ts; zero efeitos nos cenários simulados e zero mudanças de limites.

### Task 5 — Espera por operação, retomada e reconciliação sem sucesso prematuro

**Files:** criar action-engine/radar-operation-waits.ts; modificar capabilities/radar.ts, capabilities/index.ts, capability-registry.ts, executor.ts, jobs/handlers/action-engine.ts, jobs/queue.ts, jobs/registry.ts e src/worker.ts; criar tests/integration/action-engine-radar-waits.test.ts. Caminhos sem prefixo de módulo nesta linha pertencem a backend/src/modules/action-engine, salvo jobs e src/worker.ts.

**Interfaces:** produz radar.operation.await@1, inspectRadarMissionOperation e reconcileRadarMissionOperations(pool, queue, {limit:number,now:Date}). CapabilityResult recebe deferred opcional strict {kind:'radar_operation',ref,nextCheckAt,deadlineAt}; compatibilidade preservada para capacidades existentes. Job novo action-engine.reconcileRadarOperations, classe maintenance.

- [ ] Escrever teste: start sucede como solicitação aceita, await fica running; completed_at é null e passo de entrega não executa enquanto Radar está researching.
- [ ] Persistir espera e ref; claimed_by=radar_operation_wait. O expires de system.signal.wait não pode completá-la por tempo. Agendar inspeção local a cada 15s, backoff até 60s; prazo vem da missão. Não usar loop HTTP/sleep mantendo worker ocupado.
- [ ] Reconciliador lê estados canônicos sem fornecedor, verifica vínculo/org/revisões, conclui uma única vez e agenda dependências pela fila/outbox existentes. blocked/waiting pausam com instrução comercial; deadline não inventa resultado nem inicia outro lote.
- [ ] Testar reinício, fila indisponível, entrega duplicada de evento, resposta perdida, missão pausada/cancelada, capacidade esgotada, lote parcial e research unchanged. Não finalizar enquanto houver etapas aplicáveis pendentes. Contagens qualificadas e aprovadas continuam separadas.
- [ ] Executar integração action-engine-radar-waits e regressões de human.task.create/system.signal.wait. Commit feat: await Radar outcomes durably.

### Task 6 — Conhecimento no contexto de todas as entradas de missão Radar

**Files:** modificar jobs/handlers/action-engine.ts, action-engine/context-builder.ts, mission-source-verifier.ts; criar action-engine/radar-knowledge-context.ts; modificar runtime mission_conversation.py, workflow.py e os schemas/geradores necessários; criar tests/integration/radar-action-grounding.test.ts.

**Interfaces:** produz resolveRadarKnowledgeScope({entry:'intake'|'planning',packKeys,actor}) e buildRadarMissionKnowledgeContext(pool, mission). Intake compatível preserva growth_strategist/marketing_studio/mission_intake_conversation; planejamento Radar usa growth_strategist/radar/radar_commercial_mission. Escopo derivado do catálogo confiável, não texto livre.

- [ ] Escrever teste: missão pelo formulário/receita, sem conversa vinculada, recebe a mesma regra publicada; hoje o contexto operacional permanece vazio.
- [ ] Consultar conhecimento publicado também nessa entrada, via retrieval autorizado e identidade runtime real; não copiar itens brutos de pack nem ampliar namespace por SQL improvisado.
- [ ] Acrescentar o contexto Radar ao runtime com campos tipados, respeitar binding e namespace; não alterar indiscriminadamente o escopo de todos os consumidores de marketing/atendimento.
- [ ] Revalidar publicationId/itemId/hash/binding antes de planejar e antes de efeitos que dependam dessa regra. Testar revogação entre plano e execução, publicação nova, modelo de embedding indisponível com degradação explícita e injeção de “ignore aprovações” no documento.
- [ ] Rodar integração radar-action-grounding e harness-grounding existentes; testes Python de retrieval/conversation. Commit feat: ground Radar missions in published operational knowledge.

### Task 7 — Action Pack, catálogo e roteamento Radar distintos de publicidade

**Files:** criar action-engine/packs/radar-prospecting-v1.ts e action-engine/radar-pack-registration.ts; modificar action-engine/routes.ts, pack-registry.ts, planner.ts, executor.ts, jobs/handlers/action-engine.ts, runtime mission_router.py e mission_supervisor.py; criar tests/action-engine-radar-pack.test.ts e tests/test_mission_router_radar.py no runtime.

**Interfaces:** produz RADAR_PROSPECTING_PACK_V1, key radar_prospecting, semanticVersion 1.0.0, status published_for_internal_pilot. Artefatos radar.campaign@1 e radar.prospecting_result@1. Parâmetros: objetivo, descrição do público, regiões, oferta, critérios, requestedCount e referências existentes opcionais.

- [ ] Fixar regressão com teste exato:

      route("Crie uma campanha no Radar Comercial para pesquisar 100 empresas")
      => ["radar_prospecting"]
      route("Crie uma campanha no Google Ads")
      => ["campaign_launch"]
      route("Crie uma campanha", contexto insuficiente)
      => pergunta sobre publicidade ou prospecção

- [ ] Criar pack: inspect → create quando necessário → preflight → aprovação vinculada ao pedido → capture.start → operation.await → results.inspect → checkpoint. Preflight pendente de capacidade bloqueia antes da autorização de efeito. Campanha existente elimina criação; lote pendente exige resume, não lote substituto.
- [ ] Registrar pack em catálogo público, descoberta, persistência de versão, intents, listagem/detalhe, catálogo do worker e capabilities permitidas. Remover fallbacks que escolhem revenue_recovery para chave desconhecida. Atualizar enums/tipos/fixtures onde realmente enumeram os packs e regenerar contratos.
- [ ] Permitir allowedModules radar em briefing/receita e filtrar catálogo por role/entitlement/gate. Modelo só escolhe radar_prospecting quando está publicado e disponível; não pode inventá-lo pela documentação.
- [ ] Atualizar claims do início da missão: uma missão Radar não deve cair no fallback crm.lead_population/inactive_revenue_recovery. Usar resourceKey radar.campaign com campaignId e resourceKey radar.creation com actionRunId antes da criação; migração da referência após criar, transacional e por organização. Testar duas missões na mesma campanha sem duas capturas concorrentes e duas campanhas independentes sem bloqueio entre si.
- [ ] Executar testes de pack, router e os de campanhas/funil/recuperação; backend generate:mission-contracts, type-check, Python export_mission_contracts.py --check. Commit feat: add Radar prospecting Action Pack and intent routing.

### Task 8 — Resultados comerciais na missão e atos seguros sobre campanhas existentes

**Files:** modificar action-engine/mission-artifacts.ts, mission-activity.ts e evaluator.ts; criar action-engine/metrics/radar-prospecting.ts; criar frontend/src/components/action-engine/RadarMissionArtifacts.tsx; modificar MissionArtifactsPanel.tsx e services/actionEngineService.ts conforme contrato; criar frontend/src/components/action-engine/RadarMissionArtifacts.test.tsx e backend/tests/integration/radar-action-results.test.ts.

**Interfaces:** consome RadarCommercialOutcome e produz artefatos/timeline “Campanha salva”, “Pesquisa solicitada”, “Em pesquisa”, “Aguardando ação”, “Finalizada com lacunas” e “Pronta para revisão”. Link preserva workspace/campaignId; qualidade não é autorização de contato.

- [ ] Escrever testes de projeção para os quatro papéis: cliente/operador não recebem ferramentas, modelos, custos, recibos ou erros brutos nem em resposta direta/artefato/raw payload.
- [ ] Renderizar briefing revisável e próximo passo único, nome/quantidade/revisões e contagens reais. Contexto técnico somente global Admin; separar artefato operacional de publicação externa/CRM.
- [ ] Definir critérios do evaluator: campanha criada cumpre somente objetivo de criação; pesquisa entregue exige término/revisão prevista e pode ser parcial. Nada atribui receita ou leads qualificados só por empresas encontradas.
- [ ] Implementar radarProspectingMetricCollector:PackMetricCollector em metrics/radar-prospecting.ts e registrá-lo em createPackMetricCollectorRegistry. Sem ele, collectPackMissionMetrics lança pack_metric_collector_not_registered. Métricas derivam dos links/estados reais, nunca dos números escritos pelo modelo. Testar que pesquisa vazia não vira receita ou sucesso por targetRevenueBrl=0.
- [ ] Cobrir comandos pós-criação: duplicação limpa, update de critérios conflitante e invalidação de aprovação, resume das existentes, refresh e reanalyze distintos. Não copiar progresso/cursor na duplicação e não enfraquecer suficiência para encerrar.
- [ ] Executar testes UI e integração radar-action-results, incluindo seleção de dois clientes e IDs alheios. Commit feat: present and manage Radar mission outcomes commercially.

### Task 9 — Autonomia delimitada e rotinas recorrentes

**Files:** criar action-engine/radar-autonomy.ts e backend/src/modules/automation/radar-action-handler.ts; modificar action-engine/autonomy-grants.ts, autonomous-preflight.ts, a configuração do novo pack e backend/src/modules/automation/action-handlers.ts; criar tests/integration/radar-action-autonomy.test.ts; documentar runbook.

**Interfaces:** produz RadarAutonomyScope com organizationId, packVersion/hash, campaignIds permitidos, máximo por lote, máximo acumulado de novas empresas por janela, número máximo de lotes, vigência, limite de gasto interno, finalidades e capabilities autorizadas. Grant só é emitido por responsável autorizado; modelo não define os tetos.

- [ ] Escrever testes: grant para uma campanha não permite outra; teto agregado impede dez execuções separadas de contornar limite; revogação/expiração impedem novos efeitos.
- [ ] Manter approval=always da release assistida até este gate ser aprovado. Depois publicar **nova versão** das capabilities de pesquisa com approval=risk_based, exigindo grant no modo autonomous e conservando aprovação em assisted. Não alterar hash de uma versão já publicada.
- [ ] Reservar capacidade/orçamento de forma atômica junto à aceitação durável, respeitando limites acumulados do Radar; conciliar gasto real sem dupla cobrança entre ledger de missão e Radar.
- [ ] Rotina “a cada semana, mais empresas nesta campanha” reutiliza scheduler/automação existente com concessão/identidade fixa e revalidação atual, vigência e cota. Registrar ação nova radar.mission.start, entrada strict {campaignId,requestedCount,grantId}, derivando organizationId/actor/scheduleWindow da automação persistida. Implementar createRadarMissionFromAutomation(pool, {organizationId,actorUserId,flowVersionId,grantId,campaignId,requestedCount,scheduleWindow,idempotencyKey}) no novo handler: inicia a missão com radar_prospecting pelos comandos canônicos do Engine, sem chamar fornecedor diretamente. Sem lote novo enquanto o anterior tiver pendência; disparo duplicado usa a identidade estável flowVersionId+campaignId+scheduleWindow, persistida com UNIQUE por organização. Adicionar o discriminador ao schema/registro de ações existente e teste que garante handler para radar.mission.start; não oferecer raw URL/HTTP como alternativa.
- [ ] Executar testes autonomia/concorrência/revogação/fencing e nenhuma chamada de fornecedor real. Commit feat: bound autonomous Radar research by revocable grants.

Não há autonomia irrestrita por leitura do manual. Mensageria, nutrição, exportação e CRM exigem capabilities/fluxos próprios, sem efeito colateral nesta tarefa. A ação de automação delega ao mesmo command adapter; não usa HTTP arbitrário com token de Admin.

### Task 10 — Aceite integrado, publicação do guia e liberação gradual

**Files:** criar backend/tests/integration/radar-action-journey.test.ts; criar frontend/tests/journeys/browser/radar-action-engine.pw.ts; criar docs/runbooks/radar-action-engine-rollout.md; atualizar os dois documentos de origem para a versão efetivamente entregue.

**Interfaces:** produz dossiê de aceite: commit, migrations, catálogo/hash, pack/hash, publicação/hash/bindings, organização piloto, flags, IDs correlacionados e limitações. Flags propostas RADAR_ACTION_ENGINE_ENABLED=false e RADAR_ACTION_ENGINE_TENANT_ALLOWLIST vazia por padrão, encaminhadas à API e workers. O gate remove o pack do catálogo e bloqueia novos comandos, mas mantém leitura/reconciliação de operação já aceita.

- [ ] Jornadas com provedores simulados e banco/Redis reais: pedido natural → confirmação mínima → plano correto → campanha única → preflight → aprovação → lote → reinício → resultado → links e refresh. Fazer também a entrada pelo formulário legado.
- [ ] Contraprovas: quatro papéis, cross-tenant em chamada HTTP direta, revisão alterada, limite excedido, response lost, repetição, publicação revogada, knowledge injection, gate desligado no meio e empresa sem dados. Verificar nenhum contato ou entrega CRM automática.
- [ ] Publicar a versão revisada do guia apenas quando registry/pack/commands/wait estiverem disponíveis no ambiente-alvo. Registrar manifestação de ingestão e comprovar retrieval. Substituir os avisos estáticos antigos por consulta ao catálogo real; rollback de capability não deixa o agente afirmando execução disponível.
- [ ] Verificação: testes focados de todas as tarefas; npm run type-check e npm test em backend/frontend; generate:mission-contracts e diff dos gerados; pytest do runtime; integração persistente; npm run test:journeys -- radar-action-engine.pw.ts em stack local isolada. A execução de navegador usa o mecanismo suportado na sessão; não presumir que a suíte isolada testa produção.
- [ ] Preparar piloto interno assistido com gate por organização, desligamento e IDs observáveis. Deploy/canário pago somente com autorização explícita e teto por serviço/modelo. Canário real verifica uso/recibos somente em área Admin, qualidade, restart e ausência de duplicação. Promoção de autonomia depende da tarefa 9. Commit test/docs: accept Radar Action Engine journey and rollout.

## 6. Ordem, revisão e critérios de encerramento

Dependências: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 (assistido)**. A tarefa 9 sucede 8 e só libera autonomia após seu próprio aceite. Não é necessário esperar autonomia para entregar um fluxo assistido útil.

Antes de começar a implementação, reconciliar a branch com o worktree e reler as fontes; testes existentes e migrations podem ter avançado. Não carregar commits dos outros trabalhos em andamento por conveniência.

Critérios objetivos:

- O guia funcional está publicado com fontes/hash rastreáveis e recuperado pelo consumidor real; o documento técnico permanece fora do contexto compartilhado.
- “Campanha Radar” nunca aciona publicidade; criar e pesquisar são atos distintos.
- O responsável autorizado e o escopo são revalidados; não existe promoção de cliente/operador para Admin pelo worker.
- A mesma intenção cria no máximo uma campanha/solicitação e conserva os IDs após reinício.
- A pesquisa não conclui na resposta 202 e não é reiniciada porque uma página foi fechada.
- Uma empresa sem contato e uma pesquisa bloqueada têm explicações diferentes.
- O cliente recebe projeções comerciais, e o Admin mantém trilha técnica sem vazamento.
- Nenhum envio de mensagem, login em site, formulário, exportação ou entrega CRM ocorre como consequência implícita.
- Autonomia, se habilitada, tem grant, teto, vigência, revogação e anti-duplicação por janela.
- O dossiê registra o que foi provado em teste, homologação e produção; não marca o plano inteiro concluído pela criação de arquivos.

## 7. Referências locais verificadas



| Referencia | Local verificado |
| --- | --- |
| docs/knowledge/radar-commercial-action-engine.md | [Linha 120](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/docs/knowledge/radar-commercial-action-engine.md:120>) |
| docs/radar-commercial-execution-reference.md | [Linha 7](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/docs/radar-commercial-execution-reference.md:7>) |
| AGENTS.md | [Linha 5](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/AGENTS.md:5>) |
| backend/src/modules/action-engine/capabilities/index.ts | [Linha 22](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/capabilities/index.ts:22>) |
| backend/src/modules/action-engine/capability-registry.ts | [Linha 9](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/capability-registry.ts:9>) |
| backend/src/modules/action-engine/commands.ts | [Linha 25](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/commands.ts:25>) |
| backend/src/modules/action-engine/routes.ts | [Linha 96](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/routes.ts:96>) |
| backend/src/jobs/handlers/action-engine.ts | [Linha 117](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/jobs/handlers/action-engine.ts:117>) |
| backend/src/modules/action-engine/context-builder.ts | [Linha 26](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/context-builder.ts:26>) |
| backend/src/modules/action-engine/executor.ts | [Linha 534](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/executor.ts:534>) |
| backend/src/modules/action-engine/evaluator.ts | [Linha 134](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/action-engine/evaluator.ts:134>) |
| backend/src/modules/radar/access.ts | [Linha 20](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/access.ts:20>) |
| backend/src/modules/radar/repository.ts | [Linha 187](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/repository.ts:187>) |
| backend/src/modules/radar/capture-preflight.ts | [Linha 19](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/capture-preflight.ts:19>) |
| backend/src/modules/radar/capture-operation.ts | [Linha 30](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/capture-operation.ts:30>) |
| backend/src/modules/radar/research-requests.ts | [Linha 14](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/research-requests.ts:14>) |
| backend/src/modules/radar/commercial-view.ts | [Linha 8](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/radar/commercial-view.ts:8>) |
| backend/src/modules/strategy-engine/curation.ts | [Linha 17](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/strategy-engine/curation.ts:17>) |
| backend/src/modules/strategy-engine/publications.ts | [Linha 39](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/strategy-engine/publications.ts:39>) |
| backend/src/modules/strategy-engine/projection.ts | [Linha 17](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/modules/strategy-engine/projection.ts:17>) |
| backend/src/db/migrations/0167_authorized_knowledge_retrieval.sql | [Linha 334](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/backend/src/db/migrations/0167_authorized_knowledge_retrieval.sql:334>) |
| workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_router.py | [Linha 37](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_router.py:37>) |
| workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_conversation.py | [Linha 490](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_conversation.py:490>) |
| workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py | [Linha 306](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py:306>) |
| frontend/src/components/strategy-engine/StrategyPacksPanel.tsx | [Linha 444](<C:/Users/andre/.codex/worktrees/radar-brave-state-fixes/APP - Portal YUX/frontend/src/components/strategy-engine/StrategyPacksPanel.tsx:444>) |

Identidade dos documentos de origem (SHA-256 do arquivo integral):

- docs/knowledge/radar-commercial-action-engine.md: **48be0a24c5b04a133fbba62f8d4032200fa0716e7554d8e72eb1a7faff956bd4**.
- docs/radar-commercial-execution-reference.md: **66671418b37abd427145ca5a6b330ca3e24649532a6e231b6875bfa30d9690d1**.

A versao da referencia tecnica nao deve ser copiada ao contexto do cliente para comprovar conhecimento. Usar este hash para rastreabilidade de implementacao, e a publicacao funcional para retrieval operacional.
