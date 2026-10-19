# Radar recuperação e experiência comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa, sequencial, sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer retomar e atualizar executarem trabalho útil, com recibos recuperáveis, orçamento coerente e estado comercial confiável.

**Architecture:** Após a entrega pequena A0, fortalecer os recibos e a intenção durável sobre o pipeline v1. Reaproveitar hash e reconciliação já corrigidos, sem reimplementar. Nenhuma dependência da Perplexity ou de modelo novo nesta entrega; contratos de decisão/ação só entram em B/C.

**Tech Stack:** TypeScript/Fastify, PostgreSQL/RLS, BullMQ/outbox, Python/FastAPI, React 18/Vite, Vitest, pytest e testes de navegador simulados.

**Spec:** `docs/superpowers/specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md`

## Global Constraints

- A experiência comercial do Radar não mostra ferramentas, fornecedores, modelos, rotas, recibos, tokens, licenças, custos ou falhas de infraestrutura. Administração técnica fica no painel administrativo do sistema, não em um accordion dentro da campanha.
- Não apagar candidatos, empresas, revisões, recibos, contadores, overflow, aprovações ou correções humanas. Descartes de aderência são reversíveis e ficam fora da lista principal.
- Uma resposta paga com resultado incerto não é reenviada automaticamente. Recuperar recibos/respostas; novas compras exigem autorização compatível com a política financeira vigente.
- Não relaxar bloqueios SSRF, DNS fixado, TLS, robots, acesso privado, permissões de conta ou licenciamento. Exceções de certificado continuam específicas e temporárias.
- Desenvolvimento usa transportes simulados e PostgreSQL isolado. Piloto real e implantação são autorizações separadas.

## Review Focus

1. Resposta cortada paga ser classificada como efeito desconhecido e recomprada: A1 deve conservar resposta, custo e motivo antes da validação.
2. Horário, ordem ou limite administrativo invalidar identidade ou cursor: A2 deve provar hash estável e invalidação apenas da dependência alterada.
3. Atualização individual ou duplo clique deixar pai desatualizado ou perder job: A3 deve provar outbox e reconciliação transacional.
4. Retomada esbarrar no teto acumulado antigo ou em indisponibilidade de uma fonte desnecessária: A4 deve distinguir orçamento incremental e trabalho salvo.
5. Estado insuficiente virar sucesso ou fornecedor vazar a cliente por HTTP/CSV: A5 deve cobrir quatro papéis e API direta.

## Preparação

Executar depois de [A0](2026-10-19-radar-destravamento-a0.md), consultando o [inventário de códigos](2026-10-19-radar-bloqueios-auditados.md). Conferir `AGENTS.md`, alterações locais e base remota. `origin/main` já contém os 41 commits e migrações 0193–0195; não repetir integração por causa da main local antiga. Cada migração abaixo recebe o próximo número livre na execução, registrado no índice, sem editar SQL já publicado. Não incorporar a árvore principal suja.

### Task A1 Contratos e recibos recuperáveis

**Files:** criar `contracts/radar/v1/radar-research.schema.json`, `contracts/radar/v1/cases.json`, `backend/scripts/generate-radar-contracts.ts`, `backend/src/contracts/generated/radarResearch.ts`, `frontend/src/types/generated/radarResearch.ts`, `backend/src/modules/radar/effect-receipts.ts`, migração aditiva `radar_effect_receipts`, `backend/tests/radar-effect-receipts.test.ts`, `backend/tests/integration/radar-effect-receipts.test.ts`; modificar `backend/package.json`, `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_receipts.py`, `radar_presence.py`, `radar_qualification.py`, `runtime_store.py`, `api.py`, e testes `test_radar_receipts.py`, `test_radar_presence.py`, `test_radar_qualification.py`.

