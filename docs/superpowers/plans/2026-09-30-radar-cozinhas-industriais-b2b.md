# Radar de cozinhas industriais B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar, verificar, qualificar e entregar uma lista auditável de cozinhas industriais em MG, SP e PR, sem confundir descoberta cadastral com operação comprovada ou permissão de contato.

**Architecture:** Ampliar a campanha Radar para múltiplas UFs, executar descoberta paginada em fonte com direitos de retenção verificados e registrar fatos com proveniência. Uma etapa isolada verifica site/atividade e outra calcula aderência aos produtos; revisão humana controla exportação/CRM e não há outreach automático.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest e roteamento de LLM existente no Admin.

**Spec:** `docs/superpowers/specs/2026-09-30-radar-cozinhas-industriais-b2b.md`

## Global Constraints

- Nenhum crédito de API ou modelo pago é autorizado por este plano. Desenvolvimento e testes usam respostas simuladas.
- Manter Serper fora da persistência de leads; Brave entra somente com chave específica e atestação administrativa de licença de retenção/entrega, com referência contratual registrada. Brave padrão impede armazenamento de resultados.
- Preservar campanhas existentes de cidade/UF única e todas as permissões/limites atuais.
- Nenhum contato, proposta, WhatsApp ou e-mail automático como efeito da descoberta/classificação; telefonema é manual pela equipe do cliente e registrado no CRM.
- Sites e contatos ausentes continuam `unknown`/nulos; toda conclusão substantiva tem fonte e data.
- O rollout começa na organização interna YUX; abertura para o cliente é etapa separada, com entitlement e isolamento por organização.

## Review Focus

- CNPJ com 5620-1/01 apenas secundário deve entrar na descoberta, mas ser classificado por evidência antes de ser confirmado (Task 2/4).
- Restaurante com nome ou CNAE parecido deve ficar fora dos confirmados, com motivo auditável (Task 4).
- Site inexistente, bloqueado ou URL em rede privada não pode virar falso diagnóstico nem requisição insegura (Task 3).
- Paginação interrompida/repetida e CNPJ com matriz/filiais não devem cobrar/processar novamente nem duplicar registros (Task 2).
- URL, contato e pessoa sem fonte confiável, ou registro de outra organização, não devem aparecer em exportação (Task 3/5).

---

## File map

- `backend/src/db/migrations/0180_radar_multistate_industrial_kitchen.sql`: briefing multirregional, checkpoints, evidências e classificações, sem alterar dados históricos destrutivamente.
- `backend/src/modules/radar/types.ts`, `routes.ts`, `repository.ts`: contrato da campanha, autorização e persistência.
- `backend/src/modules/radar/cnpjaClient.ts`, novo `cnpja-batch.ts`: consulta CNAE principal/secundário, paginação, checkpoint, quota e idempotência.
- `backend/src/modules/radar/place-providers.ts` e novo `licensed-place-capture.ts`: resultado Brave persistível só sob licença registrada e chave específica; Serper segue transitório.
- Novo `site-verification.ts`: resolução segura de domínio, HTTP limitado e fatos com proveniência; não é raspagem de buscadores.
- Novo `industrial-kitchen-triage.ts`: classificação setorial e aderência aos produtos como saídas distintas.
- `backend/src/modules/platform/llm-routing.ts`: rota opcional para análise de evidências ambíguas, com fallback configurável no Admin.
- `frontend/src/components/radar/RadarWorkspace.tsx` e, se necessário, componentes focados sob `frontend/src/components/radar/`: briefing MG/SP/PR, progresso, evidências, revisão e exportação.
- Testes dedicados sob `backend/tests/radar-*.test.ts` e `frontend/src/**/__tests__/` conforme convenção já existente.

### Task 1: Campanha multirregional e briefing comercial

**Files:** Modify `backend/src/modules/radar/types.ts`, `routes.ts`, `repository.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`; create migration `0180_radar_multistate_industrial_kitchen.sql`; test `backend/tests/radar-routes.test.ts` e teste da UI.

**Interfaces:** Produz `RadarProspectingBrief { states: ('MG'|'SP'|'PR')[]; segmentKey: 'industrial_kitchen'; products: string[]; includeAdjacent: boolean; budgetLimit: number | null }`, associado à campanha. Campanha antiga continua com `targetCity/targetState`; campanha multirregional usa `targetStates` e cidade nula.

- [ ] Escrever teste que cria campanha MG/SP/PR sem cidade, rejeita UF fora da seleção e confirma leitura inalterada de campanha antiga.
- [ ] Rodar `npm --prefix backend test -- tests/radar-routes.test.ts`; verificar falha por contrato ainda inexistente.
- [ ] Implementar migração e validação de payload, mantendo compatibilidade das rotas existentes; formulário oferece briefing e deixa explícito que não envia mensagens.
- [ ] Rodar teste backend, teste da UI e `npm --prefix frontend run build`; todos passam.
- [ ] Commit `feat(radar): support multistate prospecting brief`.

### Task 2: Descoberta CNPJá paginada e idempotente

