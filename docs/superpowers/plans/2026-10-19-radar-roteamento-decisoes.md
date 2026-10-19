# Radar roteamento de decisões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa, sequencial, sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escolher e testar modelo de decisão principal e fallbacks no Admin, sem alterar chat, embeddings ou modelos de outras funções.

**Architecture:** Estender o campo `kind` do roteamento existente e promover o adaptador alpha preparado em E0. O protocolo normalizado separa disponibilidade técnica, dúvida comercial e autorização de efeito. A atualização autorizada abaixo libera B1–B5 sem esperar comparação paga; qualidade e exclusão automática continuam dependentes de benchmark e calibração reais. Não ativar modelos em migração.

**Tech Stack:** model_routing_rules/PostgreSQL, Fastify, runtime Python/FastAPI, painel React/Vitest, pytest e contratos JSON Schema.

**Spec:** `docs/superpowers/specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md`

## Global Constraints

- Somente o papel global `yux_admin` pode receber os dados técnicos. Aplicar allowlists aninhadas no backend, incluindo erros HTTP, histórico, exportações, CRM e atualizações de progresso. Preservar o CNPJ cadastral da empresa e suas fontes comerciais legítimas.
- Não apagar candidatos, empresas, revisões, recibos, contadores, overflow, aprovações ou correções humanas. Descartes de aderência são reversíveis e ficam fora da lista principal.
- Uma resposta paga com resultado incerto não é reenviada automaticamente. Recuperar recibos/respostas; novas compras exigem autorização compatível com a política financeira vigente.
- Critérios comerciais e geográficos são configuráveis por campanha ou missão. Nenhum preset fixo de segmento, cidade, estado ou oferta. Este caso de teste não vira regra global.
- Desenvolvimento usa transportes simulados e PostgreSQL isolado. Piloto real e implantação são autorizações separadas.

## Review Focus

1. Modelo de decisão cair em endpoint de chat/global: B1/B2 testam capacidade e ausência de herança incompatível.
2. Fallback repetir cobrança ou confundir dúvida com indisponibilidade: B2 cobre resposta válida inconclusiva, erro recebido e timeout incerto.
3. Modelo novo exibir confiança inválida ou escolher ferramenta fora das opções: B2/B3 rejeitam contrato e mantêm evidência.
4. Nome/CNAE levar ao descarte de prospecto válido: B3 testa ambiguidade, decisão em observação e exclusão reversível.
5. Trocar a rota alterar uma chamada em andamento ou quebrar automações/embeddings: B1/B4 testam snapshot, isolamento e rotas legadas.

## Dependência e base

**Atualização autorizada pelo usuário em 19/10, após `dcef51b`:** implementar agora B1–B4 e a integração operacional B5 abaixo, sem aguardar o comparativo pago E0. Isso altera o gate de implementação, não aprova modelos, calibrações, gastos, publicação ou descarte automático. O produto fica configurável e testável com transportes simulados; na ausência de calibração correspondente, observa e preserva a coleta atual. O benchmark humano continua requisito para aprovar exclusão automática. Perplexity e a descoberta multi-fonte C3.3/C4 continuam entregas independentes; não são pré-requisito para conectar decisões ao fluxo atual de aprofundamento. Execução sequencial, sem subagentes, preservando a infraestrutura nativa.

Executar sobre A0, a infraestrutura offline E0 e os recibos A1 já concluídos. O comparativo real não bloqueia o código autorizado em B1–B5, mas permanece pendente para aprovar sua qualidade. A0 continua liberável independentemente de B. Base e migrações estão na main remota, conforme o índice; reservar número novo apenas depois de conferir a base na execução. Âncoras abaixo são da revisão `2ae380a`.

### Task B1 Capacidade de rota compatível e herança administrativa

**Files:** criar migração aditiva `radar_route_kinds` no próximo número livre; modificar `backend/src/modules/platform/llm-routing.ts:4`, `:31` e `:55`, `routes.ts`, `adminRepository.ts`, `frontend/src/services/adminPlatformService.ts`, `frontend/src/types/adminPlatform.ts`, `workers/marketing-studio-agent-runtime/yux_agent_runtime/llm_routing.py:18`/`:50`, `runtime_factory.py`, `backend/tests/admin-llm-routing.test.ts`, `backend/tests/llm-embedding-routing.test.ts`, `workers/marketing-studio-agent-runtime/tests/test_llm_routing.py`.

