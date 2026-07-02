# Radar Comercial Growth Workflow Design

## Objetivo

Implementar a primeira fase do Radar Comercial YUX como um workflow comercial
do Growth Workspace, integrado ao Strategy Engine, Agent Harness e RAG
governado da plataforma.

O modulo deve ajudar a YUX a encontrar, qualificar e abordar empresas com
potencial real de compra, sem criar uma ferramenta de spam ou um motor de IA
paralelo. Toda analise, score, diagnostico e mensagem sugerida deve passar pela
inteligencia central do sistema.

## Decisao Aprovada

A primeira entrega sera o **Radar Local por Nicho**, dentro do workspace
operacional `Crescimento YUX`.

Ficam fora desta fase:

- radar de empresas recem-abertas;
- ingestao mensal completa da base CNPJ oficial;
- cadencias automaticas avancadas;
- envio automatico de WhatsApp ou email;
- produto exposto para clientes no Portal;
- APIs pagas obrigatorias como Google Places ou bases comerciais.

## Principio De Arquitetura

O Radar nao deve ter prompts, agentes ou RAG isolados.

Ele deve usar:

- Strategy Packs publicados e aprovados;
- perfis do Strategy Engine, principalmente `ai_sdr_comercial_1`,
  `offer_conversion`, `crm_controller`, `metrics_cash_mroi` e
  `growth_strategist`;
- retrieval auditavel em `yux_strategy_retrieval_queries`;
- execution trace em `agent_execution_runs` e `agent_execution_steps`;
- politicas de autonomia e aprovacao humana;
- learning/outcome signals quando houver resultado comercial.

O frontend apenas opera a campanha, revisa oportunidades e aprova a conversao
para CRM. Coleta, enriquecimento, IA, deduplicacao pesada e workflows longos
devem rodar no backend e no runtime Python.

## Escopo Da Fase 1

Implementar:

- area interna do Radar no Growth Workspace;
- criacao de campanha por nicho, cidade, UF, oferta e limite operacional;
- cadastro ou importacao inicial de empresas-alvo;
- enriquecimento controlado com fontes publicas e Jina quando configurado;
- deduplicacao por CNPJ, dominio, telefone e nome/cidade;
- diagnostico externo com evidencias;
- score justificavel de oportunidade;
- sugestao de mensagem por canal;
- revisao humana de diagnostico e mensagem;
- aprovacao ou rejeicao de oportunidade;
- opt-out e bloqueio de nova abordagem;
- conversao de oportunidade aprovada em lead no CRM;
- registro de custo estimado, fonte, compliance e trace do agente.

## Fora Do Escopo Inicial

- busca automatica ilimitada na web;
- scraping agressivo de redes sociais, mapas ou diretorios privados;
- compra ou uso de bases sem procedencia clara;
- disparo em massa;
- envio sem aprovacao humana;
- enriquecimento com dados pessoais sensiveis;
- promessa automatica de preco, desconto, prazo ou resultado;
- alteracao automatica de Strategy Packs, prompts produtivos ou politicas.

## Areas Do Produto

### Growth Workspace

Adicionar uma area operacional no workspace do cliente:

- rota recomendada: `/client-workspaces/:organizationId/comercial/radar`;
- visibilidade inicial: usuarios internos YUX em workspaces operacionais;
- destaque de uso: workspace interno `Crescimento YUX`;
- nao expor no Portal do Cliente nesta fase.

Telas principais:

- Dashboard Radar;
- Campanhas;
- Criar Campanha;
- Empresas e Enriquecimento;
- Oportunidades;
- Revisao de Mensagens;
- Compliance e Custos;
- Configuracoes.

### Admin Strategy Engine

O Admin continua sendo a area de governanca:

- Strategy Packs;
- perfis de agente;
- prompts globais;
- rotas de modelo;
- politicas de ferramenta;
- limites de custo;
- traces;
- learning signals.

O Admin nao vira tela operacional do Radar.

## Modelo De Dados

Criar uma migration nova para as tabelas do Radar.

### radar_campaigns

Campanhas de prospeccao local.

Campos principais:

- `id`;
- `organization_id`;
- `name`;
- `campaign_type`: inicialmente `local_niche`;
- `target_segment`;
- `target_city`;
- `target_state`;
- `target_keywords`;
- `target_cnaes`;
- `offer_type`;
- `status`: `draft`, `active`, `paused`, `completed`, `archived`;
- `owner_id`;
- `budget_limit`;
- `daily_limit`;
- `automation_level`: inicialmente `human_review_required`;
- `strategy_profile_key`;
- `created_by`;
- timestamps.

### radar_company_records

Registro normalizado da empresa encontrada.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `cnpj`;
- `legal_name`;
- `trade_name`;
- `cnae_main`;
- `city`;
- `state`;
- `address`;
- `phone_raw`;
- `email_raw`;
- `website_url`;
- `source_type`;
- `source_url`;
- `source_collected_at`;
- `dedupe_key`;
- `dedupe_status`;
- `status`: `raw`, `enriching`, `enriched`, `qualified`, `discarded`,
  `approved`, `converted`;
- timestamps.

### radar_enrichment_runs

Execucoes de enriquecimento.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `agent_execution_run_id`;
- `status`;
- `provider`: `manual`, `jina_reader`, `jina_search`, `web_search`,
  `opencnpj`;
- `input_payload`;
- `output_payload`;
- `error_message`;
- `started_at`;
- `completed_at`;
- timestamps.

### radar_company_enrichment

Resultado consolidado de enriquecimento.

Campos principais:

- `id`;
- `company_record_id`;
- `website_url`;
- `instagram_url`;
- `linkedin_url`;
- `facebook_url`;
- `google_business_url`;
- `whatsapp`;
- `public_email`;
- `public_phone`;
- `has_site`;
- `has_form`;
- `has_whatsapp_cta`;
- `has_booking`;
- `has_meta_pixel`;
- `has_google_tag`;
- `review_rating`;
- `review_count`;
- `confidence_score`;
- timestamps.

### radar_diagnostics

Diagnostico comercial externo gerado pelo harness.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `agent_execution_run_id`;
- `summary`;
- `detected_services`;
- `detected_channels`;
- `pain_hypotheses`;
- `recommended_offer`;
- `evidence_json`;
- `risk_flags`;
- `strategy_profile_key`;
- `retrieval_query_id`;
- `ai_model`;
- `ai_cost_estimate`;
- timestamps.

### radar_scores

Score explicado da oportunidade.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `total_score`;
- `fit_score`;
- `timing_score`;
- `pain_score`;
- `contactability_score`;
- `budget_score`;
- `personalization_score`;
- `explanation`;
- timestamps.

### radar_message_suggestions

Mensagens sugeridas para revisao humana.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `agent_execution_run_id`;
- `channel`: `email`, `linkedin`, `phone`, `whatsapp_manual`, `task`;
- `subject`;
- `body`;
- `personalization_notes`;
- `evidence_used`;
- `status`: `draft`, `approved`, `rejected`, `converted`;
- `approved_by`;
- `approved_at`;
- timestamps.

### radar_outreach_events

Historico operacional da oportunidade.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `lead_id`;
- `channel`;
- `event_type`;
- `event_status`;
- `message_id`;
- `notes`;
- `occurred_at`;

### radar_compliance_logs

Registro LGPD e governanca da coleta.

Campos principais:

- `id`;
- `organization_id`;
- `company_record_id`;
- `data_source`;
- `legal_basis`;
- `data_categories`;
- `purpose`;
- `opt_out`;
- `opt_out_at`;
- `retention_until`;
- `created_at`.

### radar_cost_logs

Uso e custo estimado.

Campos principais:

- `id`;
- `organization_id`;
- `campaign_id`;
- `company_record_id`;
- `source_type`;
- `action_type`;
- `units`;
- `estimated_cost`;
- `provider`;
- `agent_execution_run_id`;
- `created_at`.

## Backend Node

Criar um modulo `backend/src/modules/radar`.

Rotas recomendadas:

- `GET /api/radar/campaigns`;
- `POST /api/radar/campaigns`;
- `PATCH /api/radar/campaigns/:id`;
- `GET /api/radar/campaigns/:id/companies`;
- `POST /api/radar/campaigns/:id/companies`;
- `POST /api/radar/companies/:id/enrich`;
- `POST /api/radar/companies/:id/run-diagnostic`;
- `PATCH /api/radar/messages/:id/review`;
- `POST /api/radar/companies/:id/convert-to-lead`;
- `POST /api/radar/companies/:id/opt-out`;
- `GET /api/radar/campaigns/:id/metrics`.