**Files:** Modify `backend/src/modules/radar/cnpjaClient.ts`, `repository.ts`, `routes.ts`; create `backend/src/modules/radar/cnpja-batch.ts`; test `backend/tests/radar-cnpja-governance.test.ts` e novo `backend/tests/radar-cnpja-batch.test.ts`.

**Interfaces:** `searchCnpjaBatchPage(config, { states, activityId: '5620101', token?, limit }) -> { candidates, nextToken? }`; `runRadarCnpjaBatch(pool, user, { campaignId, maxPages }) -> { inserted, skipped, nextToken?, spentUnits }`. A busca usa `activities.id.in` para principal **ou** secundária e preserva o CNAE efetivo retornado.

- [ ] Escrever fixtures com três UFs, CNAE secundário, duas páginas, página repetida, matriz/filial e falha após uma página; assertar checkpoint e dedupe por CNPJ de estabelecimento.
- [ ] Rodar `npm --prefix backend test -- tests/radar-cnpja-batch.test.ts`; verificar falha por API ainda inexistente.
- [ ] Implementar batches limitados, reserva/cobrança conforme contrato da fonte, `nextToken` persistido e retomada sem repetir candidatos nem extrapolar orçamento. Não chamar serviço real no teste.
- [ ] Rodar testes CNPJá e rotas; confirmar custo e número de chamadas das fixtures.
- [ ] Commit `feat(radar): page and resume CNPJa discovery`.

### Task 3: Verificação segura de site e fatos de contato

**Files:** Create `backend/src/modules/radar/site-verification.ts`, teste `backend/tests/radar-site-verification.test.ts`; modify `repository.ts`, `routes.ts` e migração da Task 1; reutilizar helpers seguros existentes somente se passarem testes SSRF/redirect.

**Interfaces:** `verifyBusinessSite(candidate, { fetch, maxPages, timeoutMs }) -> { websiteStatus: 'verified_present'|'unknown'|'blocked'; facts: EvidenceFact[] }`; `EvidenceFact { id, kind, value, sourceUrl, observedAt, confidence }`. Não buscar perfis pessoais; e-mail/nome profissional só com URL de origem inequívoca.

- [ ] Escrever testes de domínio pertencente a outra empresa, URL com rede privada, redirect para IP interno, timeout, site bloqueado, contato corporativo publicado e ausência de site; assertar `unknown`/`blocked` sem conclusões inventadas.
- [ ] Rodar `npm --prefix backend test -- tests/radar-site-verification.test.ts`; verificar falha por módulo inexistente.
- [ ] Implementar verificação limitada e persistência de evidências versionadas, sem Brave/Serper como origem persistente e sem acessar páginas autenticadas; orçamento de páginas por candidato.
- [ ] Rodar teste específico e testes de segurança/rotas do Radar; todos passam.
- [ ] Commit `feat(radar): verify business sites with evidence`.

### Task 3A: Captura Brave com licença de retenção

**Files:** Modify `backend/src/modules/radar/place-providers.ts`, `repository.ts`, `routes.ts`, `frontend/src/pages/platform/AdminIntegrationsPage.tsx`, `frontend/src/components/radar/RadarWorkspace.tsx`; create `backend/src/modules/radar/licensed-place-capture.ts`, `backend/tests/radar-licensed-place-capture.test.ts`; extend migration from Task 1.

**Interfaces:** `captureLicensedBravePlaces(pool, user, { campaignId, query, city, state, limit })` só executa se provider `brave_place` tiver chave específica ativa, `retentionLicensed: true`, `licenseReference` não vazia e fonte habilitada/com custo aprovado; retorna candidatos persistidos com `source_type='brave_place_search'` e proveniência. A prévia transitória existente continua funcionando sem licença.

- [ ] Escrever testes de bloqueio sem licença, apenas com chave padrão, licença sem referência, fonte desativada, limite estourado, falha do provedor e duplicata; confirmar zero chamada externa nos bloqueios e zero gravação dos resultados em falha.
- [ ] Rodar `npm --prefix backend test -- tests/radar-licensed-place-capture.test.ts`; verificar falha por API inexistente.
- [ ] Implementar atestação explícita no Admin e captura com governança/cobrança existentes, salvando somente dados previstos no contrato registrado; nunca presumir licença a partir da chave.
- [ ] Rodar teste específico, `radar-place-preview.test.ts` e testes do Admin; todos passam.
- [ ] Commit `feat(radar): gate persistent Brave capture on license`.

### Task 4: Triagem setorial e adequação comercial independentes

**Files:** Create `backend/src/modules/radar/industrial-kitchen-triage.ts`, `backend/tests/radar-industrial-kitchen-triage.test.ts`; modify `backend/src/modules/platform/llm-routing.ts`, `repository.ts`, `routes.ts` e migração da Task 1.

**Interfaces:** `triageIndustrialKitchen(candidate, facts) -> { kitchenStatus: 'confirmed'|'review'|'not_target'|'insufficient'; productFit: 'high'|'possible'|'low'|'unknown'; reasons: string[]; evidenceIds: string[] }`. Rota LLM opcional `radar_candidate_triage`, usada apenas para ambiguidade e sem decisão definitiva sem evidência; modelo/fallback escolhidos no Admin.