**Interfaces:** Estender **o mesmo** `kind:'chat'|'embedding'|'decision'|'research'` de `LlmUseCaseDefinition`, configuração efetiva, DTO Admin e runtime. Não criar `routeKind` paralelo. `isEmbeddingUseCase(key,definitions)` consulta a definição/catálogo registrado, não dois nomes fixos. `resolveUseCaseDefinition(key,registeredDefinitions)` rejeita chave técnica desconhecida. Perfis e agentes cadastrados continuam casos legítimos de chat; rotas antigas sem definição ficam visíveis ao Admin como pendentes de classificação, sem recategorização silenciosa. Novas gravações exigem caso registrado e kind compatível; chamadas novas de decisão com typo falham antes da rede, nunca caem no chat global. Migração preserva explicitamente rotas legadas já classificadas e sinaliza desconhecidas para revisão, sem interromper os casos legítimos existentes.

Persistir `kind`, `protocol` e versão de adaptador onde faltar, com backfill por catálogo e perfil/agente. Casos `radar_decision_default`, `radar_initial_triage`, `radar_next_action`, `radar_quality_gate`, `radar_deep_research`; decision herda apenas sua função geral compatível e research exige rota explícita. Escopos/status mantêm precedência. Exemplo: `radar_initial_trage` retorna `llm_use_case_unknown`; `knowledge_embeddings` continua embedding mesmo quando reordenado o catálogo. Novo caso embedding registrado não exige editar função de nomes.

- [x] **Step 1:** Fixtures TS/Python devem provar `resolve(decision, scoped) => scopedPrincipal + scopedFallbacks + compatibleDefault`; `pausedScoped => denied`; `noDecisionRoute + globalChat => decision_unconfigured`; typo de caso/novo kind desconhecido falha antes da rede; embedding definido no catálogo é reconhecido sem lista fixa. Chat/embeddings e perfis legítimos retornam a cadeia anterior. Rota antiga não classificada não vira decision nem chat em silêncio. Duplicatas são eliminadas e ciclos rejeitados.
- [x] **Step 2:** Rodar `npm test -- tests/admin-llm-routing.test.ts tests/llm-embedding-routing.test.ts` e `python -m pytest tests/test_llm_routing.py -q`; confirmar falha das capacidades novas sem alterar expectativas de chat/embeddings.
- [x] **Step 3:** Implementar schema/validação e defaults compatíveis. Registrar protocolos suportados por adaptadores; adicionar ID de modelo compatível não exige alteração de código. Rota/modelo/protocolo/limites efetivos são congelados por tentativa; rota editada só vale para tentativa nova. Cadastro da rota não executa teste pago automaticamente.
- [x] **Step 4:** Aplicar migração em PostgreSQL de teste com rotas antigas, rodar testes de platform e runtime e garantir zero rota ativada por migração; commit das capacidades.

### Task B2 Cliente de decisão e fallback com contabilização

**Files:** promover `decision_providers.py`, `radar_decision_context.py` e seus testes de E0; criar `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_decisions.py`, `tests/test_radar_decisions.py`, `backend/src/modules/radar/decision-service.ts`, `backend/tests/radar-decision-service.test.ts`, `contracts/radar/fixtures/openrouter-decisions-alpha-v1/manifest.json`; modificar `contracts/radar/v1/radar-research.schema.json`/`cases.json` para acrescentar somente `DecisionContextV1` e `DecisionResultV1`, regenerar tipos por comando A1; modificar `runtime_factory.py`, `api.py`, `runtime_store.py` e recibos A1.

**Interfaces:** `DecisionProvider.decide(*,model,state,questions)->DecisionProviderResponse`; adaptador `OpenRouterDecisionsAlphaV1Provider`, protocolo interno `openrouter-decisions-alpha-v1`, **POST `https://openrouter.ai/api/alpha/decisions`**. `/api/v1/systemone` é compatibilidade do SDK TypeSafe, não a interface geral adotada. [Referência Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request). Catálogo de modelos é consultável/versionado; não congelar a quantidade de modelos como enum de produto.

