# Radar — qualidade e entrega comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Impedir sites/canais de terceiros como oficiais e tornar pesquisa, retomada e entrega comercial verificáveis e configuráveis.

**Architecture:** Evoluir o pipeline atual e compartilhar regras de titularidade, canais e suficiência entre persistência, projeção, UI e CRM. Isolar planejamento de pesquisa, consolidação de contatos e qualidade em módulos puros; manter serviços atuais de autorização, fila, leitores seguros e governança. Acrescentar registro durável de IA e retorno da equipe sem refazer o CRM nem compartilhar dados entre tenants.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, BullMQ, Python/FastAPI, React/Vite, Vitest, pytest e Playwright com provedores simulados.

**Spec:** `docs/superpowers/specs/2026-10-15-radar-qualidade-entrega.md` (pedido de 15/10/2026 e sugestões aprovadas na conversa).

## Global Constraints

- Configurável para qualquer segmento, região e oferta; nenhum caso comercial fixo.
- Nenhuma chamada paga, modelo novo, alteração de credenciais, licença, limites ou TLS nesta implementação.
- Preservar funcionalidades, isolamento por tenant, revisões, aprovações humanas, dados históricos e leads já entregues.
- TLS estrito, leitor público seguro e proteção contra URLs internas continuam obrigatórios.
- Limites existentes: 1–5 chamadas de busca e 1–10 páginas por execução; teto de buscas separado da IA.
- Manter padrão visual YUX e rótulos comerciais; não ampliar permissões de pesquisa paga dos clientes.
- Testes com provedores simulados. Publicação em main após verificação; deploy/piloto real separados.
- IDs novos de migração devem ser revalidados antes de editar se outra mudança ocupar 0188/0189.

## Review Focus

1. Página governamental cita CNPJ exato, mas não pertence à empresa: não promover; portal da entidade pública pesquisada exige comprovação própria (Task 1).
2. Dados legados/HTML ausente, redirecionamento para terceiro e CNPJ de outra filial: projeção não ressuscita site/contato incorreto nem apaga história (Tasks 1–2).
3. Quota interrompe descoberta, surgem novos hits e chega retomada concorrente: ler somente URLs pendentes sem repetir custo ou exceder profundidade (Tasks 2–3).
4. Contato duplicado em fontes/finalidades conflitantes e oferta sem site: consolidar sem perder fontes, sem transformar vagas/privacidade em compras (Tasks 4–5).
5. Lote sem contatos, IA sem custo conhecido, feedback de outro tenant ou tentativa de entrega sem revisão: métricas honestas, autorização e CRM preservados (Tasks 5–7).

---

### Task 1: Titularidade consistente, inclusive para dados já salvos

**Files:**
- Modify: `backend/src/modules/radar/source-identity.ts`, `site-discovery.ts`, `presence-resolution.ts`, `public-presence.ts`, `company-projection.ts`, `research-service.ts`, `research-export.ts`, `crm-delivery.ts`.
- Modify: `frontend/src/lib/radar/radarPresenceSummary.ts`, `frontend/src/types/radarResearch.ts`.
- Test: `backend/tests/radar-source-identity.test.ts`, `radar-public-presence.test.ts`, `radar-legacy-projection.test.ts`, `radar-presence-resolution.test.ts`, `radar-crm-delivery.test.ts`; `frontend/src/lib/radar/radarPresenceSummary.test.ts`.

**Interfaces:**
- Consumes: `classifyRadarSource(url, evidence)`, `projectRadarCompanyFacts(payload)`, `projectRadarPublicPresence(input)`.
- Produces: categorias atuais preservadas; `classifyRadarSource` ganha `role: 'institutional_candidate'|'government_reference'|'directory_reference'|'editorial_reference'|'social_profile'|'external_reference'`, sem ampliar `kind` consumido pelo runtime. Projeções ganham `externalReferences: Array<{url:string;reason:string}>`; fontes externas nunca ocupam `website`.

