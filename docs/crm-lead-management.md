# CRM e Gestao de Leads

Atualizado em: 2026-06-04

Este documento descreve o modulo de CRM e gestao de leads conforme implementado
neste repositorio, incluindo escopo funcional, modelo de dados, integracoes,
regras de seguranca, relacao com outros modulos e dependencias operacionais
pendentes.

## Status Executivo

O escopo de CRM e gestao de leads planejado para a fase atual esta implementado
no codigo do repositorio. Isso nao significa que o modulo esteja automaticamente
100% operacional em qualquer ambiente: o projeto Supabase alvo precisa ter as
migracoes, grants da Data API, politicas RLS, dados iniciais e usuarios/
memberships autenticados corretamente aplicados.

Estado atual:

- Rota interna do CRM: implementada em `/leads`.
- Rota do CRM no portal do cliente: implementada em `/portal/crm`.
- Rota de configuracoes do CRM no portal: implementada em `/portal/crm/settings`.
- Rota interna de governanca CRM YUX: implementada em `/crm-governance`.
- Governanca por contrato: implementada no repositorio com instancia CRM,
  assentos, equipes, papeis, versoes de configuracao, publicacao, migracao e
  auditoria.
- Fase 1 do CRM ideal, cockpit comercial usavel: implementada no repositorio
  com abas Kanban, Lista, Hoje, Calendario e Fontes; filtros avancados; lead 360;
  importacao CSV com preview; regras de tags, duplicidade, motivos de perda,
  proximas acoes e tempo parado.
- Upgrade comercial do CRM Cockpit: implementado.
- Base de automacao de follow-up: implementada.
- Dispatcher protegido de automacoes do CRM: implementado.
- Fronteira provider-neutral para automacoes: implementada.
- Execucao real por WhatsApp/email/n8n: suportada pela fronteira do dispatcher,
  mas credenciais e workflows de producao continuam sendo configuracao
  operacional.
- Problema reportado no navegador em 2026-06-03: corrigido no codigo ao impedir
  loading infinito quando o contexto da plataforma cai em uma organizacao local
  nao persistida.
- `401` do Supabase em `organizations`: tratado no repositorio com migracao de
  grants explicitos para a Data API; o ambiente alvo ainda precisa ter a
  migracao aplicada e uma sessao autenticada valida.
- Verificacao remota do Supabase em 2026-06-03: o projeto `portal-yux`
  (`uuowkncimiydpbxqpkej`) esta ativo e tinha migracoes somente ate
  `20260601210000_omnichannel_webchat_widget_service` antes da correcao de
  grants da Data API. As migracoes posteriores do MVP comercial ainda precisam
  ser aplicadas nesse ambiente alvo.

## Rotas e Superficies

### CRM Interno

Rota: `/leads`

Componentes principais:

- `frontend/src/pages/leads/LeadsPage.tsx`
- `frontend/src/components/crm/CrmWorkspace.tsx`

O CRM interno e o cockpit comercial da YUX para operacao de pipeline. Ele usa o
contexto atual de organizacao da plataforma e so consulta organizacoes com IDs
persistidos no banco.

### CRM no Portal do Cliente

Rota: `/portal/crm`

A rota do portal atualmente reutiliza o workspace compartilhado do CRM e e
controlada pelo contexto de navegacao/contrato do portal. Um cliente so ve CRM
quando o contrato ativo habilita o modulo `crm` e quando as politicas RLS
permitem acesso a organizacao desse cliente.

O escopo seguro para portal e intencionalmente mais restrito que a operacao
interna: ele foi pensado para visibilidade contratada de pipeline e continuidade
segura de estagios/leads pelo cliente, nao para administracao interna irrestrita
da YUX.

### Configuracoes do CRM no Portal

Rota: `/portal/crm/settings`

Implementado:

- painel de assentos contratados;
- painel de convites e papeis;
- painel de equipes comerciais;
- rascunho de configuracao;
- assistente de publicacao de versao com estrategia de migracao.

Esta superficie e destinada ao admin do cliente dentro dos limites configurados
pela YUX. A ligacao operacional completa com convite de usuarios reais e
edicao interativa de todos os campos depende da aplicacao da migration de
governanca e da evolucao dos forms de administracao.

### Governanca CRM YUX

Rota: `/crm-governance`

Implementado:

- visao interna de instancias por contrato;
- comunicacao dos limites de vendedores, gerentes e admins;
- comunicacao do blueprint setorial como ponto de partida da implantacao.