**Interfaces:** O schema define somente `ResearchEvidenceV1`, `EffectReceiptV1` e `CommercialResearchStatusV1` necessários nesta entrega; `DecisionContextV1`/`DecisionResultV1` entram em B2, `ResearchActionV1` em C4. Gerar tipos TS por `npm run generate:radar-contracts` com `json-schema-to-typescript`; Python valida representações com as mesmas fixtures. `recordRadarEffectResponse(db,input:EffectReceiptV1):Promise<void>` conserva resposta antes da projeção. Separar `transportOutcome:not_started|rejected|received|uncertain`, `validationOutcome:pending|valid|invalid` e `billingOutcome:known|estimated|uncertain`. Chave única `(organization_id,effect_key,attempt)`; atualizar somente com proprietário e lease válidos. Resposta técnica protegida, nunca credenciais. Conservar e vincular `radar_analysis_receipts`. Runtime grava seus recibos; privilégios mínimos no backend.

**Exemplo e âncora:** `research-service.ts:596` tenta recuperar análise. Uma resposta recebida com JSON cortado deve ser recuperável/revalidável sem compra nova; não chamar de timeout incerto. Para Nutrisaude/Premium/Nutri Line e os recibos pendentes de Duque/Gourmet, exibir prova disponível e autorização de tentativa nova vinculada quando não existir corpo recuperável. A0 não resolve esses recibos por booleano de atualização.

- [x] **Step 1:** Adicionar fixtures e assertions nos testes TS/Python: `received + finish_reason=length => validationOutcome=invalid, failureCode=output_truncated`; `received + trecho inventado => invalid`; `timeout após envio => uncertain`; `rejeição antes do envio => not_started`; `response salva + revalidação => providerCalls=0`. Invalidade de um campo de perfil não elimina outros fatos válidos. Recibo antigo incerto sem corpo continua incerto.
- [x] **Step 2:** Rodar no backend `npm test -- tests/radar-effect-receipts.test.ts` e no runtime `python -m pytest tests/test_radar_receipts.py tests/test_radar_presence.py tests/test_radar_qualification.py -q`; observar falhas novas nas assertions, não em imports/infraestrutura.
- [x] **Step 3:** Implementar contrato e persistência aditiva. Preservar ID externo, modelo efetivo, consumo, motivo sanitizado e sinal de corte. Persistir resposta antes do parser de domínio; falha de persistência após resposta mantém reserva incerta. Recuperar por mesma chave sem nova chamada. Conciliação administrativa em lote registra aprovação de nova tentativa distinta, com vínculo à anterior, sem falsificar resultado/custo.
- [x] **Step 4:** Repetir testes e `npm run test:integration -- tests/integration/radar-effect-receipts.test.ts` em banco isolado. Provar concorrência, isolamento de contas e visibilidade técnica; commit somente desses contratos/recibos.

A1 entregue no commit `0fefe86`: contratos, gravação protegida antes do parser, revalidação gratuita e produtor de autorizações. Consumo dessas autorizações está em A3. Evidência de recuperação real das empresas permanece pendente de implantação e piloto autorizado.

### Task A2 Estabilidade de evidência e preservação dos fatos

**Files:** modificar `backend/src/modules/radar/evidence-version.ts` e `backend/tests/radar-evidence-version.test.ts` entregues em A0.4; criar `backend/tests/radar-company-projection.test.ts`; modificar `research-service.ts`, `research-checkpoint.ts`, `presence-resolution.ts`, `company-projection.ts`, `company-profile.ts`, `public-presence.ts` e testes de persistência correspondentes.

**Interfaces:** Estender `radarEvidenceContentHash` já entregue por A0.4 para os tipos A1, sem alterar sua identidade por refatoração. Separar versões de conteúdo, identidade, qualificação e apresentação. Data de observação continua no dado, não na identidade do conteúdo.

**Exemplo e âncora:** `research-service.ts:212` calculava hash incluindo observação; A0 já o estabiliza. Agora, mudar só contato invalida análise de contato, não cursor ou domínio confirmado; mudar CNPJ requer rever a associação. Nunca refazer efeito só porque tipos TS foram gerados.

