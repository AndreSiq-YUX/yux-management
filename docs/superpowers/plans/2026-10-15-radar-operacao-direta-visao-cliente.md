# Radar — operação direta e visão comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Tornar a quantidade do próximo lote visível e a pesquisa objetiva, entregando ao cliente somente resultados comerciais, nunca ferramentas/custos internos.

**Architecture:** Reutilizar a operação durável de captação e os jobs existentes. Separar explicitamente os DTOs comerciais dos dados administrativos no backend e na interface. Substituir a seleção modal por formulário inline e reunir controles legados numa única área técnica exclusiva do Admin YUX.

**Tech Stack:** Fastify/TypeScript, React/Vite, componentes YUX/Radix, Vitest e PostgreSQL de teste isolado.

**Spec:** `docs/superpowers/specs/2026-10-15-radar-operacao-direta-visao-cliente.md`.

## Global Constraints

- Quantidade inteira de 1 a 1.000, padrão 10; novas empresas únicas adicionais, não quantidade garantida de aprovadas. Editar quantidade não altera a configuração salva.
- Somente `user.role === 'yux_admin'` vê ferramentas, provedores/modelos, custos, licenças e diagnósticos; conta administradora, `yux_operator` e `platform.manage` não equivalem a Admin YUX.
- Clientes recebem somente dados/conclusões comerciais, inclusive nas respostas da API. Manter CNPJ cadastral e evidências públicas úteis; retirar fornecedor CNPJá e demais mecanismos internos.
- Não alterar motor de pesquisa, migrações aplicadas, provedores, limites/preços, modelos, credenciais, TLS, carteira, consentimento, revisão, CRM ou autorização de pesquisa paga.
- Sem chamadas pagas ou deploy; testar com provedores/fila simulados, manter padrão visual YUX sem geração de imagens. Preservar comandos legados na área técnica, não excluí-los.
- Execução nativa já escolhida pelo usuário; apresentar este plano para confirmação antes de implementar.

## Review Focus

1. Cliente Admin com `platform.manage`, operador YUX ou chamada HTTP direta: nenhuma visibilidade técnica por confusão de papel (Task 1/3).
2. Payload legado com metadados dentro de contatos, limitações, oportunidades, histórico/erros ou entregas CRM/CSV: projeção aninhada fail-closed, não só remoção de propriedades de primeiro nível (Task 1/3).
3. Resposta de início perdida, quantidade alterada e navegação durante requisição: preservar UUID/quantidade do mesmo pedido, não iniciar lote concorrente nem aplicar resposta antiga (Task 2).
4. Lote bloqueado ou parcial: retomada mantém itens/quantidade, parcial nunca vira sucesso; um único comando primário e sem descoberta isolada na área principal (Task 2).
5. Preservar fatos úteis e visual YUX ao ocultar internals: nome comercial semelhante a fornecedor, CNPJ da empresa, contatos/evidências legítimas, nenhum consumo técnico solicitado por cliente (Tasks 1/3).

---

### Task 1: Fronteira comercial no servidor

**Files:**
- Create: `backend/src/modules/radar/commercial-view.ts`, `backend/tests/radar-commercial-view.test.ts`, `backend/tests/integration/radar-commercial-audience.test.ts`.
- Modify: `backend/src/modules/radar/routes.ts`, `backend/src/modules/radar/research-metrics.ts`, `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/b2b-delivery.ts`, `backend/src/modules/radar/crm-delivery.ts`, `backend/tests/radar-routes.test.ts`, `backend/tests/radar-b2b-delivery.test.ts`.