Esta tela e a base administrativa para a YUX configurar a instancia CRM
contratada por cliente. Ela deve evoluir para formularios completos de status,
limites, blueprint, setor e permissoes por contrato.

## Funcionalidades Implementadas

### Governanca por Contrato

Implementado:

- nova entidade `crm_instances`, vinculada a organizacao e contrato;
- `crm_instance_members` com papeis `seller`, `manager`, `client_admin` e
  `yux_admin`;
- limites contratados de vendedores, gerentes e admins;
- `crm_teams` e `crm_team_members`;
- tipos de distribuicao `manual`, `queue`, `round_robin` e `pull_next`;
- campos de governanca em `leads`: `crm_instance_id`, `team_id`,
  `owner_member_id`, versoes de pipeline/etapa, estado/modo de atribuicao e
  ultimo horario de atribuicao;
- regras puras testadas para assentos, visibilidade, publicacao e migracao;
- workspace do CRM com estado `CRM nao contratado ou inativo` para cliente sem
  instancia ativa;
- visao `Meus leads` para vendedor e `Leads da equipe` para gerente.

Regra de produto:

- Sem contrato ativo com modulo `crm` e instancia CRM ativa, o portal nao deve
  operar CRM para o cliente.
- Admin YUX define limites, blueprint, setor e permissoes comerciais.
- Admin cliente opera dentro dos limites contratados.
- Vendedor ve o proprio fluxo.
- Gerente ve sua equipe e pode receber controles de redistribuicao.

### Papeis e Visibilidade

Modelo implementado no dominio e preparado no RLS:

- Admin YUX: configura limites, blueprint, status e auditoria.
- Admin cliente: gerencia usuarios, equipes e configuracoes dentro dos limites
  contratados.
- Gerente: ve leads das equipes sob sua gestao.
- Vendedor: ve seus proprios leads.

As regras de dominio ficam em:

- `frontend/src/lib/crm/governanceRules.ts`
- `frontend/src/lib/crm/governanceRules.test.ts`

### Cockpit de Pipeline

Implementado:

- Carrega pipelines do CRM por organizacao.
- Seleciona o pipeline ativo padrao quando disponivel.
- Exibe estagios ordenados do pipeline.
- Suporta visualizacao Kanban.
- Suporta visualizacao em lista/tabela.
- Suporta abas de cockpit: Kanban, Lista, Hoje, Calendario e Fontes.
- Suporta filtros por busca, etapa, origem, temperatura e negocios travados.
- Permite mover leads entre estagios.
- Preserva valores legados de `stage` do lead enquanto usa `stage_id`
  configuravel.
- Suporta semantica de ganho/perda por metadados do estagio.

### Faixa de Metricas

Implementado:

- Novos leads.
- Leads parados.
- Taxa de conversao.
- Valor de pipeline aberto.

### Fase 1 - CRM Comercial Usavel

Implementado em 2026-06-04:

- tipos de dominio em `frontend/src/types/crmCockpit.ts`;
- regras puras em `frontend/src/lib/crm/cockpitRules.ts`;
- testes de dominio em `frontend/src/lib/crm/cockpitRules.test.ts`;
- service `frontend/src/services/crmCockpitService.ts`;
- componentes `CockpitTabs`, `LeadAdvancedFilters`, `TodayWorkQueue`,
  `Lead360Panel` e `LeadCsvImportPanel`;
- abas Kanban, Lista, Hoje, Calendario e Fontes no `CrmWorkspace`;
- preview de importacao CSV com contagem de linhas validas e invalidas;
- ranking de oportunidades de hoje por follow-up, temperatura, urgencia e
  tempo parado;
- resumo de fontes de leads para preparar atribuicao/MROI;
- painel 360 do lead com dados, proximas acoes, tarefas e timeline.

Migration planejada/implementada no repositorio:

- `supabase/migrations/20260604010000_crm_commercial_cockpit.sql`

Probe:

- `supabase/probes/20260604010000_crm_commercial_cockpit.sql`

Limite operacional:

- a migration e o probe ainda precisam ser executados no Supabase alvo;
- a validacao local do Supabase depende do Docker Desktop/daemon disponivel.

As regras ficam em:

- `frontend/src/lib/crm/pipelineRules.ts`
- `frontend/src/lib/crm/pipelineRules.test.ts`

### Criacao de Leads

Implementado:

- Criacao manual de lead pela UI do CRM.
- Captura nome, email, telefone, empresa, origem, score e valor estimado.
- Atribui o novo lead ao primeiro estagio ordenado do pipeline selecionado.
- Persiste contexto de atribuicao e padroes de tipo de origem.