- [x] **Step 1:** Fixtures devem satisfazer `hash(t1,ordemA)===hash(t2,ordemB)` para mesmo conteúdo; mudança de contato invalida análise de contato, não cursor; novo orçamento não invalida identidade; mudança de CNPJ invalida associação. Dossiê anterior válido permanece acessível e datado durante refresh incompleto. Grupo e estabelecimento continuam diferentes.
- [x] **Step 2:** Rodar `npm test -- tests/radar-evidence-version.test.ts tests/radar-research-persistence.test.ts tests/radar-company-projection.test.ts`; observar falhas nas assertions novas.
- [x] **Step 3:** Registrar quais campos cada análise usa e comparar somente esses campos. Gravar resultado somente se a versão lida ainda é atual (`UPDATE ... WHERE version=expectedVersion`); se outra atualização venceu, recarregar sem publicar resultado antigo. Converter evidência legada apenas quando lida e com material suficiente, mantendo vínculo do recibo. Não retirar correção humana, apagar auditoria ou confundir `site encontrado` com `associação confirmada`.
- [x] **Step 4:** Rodar unitários, persistência PostgreSQL e `npm run type-check`. Confirmar zero chamada paga por mera releitura; commit de versionamento/projeção.

Verificado localmente: 1.177 testes backend, 326 runtime, 18 testes PostgreSQL/HTTP e type-check. Nenhum piloto pago ou recuperação em produção executado. `radar-company-projection.test.ts` demonstra datas/grupo/CNPJ/CAS; `radar-research-service.test.ts` demonstra contato novo sem refazer identificação e qualificação com citações válidas. Reuso dependente mantém `derivedFromHash`, não cria alias de recibo pago para conteúdo diferente.

### Task A3 Intenção durável única e reconciliação de lote

**Files:** criar `backend/src/modules/radar/research-requests.ts`, migração aditiva `radar_research_requests`, `backend/tests/radar-research-requests.test.ts`, `backend/tests/integration/radar-research-requests.test.ts`; modificar `routes.ts`, `repository.ts`, `research-service.ts`, `capture-dispatch.ts`, `capture-research-state.ts`, `capture-operation.ts`, `backend/src/jobs/handlers/radar.ts`, `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`.

**Interfaces:** `queueRadarResearchRequest(pool,user,{organizationId,campaignId,candidateIds,requestId,criteriaRevision,intent:'resume'|'refresh'|'reanalyze',analysisAuthorizationId?}):Promise<{requestId,state:'accepted'|'running'|'waiting'|'unchanged',items:Array<{candidateId,runId?,state}>}>`. Endpoint `POST /campaigns/:id/research-requests`; contratos antigos delegam internamente. Acrescentar `commercial_criteria_revision`/`operational_policy_version`, mapeando revisão atual sem reiniciar cursores. Estender a outbox existente à pesquisa individual, sem criar segundo dispatcher. Consumir `reconcileRadarCaptureItems` de A0.3, não redefini-lo. Autorização A0.2 recebe vínculo durável explícito.

**Exemplo e âncora:** em `research-service.ts:427`, duas entregas do mesmo requestId não são duas intenções. Se a fila falhar após salvar o pedido de quatro empresas, a outbox continua entregando esse mesmo pedido, com os mesmos IDs e autorização.

- [x] **Step 1:** Provar `doubleClick.sameRequest => oneIntent, oneEffect`; enqueue indisponível após commit deixa outbox pendente; entrega duas vezes reaproveita lease; atualização de quatro empresas altera estado e motivos do lote; empresa sem material novo resulta `unchanged` com verificações realizadas; autorização expirada não é reutilizada.
- [x] **Step 2:** Rodar `npm test -- tests/radar-research-requests.test.ts tests/radar-capture-dispatch.test.ts` e integração de requests; demonstrar falha do caminho atual individual sem outbox/reconciliação.
- [x] **Step 3:** Implementar pedido compartilhado para botões individuais e em lote. Carry-over de autorização usa snapshot explícito da operação, não booleano client arbitrário. Recarregar estado atual antes de efeitos, manter revision e tenant; empresa impedida não paralisa trabalhos independentes. Não criar novos candidatos ao retomar lote cuja descoberta acabou.
- [x] **Step 4:** Repetir worker real com transporte simulado, matar/reiniciar após reserva e após resposta, conferir IDs/custos e progresso. Testes verdes e commit de requests/reconciliação.