- [x] Criar testes RED: `expect(isRadarInstitutionalSource('https://compras.example.gov.br/ata/empresa', {text: fixtureExactCnpj})).toBe(false)`; diretório desconhecido em `/guia/empresa` com autoria cadastral também falso; `/fornecedor/` no site próprio continua candidato. Cobrir Escavador, Diário Cidade, balanços e páginas de governo observados, com fixtures reduzidas e sem conteúdo integral.
- [x] Cobrir portal oficial de entidade pública sem bloqueio cego por TLD; propriedade requer contexto de identidade. Testar domínio parecido com gov, redirecionamento e diretório que imita texto institucional.
- [x] Executar `npm --prefix backend test -- tests/radar-source-identity.test.ts tests/radar-public-presence.test.ts tests/radar-legacy-projection.test.ts`; confirmar falhas das novas expectativas.
- [x] Implementar classificação por sinais combinados, filtrar candidatos na IA e reaplicar na projeção histórica. Preservar referência externa com motivo; não reescrever registros aprovados ou leads antigos.
- [x] Testar UI sem URL externa como site e backend sem contato do editor na exportação/nova entrega; executar suites modificadas e criar commit `fix(radar): separate external references from company websites`.

### Task 2: Retomada por trabalho pendente e registro de IA

**Files:**
- Create: `backend/src/modules/radar/research-checkpoint.ts`; `backend/src/db/migrations/0188_radar_analysis_receipts.sql`.
- Modify: `backend/src/modules/radar/research-service.ts`; `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`, `runtime_store.py`, `radar_presence.py`, `radar_qualification.py`.
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_receipts.py`.
- Test: `backend/tests/radar-research-service.test.ts`, `radar-research-persistence.test.ts`, `integration/radar-research-journey.test.ts`; `workers/marketing-studio-agent-runtime/tests/test_radar_receipts.py`, `test_api_credits.py`.

**Interfaces:**
- Consumes: páginas, hits e chamadas salvos de `runRadarResearchPipeline`; `request_id` atual do runtime.
- Produces: `pendingRadarReadUrls(hits:RadarWebHit[], pages:RadarSiteEvidence[], maxPages:number):string[]` com URL canônica e deduplicação existente; recibo durável com tenant, finalidade, request ID, hash, estado, resultado validado e metadados de uso opcionais.

- [x] Criar teste RED: checkpoint `readingComplete:true`, zero páginas e novos hits institucionais deve chamar `collect`; páginas concluídas/recentes não são lidas de novo e chamadas pagas concluídas não se repetem. Testar limite de páginas e leitor atualizado separadamente da reanálise somente salva.
- [x] Criar teste de recibo com duas solicitações concorrentes: uma reserva/chamada; mesma entrada concluída devolve resultado; hash diferente com mesmo ID gera conflito; `uncertain` não chama provedor novamente. Rodar testes e confirmar RED.
- [x] Criar migração aditiva com unicidade `(organization_id, action, request_id)`, hash, estados e acesso somente de papéis necessários. Implementar claim transacional e recibo antes/depois da chamada; manter a carteira atual e não confundir crédito interno com custo monetário.
- [x] Integrar recuperação de resposta concluída e rejeição pré-provedor comprovada. Chamadas antigas sem recibo continuam incertas, com diagnóstico acionável e sem replay automático. Registrar custo/uso retornado, ausência como desconhecida.
- [x] Executar Vitest focal, pytest focal e integração PostgreSQL com concorrência/isolamento; confirmar reanálise não pesquisa. Criar commit `fix(radar): resume unread evidence and reconcile analysis receipts`.

### Task 3: Busca orientada por lacunas, com ordem configurável

**Files:**
- Create: `backend/src/modules/radar/research-planner.ts`, `backend/tests/radar-research-planner.test.ts`.
- Modify: `backend/src/modules/radar/search-configuration.ts`, `site-discovery.ts`, `research-service.ts`, `research-availability.ts`; `frontend/src/lib/radar/radarSearchConfiguration.ts`, `frontend/src/types/radar.ts`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`.
- Test: `backend/tests/radar-site-discovery.test.ts`, `radar-research-availability.test.ts`, `radar-search-configuration.test.ts`; `frontend/src/components/radar/RadarCampaignConfigurationForm.test.tsx`.