### Cards e Linhas de Leads

Implementado:

- Nome do lead.
- Contexto de empresa/email.
- Origem e tipo de origem.
- Score.
- Valor.
- Selecao de estagio.
- Acao de movimentacao de estagio.

### Operacoes no Detalhe do Lead

Implementado no modal do lead:

- Resumo do lead.
- Marcar como ganho.
- Marcar como perdido.
- Linha do tempo de interacoes.
- Adicionar nota/atividade.
- Painel de tarefas.
- Criar tarefa de follow-up.
- Concluir tarefa de follow-up.
- Lista de execucoes de automacao.
- Tentar novamente execucao com falha.
- Integracao com painel comercial/propostas.

Componentes relacionados:

- `LeadDetailPanel`
- `LeadKanbanBoard`
- `LeadTaskPanel`
- `LeadTimeline`
- `LeadCommercialPanel`

### Sequencias de Follow-Up

Implementado:

- Sequencias de CRM.
- Etapas de sequencia.
- Inscricoes de leads em sequencias.
- Pausar automacao.
- Retomar automacao.
- Assumir atendimento manualmente.
- Reagendar proxima execucao.
- Rastrear status de execucao.
- Retentar execucao com falha.

Regras de dominio:

- `frontend/src/lib/crm/followUpRules.ts`
- `frontend/src/lib/crm/followUpRules.test.ts`

## Modelo de Dados

### Tabelas Centrais do CRM

Implementadas por `supabase/migrations/20260601110000_multitenant_crm_automation.sql`:

- `crm_pipelines`
- `crm_pipeline_stages`
- `crm_sequences`
- `crm_sequence_steps`
- `crm_sequence_enrollments`
- `crm_tasks`
- `automation_executions`

Tabelas existentes estendidas:

- `leads`
- `interactions`

### Tabelas do Upgrade do CRM Cockpit

Implementadas por `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`:

- `pipeline_templates`
- `pipeline_template_stages`
- `lead_custom_field_values`
- `lead_tasks`

Campos adicionados ou normalizados em leads:

- `organization_id`
- `pipeline_id`
- `stage_id`
- `owner_id`
- `score`
- `status`
- `lost_reason`
- `won_at`
- `lost_at`
- `last_activity_at`
- `next_follow_up_at`
- `source_kind`
- `attribution_context`

### Tabelas de Governanca CRM por Contrato

Implementadas por `supabase/migrations/20260603230000_crm_governance_by_contract.sql`:

- `crm_instances`
- `crm_instance_members`
- `crm_teams`
- `crm_team_members`
- `crm_pipeline_versions`
- `crm_stage_versions`
- `crm_custom_field_definitions`
- `crm_categories`
- `crm_tags`
- `crm_loss_reasons`
- `crm_configuration_drafts`
- `crm_configuration_publications`
- `crm_configuration_migration_runs`
- `crm_audit_events`

Probe:

- `supabase/probes/20260603230000_crm_governance_by_contract.sql`

### Tabelas do Cockpit Comercial Usavel

Implementadas por `supabase/migrations/20260604010000_crm_commercial_cockpit.sql`:

- `lead_stage_history`
- `lead_tags`
- `lead_tag_assignments`
- `lead_loss_reasons`
- `lead_duplicates`
- `lead_saved_views`
- `lead_imports`
- `lead_import_rows`
- `lead_next_actions`
- `crm_activity_calendar_entries`

Campos adicionados em `leads`:

- `whatsapp_phone`
- `city`
- `state`
- `segment`
- `interest`
- `temperature`
- `urgency`
- `consent_lgpd`
- `whatsapp_opt_in`
- `email_opt_in`
- `competitor`
- `objections`
- `current_stage_entered_at`

### Correcao de Exposicao da Data API

Implementada por `supabase/migrations/20260603215128_expose_platform_base_tables_to_data_api.sql`:

- `GRANT` explicito para acesso autenticado as tabelas base exigidas pelo shell
  da plataforma;
- `GRANT` explicito para acesso autenticado as tabelas exigidas pelo service do
  CRM;
- RLS continua sendo a fronteira de autorizacao por linha.

Probe:

- `supabase/probes/20260603215128_expose_platform_base_tables_to_data_api.sql`

Aplicacao remota:

- Aplicada ao projeto `portal-yux` (`uuowkncimiydpbxqpkej`) em 2026-06-03 via
  conector Supabase como migracao remota
  `20260603215652_expose_platform_base_tables_to_data_api`.

