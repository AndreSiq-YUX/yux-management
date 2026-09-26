# Radar Comercial e Prospecção Orquestrada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** após o piloto automático OSM, tornar o Radar uma entrada governada e opcional por organização para uma jornada de descoberta, verificação, análise, CRM, proposta e atendimento SDR, sem Jina no caminho ativo.

**Architecture:** separar fonte de descoberta, leitor de site, decisões tipadas, análise generativa e orquestração de CRM. A busca retorna candidatos; evidências verificadas e política habilitam transições idempotentes. O Admin escolhe modelos e fallbacks; integrações e custos de pesquisa ficam em fonte própria. Nenhuma migração ativa gasto ou envio.

**Tech Stack:** Fastify/TypeScript, PostgreSQL, BullMQ, React, Vitest; OpenRouter/TypeSafe só quando configurados; HTTP/HTML e Playwright opcional para páginas JavaScript.

**Spec:** [`docs/superpowers/specs/2026-09-26-radar-prospeccao-orquestrada.md`](../specs/2026-09-26-radar-prospeccao-orquestrada.md)

## Global Constraints

- Nenhuma chamada paga a Brave, Parallel, CNPJa, Jev ou outro provedor sem autorização explícita do usuário e configuração habilitada no Admin.
- O piloto OSM de `2026-09-26-radar-piloto-descoberta-automatica-osm.md` precede este plano; fonte OSM local não implica permissão para contato.
- Jina não é fallback: leituras e buscas antigas ficam históricas, novas execuções não invocam `r.jina.ai` nem `s.jina.ai`.
- Radar e prospecção começam desligados para todas as organizações; ativação é explícita, auditada e limitada ao contrato/papel.
- Primeiro contato e proposta não são enviados pela mera descoberta; autorização do canal, política de WhatsApp, aprovação, limite e opt-out são revalidados no envio.
- Não preencher contatos fictícios; `unknown`/`blocked` não significam site ausente, e `not_found_in_checked_sources` significa apenas busca negativa nas fontes indicadas.
- Evitar migrações de dados destrutivas, preservar registros Radar existentes e respeitar alterações de WhatsApp em andamento na árvore de trabalho.

## File Structure

| Unidade | Responsabilidade |
| --- | --- |
| `backend/src/modules/radar/discovery-provider.ts`, `paid-discovery.ts` | Interface de descoberta e adaptadores opcionais autorizados, sem análise/CRM |
| `backend/src/modules/radar/site-evidence.ts`, `site-browser.ts` | Segurança de URL, leitura HTTP, fallback Playwright, evidências e estado do site |
| `backend/src/modules/radar/triage.ts` | Decisão tipada/limiar Jev opcional; nunca gera texto |
| `backend/src/modules/radar/orchestration.ts` | Estados e eventos Radar→CRM com idempotência |
| `backend/src/modules/prospecting/crm-handoff.ts` | Regras por estágio para SDR/closer/tarefa sem autorização implícita de envio |
| `backend/src/modules/platform/llm-routing.ts`, `adminRepository.ts`, `routes.ts` | Rotas de modelo/decisão, fallback, teste e escopo |
| `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/lib/radar/radarRules.ts` | UI de fontes, estados, revisão e autorização por organização |
| `frontend/src/pages/platform/AdminAiPage.tsx`, `frontend/src/lib/platform/moduleRegistry.ts` | Configuração de modelos e módulo Radar contratável |
| `backend/src/db/migrations/0179_radar_orchestration.sql` | Contrato, fonte, site, estágios e eventos; usar próximo número livre se 0179 for ocupado antes da execução |
| `backend/src/db/migrations/0180_radar_crm_nullable_contacts.sql` | Permitir lead de empresa sem e-mail sem fabricar identidade; ajustar restrições de contato |

## Review Focus