Verificado localmente: 1.180 testes backend, 1.143 frontend, 329 runtime e 28 PostgreSQL/HTTP; subconjunto de autorização em lote também revalidado depois. Falhas de processo são simuladas por lease expirado/recibo persistido, sem comprar chamadas reais. Migrações 0200–0202, outbox existente, IDs estáveis em ambos os botões, consumo transacional de aprovação pelo runtime e revisão comercial independente de capacidade. Interface comercial mais rica e teste de navegador completo continuam em A5.

### Task A4 Orçamento incremental e continuidade sem reinício

**Files:** modificar `operational-limits.ts`, `capture-capacity.ts`, `capture-preflight.ts`, `capture-limit-authorization.ts`, `capture-recovery.ts`, `research-availability.ts`, `research-planner.ts`, `research-requests.ts`; testes `radar-operational-limits.test.ts`, `radar-capture-capacity.test.ts`, `radar-capture-preflight.test.ts`, `radar-capture-recovery.test.ts`, `radar-research-requests.test.ts`; painel `frontend/src/components/platform/admin/RadarOperationalLimitsPanel.tsx` e teste.

**Interfaces:** `resolveRadarIntentBudget({historicalUsage,intentBaseline,authorizedPolicy}):{additionalAllowed,reserved,remaining,reasons}`. A política operacional versionada acrescenta máximos de decisões, pesquisas profundas e tentativas fallback, com unidades explícitas. Não usar int4 ou duração do worker como quota de produto. Cada reserva verifica carteira interna, custo, fonte e licença somente do efeito que será executado.

Estender A0.1 sem recriar o teto agregado implícito. Admin edita capacidade por fonte, agregado opcional, custo e origem da herança. Criar `backend/src/modules/radar/cost-conversion.ts`, `backend/tests/radar-cost-conversion.test.ts` e `RadarCostPolicy={usdToBrl:string|null;rateAsOf:string|null;rateSource:'manual';marginPercent:string}` (margem inicial zero). Persistir `costPolicy` junto da política operacional, com o mesmo versionamento, não dentro do mapa de limites numéricos. Estender GET/PUT em `routes.ts`, tipos/serviço e painel Admin; cliente não recebe o objeto. `estimateRadarCostBrl({amount,currency,rateSnapshot}):{amountBrl,originalAmount,currency,rateSnapshot,estimated:true}` usa decimal, não ponto flutuante acumulativo. Preservar moeda/custo informado pelo fornecedor e congelar cotação por reserva; conciliar em BRL estimado, sem alegar valor exato de cartão/impostos. Não reutilizar o câmbio fixo 1 do Action Engine (`executor.ts:526`) nem alterar essa área neste patch.

**Exemplo:** cotação **hipotética** de R$ 5,50/US$ e custo US$ 0,01 dão R$ 0,055 antes de taxas. Admin mostra unidade, cotação/data, estimado/confirmado/incerto; cliente não recebe nenhum desses campos. Cotação ausente não equivale a zero: pedir configuração para aprovar novo efeito USD; permitir leitura/revalidação gratuita e efeitos BRL já autorizados. Não inventar cotação atual.

- [x] **Step 1:** Assertions: `oldRun.queries=5 + refresh.additional=3 => historical=5, available=3`; `sourceDailyExhausted + savedPages => read/analyzeAllowed`; orçamento concorrente não é gasto duas vezes; mudar teto de páginas não troca cursor; ausência de crédito externo não é inferida de uma quota interna. Limite diário gera espera retomável, não sucesso parcial definitivo.
- [x] **Step 2:** Rodar suítes de capacidade/preflight/requests e teste de painel; incluir banco real com corrida de duas reservas.
- [x] **Step 3:** Implementar reservas incrementais e explicação administrativa da origem dos limites. Atualização autorizada aumenta capacidade do mesmo pedido sem zerar uso passado. Recibo incerto mantém reserva conservadora. Ausência de política nova não libera gastos infinitos nem impede revalidação gratuita.
- [x] **Step 4:** Testar compatibilidade v1, carteira ilimitada autorizada/limitadas, pausas e reativação sem redescoberta. Rodar `npm test -- tests/radar-cost-conversion.test.ts`: precisão decimal, BRL direto, USD sem cotação, cotação alterada durante chamada, valores incertos e ausência dos campos em DTO cliente. Commit financeiro/continuidade.