**Interfaces:**
- Produces: `research.localSearchOrder: 'before_web'|'after_web_if_needed'|'disabled'`, default `before_web` para compatibilidade; `planRadarResearch(input:{identity:RadarBusinessIdentity;policy:RadarResearchPolicy;hits:RadarWebHit[];pages:RadarSiteEvidence[];queriesUsed:number;missing:RadarResearchGap[]}):{next?:{kind:'web'|'local'|'read';query?:string;url?:string};stopReason?:string}`. `RadarResearchGap = 'identity'|'website'|'contact'|'segment'|'profile'|'size'`.
- Consumes: classificação da Task 1 e leituras pendentes da Task 2; critérios de suficiência da Task 5 quando habilitados.

- [x] RED: primeira fonte retorna diretórios, segunda tem candidato legítimo → consultar a segunda; site/contato suficiente → não consultar Brave local em `after_web_if_needed`; limite total inclui tentativas em ambas as fontes.
- [x] RED: marca/razão social diferentes, ausência de cidade, nomes com pontuação e resultados de filial → consultas delimitadas e identidade não assumida. Rodar suites de planejamento/configuração e confirmar falha.
- [x] Implementar planejamento determinístico e motivos de parada; consultas por finalidade dentro do domínio associado. Não acrescentar LLM de pesquisa nem modificar campanhas salvas automaticamente.
- [x] Expor ordem/local na configuração com texto comercial e estimativa, mantendo controles avançados de fontes no Admin. Verificar UI, tipos e disponibilidade compatíveis.
- [x] Executar testes focais backend/frontend; criar commit `feat(radar): plan research around missing evidence`.

### Task 4: Consolidar canais e priorizar finalidade

**Files:**
- Create: `backend/src/modules/radar/contact-consolidation.ts`, `backend/tests/radar-contact-consolidation.test.ts`.
- Modify: `backend/src/modules/radar/contact-evidence.ts`, `research-service.ts`, `public-presence.ts`, `research-export.ts`, `crm-delivery.ts`; `frontend/src/types/radarResearch.ts`, `frontend/src/lib/radar/radarPresenceSummary.ts`, `frontend/src/components/radar/RadarCandidateSummary.tsx`.
- Test: `backend/tests/radar-contact-evidence.test.ts`, `radar-crm-delivery.test.ts`; `frontend/src/components/radar/RadarCandidateSummary.test.tsx`.

**Interfaces:**
- Produces: `consolidateRadarContacts(contacts:RadarContactEvidence[], purpose:RadarContactPurpose):RadarContactEvidence[]`; cada contato mantém campos atuais e `sources?:Array<{sourceUrl:string;observedAt:string;purpose?:RadarContactPurpose}>`. Não fundir associações/escopos distintos ou perder motivo de conflito.

- [x] RED: mesmo telefone em três páginas → um canal/três fontes; matriz e filial → dois escopos; e-mail de vagas/privacidade não preferido para fornecedores; formulário de fornecedores preferido diante de contato geral. Campo `phone` não vira `whatsapp` sem publicação.
- [x] Executar suite nova e confirmar RED; implementar normalização, consolidação e ranking por finalidade, associação e atualidade. Contato vinculado ao site pode continuar não apropriado à oferta.
- [x] Reutilizar consolidação no resumo, exportação e novos leads, mantendo histórico e todos os contatos nos detalhes. Criar teste de reanálise de canais antigos com fontes preservadas.
- [x] Rodar suites focais e criar commit `feat(radar): consolidate and rank useful contact channels`.

### Task 5: Critérios de suficiência e avaliações independentes

