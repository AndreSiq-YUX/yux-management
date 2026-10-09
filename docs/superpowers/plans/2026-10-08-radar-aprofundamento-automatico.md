# Radar — pesquisa automática e dossiê de contatos — Implementation Plan

> **For agentic workers:** implementar apenas após revisão e aprovação do usuário. Recomendada execução nativa nesta conversa, sem delegação. As skills executing-plans e subagent-driven-development não estão disponíveis nesta sessão; não inventar sua execução. Passos com checkboxes registram entregas verificáveis.

**Goal:** transformar candidatos já captados em dossiês úteis, descobrindo automaticamente site, contatos comerciais e evidências de atividade, sem exigir uma URL manual e sem restringir a solução a um segmento ou região.

**Architecture:** separar descoberta CNPJá, pesquisa pública, resolução de identidade, coleta de contatos, avaliação de atividade e qualificação pela oferta. Reutilizar o cadastro de provedores, governança de custos e fila existentes, mas registrar o aprofundamento por candidato em etapas retomáveis. A evidência coletada é independente da oferta; interpretação semântica usa rota própria configurável no Admin, sem modelo fixo ou chamada paga implícita.

**Tech Stack:** Fastify/TypeScript, PostgreSQL, BullMQ, React, runtime Python existente, Vitest, pytest e validação de navegador com dados simulados.

**Spec:** solicitação do usuário em 08/10/2026 nesta conversa: descobrir automaticamente site/contatos/WhatsApp público e sinais de funcionamento; explicar o bloqueio Brave; preservar dados reais, uso de contatos manuais e configuração reutilizável. Implementação autorizada pelo usuário: “ok, pode implementar”.

## Diagnóstico confirmado

- Produção: campanha regional com 30 candidatos, apenas um avaliado, nenhum qualificado/aprovado. Brave: credencial cadastrada, provedor ativo, retenção e entrega confirmadas; **fonte desativada, custo 0 e limite 10/dia por organização**. O checkbox da licença foi salvo corretamente. Não é falta de chave nem necessidade de repetir a confirmação.
- `enrichRadarCandidateWithLicensedBrave` faz uma única consulta Place Search, associa somente nome normalizado idêntico e mesma cidade/UF, e não pesquisa a web geral. O telefone já vindo da CNPJá tem prioridade sobre o encontrado na Brave.
- `inspectRadarCandidateBusinessSite` recebe `websiteUrl` existente; com URL ausente, retorna `site_not_found_in_sources`. Não descobre o endereço. O formulário de URL é uma revisão humana alternativa, não uma pesquisa automática.
- `inspectRadarBusinessSite` lê uma página, extrai telefones/e-mails do texto visível e não segue páginas de contato nem extrai `mailto:`, `tel:`, WhatsApp ou redes de atributos HTML. Contatos coletados só são persistidos como tais quando a qualificação do público é confirmada; identidade e interesse comercial estão acoplados indevidamente.
- `handleRadarRegionalVerification` só tenta Brave quando não há site; depois registra `analysisRevision` mesmo se a descoberta não ocorreu. O filtro do lote seguinte pode pular o candidato inconclusivo, incluindo o primeiro já verificado, embora a fonte seja liberada depois.
- Qualificação atual é por expressões literais configuradas; não é interpretação semântica por LLM. CNPJ ativo e site respondendo não comprovam funcionamento comercial.
- Foram executados 22 testes existentes de inspeção, qualificação, Brave e lotes: aprovados, com dependências simuladas e sem consultas externas. Esses testes comprovam o comportamento atual, não a entrega da melhoria.

## Global Constraints