Normalizar `answers[id].choice`, mapa `probabilities`, `confidence` quando existe, `model` efetivo/snapshot, `provider`, `id` e `usage`, mantendo envelope original restrito. `noul` não traz confidence separado; não exigir o campo nem inventá-lo. Chaves de probabilidades são por opção, não posição. Mudança incompatível alpha produz `decision_contract_changed`, preserva resposta e não aprova empresa. `decideRadarAction(pool,user,input:DecisionContextV1):Promise<DecisionResultV1>` chama `/radar/decide` interno; servidor valida tenant/revisão e runtime a rota.

`buildRadarDecisionContext(input,policy)->{state,questions,evidenceMap,byteCount,omittedEvidenceIds,contextVersion}` limita a requisição JSON **inteira** a 24.000 bytes UTF-8 e o `state` a 16.000 bytes; no máximo seis trechos de até 1.500 bytes por trecho, limites iniciais editáveis no Admin por modelo. Respeitar também o limite de tokens de cada modelo. O pacote de contexto só aceita texto nesta versão. O teto conservador evita o modo de contexto longo que o OpenRouter habilita no Jev em torno de 32.000 bytes; isso não é uma janela de 32 mil tokens. [Contexto Jev](https://openrouter.ai/blog/insights/what-is-jev/).

Selecionar identidade/CNPJ e critérios primeiro, depois trechos de atividade e abrangência, propriedade de domínio e contato da finalidade solicitada. Deduplicar navegação/rodapés, preservar ao menos uma evidência contraditória disponível e preferir documentos primários. Ordenação determinística com ID estável; truncar em fronteira UTF-8/frase, não enviar páginas completas nem apenas os primeiros caracteres. Registrar quais trechos ficaram fora. Se identidade/contradição essencial não couber, retornar `context_incomplete` e investigar/revisar, sem descarte automático. Mudança dessa seleção tem versão e invalida calibração.

**Exemplo:** seis páginas com 12 mil caracteres cada não entram integralmente; extrair os seis trechos mais pertinentes, mantendo o trecho que contradiz aderência. Um telefone novo não exige enviar o histórico inteiro.

- [x] **Step 1:** Assertions de Jev **e** Luna usando `/api/alpha/decisions`, snapshot/model/provider/id/usage preservados, opções e distribuição válidas, resposta sem confidence suportada, drift alpha rejeitado. Testar português/emoji e `serializedBytes<=24000`, `stateBytes<=16000`, seleção determinística, contradição preservada, nenhum corte UTF-8 e nenhuma imagem. `429 confirmado => nextAuthorizedModel`; `valid.investigate => noTechnicalFallback`; `receivedInvalid => recordThenFallback`; `timeoutAfterSend => uncertainAndNoReplay`; nenhuma credencial em logs/DTO. Cada tentativa tem recibo/custo próprio, não só o vencedor.
- [x] **Step 2:** Rodar testes Python novos e `npm test -- tests/radar-decision-service.test.ts`; falhas devem reproduzir ausência do adaptador/normalização.
- [x] **Step 3:** Implementar transporte e seleção de contexto com versões explícitas, reserva por tentativa e erro tipado. Manifesto de fixtures separa `official_example` de `real_response`, com data, modelo pedido/efetivo e adaptador. Guardar resposta real sanitizada no piloto autorizado, não chamar modelo pago apenas para escrever fixture. Uma mudança alpha atualiza adaptador e testes antes de ativação. Não repetir 400 indefinidamente; cada fallback no máximo uma vez por efeito autorizado. Resultado incerto exige conciliação; investigar é resposta válida, não falha de fornecedor.
- [x] **Step 4:** Validar perda de resposta após cobrança, resposta salva antes do crash, reentrega de worker e recuperação sem nova compra em PostgreSQL isolado; commit do adaptador/fallback.

### Task B3 Decisões por estágio e motivos sustentados por evidência

**Files:** criar `backend/src/modules/radar/decision-policy.ts`, `decision-calibration.ts`, `backend/tests/radar-decision-policy.test.ts`, `radar-decision-calibration.test.ts`, `backend/tests/fixtures/radar-decision-cases.ts` e migração aditiva `radar_decision_calibrations`; modificar `research-planner.ts`, `research-service.ts`, `research-quality.ts`, `search-configuration.ts` e `radar_decisions.py`.

**Interfaces:** `evaluateRadarDecision(context:DecisionContextV1,result:DecisionResultV1,policy:RadarDecisionPolicy,calibration:RadarDecisionCalibration|null):{action:ResearchActionV1;reasonCode:string;evidenceIds:string[]}`. Policy contém `enabled`, `requestedMode:'observe'|'route'|'auto_exclude'`, `maxAttempts` e `allowedActions`; **não** contém limiar global compartilhado. `RadarDecisionCalibration` tem chave `(provider,requestedModel,resolvedModelSnapshot,adapterVersion,task,questionVersion,contextVersion,criteriaRubricVersion,datasetVersion)`, `metric:'top_probability'|'confidence'`, limiares por ação, métricas validadas, data e aprovação Admin. Sem calibração compatível: modo efetivo `observe`, limiares `null`, nunca herdar 0,90/0,98 de outro modelo. Probabilidade da opção e confidence são grandezas diferentes. [Calibração de confiança](https://docs.typesafe.ai/confidence).

Troca de principal, fallback, snapshot servido, perguntas ou versão de contexto invalida a calibração aplicável. A rota volta a observação; reativação de roteamento/exclusão exige calibração correspondente e confirmação Admin. Snapshot inesperado detectado na resposta também força observação antes de aplicar decisão. Tentativa em andamento conserva seu snapshot autorizado. Cada fallback usa a própria calibração, nunca a do principal. Sem decisão calibrada, coleta autorizada pelo planner atual continua; observação não deve paralisar pesquisa.

**Exemplo:** Jev calibrado com limiar A é substituído por Luna. Luna começa em observação, mesmo que retorne probabilidade 0,99, até seu benchmark/calibração ser aprovado. Não tratar esse número como certeza factual.

- [x] **Step 1:** Fixtures de aderência conforme campanha: tabacaria ambígua investiga; atividade química comprovada não vira aderente só por CNAE secundário; diretório não vira domínio oficial. Testar `jevToLuna => effectiveMode==='observe'`, `fallbackUncalibrated => noAutoExclude`, `sameAliasNewSnapshot => observe`, `contextVersionChanged => observe`, `noCalibration => thresholds===null`. Contexto incompleto e escolha fora das opções nunca descartam. Critérios vêm da campanha, não do nome do teste.
- [x] **Step 2:** Rodar `npm test -- tests/radar-decision-policy.test.ts tests/radar-research-planner.test.ts tests/radar-research-quality.test.ts` e testes Python de decisões; confirmar falhas novas.
- [x] **Step 3:** Implementar perguntas atômicas e escolhas restritas. Agrupar perguntas independentes na mesma chamada; decisões dependentes ocorrem após nova evidência. O modelo pode selecionar IDs/enumerações fornecidos, não criar URLs, e-mails ou justificativas fictícias. Gerar explicação comercial a partir de motivo enumerado e fonte selecionada; análise discursiva fica com LLM de extração/qualificação. Baixa confiança encaminha investigação/revisão, não descarte ou busca sem fim.
- [x] **Step 4:** Provar cache por conteúdo/critério/modelo-snapshot/perguntas/contexto/calibração e isolamento de conta. Rodar também `npm test -- tests/radar-decision-calibration.test.ts`; correção humana prevalece. Commit da política e calibração. Não habilitar auto_exclude só porque testes simulados passaram.

### Task B4 Painel de modelo principal fallback e teste objetivo

**Files:** modificar `frontend/src/components/platform/admin/LlmUseCaseRoutingPanel.tsx`, seu teste, `frontend/src/pages/platform/AdminIntegrationsPage.tsx`, `backend/src/modules/platform/routes.ts`, testes de API administrativa e `backend/src/modules/platform/llm-routing.ts`; criar `frontend/tests/journeys/browser/radar-decision-routing.pw.ts`.

**Interfaces:** Teste administrativo retorna `{ok,kind,selectedOption,contractValid,requestedModel,resolvedModel,adapterVersion,calibrationState,latencyMs,usage,attempts,sanitizedFailure?}` apenas a `yux_admin`. POST pago explícito, com estimativa BRL e cotação A4; salvar não testa. Mostrar principal/fallbacks, herança, protocolo alpha, modo efetivo, limiares por modelo/versão/tarefa e contexto em bytes. Não usar temperatura ou saída de chat como parâmetro da decisão.

- [x] **Step 1:** Testes: selecionar Jev, salvar, testar; selecionar Luna, testar; ambos usam `/api/alpha/decisions` com seus envelopes/snapshots. Troca exibe observação e não conserva limiar de Jev; fallback sem calibração também. Reabrir conserva cadeia e configuração, sem teste automático. Typo de caso é erro de validação, não chat. Trocar decisão não muda atendimento, missões ou embeddings; cliente/operador/admin de conta recebem 403 sem detalhes.
- [x] **Step 2:** Rodar testes frontend do painel e backend administrativos antes da implementação; confirmar falhas das capacidades novas.
- [x] **Step 3:** Implementar campos por capacidade e validação server-side, preservando o visual YUX. Mostrar modelo novo como não testado, permitir teste manual com ID compatível e informar incompatibilidade antes de operação comercial quando conhecida. Não preencher nem ativar silenciosamente um modelo pago.
- [x] **Step 4:** Testar no navegador local com transportes simulados, quatro papéis, mudança de escopo e tentativa em andamento; rodar suítes completas platform/runtime/frontend e builds; commit do painel. Comparação paga de qualidade é etapa futura autorizada, não substituída por este teste sintético.

### Task B5 Integração real no aprofundamento e prontidão operacional

**Files:** modificar `backend/src/modules/radar/research-service.ts`, `research-planner.ts`, `research-availability.ts`, `capture-research-state.ts`, `commercial-view.ts`, testes correspondentes; criar `backend/tests/integration/radar-decisions-journey.test.ts`, `frontend/tests/journeys/browser/radar-decision-routing.pw.ts`; atualizar `docs/runbooks/radar-pesquisa-configuravel.md`.

**Interfaces:** o fluxo existente usa `decideRadarAction` em triagem inicial, seleção entre ações já elegíveis e qualidade final. Registro por estágio/conteúdo/rota, recibos A1 por tentativa, orçamento A4 e reconciliação A3. Decisão nunca recebe poder de comprar sem autorização ou de dispensar requisitos mínimos. Modo observação/função sem rota mantém o fluxo atual. Mudança de evidência permite próxima decisão dentro do orçamento, nunca repetição infinita do mesmo contexto. Revisão humana prevalece.

- [x] **Step 1:** Testar um lote existente retomado e uma atualização individual com os três estágios, principal/fallback, timeout incerto e recuperação sem rede; provar que escolhas calibradas alteram a ação elegível, não apenas geram logs. Ausência de rota, carteira/limite insuficiente, troca de modelo e falta de calibração não apagam fatos nem inventam aprovação.
- [x] **Step 2:** Implementar os hooks duráveis e projeções comerciais por allowlist; informações técnicas apenas no Admin global. Não comprar substitutas num lote v1 retomado, não repetir descoberta e não alterar CRM/WhatsApp/embeddings/missões.
- [x] **Step 3:** Rodar suítes completas backend/frontend/runtime, PostgreSQL isolado e navegador desktop/mobile. Conferir quatro papéis, migração de rotas anteriores, cadastro/edição da cadeia, teste explícito e leitura da cadeia efetiva após reabrir.
- [x] **Step 4:** Documentar configuração exata, limites, observação/calibração e checklist de implantação coordenada; revisão final sequencial e commits locais. Sem ativação paga, push ou deploy. Não chamar de pronto se apenas o adaptador estiver implementado e o fluxo não o consumir.

## Conclusão da implementação local

B1–B5 implementadas no fluxo existente, não apenas como adaptador. B1: `37467ba`; a entrega operacional B2–B5 é registrada no commit local seguinte. Migrações 0217–0220, sem ativação, preservando rotas antigas. Verificação: backend 1.255; frontend 1.164; runtime 353; integração PostgreSQL 74, recibos Python PostgreSQL seis e navegador cinco jornadas. Tipos/builds/bundle/manifesto aprovados; lint passou na baseline existente, não está limpo. [Relatório de prontidão e limites](../reports/2026-10-19-radar-decisions-readiness.md).

As verificações usam banco isolado e transportes simulados. Não comprovam precisão de Jev/Luna ou de outro modelo real. Benchmark/calibração, ativação, piloto e implantação continuam exigindo as etapas/autorizações descritas no runbook; não foram executados. Perplexity/C e recuperação do lote real não são apresentados como concluídos.