1. URL pública redireciona para IP interno: teste da Task 2 exige bloqueio antes de buscar o destino.
2. Site indisponível ou sem URL: teste da Task 2 exige `unknown`/`blocked`, nunca “não tem site”.
3. Duas execuções do mesmo candidato ou evento: testes das Tasks 3 e 5 exigem um lead e uma transição por chave de correlação.
4. Organização sem contrato/módulo ou de outro tenant: testes da Task 1 exigem 403 e ausência no menu.
5. Resposta SDR, opt-out ou falta de template no instante do envio: testes da Task 6 exigem transição única ou bloqueio, sem mensagem.

---

### Task 1: Módulo Radar por organização e governança de fontes

**Files:**
- Create: `backend/src/db/migrations/0179_radar_orchestration.sql`
- Modify: `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/routes.ts`, `backend/src/modules/prospecting/service.ts`, `frontend/src/lib/platform/moduleRegistry.ts`, `frontend/src/lib/radar/radarRules.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`
- Test: `backend/tests/radar-routes.test.ts`, `backend/tests/prospecting-repository.test.ts`, `frontend/src/lib/radar/radarRules.test.ts`

**Interfaces:**
- Produces: `requireRadarEntitlement(pool, user, organizationId, action: 'read'|'manage'|'prospect'): Promise<void>`; política efetiva `radar_enabled=false`, `prospecting_enabled=false` por padrão; fonte guarda `enabled`, `daily_limit`, `campaign_limit`, `estimated_cost`, `storage_rights_confirmed`.
- Consumes: contratos/módulos e escopo organizacional já usados pela plataforma; não confiar apenas no menu.

- [ ] **Step 1: Write failing tests.** Cobrir Admin ativando Radar apenas para organização A; A com papel permitido passa, B e A sem contrato/papel recebem 403; menu só aparece em A; prospecção desligada bloqueia início mesmo com Radar ligado.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-routes.test.ts tests/prospecting-repository.test.ts`; `cd frontend; npm test -- src/lib/radar/radarRules.test.ts` → FAIL nos novos casos.
- [ ] **Step 3: Implement entitlement and UI.** Criar chave `radar` no registro de módulos, endpoint/admin toggle auditado e verificação em todas as rotas Radar/prospecting; remover dependência exclusiva de `isInternalGrowthWorkspace`, preservando permissão de operação interna.
- [ ] **Step 4: Run green tests and type-check.** Os comandos da Step 2 e `cd backend; npm run type-check`, `cd frontend; npm run type-check` → PASS.
- [ ] **Step 5: Commit.** Apenas os arquivos desta tarefa: `feat(radar): gate prospecting by organization entitlement`.

### Task 2: Verificação segura do site e evidências auditáveis

**Files:**
- Create: `backend/src/modules/radar/site-evidence.ts`, `backend/src/modules/radar/site-browser.ts`, `backend/src/jobs/handlers/radar-site.ts`, `backend/tests/radar-site-evidence.test.ts`
- Modify: `backend/src/jobs/registry.ts`, `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/analysis-service.ts`, `backend/src/modules/radar/routes.ts`, `backend/src/modules/radar/types.ts`, `backend/package.json`, `backend/Dockerfile.dokploy`, `docker-compose.dokploy.yml`
- Test: `backend/tests/radar-analysis-service.test.ts`, `backend/tests/radar-routes.test.ts`

**Interfaces:**
- Produces: `inspectRadarSite(input: { organizationId:string; opportunityId:string; url?:string }): Promise<RadarSiteEvidence>`; `RadarSiteEvidence={status:'verified_present'|'not_found_in_checked_sources'|'unknown'|'blocked', finalUrl?, title?, facts: Array<{text:string;url:string}>, contacts: Array<{value:string;kind:'email'|'phone';url:string}>, checkedAt, reason?}`.
- Consumes: URLs atuais manuais/CSV/candidatos. Faz HTTP/HTML primeiro; Playwright somente por fila/serviço isolado se JavaScript impedir leitura, com teto de duração/tamanho/redirects; bloqueia loopback, redes privadas, metadados de nuvem e redirects para elas. O container do browser não compartilha credenciais de IA/CRM.

- [ ] **Step 1: Write failing tests.** HTML estático fornece título/contato com URL de origem; HTML sem conteúdo útil aciona browser simulado; redirect interno é bloqueado; URL ausente retorna `unknown`; 404/timeout sem evidência não declara empresa sem site; análise não afirma defeito não observado.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-site-evidence.test.ts tests/radar-analysis-service.test.ts` → FAIL.
- [ ] **Step 3: Implement reader, worker and persistence.** Salvar só sinais e trechos necessários com proveniência/retenção; enfileirar após importação e expor chamada para descoberta futura; análise aguarda evidência ou marca insuficiência explicitamente. Isolar browser no deploy e não abrir navegador para páginas de busca.
- [ ] **Step 4: Run green tests and type-check.** Testes da Step 2 e `cd backend; npm run type-check` → PASS; smoke do worker em ambiente de teste sem internet externa.
- [ ] **Step 5: Commit.** `feat(radar): verify company sites with bounded evidence`.