- Nenhuma execução paga, ativação de fonte, alteração de custo/limite/chave ou teste de conexão durante planejamento. Não selecionar novos modelos pagos por conta própria.
- Preservar os 30 candidatos e as evidências anteriores. Aprofundar os registros existentes sem refazer a descoberta CNPJá; também permitir retomar quem já ficou inconclusivo.
- Segmento, oferta, regiões, fontes, campos pretendidos e profundidade pertencem à campanha/missão. Não criar preset obrigatório de cozinhas industriais, cidades ou produtos.
- Reutilizar a conexão Brave existente quando a chave/plano permitir o endpoint. Não obrigar reinserção de chave ou referência contratual. Confirmar escopo de uso da busca web antes de habilitá-la; não presumir direitos de um endpoint a partir de outro.
- Sem Jina, Firecrawl, ScrapingBee, novo serviço de scraping, navegador com sessão pessoal, login em rede social, CAPTCHA contornado ou coleta de perfis privados. Ler páginas públicas por HTTP seguro; páginas que exigem JavaScript ficam com limitação explícita nesta etapa.
- Cada contato conserva fonte, data de observação, estado da associação à empresa e tipo. Número publicado não é telefone atendido; link de WhatsApp publicado não comprova conta acessível nem autorização de contato.
- Nenhum WhatsApp/e-mail/ligação automática, mensagem de teste, verificação de conta por sondagem ou criação automática de lead. Preservar as aprovações e os direitos de exportação atuais.
- Não modificar o checkout primário sujo, arquivos de WhatsApp ou migrações já aplicadas. Alocar a próxima migração livre ao iniciar implementação; `0183` era a próxima neste worktree no diagnóstico.

## Review Focus

1. Homônimos, grupos e filiais: nome/cidade isolados não autorizam associação de site ou telefone; site do grupo não comprova contato da filial. Testes das Tasks 2–3.
2. CNPJ ativo, fonte de encerramento e site disponível com sinais contraditórios: manter evidências e conflito, não afirmar funcionamento/fechamento. Testes da Task 3.
3. Contato somente em atributo HTML, telefone cadastral antigo e empresas sem site: coletar canais observados em fontes públicas associadas sem depender da qualificação comercial. Testes da Task 3.
4. Retry, clique duplo, mudança de campanha e fonte liberada após falha: não duplicar cobrança, perder dados nem ignorar candidatos inconclusivos. Testes da Task 4.
5. URL insegura, DNS rebind, redirecionamento, robots e conteúdo que tenta instruir a IA: impedir acesso privado e instruções externas; manter resultado parcial e motivo da limitação. Testes das Tasks 2–4.

## Fluxo e resultado esperados

`Candidatos existentes → buscar presença pública → conferir identidade → ler páginas relevantes → consolidar canais e atividade → qualificar para a oferta → revisão/entrega manual`

- Busca local tenta encontrar ficha, site e contatos. Busca web complementar procura nome fantasia, razão social, CNPJ e localidade quando necessário. Consultas limitadas e geradas a partir da identidade do candidato, não apenas do segmento.
- Site encontrado é comparado com identidade/endereço/CNPJ e canais corroborados. Só depois seus contatos entram como associados à empresa; resultados incertos ficam como sugestões, sem mistura silenciosa com contatos confirmados.
- Leitura limitada de página inicial, contato, sobre/empresa e serviços, escolhidas entre links realmente encontrados. Extrair texto, dados estruturados, `mailto:`, `tel:`, `wa.me`, `api.whatsapp.com/send` e URLs públicas de redes sociais. Não abrir WhatsApp nem enviar mensagem.
- Separar situação cadastral, presença digital e sinais de operação. Estados de atividade: `public_signals`, `possible_closure`, `inconclusive`, `conflicting`; mostrar fatos e respectivas datas. Sem sinal datado, não chamar observação de hoje de atividade recente. Copyright e HTTP 200 não bastam.
- Dossiê visível: site/associação, telefones cadastrais e públicos separados, WhatsApp publicado, e-mails comerciais, redes, endereço, atividade, responsáveis comerciais publicamente identificados quando encontrados, fontes/data e pendências. Dados não encontrados não são inventados. Contato preferencial é escolhido por evidência/corroboramento, não por prioridade fixa da CNPJá.
- Campos de contato e atividade podem existir mesmo sem site. A qualificação para a oferta é posterior e não determina se um fato público de contato pode ser exibido.
- Ação principal: **Pesquisar e enriquecer automaticamente**, individual ou lote. **Ver resultado** abre etapas, canais e evidências persistidas. Revisão de URL fica opcional em **Corrigir associação**, usada em ambiguidades, não como requisito inicial.

## Task 1: disponibilidade real, configuração e orçamento