- [ ] Escrever testes para cozinha B2B confirmada, restaurante comum, CNAE secundário sem site, central de refeições hospitalares adjacente e alegação de compra sem evidência; assertar separação entre atividade e potencial de compra.
- [ ] Rodar `npm --prefix backend test -- tests/radar-industrial-kitchen-triage.test.ts`; verificar falha por módulo inexistente.
- [ ] Implementar regras determinísticas, revisão de ambíguos, chamada LLM configurável com orçamento e saída estruturada que exige `evidenceIds`; nenhuma chamada paga por padrão.
- [ ] Rodar testes específicos, de roteamento LLM e rotas; todos passam.
- [ ] Commit `feat(radar): classify industrial kitchens and product fit`.

### Task 5: Revisão, entrega e fronteira entre organizações

**Files:** Modify `backend/src/modules/radar/routes.ts`, `repository.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`; create componentes de dossiê/revisão focados e testes `backend/tests/radar-b2b-delivery.test.ts` e teste UI.

**Interfaces:** `listProspects({ campaignId, kitchenStatus?, state? })` retorna evidências e qualidade; `approveProspect` registra revisor/versão; `exportApprovedProspects` inclui somente dados cuja fonte permite retenção/entrega. Reutilizar controles de organização/entitlement; rollout inicial interno, cliente externo somente após habilitação explícita.

- [ ] Escrever testes para filtragem por UF/status, rejeição de dados de outra organização, registro sem evidência, contato sem origem, fonte sem direitos confirmados e ausência de ação de envio.
- [ ] Rodar `npm --prefix backend test -- tests/radar-b2b-delivery.test.ts`; verificar falha por endpoint ainda inexistente.
- [ ] Implementar lista/dossiê/revisão/exportação e autorização por organização, mantendo fontes sem direito de retenção fora do fluxo; não acionar CRM nem mensagens por padrão.
- [ ] Rodar testes backend/UI, `npm --prefix backend run build` e `npm --prefix frontend run build`; todos passam.
- [ ] Commit `feat(radar): review and export verified B2B prospects`.

### Task 6: Piloto controlado e decisão de escala

**Files:** Create `docs/runbooks/radar-cozinhas-industriais-piloto.md`; modify testes de integração do Radar conforme necessário.

**Interfaces:** Runbook descreve configuração da fonte, teto de custo, amostra por UF, revisão de falsos positivos/negativos, relatório de cobertura e procedimento de pausa; não contém chave de API.

- [ ] Escrever teste integrado com fixtures MG/SP/PR: descoberta → evidência → classificação → revisão → exportação, sem outreach ou vazamento entre organizações.
- [ ] Rodar teste integrado e verificar falha no primeiro estado incompleto.
- [ ] Completar runbook, simulações de falha/retry e relatório de custo estimado por página/candidato; execução real com créditos apenas após autorização específica do usuário.
- [ ] Rodar suites backend/frontend, type-check, builds e revisar diff de segurança/termos; registrar métricas e limitações observadas.
- [ ] Commit `docs(radar): add industrial kitchen pilot runbook`.

## Gate antes de implementar

O usuário aprovou implementação e contato exclusivamente telefônico/manual, e obterá chave Brave com licença de retenção. A permissão operacional para salvar dados Brave só se concretiza quando o Admin registrar a licença e a chave específica; não executar chamadas reais antes disso. Confirmar recorte das cozinhas adjacentes antes de usá-las em lista aprovada. Aprovar orçamento e volume do piloto antes de chamadas reais; desenvolvimento pode avançar com mocks sem gastar crédito.

## Estado da entrega de 30/09/2026

O código entregue usa `0180_radar_regional_b2b.sql`, `searchCnpjaAdvancedPage` e os jobs `radar.runRegionalDiscovery` / `radar.verifyRegionalCandidates`. A Brave licenciada **enriquece** um CNPJ descoberto, com correspondência estrita; não cria registros novos por busca ampla. Resultados ambíguos ficam como sugestões separadas para associação humana, sem anexar contatos automaticamente. O classificador atual é conservador/determinístico, sem chamada LLM. O site público é inspecionado na página inicial; páginas internas de contato e nomes de responsáveis não são investigados ainda. O painel oferece revisão humana com fonte e justificativa para empresas sem site. A entrega é CSV manual, não sincronização automática com o CRM. Esses desvios são deliberados para evitar correspondência errada, custo pago não autorizado e importação pelo conversor legado de funil/oferta genéricos.

Concluídos no código: campanha multirregional, paginação/checkpoint CNPJá, lote limitado, verificação HTTP segura, enriquecimento Brave condicionado à licença, triagem setorial, revisão/CSV com governança de direitos e testes simulados. Pendentes para a etapa pós-piloto: fonte complementar que descubra empresas fora do CNAE, pesquisa de páginas internas e contatos profissionais, decisão sobre LLM roteável, integração nativa com CRM, acesso da organização cliente e medição com dados reais. Nenhum teste consumiu créditos.