**Interfaces:**
- `canViewRadarInternals(user: Pick<AuthUser,'role'>): boolean`: estritamente `yux_admin`.
- `projectRadarCommercialResponse(surface: RadarCommercialSurface, payload: unknown): unknown`: allowlists por recurso/envelope, com `RadarCommercialSurface` fechado para `campaigns|candidates|opportunities|duplicates|research|capture|researchHistory|feedback|metrics|researchMetrics|crmDelivery|import|review|lead`. Campos aninhados desconhecidos não são copiados. Shapes nulos/arrays/envelopes seguem o contrato do recurso; nunca spread de JSON arbitrário.
- DTOs exportados `RadarCommercialCampaign`, `RadarCommercialCandidate`, `RadarCommercialResearch`, `RadarCommercialCapture`, `RadarCommercialMetrics`, usados pela Task 3. Identificadores/escopo/status e datas necessários à navegação permanecem; candidatos fornecem `facts` comerciais explícitos, não `normalizedPayload`; pesquisa fornece fatos, avaliação comercial e estado, não `run.output` bruto; capture fornece `id,campaignId,configurationRevision,status,counts,updatedAt` e pendência comercial, não recibos/configuração/itens operacionais. Métricas fornecem apenas contagens e período.
- Integração em `routes.ts`: projetar respostas autorizadas para não Admin e aplicar política também a erros HTTP. Catálogo/fontes, disponibilidade, readiness/piloto OSM, Brave availability, runs técnicos e ações provedor-específicas exigem Admin YUX. Manter escopo/autorização anteriores antes da projeção. Não ampliar endpoints pagos para clientes.
- Export/CRM disponíveis a clientes contêm fatos comerciais permitidos; erros de entrega são mensagens comerciais, sem provedor. Não remover controle de licença. Não repassar conteúdo com atribuição obrigatória incompatível com política de não divulgação; manter no Admin e bloquear essa entrega de modo legível.

- [x] Escrever testes RED parametrizados por `yux_admin`, `yux_operator`, `client_admin`, `client_member`: dados técnicos semeados em todas as camadas, acesso direto e configuração, métricas sem fontes/custos; Admin mantém payload completo. Testar allowlist com campo futuro desconhecido, nulos, arrays, histórico antigo, erros e empresa “Brave Transportes” com CNPJ preservados. Executar `npm --prefix backend test -- tests/radar-commercial-view.test.ts tests/radar-routes.test.ts tests/radar-b2b-delivery.test.ts`; esperar novas asserções FAIL.

  Teste `commercial metrics contain no internal consumption`: usar `projectRadarCommercialResponse('researchMetrics', {companies:7,identified:6,withUsefulContact:5,readyForReview:4,searchEstimatedBrl:1.25,sources:[{sourceType:'cnpja_advanced_search'}],futureInternalField:'private'})`; asserções `expect(result).toMatchObject({companies:7,identified:6,withUsefulContact:5,readyForReview:4})`, `expect(result).not.toHaveProperty('sources')`, `expect(result).not.toHaveProperty('searchEstimatedBrl')`, `expect(result).not.toHaveProperty('futureInternalField')`. Matriz de papéis usa `expect(canViewRadarInternals({role})).toBe(role==='yux_admin')`.
- [x] Implementar projeções/DTOs e aplicar em todas as rotas Radar de leitura e retornos de mutações permitidas, incluindo envelopes import/review/lead/CRM. Endpoints sem schema comercial ficam Admin-only em vez de vazar fallback bruto; registrar matriz rota/audiência nos testes. Manter internals persistidos e lógica de execução intactos.
- [x] Semear dois tenants no banco Radar dedicado. Testar com HTTP real e papéis reais: endpoints técnicos 403, comerciais sem metadados, acesso cruzado negado, erros sem stack/ferramentas, CRM/CSV sem observações técnicas e licenças ainda exigidas. Executar `npm --prefix backend run test:integration -- tests/integration/radar-commercial-audience.test.ts tests/integration/radar-crm-delivery.test.ts tests/integration/radar-capture-operation.test.ts`; esperar PASS.
- [x] Rodar suíte backend completa com o banco opt-in e build; esperar PASS. Commit `fix(radar): restrict internal tooling data to system admins`.

### Task 2: Uma operação principal com quantidade inline