Verificado localmente: 1.193 testes backend, 1.145 frontend, 330 runtime, 132 testes de capacidade/continuidade com PostgreSQL e 57 de worker/HTTP/jornada. Migrações 0203–0209 em banco isolado; nenhuma compra ou alteração em produção. Novos pedidos e retomadas têm orçamento incremental; ampliação do mesmo pedido exige autorização administrativa versionada e conserva o baseline, o consumo e os recibos. Campo de decisões/pesquisa profunda é preparação para B/C, não ativação; limite de fallback já é aplicado às análises atuais do Radar. A5 ainda implementa o feedback comercial e o acesso visual à conciliação/ampliação.

### Task A5 Feedback comercial e recuperação do lote legado

**Files:** modificar `backend/src/modules/radar/commercial-view.ts`, `research-feedback.ts`, `research-metrics.ts`, `frontend/src/components/radar/RadarCaptureControls.tsx`, `RadarCaptureProgress.tsx`, `RadarCandidateResearchPanel.tsx`, `RadarResultsTable.tsx`, `RadarCandidateSummary.tsx`, `RadarWorkspace.tsx`, `RadarCommercialResults.tsx`, `RadarCommercialWorkspace.tsx`, `RadarAdminOperations.tsx`, `frontend/src/pages/platform/AdminIntegrationsPage.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts`; testes de componentes, inclusive `RadarCommercialResults.test.tsx`, e `backend/tests/integration/radar-commercial-audience.test.ts`; criar `frontend/tests/journeys/browser/radar-resume-quality.pw.ts`.

**Interfaces:** Projetar `CommercialResearchStatusV1` a partir de etapas e lacunas, com `updatedFields`, `unresolvedFields`, `lastAttemptAt`, `nextAction` e motivos comerciais enumerados. O diagnóstico técnico vai à área administrativa autorizada; nunca transferir blob de provedor para a tela da campanha.

**Exemplo e âncora:** `capture-research-state.ts:38–40` diferencia espera de identidade/leitura. Para Suprema, mostrar “Não foi possível ler a página encontrada; dados ainda não confirmados”, não “chave inválida”. Para Pronutri, campo de perfil sem suporte não apaga contato válido nem vira intenção de compra. Para Fragon, resultado fora do perfil é diferente de operação impedida. Os testes devem corresponder às linhas do inventário, não apenas à contagem 1/8/11.

- [x] **Step 1:** Testes de 1 concluída/8 insuficientes/11 impedidas: progresso não 100%, botões respondem com pedido/etapa; os quatro selecionados mostram resultados individualizados, não só `reused`; detalhes expandem na linha e detalhes completos navegam. HTTP direto, JSON aninhado, CSV e CRM ocultam ferramentas/custos para cliente, operador e admin de conta; nome legítimo semelhante a fornecedor não é censurado.
- [x] **Step 2:** Rodar unitários frontend e `npm run test:integration -- tests/integration/radar-commercial-audience.test.ts`; confirmar falhas esperadas antes de editar UI.
- [x] **Step 3:** Implementar DTO allowlist, mensagens de falta de evidência distintas de etapa não executada e resumo pai atualizado. Uma ação contextual por pedido; conservar funções técnicas no Admin. Adicionar conciliação administrativa agregada dos cinco recibos antigos sem criar prova inexistente.
- [x] **Step 4:** Navegador conectado local, desktop/mobile e recarga, worker e banco isolado, reproduzindo as 20 empresas com fontes simuladas: `discoveryCalls===0`, nenhum item perdido e cada item termina ou apresenta causa/ação real. Rodar suítes completas, builds, lint comparativo e teste de isolamento; commit da experiência. Recuperação real continua pendente de deploy e autorização de gasto próprios.