**Files:** modificar `backend/src/modules/radar/{routes,repository,types,search-configuration}.ts`, `frontend/src/{types/radar.ts,lib/radar/radarSourceRules.ts,lib/platform/providerDefaults.ts}`, `frontend/src/components/platform/admin/RadarSourceManagementPanel.tsx`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`; criar migração `backend/src/db/migrations/0183_radar_candidate_research.sql` se ainda livre. Testar em `backend/tests/radar-search-configuration.test.ts`, `radar-routes.test.ts`, e testes dos componentes existentes.

**Interfaces:** `RadarResearchPolicy` acrescentada como objeto opcional `research` à configuração existente: `enabled` (default false para campanhas antigas), `webSearchEnabled` (false), `maxSearchQueriesPerCandidate` (default 3, intervalo 1–5), `maxPagesPerCandidate` (default 4, intervalo 1–10), `freshnessDays` (default 7, intervalo 1–30), `semanticQualificationEnabled` (false). `getRadarResearchAvailability(pool,user,organizationId,campaignId)` retorna razões estruturadas e estimativa máxima por fonte, sem chamar provedores. Novo source type/key `brave_web_search`, desativado por padrão e com preço a cadastrar; conexão existente `brave_place` permanece compatível, sem renomear sua chave no banco.

- [x] Escrever testes `reports_exact_blockers_without_provider_calls`, `preserves_existing_campaign_configuration` e `limits_apply_across_all_search_endpoints`: fonte desligada/custo não definido, chave existente, licença confirmada, quota esgotada, campanha desabilitada e papel sem permissão geram razões distintas. Não afirmar licença ausente em qualquer erro genérico.
- [x] Executar `cd backend; npm test -- tests/radar-search-configuration.test.ts tests/radar-routes.test.ts`; confirmar falha nos contratos novos, não em configuração do ambiente.
- [x] Implementar disponibilidade e configuração. Novo catálogo web e fonte local usam a mesma conexão, mas custos e contadores por endpoint; um teto total por candidato evita multiplicação silenciosa. Estimativa é calculada com valores aprovados no Admin, sem inventar preço ou alterar a quota atual de 10. O limite inclui retries e detalhes POI se habilitados. Persistir confirmação/ativação não executa consulta.
- [x] Reexecutar testes backend e `frontend` dos controles/formulário; verificar preservação de escopo global e específico, erros e custos inválidos. Commit apenas arquivos desta task.

## Task 2: descoberta automática e associação de identidade

**Files:** criar `backend/src/modules/radar/{web-search,site-discovery}.ts` e `backend/tests/radar-{web-search,site-discovery}.test.ts`; modificar `licensed-brave.ts`, `place-providers.ts` e testes correspondentes.

**Interfaces:** `searchRadarWeb(input: {apiKey:string; query:string; limit:number; fetchImpl?:typeof fetch}): Promise<RadarWebHit[]>`, cada hit com `url,title,snippets,observedAt`; `discoverRadarBusinessPresence(identity,policy,dependencies): Promise<RadarPresenceDiscovery>` retorna URLs/canais candidatos, associação `confirmed|review|not_found_in_consulted_sources|blocked`, evidências e chamadas realizadas. Consome disponibilidade e orçamento da Task 1. Busca e coleta não recebem a oferta como filtro de existência.

- [x] Escrever fixtures `finds_official_site_when_registry_has_no_url`, `rejects_same_name_and_city_without_corroboration`, `distinguishes_group_from_branch`, `returns_search_limit_without_guessing_missing_website` e `preserves_partial_results_on_rate_limit`. Todas as chamadas externas injetadas/simuladas.
- [x] Executar `cd backend; npm test -- tests/radar-web-search.test.ts tests/radar-site-discovery.test.ts`; confirmar falha esperada.
- [x] Implementar adaptador Brave Web Search com país/idioma Brasil e snippets, sem ativá-lo. Gerar consultas sequenciais com nome/razão/CNPJ/localização, parar ao atingir cobertura ou teto. Associação automática exige CNPJ compatível com estabelecimento ou nome e endereço corroborados; nome+telefone+localidade pode corroborar quando não há conflito. CNPJ-base do grupo não confirma filial sozinho. Ambiguidade não gera associação automática por opinião de LLM.
- [x] Reexecutar testes novos e `radar-place-providers.test.ts`, `radar-licensed-brave.test.ts`; registrar que resultados negativos não provam inexistência. Commit desta task.

## Task 3: leitura multipágina e dossiê de fatos

**Files:** criar `backend/src/modules/radar/{site-evidence,contact-evidence,business-activity}.ts` e testes `radar-{site-evidence,contact-evidence,business-activity}.test.ts`; modificar `b2b-site-inspection.ts`, `repository.ts`, `types.ts`, `search-configuration.ts`, `b2b-delivery.ts` e seus testes. Não usar o leitor Jina de `company-intelligence/website-discovery.ts`; reutilizar apenas helpers puros quando compatíveis com a segurança do leitor Radar.

**Interfaces:** `collectRadarSiteEvidence(url,policy,dependencies): Promise<RadarSiteEvidence[]>` com página, texto, links e data; `extractRadarContacts(page): RadarContactEvidence[]` com `kind:phone|email|whatsapp|social|business_person`, valor, sourceUrl, observedAt e associação; `assessRadarBusinessActivity(evidence): RadarActivityAssessment`. `RadarResearchDossier` reúne identidade, fatos, canais, atividade, limitações e histórico, sem confundir com adequação comercial.

- [x] Testar `extracts_href_only_contacts`, `normalizes_brazilian_phones_without_inventing_digits`, `keeps_registry_and_website_phone_separate`, `retains_contacts_when_target_fit_is_unknown`, `handles_company_without_website`, `does_not_mark_http200_or_active_cnpj_as_operating`, `keeps_conflicting_closure_signals` e `records_fact_source_per_page`.
- [x] Testar SSRF/DNS e redirecionamento em cada página, regras robots por caminho, timeout, limite total de páginas/bytes, HTML sem conteúdo útil e script que tenta instruir a IA. Rodar os três novos testes para confirmar falha.
- [x] Implementar leitura HTTP segura limitada e parser de texto/atributos/dados estruturados. Não enviar cookies, segredos ou conteúdo privado. Guardar contatos associados por identidade independentemente da decisão comercial. Exibir contatos diferentes, com preferencial justificado; não substituir o histórico. Link WhatsApp precisa estar observado, não derivado de qualquer celular. Pessoa responsável precisa de nome/cargo profissional publicado e associado; não obter dados pessoais de sócios por padrão.
- [x] Persistir evidências no catálogo existente `radar_b2b_evidence` e resumo versionado; ampliar campos de entrega sem remover colunas antigas. Exportar apenas conforme revisão e direitos já existentes; manter uma pendência explícita quando contato/atividade não foi comprovado.
- [x] Reexecutar testes novos e regressões de inspeção, triagem e entrega. Commit desta task.

## Task 4: pesquisa retomável dos candidatos existentes

**Files:** criar `backend/src/modules/radar/research-service.ts`, `backend/tests/radar-research-service.test.ts`; modificar `repository.ts`, `routes.ts`, `backend/src/jobs/{registry.ts,handlers/radar.ts}`, testes `radar-routes.test.ts` e `radar-b2b-batches.test.ts`; tabela nova na migração da Task 1, `radar_candidate_research_runs`, com escopo, candidato, versão, etapa, status, lease, outputs, custos e chave idempotente. Não reutilizar `radar_enrichment_runs` para candidatos: ela exige oportunidade já criada.

**Interfaces:** `startRadarCandidateResearch(pool,user,{organizationId,candidateId,configurationRevision,requestId})` cria run sem pesquisa síncrona; `executeRadarCandidateResearch(pool,env,{runId},signal,dependencies)` executa etapas das Tasks 2–3; GET `/api/radar/candidates/:id/research` retorna dossiê/status/pendências; POST no mesmo caminho enfileira e retorna 202/runId. Lote de verificação passa a iniciar/retomar essas pesquisas, respeitando a disponibilidade.

- [x] Escrever testes `reprocesses_previously_inconclusive_candidate_without_cnpja_call`, `does_not_skip_after_source_becomes_available`, `resumes_completed_stages_without_rebilling`, `deduplicates_double_click`, `stops_before_request_when_budget_is_exhausted`, `refuses_cross_tenant_access`, `rejects_changed_campaign` e `does_not_send_outreach`.
- [x] Executar `cd backend; npm test -- tests/radar-research-service.test.ts tests/radar-b2b-batches.test.ts tests/radar-routes.test.ts`; confirmar falhas esperadas.
- [x] Implementar run por candidato e política/revisão. Estados `queued|running|partial|succeeded|failed|blocked`; etapas de descoberta/identidade/leitura/consolidação/qualificação. Reserva atômica antes de cada chamada, checkpoint por etapa, timeout/cancelamento e auditoria. Resultado sem fonte disponível é `blocked/partial`, não verificação concluída. O antigo `analysisRevision` não exclui candidatos sem pesquisa completa; aprovados não são reescritos silenciosamente.
- [x] Reexecutar testes e simular liberação da fonte entre tentativas usando fixtures, não configurações de produção. Commit desta task.

## Task 5: qualificação semântica roteável, separada da coleta

**Files:** modificar `backend/src/modules/platform/llm-routing.ts`; criar `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_qualification.py` e `workers/marketing-studio-agent-runtime/tests/test_radar_qualification.py`; modificar `api.py`, usar `runtime_factory.py`/`llm_routing.py` sem substituir rotas existentes; integrar `research-service.ts`. Testar catálogo administrativo e roteamento existentes.

**Interfaces:** caso de uso `radar_business_qualification`; endpoint interno autenticado `/radar/qualify`, payload com escopo, critérios/público/oferta configurados e evidências com IDs. Resposta estruturada: `targetStatus,productFit,reasons,evidenceIds,limitations,provider,model`. Cada afirmação precisa apontar evidência fornecida; saída não cria contato, URL ou prova de compra.

- [x] Testar `uses_admin_route_and_configured_fallbacks`, `does_not_call_llm_when_semantic_stage_disabled_or_unconfigured`, `rejects_invented_evidence_ids`, `classifies_different_segments_from_config`, `ignores_instructions_embedded_in_evidence` e `does_not_infer_purchasing_intent_from_menu`.
- [x] Executar `python -m pytest workers/marketing-studio-agent-runtime/tests/test_radar_qualification.py`; confirmar falhas de implementação antes de codificar.
- [x] Implementar com `build_routed_client`, rota/fallbacks do Admin e autorização de custo existente. A etapa nova começa desligada; sem rota explicitamente autorizada para o caso, não chamar modelo global/legado silenciosamente. Preservar todas as demais funções e seu fallback global. Espera-se modelo de inteligência média/alta para distinguir atividade, público e aderência a partir de evidências; nenhum modelo será escolhido neste plano.
- [x] Reexecutar testes novos e os existentes de roteamento; comprovar que falha de LLM mantém fatos coletados e deixa qualificação pendente. Commit desta task.

## Task 6: experiência útil, regressão e piloto controlado

**Files:** criar `frontend/src/components/radar/RadarCandidateResearchPanel.tsx` e teste correspondente; modificar `RadarWorkspace.tsx`, `RadarWorkspace.test.tsx`, `frontend/src/services/radarService.ts`, `frontend/src/types/radar.ts`, documentação `docs/runbooks/radar-pesquisa-configuravel.md`. Criar `backend/tests/integration/radar-research-journey.test.ts`.

**Interfaces:** `RadarCandidateResearchPanel({candidateId,organizationId})` usa endpoints da Task 4, mostra etapas, evidências e contatos por origem, resultado parcial e retentativa. A ação por candidato/lote explica estimativa máxima antes de iniciar. O botão desabilitado sempre expõe o motivo e o caminho de resolução.

- [x] Testar `starts_without_manual_url`, `shows_brave_disabled_and_cost_reason`, `shows_all_contacts_and_sources_after_completion`, `shows_partial_result_and_resume`, `manual_url_is_optional_correction` e `existing_campaign_criteria_and_candidates_are_preserved`.
- [x] Implementar painel e ações, sem remover a revisão/associação humana. Separar erros de chave/licença/ativação/limite/quota/campanha, sem toast genérico que mande reconfirmar direitos já salvos. Atualizar resultados em progresso e após recarregar a página.
- [x] Executar todas as suítes backend/frontend/runtime, builds, type-check, lint comparativo sem alterar baseline e navegador desktop/mobile com API simulada. Testar jornada completa candidato → run → evidências → revisão/exportação, sem mensagens ou consultas pagas.
- [x] Publicar apenas os commits aprovados em main, conforme autorização de publicação vigente; deploy pelo usuário. Não apresentar código local como disponível em produção.
- [ ] Depois de autorização específica para custos/ativação, piloto inicialmente de **3 candidatos existentes**, com teto total informado por fonte e por LLM. Respeitar a quota atual remanescente, sem aumentá-la automaticamente; se não couber, reduzir lote ou pedir autorização. Comparar sites/identidades e canais com amostra conferida, registrar chamadas/custo real, falsos vínculos, cobertura, limitações e tempo. Só ampliar após qualidade demonstrada.

## Referências técnicas consultadas

- Brave Place Search: busca local, informações de POI e detalhes complementares: <https://api-dashboard.search.brave.com/documentation/services/place-search>.
- Brave Web Search: URLs, snippets adicionais e operadores de consulta: <https://api-dashboard.search.brave.com/api-reference/web/search/get>.
- A documentação técnica não confirma o preço, acesso ou direitos do contrato específico do usuário. Esses dados devem vir do plano/credencial e da configuração autorizada do Admin, não de suposição do implementador.

## Self-review

- A proposta fecha a descoberta faltante, não exige URL manual e não confunde habilitar Brave com concluir o aprofundamento.
- Coleta neutra e interpretação comercial são independentes; sem LLM, fatos continuam úteis. Sem provas suficientes, há pendência explícita, não resposta inventada.
- Cobre os cinco riscos de revisão com testes nas tasks responsáveis, inclusive candidato antigo inconclusivo, identidade de filial, contatos em atributos e limites de custo.
- Contratos de policy/run/dossiê estão definidos antes de seus consumidores. Dados, permissões e caminhos existentes permanecem compatíveis.
- Na escrita do plano não houve implementação nem mudança de produção. Após aprovação, as Tasks 1–6 foram implementadas e verificadas localmente; configurações e autorizações pagas de produção continuam pendentes. Nenhum modelo foi escolhido nem fornecedor pago consultado. Piloto real não realizado.

## Registro de execução

- Worktree isolado `codex/radar-brave-state-fixes`; checkout primário com alterações de WhatsApp preservado. Migração nova 0183; nenhuma migração anterior aplicada foi editada.
- Testes de serviço, governança, identidade, extração, retomada, filas, UI e roteamento incluídos. Para Tasks 1–5 houve verificação de falhas dos contratos novos antes da implementação correspondente; os testes do painel da Task 6 foram adicionados junto/depois do componente, não se declara TDD integral.
- PostgreSQL 17 exclusivamente local: 80 migrações aplicadas; jornada com papel/escopo efetivo de worker, persistência, clique concorrente, isolamento por organização, aprovação e exportação. API, buscas e LLM simulados; nenhuma mensagem ou nova consulta CNPJá.
- Chrome desktop/mobile com componentes reais e API interceptada: fonte bloqueada, atualização após liberação simulada mesmo com resultado aberto, início sem URL, resultado parcial, contatos/fontes e recarga. Sem console/overlay de erro ou transbordamento horizontal. Ajustada a visibilidade de candidatos antigos e o layout dos cartões.
- Fontes/licenças/custos/limites de produção não foram alterados. O deploy continua a cargo do usuário; o piloto pago de até 3 candidatos precisa de autorização/configuração separadas.
- Verificação: 820 testes backend, 623 frontend, 275 runtime (1 skip já existente) e 1 jornada PostgreSQL; builds/type-check de backend/frontend e orçamento de bundle aprovados. Lint comparativo passou com 558 erros/26 avisos preexistentes contra baseline 560/27; não se declara lint limpo. Depois dos ajustes finais, serviços afetados, jornada real, navegador e builds foram reexecutados.