**Files:**
- Create: `frontend/src/components/radar/RadarCaptureControls.tsx`, `frontend/src/components/radar/RadarCaptureControls.test.tsx`, `frontend/src/components/radar/RadarAdminOperations.tsx`.
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/components/radar/RadarWorkspace.test.tsx`, `frontend/src/components/radar/RadarCaptureProgress.tsx`, `frontend/src/components/radar/RadarCaptureProgress.test.tsx`, `frontend/src/components/radar/RadarCampaignPage.tsx`.
- Retire unused modal files only after verifying all consumers: `frontend/src/components/radar/RadarCaptureDialog.tsx`, `frontend/src/components/radar/RadarCaptureDialog.test.tsx` (functionality moves to inline tests, not removed).

**Interfaces:**
- `RadarCaptureControls({scopeKey,operation,loading,busy,available,error,onStart,onResume,onRefresh})`: `scopeKey=organizationId:campaignId:revision`; `onStart({requestedCount:number,requestId:string}):Promise<void>`. Same persisted operation and start/resume services as before. `available` concerns saved configuration, not enabling options.
- Label **Novas empresas neste lote**, default 10, inline Input 1..1000; CTA **Pesquisar novas empresas**. Active CTA status **Pesquisando empresas…**; blocked CTA **Retomar pesquisa**; uncertain start CTA **Tentar novamente sem duplicar**. Quantity original locked for active/uncertain; reset default 10 only after terminal/scope change. Exactly one start/resume CTA in this section; progress has no duplicate resume button.
- `RadarAdminOperations({children})`: single closed disclosure **Operação técnica — Admin YUX**, rendered only for `yux_admin` after results, housing legacy discover/verify/regional/availability/input/source controls. Move existing functionality, do not duplicate state/effects in a second controller.
- `RadarCampaignPage` accepts optional Admin campaign action `onDuplicate`; **Ações da campanha** contains duplication, not research. Commercial criteria summary remains distinct from technical config.

- [x] Escrever RED tests: Input visível sem modal; 7 inicia exatamente uma captação completa; 0/fração/1001 não iniciam; alterar quantidade não salva campanha; lost response conserva UUID/7; segunda tentativa e duplo clique não duplicam; campanha trocada ignora resposta antiga. Executar `npm --prefix frontend test -- src/components/radar/RadarCaptureControls.test.tsx src/components/radar/RadarWorkspace.test.tsx`; esperar FAIL.

  Teste `starts seven additional companies from the visible inline field`: montar o workspace com fixture Admin/campanha/disponibilidade existentes, editar Input para `7` e clicar CTA. Asserções `expect(radarService.startCaptureOperation).toHaveBeenCalledTimes(1)`, `expect(radarService.startCaptureOperation).toHaveBeenCalledWith('campaign',expect.objectContaining({requestedCount:7,requestId:expect.any(String)}))`, `expect(radarService.updateCampaign).not.toHaveBeenCalled()`, `expect(container.querySelector('[role="dialog"]')).toBeNull()`. Adicionar mock `updateCampaign` ao fixture, não uma implementação de teste paralela.
- [x] Escrever RED tests para execução/pausa/partial: quantidade original travada, uma CTA contextual, duas retomadas seguidas com UUIDs corretos; sem redescoberta. Área principal não contém **Buscar próxima página**, **Somente descobrir**, **Atualizar disponibilidade** ou **Duplicar pesquisa**. Expandir única área técnica e ações da campanha comprova funções legadas existentes.
- [x] Implementar formulário e composição com componentes YUX existentes, sem modal de quantidade ou confirmações redundantes. Links/painel técnico do Admin mantêm acesso a custos/preflight; iniciar não altera configurações/autorizações. Progresso usa polling existente, não navegador coordenando consultas pagas. Validar acessibilidade/foco e responsividade.
- [x] Rodar testes focais, suíte frontend completa e build; esperar PASS. Commit `fix(radar): make complete capture quantity visible and direct`.

### Task 3: Visão cliente completa, regra permanente e QA

**Files:**
- Create: `frontend/src/types/radarCommercial.ts`, `frontend/src/components/radar/RadarCommercialResults.tsx`, `frontend/src/components/radar/RadarCommercialResults.test.tsx`, `frontend/src/components/radar/RadarResearchMetrics.test.tsx`, `AGENTS.md` (se ainda ausente; preservar instruções existentes).
- Modify: `frontend/src/services/radarService.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/components/radar/RadarWorkspace.test.tsx`, `frontend/src/components/radar/RadarCampaignPage.tsx`, `frontend/src/components/radar/RadarResearchMetrics.tsx`, `frontend/src/components/radar/RadarCandidateResearchPanel.tsx`, `frontend/src/components/radar/RadarCandidateResearchPanel.test.tsx`, `frontend/src/components/radar/RadarCandidateSummary.tsx`, `frontend/src/components/radar/RadarResultsTable.tsx`, `frontend/src/components/radar/RadarCrmDeliveryDialog.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts`, `docs/runbooks/radar-pesquisa-configuravel.md`, this plan.
- Modify local QA fixture: `backend/tests/journeys/start-radar-capture-server.ts`; support Admin and client sessions/DTOs without enabling external effects.

**Interfaces:**
- Commercial types mirror Task 1 DTOs (no fake Admin defaults/casts). `radarService` exposes explicitly typed commercial requests; Admin code retains existing internal types. `RadarCommercialResults({campaign,candidates,operation,...allowedCommercialActions})` composes list/summary/details/history and business-only metrics from DTOs, never raw technical payloads. Permission to review/CRM remains existing policy, not inferred from DTO.
- Client campaign header uses **Resultados da pesquisa**, business counts only; **Critérios da campanha** is summary, not configuration editor. No internal “consumo” title. Technical UI and requests require strict system-Admin flag independent of `canManage`.
- API/frontend errors use commercial status text, not raw `radarResearchMessage` infrastructure details for clients. Public evidence links stay useful; no provider API URLs or technical notes.
- Root AGENTS rule: all Radar surfaces and delivered payloads must obey strict system-Admin audience policy; future code needs role-matrix tests; no new cost-plan UI unless explicitly requested.

- [x] Escrever RED UI tests para quatro papéis, inclusive cliente Admin com permissões amplas: abrir lista, campanha, detalhe, histórico, critérios e progresso. Não renderizar nomes/provedores/custos/rotas/licenças nem solicitar catálogo/disponibilidade/runs técnicos. HTTP erro com provedor legado não aparece no toast. Preservar nome/CNPJ/contatos/porte e campos comerciais. Executar `npm --prefix frontend test -- src/components/radar/RadarCommercialResults.test.tsx src/components/radar/RadarResearchMetrics.test.tsx src/components/radar/RadarWorkspace.test.tsx src/components/radar/RadarCandidateResearchPanel.test.tsx`; esperar FAIL.

  Teste `client admin with platform manage receives results without technical calls`: fixture role `client_admin`, permission `platform.manage`, contrato Radar ativo; asserções `expect(radarService.getDataSources).not.toHaveBeenCalled()`, `expect(radarService.getResearchAvailability).not.toHaveBeenCalled()`, `expect(radarService.getRuns).not.toHaveBeenCalled()`, `expect(container.textContent).not.toMatch(/Serper|CNPJá|Brave Web|OpenRouter|consumo|R\$/i)`, `expect(container.textContent).toContain('1128426000198')`. Empresa “Brave Transportes” em teste separado deve manter exatamente esse nome; não proibir substrings de dados cadastrais legítimos.
- [x] Implementar visão comercial/serviços e aplicar flag Admin estrita a todas as superfícies Radar. Revisar CSV/CRM, deep links, detalhes locais/legados e textos derivados; não restringir apenas o quadro de métricas. Registrar regra em AGENTS e no runbook.
- [x] Rodar suítes completas backend/frontend/runtime, builds e integração PostgreSQL Radar; comparar lint com dívida anterior sem atualizar baseline para ocultar regressões. Esperar testes/builds PASS e reportar limites de BullMQ/provedores simulados.
- [x] QA navegador conectado com dados sintéticos: desktop/mobile, campo 7 inline → única ação → progresso → reload → duas pausas/retomadas; cliente abrindo todas as seções sem ferramentas/custos e sem chamadas técnicas. Salvar screenshots fora do repo, inspecionar visual YUX e console, anotar diferenças/limitações.
- [x] Atualizar plano/runbook com evidências e commit `fix(radar): present only commercial results to client accounts`. Uma revisão independente final conforme execução nativa; corrigir Important/Critical com RED→GREEN em uma passagem. Nenhum deploy/piloto pago. Publicação em main autorizada, sem force, após verificação.

## Self-review / handoff

Spec 1 → Task 2; 2/3 → Tasks 1/3; 4 → todas. Review Focus 1/2/5 cobertos por matriz HTTP/DTO/UI; 3/4 por regressões inline e integração da operação existente. Não criar segundo motor de captação nem alterar licença/política de gastos para simplificar UI.

Plano confirmado e implementado nas três tarefas. Revisão independente final e publicação são gates após os testes; ver resultado final no runbook. Nenhum deploy ou chamada paga.