## Seguranca e Modelo de Acesso

RLS esta habilitado nas tabelas do CRM. As funcoes auxiliares principais ficam
no schema privado:

- `private.can_access_crm_organization(UUID)`
- `private.can_access_crm_pipeline(UUID)`
- `private.can_access_crm_lead(UUID)`

Modelo de acesso:

- usuarios internos da YUX podem gerenciar registros de CRM;
- usuarios clientes acessam CRM somente da propria organizacao quando um
  contrato ativo habilita o modulo `crm`;
- acesso entre clientes diferentes e bloqueado por RLS;
- acesso no portal deriva de contrato/modulo habilitado;
- grants da Data API expoem operacoes de tabela para a camada REST, mas nao
  contornam RLS.

Helpers adicionais de governanca:

- `private.can_access_crm_instance(UUID)`
- `private.crm_member_role(UUID)`
- `private.current_crm_member_id(UUID)`
- `private.can_manage_crm_instance(UUID)`
- `private.can_manage_crm_members(UUID)`
- `private.can_access_crm_team(UUID)`
- `private.can_access_crm_lead_v2(UUID)`
- `private.can_update_crm_lead_v2(UUID)`
- `private.can_publish_crm_configuration(UUID)`

## Relacoes com Outros Modulos

- Campanhas criam ou atualizam leads com origem e atribuicao.
- Omnichannel sincroniza conversas, handoff e contato para leads governados.
- Propostas usam o lead como origem comercial.
- Projetos podem nascer de propostas ganhas.
- Financeiro usa vendas/propostas aprovadas para contexto de receita.
- Suporte pode abrir chamados relacionados a clientes, contratos e operacao.
- Relatorios leem funil, equipe, vendedor, campanha e status contratual.

## Camada de Servico

Service principal:

- `frontend/src/services/crmService.ts`

Operacoes implementadas:

- `getPipelines`
- `getPipelinesForOrganization`
- `getLeads`
- `getLeadsForPipeline`
- `createLead`
- `moveLead`
- `moveLeadToStage`
- `updateLeadScore`
- `getInteractions`
- `createInteraction`
- `recordLeadActivity`
- `getTasks`
- `createTask`
- `createLeadTask`
- `completeLeadTask`
- `markLeadWon`
- `markLeadLost`
- `getSequences`
- `getEnrollments`
- `enrollLead`
- `updateEnrollment`
- `getExecutions`
- `retryExecution`

## Relacao com Outros Modulos

### Plataforma, Contratos e Portal

O CRM depende do contexto da plataforma:

- organizacoes;
- memberships;
- roles;
- contratos ativos;
- modulos habilitados.

O portal so expoe CRM quando o contrato ativo habilita `crm`.

### Propostas Comerciais

O CRM se integra a propostas por meio do `LeadCommercialPanel` e dos fluxos de
conversao de proposta. Leads podem se tornar oportunidades comerciais e se
conectar a geracao, revisao e conversao de propostas.

### Omnichannel AI

O Omnichannel mantem fronteiras de sincronizacao com o CRM por meio de:

- `crm_sync_runs`;
- referencias de leads em conversas/contatos;
- contexto de handoff e lead;
- workflows futuros de provider para enriquecimento contato-para-lead.

A implementacao atual e provider-neutral por padrao, com suporte real ao
provider WhatsApp implementado separadamente no caminho de provider do
omnichannel.

### Landing Pages

Landing pages podem rotear envios capturados para o CRM por meio de campos
mapeados e contexto de atribuicao do lead. O CRM consome origem/tipo de origem
e metadados de atribuicao para relatorios.

### Campanhas

Campanhas se conectam a leads por atribuicao de origem paga, metricas de
campanha e relatorios de MROI. Os campos de origem do lead suportam atribuicao
de campanha.

### Flow Builder Lite

O Flow Builder pode disparar acoes comerciais relacionadas a leads, campanhas,
landing pages, propostas e eventos de CRM. O historico de execucao fica
disponivel para rastreabilidade operacional.

### Relatorios Operacionais

Relatorios agregam dados do CRM em:

- leads por origem;
- conversoes por estagio;
- oportunidades paradas;
- taxa de aprovacao de propostas;
- tempo de resposta;
- atividade por responsavel;
- resultados de MROI/campanhas.

Relatorios do portal removem atividade exclusivamente interna.

### Financeiro e Projetos