### Task 3: Descoberta substituível, sem Jina ativo

**Files:**
- Create: `backend/src/modules/radar/discovery-provider.ts`, `backend/src/modules/radar/paid-discovery.ts`, `backend/tests/radar-discovery-provider.test.ts`
- Modify: `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/routes.ts`, `backend/src/modules/radar/types.ts`, `backend/src/modules/radar/sourceRules.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`, `backend/src/config/env.ts`
- Test: `backend/tests/radar-routes.test.ts`, `backend/tests/radar-jina-client.test.ts`

**Interfaces:**
- Produces: `RadarDiscoveryProvider.search({ query, city, state, limit, organizationId }): Promise<{ candidates: RadarDiscoveredCandidate[]; usage: { requestCount: number; estimatedCostUsd: number } }>`; `RadarDiscoveredCandidate={name,url?,phone?,address?,sourceUrl?,sourceId?,snippet?,collectedAt}`; `resolveRadarDiscoveryProvider(config)` falha fechado.
- Consumes: fonte OSM do piloto, fonte e orçamento da Task 1 e leitor da Task 2. Adaptadores pagos são opcionais e **desabilitados** até credencial, direitos de persistência e teto aprovados; manual/CSV/CNPJa continuam operacionais.

- [ ] **Step 1: Write failing tests.** Fonte desabilitada não chama rede; resposta simulada da fonte gera candidatos com proveniência; repetição deduplica; `web_search` não chama Jina; importação de URL usa leitor da Task 2; sem fonte aprovada retorna bloqueio legível.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-discovery-provider.test.ts tests/radar-routes.test.ts tests/radar-jina-client.test.ts` → FAIL nos novos casos.
- [ ] **Step 3: Implement adapter and removal.** Extrair contrato de fonte; ligar `web_search` ao provedor configurado; substituir importação Jina Reader pelo leitor da Task 2; preservar `source_type` histórico Jina no banco, retirar escolhas Jina da UI e não manter fallback oculto.
- [ ] **Step 4: Run green tests and type-check.** Testes da Step 2 e `cd backend; npm run type-check` → PASS, sem chamadas externas reais.
- [ ] **Step 5: Commit.** `feat(radar): decouple discovery and retire Jina calls`.

### Task 4: Rotas de IA e experimento controlado com Jev

**Files:**
- Create: `backend/src/modules/radar/triage.ts`, `backend/tests/radar-triage.test.ts`, `backend/tests/radar-llm-routing.test.ts`
- Modify: `backend/src/modules/platform/llm-routing.ts`, `backend/src/modules/platform/adminRepository.ts`, `backend/src/modules/platform/routes.ts`, `frontend/src/pages/platform/AdminAiPage.tsx`, `frontend/src/components/platform/admin/LlmUseCaseRoutingPanel.tsx`, `backend/src/modules/radar/analysis-service.ts`
- Test: `backend/tests/admin-llm-routing.test.ts`

**Interfaces:**
- Produces: rotas `radar_query_planner`, `radar_site_analyst`, `radar_proposal_drafter` (`chat`) e `radar_candidate_triage` (`decision`); `triageRadarCandidate(facts, route): Promise<{decision:'investigate'|'review'|'discard'; confidence:number; model:string}>`.
- Consumes: evidências da Task 2. Jev usa API de decisões, não chat completion; é opcional e não entra no fallback global de texto. Sem rota ou com confiança inferior ao limiar configurado, retorna `review`, sem gasto alternativo silencioso.

- [ ] **Step 1: Write failing tests.** Admin lista/salva/testa rotas Radar sem confundir Jev com chat; custo e fallback visíveis; Jev não recebe corpo sem limite nem telefone desnecessário; resposta inválida/baixa confiança exige revisão; diagnóstico textual usa rota de análise e cita evidência.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-triage.test.ts tests/radar-llm-routing.test.ts tests/admin-llm-routing.test.ts` → FAIL.
- [ ] **Step 3: Implement routing and decision adapter.** Reutilizar cofre e escopo existentes; adicionar tipo `decision` e teste apropriado; manter rota Jev desligada por padrão. Preparar conjunto rotulado em português para benchmark posterior, sem chamada paga nesta tarefa.
- [ ] **Step 4: Run green tests and type-check.** Testes da Step 2, `cd backend; npm run type-check`, `cd frontend; npm run type-check` → PASS.
- [ ] **Step 5: Commit.** `feat(radar): route analysis and optional decision model in Admin`.