Verificado localmente: suítes completas com 1.200 testes backend e 1.160 frontend; após os ajustes finais, 77 testes backend, 56 frontend, 29 de despacho/concorrência e 59 de PostgreSQL/HTTP/jornada revalidados. Dois testes de navegador (desktop e celular) executaram 18 empresas com páginas salvas, mantiveram duas com impedimento explícito, conservaram os 20 itens e provaram zero chamada de descoberta/busca/modelo. Um teste de concorrência reproduziu e corrigiu a atualização atrasada que marcava uma empresa concluída como pesquisando. Migração 0210 normaliza políticas antigas com auditoria de migração; execução em janela pequena não limita a seleção lógica de recuperação. Tipos, builds e orçamento de bundle passaram; lint comparativo permaneceu em 547 erros/25 avisos preexistentes, não lint limpo. Conciliação de cinco recibos foi demonstrada com dados sintéticos; não representa recuperação das empresas em produção. Revisão final sequencial, sem revisor independente/subagente, conforme o plano aprovado.

### Task A6 Vigia de lotes sem avanço

**Files:** modificar `backend/src/modules/radar/capture-dispatch.ts:99`, `backend/src/jobs/registry.ts:190`, `backend/src/modules/radar/operational-limits.ts`, painel Admin de limites/operações; criar `backend/src/modules/radar/stalled-research.ts`, `backend/tests/radar-stalled-research.test.ts`, `backend/tests/integration/radar-stalled-research.test.ts`, migração aditiva `radar_progress_watchdog` para marcos/diagnóstico quando faltarem.

**Interfaces:** `inspectStalledRadarResearch(db,{now,stalledAfterMinutes}):Promise<StalledRadarResearch[]>` usa `lastProgressAt` de avanço real (etapa, evidência, efeito concluído), não `updated_at` de polling. Configuração Admin `stalledAfterMinutes`, inicial 10 minutos, editável; estado distingue `running_with_heartbeat`, `waiting_capacity`, `waiting_authorization`, `queue_unavailable`, `lease_expired`, `effect_uncertain`, `no_progress`. Reaproveitar a manutenção/outbox já existentes; não criar daemon nem automação externa. Tentativas com heartbeat/lease válido podem gerar diagnóstico de demora, nunca compra ou reexecução automática por esse motivo.

**Exemplo:** lote sem avanço há dez minutos e sem job recebe alerta no Admin com etapa/motivo/ação; lote aguardando aprovação mostra a espera, não falha de worker. Atualizar resumo a cada vinte segundos não esconde lote parado.

- [x] **Step 1:** Testar relógio simulado, polling sem avanço, lease válido, job perdido, espera autorizada, duas contas e alerta duplicado. Assert `uncertainEffect => externalCalls===0` e `clientDTO => noTechnicalFields`.
- [x] **Step 2:** Rodar `npm test -- tests/radar-stalled-research.test.ts` e integração homônima; confirmar falhas novas.
- [x] **Step 3:** Persistir marcos, classificar espera e exibir fila de atenção em Admin. Recuperação de entrega comprovadamente não iniciada segue reconciliação existente e chave idempotente; recibo incerto só vai à conciliação A1.
- [x] **Step 4:** Simular restart de worker e indisponibilidade da fila em banco isolado. Provar que vigia informa causa sem repetir efeito pago e sem alertas técnicos na campanha comercial. Commit `feat(radar): surface stalled research in system admin`.

Verificado localmente: 1.202 testes backend, 1.162 frontend, 330 runtime, 70 PostgreSQL/HTTP/jornada e 48 de manutenção/capacidade com banco isolado. Após o último reforço de tratamento de erro da fila, seis testes focados e tipos revalidados. Dois testes de navegador conferiram a área Admin em desktop/celular, sem iniciar pesquisas. Migrações 0211–0213 em ambos os bancos de teste; marcos ficam na própria linha e a leitura calcula o avanço do lote, evitando inversão de locks. Um índice global guarda somente IDs de contas para a manutenção entrar em cada escopo RLS; não libera os dados das contas ao worker global. A vigia usa a manutenção existente e não executa ferramentas pagas. Builds, orçamento de bundle e lint comparativo passaram (547 erros/25 avisos preexistentes). Nada implantado ou ativado em produção.