Leads ganhos podem alimentar fluxos de proposta, contrato, projeto e financeiro.
O relacionamento CRM/propostas ja esta implementado no codigo atual; a
orquestracao totalmente automatizada de lead para faturamento ainda e uma
extensao operacional/produto.

## Tratamento de Erros e Correcao Atual no Navegador

Sintoma reportado no navegador:

- CRM permanecia em mensagem de carregamento;
- console mostrava `401 Unauthorized` em
  `/rest/v1/organizations?select=*&order=name.asc`.

Causa raiz no codigo:

- a inicializacao da plataforma pode cair em uma organizacao local nao
  persistida quando o contexto remoto falha;
- o CRM antes inicializava `loading=true`;
- quando o ID da organizacao nao era um UUID persistido, o CRM retornava antes
  de definir `loading=false`.

Correcao implementada:

- o CRM nao inicia mais com loading permanente;
- contexto ausente ou organizacao nao persistida renderiza um aviso operacional
  explicito;
- erros de pipeline/carregamento renderizam um erro de CRM com acao de tentar
  novamente;
- um teste de regressao cobre o caso de organizacao fallback.

Observacao operacional importante:

- se o console ainda mostrar `401` depois do deploy dessa correcao, o ambiente
  ainda tem um problema de auth/Data API. Aplique a nova migracao de grants da
  Data API, garanta que o usuario tenha uma sessao Supabase valida e confirme
  memberships/politicas RLS para o usuario atual.

## Evidencias de Validacao

Validacao focada do CRM depois da correcao de loading:

```bash
cd frontend
npm test -- src/components/crm/CrmWorkspace.test.tsx src/lib/crm/pipelineRules.test.ts src/lib/crm/followUpRules.test.ts
```

Resultado:

- 3 arquivos de teste passaram;
- 10 testes passaram.

A validacao anterior do MVP comercial tambem incluiu:

- suite completa de testes do frontend;
- type-check;
- build de producao;
- testes compartilhados de Supabase Edge Functions;
- deploy Vercel com sucesso.

## O CRM Esta 100% Implementado?

Implementacao no repositorio: sim, para o escopo de CRM, follow-up e cockpit
comercial planejado para a fase atual.

Prontidao operacional em producao: ainda nao e totalmente garantida ate que o
ambiente alvo seja verificado.

Ainda necessario ou nao totalmente automatizado:

- aplicar no Supabase alvo todas as migracoes do MVP comercial posteriores a
  `20260601210000`;
- rodar os probes do CRM contra o Supabase alvo;
- verificar que um usuario interno da YUX consegue ler `organizations`,
  pipelines e leads;
- verificar que um usuario do portal do cliente so ve CRM quando o contrato
  ativo habilita `crm`;
- configurar providers reais/workflows n8n para execucao de sequencias;
- rodar QA autenticado no navegador em `/leads` e `/portal/crm`;
- decidir se o CRM do portal deve continuar usando o workspace operacional
  compartilhado ou se deve receber uma visao ainda mais restrita, exclusiva para
  cliente.

## Arquivos Relevantes

Frontend:

- `frontend/src/pages/leads/LeadsPage.tsx`
- `frontend/src/components/crm/CrmWorkspace.tsx`
- `frontend/src/components/crm/LeadKanbanBoard.tsx`
- `frontend/src/components/crm/LeadDetailPanel.tsx`
- `frontend/src/components/crm/LeadTimeline.tsx`
- `frontend/src/components/crm/LeadTaskPanel.tsx`
- `frontend/src/components/proposals/LeadCommercialPanel.tsx`
- `frontend/src/services/crmService.ts`
- `frontend/src/types/crm.ts`
- `frontend/src/lib/crm/followUpRules.ts`
- `frontend/src/lib/crm/pipelineRules.ts`

Supabase:

- `supabase/migrations/20260601110000_multitenant_crm_automation.sql`
- `supabase/migrations/20260601120000_crm_automation_triggers.sql`
- `supabase/migrations/20260601130000_enqueue_crm_follow_up.sql`
- `supabase/migrations/20260601140000_enable_client_crm_portal.sql`
- `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`
- `supabase/migrations/20260603215128_expose_platform_base_tables_to_data_api.sql`
- `supabase/functions/dispatch-crm-automation/index.ts`

Testes:

- `frontend/src/components/crm/CrmWorkspace.test.tsx`
- `frontend/src/lib/crm/followUpRules.test.ts`
- `frontend/src/lib/crm/pipelineRules.test.ts`