**Files:**
- Create: `backend/src/modules/radar/research-quality.ts`, `backend/tests/radar-research-quality.test.ts`.
- Modify: `backend/src/modules/radar/search-configuration.ts`, `research-service.ts`, `research-planner.ts`, `company-projection.ts`, `crm-delivery.ts`; `frontend/src/types/radar.ts`, `frontend/src/types/radarResearch.ts`, `frontend/src/lib/radar/radarSearchConfiguration.ts`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`, `RadarCandidateSummary.tsx`, `RadarCandidateResearchPanel.tsx`.
- Test: `backend/tests/radar-search-configuration.test.ts`, `radar-company-size.test.ts`, `radar-crm-delivery.test.ts`; testes frontend de configuração/resumo/painel.

**Interfaces:**
- Produces: `research.completion:{enabled:boolean;requireIdentity:boolean;requireSegment:boolean;requireWebsite:boolean;contactTypes:Array<'email'|'phone'|'whatsapp'|'contact_form'>;contactPurposes:RadarContactPurpose[];minimumUsefulContacts:number}`. Default `enabled:false`, identidade exigida quando habilitado, site opcional, pelo menos um canal quando solicitado.
- `evaluateRadarResearchQuality(input:{dossier:RadarResearchDossier;policy:RadarResearchPolicy;currentRevision:boolean}):{identity:'associated'|'pending';contactability:'useful'|'missing'|'pending';fit:'high'|'possible'|'low'|'unknown';potential:{score:number|null;coverage:number|null};readyForReview:boolean;missing:RadarResearchGap[]}`.

- [x] RED: campanha permite sem site e possui canal corroborado → pode ficar suficiente; e-mail cadastral não validado não satisfaz canal público; revisão antiga/grupo não comprova estabelecimento; sem porte → desconhecido, nunca zero por ausência.
- [x] Rodar testes e confirmar RED; implementar regras compartilhadas com Task 3, sem pontuação única nem aprovação automática. Novas exigências alteram revisão pelos mecanismos existentes.
- [x] Mostrar as quatro avaliações e lacunas separadas no padrão YUX. Não relaxar aprovação/licenças/CRM; adicionar critério ativo como bloqueio adicional somente quando habilitado.
- [x] Rodar testes focais; criar commit `feat(radar): configure evidence sufficiency and delivery quality`.

### Task 6: Fila comercial, feedback auditado e métricas honestas

**Files:**
- Create: `backend/src/modules/radar/research-feedback.ts`, `research-metrics.ts`; `backend/src/db/migrations/0189_radar_research_feedback.sql`.
- Modify: `backend/src/modules/radar/routes.ts`, `repository.ts`; `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`, `frontend/src/components/radar/RadarCampaignPage.tsx`, `RadarResultsTable.tsx`, `RadarCandidateResearchPanel.tsx`.
- Create: `backend/tests/radar-research-feedback.test.ts`, `radar-research-metrics.test.ts`.
- Test: `backend/tests/radar-routes.test.ts`, `integration/radar-crm-delivery.test.ts`; `frontend/src/components/radar/RadarResultsTable.test.tsx`, `RadarCandidateResearchPanel.test.tsx`.

**Interfaces:**
- Produces: fila derivada `ready_for_review|missing_contact|identity_pending|operational_block|not_target` com motivos; estados não substituem status de aprovação existente. Prioridade visual: fora do perfil, bloqueio, identidade, canal, pronto.
- Feedback `POST /candidates/:id/feedback`, entrada `{requestId:string;configurationRevision:number;kind:'identity_confirmed'|'identity_wrong'|'contact_valid'|'contact_invalid'|'segment_confirmed'|'segment_wrong';contact?:{kind:string;value:string};note?:string}`; escopo tenant e permissão de gestão/revisão existentes, autoria/data do servidor, idempotência por tenant/request ID.
- Métricas `GET /campaigns/:id/research-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD`: contagens distintas, custo de buscas estimado BRL, IA informado USD quando disponível, cobertura/desconhecido, custos unitários com denominador explícito. Sem total BRL inventado quando IA não tem conversão.

- [x] RED: feedback de outro tenant, revisão alterada e contato fora da empresa → negar; repetição de request ID não duplica; anotações não promovem automaticamente dados nem enviam mensagens. Rodar testes e confirmar RED.
- [x] RED: 30 empresas/195 chamadas/R$3,57 → 30 pesquisadas e R$0,119 por empresa; recibos ausentes → IA desconhecida; zero empresas → métrica unitária nula; joins com múltiplas evidências não multiplicam custos. Rodar testes e confirmar RED.
- [x] Implementar armazenamento aditivo/auditado de feedback e agregação sem vazamento entre tenants. Retornos aparecem para revisão; não reescrever leads ou critérios silenciosamente.
- [x] Expor filtros, motivos comerciais, feedback e métricas; preservar paginação, seleção, detalhe inline/âncora, exportação e entrega. Não exibir chaves, diagnósticos internos ou conceder pesquisa paga ao cliente.
- [x] Rodar suites focais e integração; criar commit `feat(radar): expose actionable review queues and research costs`.

### Task 7: Benchmark, verificação completa e publicação

**Files:**
- Create: `backend/tests/fixtures/radar-quality-benchmark.ts`, `backend/tests/radar-quality-benchmark.test.ts`; `frontend/tests/journeys/browser/radar-quality-review.pw.ts`.
- Modify: `docs/runbooks/radar-pesquisa-configuravel.md`; este plano.

**Interfaces:**
- Consumes: contratos e funcionalidades das Tasks 1–6.
- Produces: evidências de regressão, comandos executados, limites da verificação e commits publicados, sem alegar piloto pago novo.

- [x] Criar 20 fixtures reduzidas: governo/diário/lista, diretório desconhecido, site verdadeiro com fornecedores, entidade pública legítima, homônimo, filial/grupo, contato repetido, recrutamento/privacidade, ausência de site, quota, crash/recibo e divergência. Assertivas por identidade, canal útil, classificação, retomada e custo; exigir zero falsos oficiais nos casos negativos.
- [x] Executar `npm --prefix backend test`, `npm --prefix backend run build`, `npm --prefix backend run test:integration` no banco local isolado; `npm --prefix frontend test`, `npm --prefix frontend run build`; pytest do runtime a partir de `workers/marketing-studio-agent-runtime`. Provedores externos obrigatoriamente simulados.
- [x] QA de navegador local autenticado/simulado: configurar critérios, consultar resultados, separar fontes externas, revisar canais, registrar feedback e encaminhar ao CRM com autorização simulada. Verificar desktop/mobile, navegação/foco e nenhum contato automático.
- [x] Revisar diff inteiro, contratos legados, isolamento e recibos concorrentes. Registrar falhas remanescentes sem ocultá-las; corrigir regressões antes da publicação.
- [x] Atualizar runbook e checks deste plano com resultados; criar commit de documentação. Conferir remoto/branch/alterações alheias e publicar em main sem force push. Não executar deploy nem novas pesquisas pagas nesta etapa.

## Revisão do plano

- R1 → Task 1; R2 → Task 2; R3 → Task 3; R4 → Task 4; R5 → Task 5; R6–R7 → Tasks 6–7.
- Seis chamadas antigas: diagnosticar e preservar incerteza na Task 2; não prometer recuperação de cobrança/resultados inexistentes.
- Melhorias de fontes, critérios e canais compartilham contratos do Radar; não constituem novos subsistemas independentes. Recibos de IA são restritos às duas funções Radar; não redesenham roteamento global nem carteira.
- Implementação nativa autorizada e executada; uma revisão independente final, com passagem única de correções. Verificações e limitações: docs/runbooks/radar-pesquisa-configuravel.md, seção 15/10/2026. Publicação após verificação do remoto.

## Fechamento — 15/10/2026

- Tasks 1–7 implementadas. Revisão independente: sete achados importantes e um reclassificado como importante por interromper a leitura histórica; todos corrigidos em uma passagem com testes RED→GREEN. Nenhum menor novo adiado.
- Verificação final: backend **1.029/1.029**, frontend **667/667**, runtime **299 aprovados e 1 ignorado preexistente**, PostgreSQL Radar **24/24**; builds e orçamento de bundle aprovados. Benchmark de 20 casos passou. Isso não comprova cobertura comercial de um lote pago.
- QA Chrome local com API/banco reais isolados: resumo inline, fontes, foco, conferência, entrega manual ao CRM e configuração versionada; desktop/celular de 430 px. Runner Playwright opt-in escrito, não executado nesta sessão. Não houve chamadas pagas nem contato externo.
- Lint global: **562 erros/27 avisos** contra baseline **560/27**; cinco mensagens acima do baseline foram reproduzidas no commit-base. Baseline preservado; não alegar lint limpo.
- Código funcional publicado sem force push em `main` e `codex/radar-brave-state-fixes`, commit **f3443fe**. Esta atualização final registra o fechamento; não foi acionado deploy. As nove decisões/limitações estão integralmente no runbook.