### Task 5: Radar→CRM→proposta por regras da organização

**Files:**
- Create: `backend/src/modules/radar/orchestration.ts`, `backend/tests/radar-orchestration.test.ts`
- Create: `backend/src/db/migrations/0180_radar_crm_nullable_contacts.sql`
- Modify: `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/routes.ts`, `backend/src/modules/crm/repository.ts`, `backend/src/modules/proposals/routes.ts`, `backend/src/modules/automations/mission-commands.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/types/crm.ts`
- Test: `backend/tests/radar-routes.test.ts`, `backend/tests/proposal-routes.test.ts`

**Interfaces:**
- Produces: `advanceRadarOpportunity({ organizationId, opportunityId, expectedState, eventKey }): Promise<{state,leadId?,proposalId?,blockedReasons:string[]}>`; mapeamento da campanha para `crm_instance_id`, `pipeline_id`, `stage_id`, regra de proposta e níveis de aprovação.
- Consumes: evidências/triagem das Tasks 2–4. Usa domínio de CRM, automações e proposta existentes; não cria implementação paralela de envio ou geração.

- [ ] **Step 1: Write failing tests.** Sem pipeline configurado bloqueia; com pipeline escolhido cria um lead único com fonte/evidência e `email=null` quando ausente; regra de estágio move uma vez; proposta fica rascunho com oferta/escopo da organização; falha posterior retoma sem duplicar lead/proposta.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-orchestration.test.ts tests/radar-routes.test.ts tests/proposal-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement transitions and UI.** Persistir configuração versionada por campanha, correlação, status técnico e erro recuperável; permitir `leads.email IS NULL` sem relaxar elegibilidade de envio, ajustar tipos/consumidores para `string|null`; remover primeiro pipeline/oferta YUX/e-mail fictício; mostrar avanço, bloqueios, evidências e decisões na UI.
- [ ] **Step 4: Run green tests and type-check.** Testes da Step 2 e `cd backend; npm run type-check`, `cd frontend; npm run type-check` → PASS.
- [ ] **Step 5: Commit.** `feat(radar): orchestrate CRM and proposal from verified opportunities`.

### Task 6: CRM comanda SDR, contato e próximo responsável

**Files:**
- Create: `backend/src/modules/prospecting/crm-handoff.ts`, `backend/tests/prospecting-crm-handoff.test.ts`
- Modify: `backend/src/modules/prospecting/service.ts`, `backend/src/modules/prospecting/repository.ts`, `backend/src/modules/crm/scheduler.ts`, `backend/src/jobs/handlers/omnichannel.ts`, `backend/src/modules/omnichannel/assistant-context.ts`, `backend/src/modules/omnichannel/whatsapp-connections.ts`
- Test: `backend/tests/prospecting-repository.test.ts`, `backend/tests/omnichannel-ai-loop.test.ts`, `backend/tests/integration/whatsapp-saas.test.ts`