Regras:

- validar sessao e permissao como nos modulos CRM e Strategy Engine;
- escopar tudo por `organization_id`;
- permitir operacao inicial somente para usuarios internos YUX;
- converter para lead usando o modulo CRM existente;
- gravar `attribution_context` com dados do Radar;
- registrar interacao inicial no lead com o resumo do diagnostico;
- nunca enviar mensagem automaticamente no MVP.

## Runtime Python E Harness

Adicionar workflow `commercial_radar_local_niche`.

Entrada esperada:

- dados da campanha;
- dados da empresa;
- fontes coletadas;
- objetivo da oferta;
- canal pretendido;
- contexto do workspace;
- politica de autonomia.

Etapas:

1. Classificar empresa, nicho e risco.
2. Recuperar contexto no Strategy Engine por perfil e tags.
3. Avaliar fit comercial.
4. Avaliar dor e evidencias externas.
5. Recomendar oferta YUX.
6. Calcular score explicado.
7. Gerar mensagem consultiva.
8. Verificar compliance e risco.
9. Bloquear envio automatico e exigir revisao humana.
10. Registrar trace e learning signal de workflow concluido.

Subagentes iniciais:

- `radar_fit_analyst`, perfil `ai_sdr_comercial_1`;
- `radar_offer_analyst`, perfil `offer_conversion`;
- `radar_crm_analyst`, perfil `crm_controller`;
- `radar_metrics_analyst`, perfil `metrics_cash_mroi`;
- `radar_risk_auditor`, perfil `growth_strategist`.

Saida estruturada:

- resumo;
- evidencias;
- hipoteses de dor;
- oferta recomendada;
- score e explicacao;
- mensagem por canal;
- flags de risco;
- recomendacao de proxima acao;
- status de politica: sempre `requires_human_approval` para mensagem.

## RAG E Strategy Packs

O retrieval deve priorizar:

- doutrina comercial interna YUX;
- playbook de Diagnostico YUX 48h;
- playbook de AI SDR;
- playbooks por nicho;
- regras de promessa, desconto, risco e aprovacao;
- cards de oferta e conversao;
- aprendizados aprovados de campanhas anteriores.

Cada diagnostico deve registrar:

- `profile_key`;
- query usada;
- cards/chunks recuperados;
- hash/contexto seguro;
- ids de cards de suporte quando disponiveis.

Conteudo `internal_only` nunca deve ser exposto ao Portal do Cliente.

## Fluxo Funcional

### Criar Campanha

1. Usuario abre o Radar no workspace `Crescimento YUX`.
2. Cria campanha `local_niche`.
3. Define nicho, cidade, UF, oferta, palavras-chave e limites.
4. Sistema salva como `draft` ou `active`.

### Adicionar Empresas

1. Usuario adiciona empresas manualmente, por CSV simples ou por busca assistida
   limitada.
2. Backend normaliza campos.
3. Backend calcula `dedupe_key`.
4. Duplicatas exatas sao bloqueadas; duplicatas provaveis ficam marcadas para
   revisao.

### Enriquecer E Diagnosticar

1. Usuario solicita enriquecimento de uma empresa ou lote pequeno.
2. Backend cria `radar_enrichment_runs`.
3. Runtime usa ferramentas permitidas, como Jina, quando configuradas.
4. Backend salva fontes, evidencias e custo estimado.
5. Runtime executa `commercial_radar_local_niche`.
6. Resultado gera diagnostico, score e mensagem em rascunho.

### Revisar E Converter

1. Usuario revisa diagnostico, score, evidencias e mensagem.
2. Usuario aprova, rejeita ou marca opt-out.
3. Se aprovado, usuario converte para lead.
4. Backend cria lead no CRM com origem `Radar Comercial`.
5. Backend cria interacao inicial com diagnostico e mensagem aprovada.
6. Lead passa a ser operado no Registro 360.

## Conversao Para CRM

O lead criado deve receber:

- `source`: `Radar Comercial`;
- `source_kind`: `outbound`;
- `score`: score aprovado do Radar;
- `company`: nome fantasia ou razao social;
- `email` e `phone` somente quando forem contatos comerciais publicos;
- `notes`: resumo curto do diagnostico;
- `attribution_context` com:
  - `radarCampaignId`;
  - `radarCompanyRecordId`;
  - `radarDiagnosticId`;
  - `radarScoreId`;
  - `radarMessageSuggestionId`;
  - `sourceUrls`;
  - `recommendedOffer`;
  - `evidenceSummary`.

Tambem deve criar uma interacao:

- tipo `note`;
- titulo `Diagnostico Radar Comercial`;
- descricao com diagnostico, evidencias e mensagem aprovada.

## UX

O Radar deve ser uma ferramenta operacional densa e clara, sem landing page.

Dashboard:

- empresas coletadas;
- enriquecidas;
- qualificadas;
- aprovadas;
- convertidas para CRM;
- custo estimado;
- taxa de enriquecimento;
- oportunidades pendentes de revisao.

Campanha:

- filtros por status, score, cidade, nicho, fonte e revisao;
- tabela de empresas;
- acao de enriquecer;
- acao de rodar diagnostico;
- acao de revisar mensagem;
- acao de converter para lead.

Oportunidade:

- perfil da empresa;
- fontes e evidencias;
- diagnostico;
- score explicado;
- mensagem sugerida;
- compliance;
- trace do agente;
- botoes `Aprovar`, `Rejeitar`, `Opt-out`, `Criar lead`.

## Compliance E LGPD

Requisitos:

- coletar somente dados publicos e comerciais;
- registrar fonte e data da coleta;
- registrar finalidade comercial;
- permitir opt-out;
- impedir mensagem/conversao quando houver opt-out;
- evitar CPF, dados sensiveis e dados de consumidores finais;
- limitar volume por campanha;
- manter revisao humana obrigatoria;
- registrar logs de automacao e custo;
- bloquear fontes sem procedencia clara.

## Guardrails De IA

O workflow deve:

- gerar mensagens consultivas, nao agressivas;
- citar evidencias publicas concretas;
- nao inventar dados;
- declarar baixa confianca quando fonte for fraca;
- nao prometer resultados garantidos;
- nao oferecer desconto, preco fechado ou prazo sensivel;
- nao enviar nada sem aprovacao humana;
- registrar riscos e premissas;
- manter trilha auditavel em trace.

## Metricas

Metricas da campanha:

- empresas adicionadas;
- empresas unicas;
- taxa de enriquecimento;
- custo estimado por empresa enriquecida;
- score medio;
- oportunidades aprovadas;
- oportunidades rejeitadas;
- opt-outs;
- leads criados;
- diagnosticos agendados, quando o CRM registrar;
- propostas e clientes, por atribuicao posterior no CRM.

## Criterios De Aceite

O MVP sera aceitavel quando:

- usuario interno criar campanha local por nicho/cidade;
- usuario adicionar empresas e ver deduplicacao basica;
- sistema registrar fontes e compliance;
- enriquecimento gerar dados consolidados e custo estimado;
- workflow do harness gerar diagnostico, score e mensagem com trace;
- retrieval do Strategy Engine for registrado quando houver contexto;
- mensagem ficar em revisao humana obrigatoria;
- opt-out bloquear conversao e mensagem;
- aprovacao permitir criar lead no CRM;
- lead criado carregar origem, score, diagnostico e atribuicao do Radar;
- Registro 360 mostrar o lead convertido como parte do funil comercial;
- testes focados de backend, runtime e frontend cobrirem o fluxo principal.

## Fases Futuras

### Fase 2 - Empresas Recem-Abertas

- ingestao CNPJ mais robusta;
- filtros por data de abertura;
- ofertas de Sprint de Lancamento Comercial;
- deteccao de empresas sem presenca digital.

### Fase 3 - Cadencias Assistidas

- templates por nicho;
- tarefas e follow-ups;
- sequencias leves com revisao;
- metricas de resposta.

### Fase 4 - Produto Para Clientes

- expor como inteligencia de mercado gerenciada;
- monitoramento de concorrentes locais;
- campanhas B2B para clientes que vendem para empresas;
- controles de permissao e separacao por contrato.