**Interfaces:**
- Produces: `applyCrmAgentHandoff({ organizationId, leadId, stageEventId }): Promise<{assignedProfileKey?, taskId?, blockedReasons:string[]}>`; associação de regra de estágio a perfil SDR/closer/suporte ou pessoa, com janela, condição e idempotência.
- Consumes: evento da Task 5, política de prospecção e conexão WhatsApp. Primeiro envio usa sequência/template e elegibilidade existentes; resposta SDR grava qualificação no CRM; nova etapa/evento agenda a próxima ação, não troca de agente dentro da mesma resposta.

- [ ] **Step 1: Write failing tests.** Descoberta sozinha não envia; número público sem permissão bloqueia; template/conexão ausentes bloqueiam; opt-out entre aprovação e envio cancela; resposta SDR move estágio apenas sob regra; evento repetido cria um handoff; nova conversa usa perfil configurado para a etapa e não mistura organizações.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/prospecting-crm-handoff.test.ts tests/prospecting-repository.test.ts tests/omnichannel-ai-loop.test.ts` → FAIL.
- [ ] **Step 3: Implement handoff.** Configurar regras versionadas por pipeline/estágio, revalidar elegibilidade no disparo, integrar escolha de perfil/conexão na entrada/continuação e registrar eventos de envio, entrega, resposta e transferência; preservar intervenção humana.
- [ ] **Step 4: Run green and integration tests.** Testes da Step 2, `cd backend; npm run test:integration -- tests/integration/whatsapp-saas.test.ts`, `cd backend; npm run type-check` → PASS.
- [ ] **Step 5: Commit.** `feat(prospecting): drive AI handoffs from CRM stage events`.

### Task 7: Canário, documentação e liberação gradual

**Files:**
- Modify: `docs/yux-hub-catalogo-funcionalidades-capacidades.md`, `docs/implementation-status.md`
- Create: `docs/runbooks/radar-prospeccao-canario.md`, `backend/tests/integration/radar-prospecting-journey.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6. O runbook define chaves desligadas, testes sem custo, aprovação de fonte/modelo/custo, limites, kill switch, restauração e métricas.
- Produces: evidência de canário em organização própria e catálogo atualizado **só com capacidades efetivamente verificadas**.

- [ ] **Step 1: Write failing integration test.** Organização própria com fonte simulada percorre descoberta→site→revisão→CRM→proposta rascunho→bloqueio/permitido de outreach→resposta→handoff; outra organização não vê os dados.
- [ ] **Step 2: Run red test.** `cd backend; npm run test:integration -- tests/integration/radar-prospecting-journey.test.ts` → FAIL.
- [ ] **Step 3: Complete runbook and documentation.** Preparar canário sem envio externo primeiro; só executar provedores pagos/Jev com autorização específica e orçamento; registrar métricas de precisão, custo/candidato, leads válidos, entrega/resposta, falhas e opt-outs; atualizar catálogo depois de evidência real.
- [ ] **Step 4: Run full verification.** Integração da Step 2, `cd backend; npm test`, `cd backend; npm run build`, `cd frontend; npm run build` → PASS; canário de produção separado requer decisão de deploy e credenciais.
- [ ] **Step 5: Commit.** `docs(radar): verify and document orchestrated prospecting rollout`.

## Self-review

- Cobertura da spec: Task 1 governa o módulo; Task 2 lê o site; Task 3 troca a fonte e elimina Jina; Task 4 roteia modelos/Jev; Tasks 5–6 ligam CRM, proposta e agentes; Task 7 valida o percurso e atualiza catálogo.
- Estados `unknown`/`blocked`, tenant, dedupe, opt-out/template e custo têm testes explícitos no dono do código.
- Dependência comercial pendente: fontes pagas e Jev permanecem desligados até autorização e confirmação de direitos/qualidade; a implementação pode usar mocks sem custo.
