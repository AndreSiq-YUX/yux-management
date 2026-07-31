# YUX Intelligent Automations + SMTP2GO Design

## Status De Implementacao

Implementado no repositorio em 2026-06-04:

- fundacao nativa de automacoes com catalogo de eventos, risco, validacao de
  publicacao, versoes e simulacoes;
- sequencias comerciais multicanal e catalogo de templates setoriais;
- hub SMTP2GO compartilhado com conexoes, subcontas, limites, suppressions,
  eventos e contadores de uso;
- Edge Functions `send-email` e `smtp2go-webhook`;
- tela `/automations` evoluida para Automacoes Inteligentes com areas de
  Automacoes, Sequencias, Templates, Execucoes e Configuracoes.

Validacao local: testes focados, type-check, `deno check`, suite frontend,
build frontend e tentativa de `supabase db reset --debug`. O reset Supabase
permanece bloqueado neste ambiente porque o Docker Desktop nao esta acessivel.

## Objetivo

Transformar a base atual de Flow Builder Lite, sequencias comerciais e historico
de execucao em um produto nativo de automacoes inteligentes do YUX Hub. A nova
area deve permitir que YUX e clientes configurem fluxos, sequencias, templates
por setor, execucoes, simulacoes e envio de emails por uma camada transversal
integrada ao SMTP2GO.

## Decisao De Produto

A automacao passa a ser nativa do YUX Hub, porque o diferencial comercial esta
em reagir aos eventos proprios do ecossistema YUX:

- CRM, funis, equipes, vendedores e leads;
- WhatsApp/omnichannel e IA;
- landing pages, campanhas e MROI;
- propostas, contratos e onboarding;
- projetos, entregaveis e aprovacoes;
- financeiro, suporte e portal do cliente.

SMTP2GO entra como infraestrutura de email do Hub, nao como motor de marketing.
Todos os modulos que precisarem enviar email devem passar pela mesma camada de
mensageria, limites, logs, opt-out e webhooks.

## Contexto Atual Do Repositorio

Ja existem:

- `automation_flows`, `automation_triggers`, `automation_conditions`,
  `automation_actions`, `automation_execution_runs`,
  `automation_execution_steps` e `automation_templates`;
- `crm_sequences`, `crm_sequence_steps`, `crm_sequence_enrollments` e
  `automation_executions`;
- `dispatch-crm-automation` para executar sequencias e eventos de fluxos;
- `automationService`, `automationRules` e `AutomationWorkspace`;
- modulo `automations` registrado na plataforma;
- historico de execucao, status e retry em partes do CRM.

O problema atual e que isso ainda parece uma base tecnica. A nova implantacao
deve transformar a area em produto comercial configuravel.

## Escopo Funcional

### 1. Dois Tipos De Automacao

#### Fluxos

Fluxos sao automacoes condicionais do sistema.

Exemplos:

- lead entrou por landing page;
- lead mudou para etapa de proposta;
- proposta foi aprovada;
- conversa ficou sem resposta;
- campanha passou do limite de CPL;
- ticket ficou atrasado;
- fatura venceu.

#### Sequencias

Sequencias sao cadencias comerciais ou de relacionamento.

Exemplos:

- follow-up de lead;
- recuperacao de proposta;
- nutricao por email;
- reativacao de cliente;
- lembrete de consulta;
- pos-venda;
- no-show;
- carrinho abandonado;
- lead imobiliario pos-visita.

Fluxos podem iniciar, pausar ou encerrar sequencias.

### 2. Gatilhos Integrados Ao Hub

Gatilhos devem ser normalizados em um catalogo.

CRM:

- `lead.created`
- `lead.updated`
- `lead.stage_changed`
- `lead.stalled`
- `lead.won`
- `lead.lost`
- `lead.score_changed`
- `lead.owner_changed`
- `lead.next_action_overdue`
- `lead.task_created`
- `lead.task_completed`
- `lead.inactive`

Omnichannel:

- `conversation.created`
- `conversation.message_received`
- `conversation.unanswered`
- `conversation.ai_intent_detected`
- `conversation.ai_urgency_detected`
- `conversation.handoff_requested`
- `conversation.human_assumed`
- `conversation.reply_after_sequence`
- `conversation.opt_out_received`
- `message.failed`

Landing pages:

- `landing_page.form_submitted`
- `landing_page.lead_from_page`
- `landing_page.lead_from_utm`
- `landing_page.conversion_drop`
- `landing_page.version_approved`
- `landing_page.published`

Propostas:

- `proposal.created`
- `proposal.sent`
- `proposal.viewed`
- `proposal.approved`
- `proposal.rejected`
- `proposal.adjustment_requested`
- `proposal.unanswered`

Projetos e entregaveis:

- `project.created`
- `project.phase_delayed`
- `deliverable.sent`
- `deliverable.approval_pending`
- `deliverable.approval_overdue`
- `deliverable.approved`
- `deliverable.adjustment_requested`

Financeiro:

- `invoice.created`
- `invoice.due_soon`
- `invoice.overdue`
- `payment.registered`
- `contract.renewal_due`
- `invoice.delinquency_age_reached`

Campanhas e relatorios:

- `campaign.cpl_above_threshold`
- `campaign.roas_below_threshold`
- `campaign.no_leads`
- `campaign.hot_lead_generated`
- `report.monthly_generated`
- `report.anomaly_detected`

Suporte:

- `ticket.created`
- `ticket.overdue`
- `ticket.escalation_required`
- `ticket.resolved`

### 3. Condicoes

As condicoes devem ser legiveis para usuarios nao tecnicos e expressivas para a
YUX.

Operadores base:

- equals;
- not_equals;
- contains;
- not_contains;
- greater_than;
- greater_or_equal;
- less_than;
- less_or_equal;
- exists;
- not_exists;
- in;
- not_in;
- business_hours;
- module_enabled;
- contract_active;
- consent_allows;
- was_viewed;
- is_overdue;

Campos suportados:

- campos do lead;
- etapa, funil, origem, score, valor e responsavel;
- contrato, modulo contratado e limites;
- consentimento de email/WhatsApp;
- evento de proposta;
- evento de campanha;
- dados de conversa e IA;
- tarefa, ticket, projeto, entrega e fatura;
- variaveis derivadas por blueprint setorial.

Condicoes de IA:

- sentimento negativo;
- intencao de compra;
- intencao de suporte;
- urgencia alta;
- objecao por preco;
- sem fit;
- reclamacao;
- pedido de humano.

### 4. Acoes

As acoes devem ser executadas por adaptadores server-side, nunca pelo frontend
com credenciais.

CRM:

- criar lead;
- atualizar campo;
- mover etapa;
- atribuir responsavel;
- adicionar/remover tag;
- criar tarefa;
- criar nota;
- criar atividade;
- marcar ganho/perdido;
- criar follow-up;
- iniciar/pausar/encerrar sequencia.

WhatsApp/omnichannel:

- enviar mensagem;
- enviar template;
- enviar lembrete;
- enviar link de proposta;
- enviar link de agendamento;
- notificar vendedor;
- transferir para humano;
- pausar/reativar IA;
- registrar opt-out.

Email:

- enviar email simples;
- enviar email por template;
- enviar proposta;
- enviar relatorio;
- enviar lembrete;
- enviar confirmacao;
- enviar conteudo educativo;
- registrar opt-out;
- respeitar suppressions.

Propostas:

- criar rascunho;
- gerar proposta com IA;
- enviar proposta;
- criar tarefa de cobranca;
- marcar follow-up;
- converter proposta aprovada.

Projetos:

- criar projeto;
- criar tarefas de onboarding;
- criar checklist;
- criar aprovacao;
- notificar cliente;
- solicitar documento.

Financeiro:

- criar item de cobranca;
- enviar lembrete;
- notificar atraso;
- criar tarefa interna.

IA:

- resumir conversa;
- classificar lead;
- extrair campos;
- sugerir proxima acao;
- gerar mensagem;
- gerar email;
- gerar proposta;
- gerar diagnostico;
- avaliar qualidade da resposta;
- detectar duplicidade;
- enriquecer lead com dados publicos quando permitido.

Integracoes:

- chamar webhook;
- enviar para n8n;
- enviar para API externa;
- registrar log;
- tentar novamente.

### 5. Templates Por Setor

Templates devem vir de blueprints e podem ser aplicados por YUX admin em cada
cliente.

Setores iniciais:

- clinicas;
- imobiliarias;
- revendas;
- oficinas;
- agencias;
- genericos.

Cada template precisa conter:

- setor;
- nome comercial;
- modulo requerido;
- gatilho;
- condicoes;
- acoes;
- variaveis;
- limites sugeridos;
- risco;
- modo de revisao humana;
- indicadores esperados.

### 6. Interface

Nome sugerido: `Automacoes Inteligentes`.

Navegacao:

1. Automacoes
2. Sequencias
3. Templates
4. Execucoes
5. Configuracoes

Nivel 1: Automacao Guiada

- "Quando algo acontecer";
- "Se as condicoes forem verdadeiras";
- "Entao executar acoes";
- frases legiveis;
- controles simples;
- bom para cliente comum.

Nivel 2: Builder Tecnico

- trigger;
- branch;
- delay;
- condition;
- action;
- AI step;
- webhook;
- error path;
- logs;
- bom para YUX admin.

### 7. Simulacao E Publicacao

Antes de publicar, o usuario deve conseguir:

- simular com lead, conversa, proposta, ticket, fatura ou campanha de exemplo;
- ver quais condicoes passariam;
- ver quais acoes seriam executadas;
- ver bloqueios por consentimento, horario, limite ou contrato;
- ver custo estimado de IA;
- ver risco do fluxo;
- publicar uma versao.

Fluxos publicados devem ser versionados. Alteracoes criam rascunho novo e nao
alteram execucoes historicas.

### 8. Logs, Controle E Seguranca

Toda automacao deve registrar:

- status: draft, active, paused, error, archived;
- versao publicada;
- quem editou;
- quem publicou;
- quando publicou;
- execucoes;
- passos;
- sucesso/falha;
- motivo da falha;
- retries;
- custo estimado de IA;
- mensagens enviadas;
- opt-out respeitado;
- dados acessados;
- permissoes;
- limite diario;
- limite por cliente;
- janela de horario;
- modo teste;
- modo simulacao.

## SMTP2GO Como Camada Transversal De Email

### Objetivo

SMTP2GO deve ser o provedor padrao para emails transacionais e emails enviados
por automacoes em todos os modulos do Hub.

Modulos que podem usar email:

- CRM;
- automacoes;
- propostas;
- projetos;
- aprovacoes;
- financeiro;
- suporte;
- relatorios;
- portal;
- notificacoes internas.

### Modelo De Contas

- YUX possui conta master SMTP2GO.
- Cada cliente que envia emails pelo Hub deve ter uma subconta SMTP2GO.
- Cada subconta deve ter quota propria.
- Cada subconta deve ter remetentes/dominios verificados.
- Dominios verificados na conta master podem ser alocados a subcontas quando
  apropriado.
- Cada canal de envio pode usar API key ou SMTP user especifico.
- Credenciais ficam somente em servidor/Edge Function.

Base externa consultada:

- subcontas SMTP2GO tem limite proprio e nao podem exceder allowance; envios
  acima da quota sao rejeitados;
- dominios verificados da conta master podem ser alocados a subcontas;
- rate limit pode ser configurado por API key;
- webhooks reportam eventos como processed, delivered, open, click, bounce,
  spam, unsubscribe, resubscribe e reject;
- tentativas para destinatarios em suppressions ou remetentes nao verificados
  podem ser rejeitadas.

### Entidades De Email

Novas entidades planejadas:

- `email_provider_connections`
- `smtp2go_subaccounts`
- `smtp2go_sender_identities`
- `email_templates`
- `email_template_versions`
- `email_send_requests`
- `email_send_events`
- `email_suppression_entries`
- `email_usage_counters`
- `email_webhook_events`

### Regras De Envio

- nenhuma acao de email executa sem modulo/contrato/permissao aplicavel;
- nenhum email comercial sai sem opt-in quando opt-in e exigido;
- opt-out bloqueia proximos envios comerciais;
- faturas, suporte e notificacoes transacionais podem ter politica propria;
- envio respeita janela de horario quando a automacao exigir;
- envio respeita limite da organizacao, limite da subconta e rate limit local;
- falha do SMTP2GO grava evento e pode gerar retry se for retryable;
- bounce, spam complaint e unsubscribe atualizam suppressions locais;
- evento reject nunca deve ser escondido do log operacional.

### Email Transacional Versus Marketing

Emails transacionais:

- proposta enviada;
- convite;
- aprovacao;
- fatura;
- suporte;
- relatorio contratado;
- reset/aviso operacional.

Emails comerciais/marketing:

- nutricao;
- reativacao;
- follow-up comercial;
- campanha educativa;
- pos-venda promocional.

Cada request deve ter `email_kind` para aplicar regras corretas.

## Arquitetura

### Camadas

Frontend:

- dashboards;
- wizard guiado;
- builder tecnico;
- editor de sequencias;
- templates;
- execucoes;
- configuracoes de email;
- simulacao.

Regras puras:

- catalogo de gatilhos;
- avaliacao de condicoes;
- validacao de acoes;
- seguranca de IA;
- limites de envio;
- elegibilidade de email;
- sanitizacao portal.

Services:

- `automationService`;
- `sequenceService`;
- `automationTemplateService`;
- `emailProviderService`;
- `emailDeliveryService`.

Supabase:

- migrations com tabelas de automacao avancada e email;
- RLS por organizacao/contrato/modulo;
- probes para grants e policies;
- Edge Functions para execucao e envio.

Edge Functions:

- `dispatch-automation-event`;
- `run-automation-step`;
- `send-email`;
- `smtp2go-webhook`;
- `simulate-automation`.

### Fluxo De Evento

1. Modulo do Hub emite evento normalizado.
2. Dispatcher localiza fluxos publicados e habilitados.
3. Condicoes sao avaliadas com contexto sanitizado.
4. Execucao e passos sao registrados.
5. Acoes rodam por adaptadores server-side.
6. Falhas sao registradas com erro protegido.
7. Retries respeitam politica por acao.
8. Resultados alimentam logs, metricas e alertas.

### Fluxo De Email

1. Um modulo ou automacao cria `email_send_request`.
2. Sistema valida contrato, modulo, permissao, opt-in, suppression e limite.
3. Edge Function `send-email` resolve subconta SMTP2GO e remetente.
4. Email e enviado via API SMTP2GO ou SMTP server-side.
5. Resultado inicial vira evento local.
6. Webhooks SMTP2GO atualizam delivery, bounce, spam, open, click,
   unsubscribe, reject e suppression local.

## Fora Do Escopo Inicial

- backend externo de marketing automation;
- Apollo;
- construtor visual identico ao n8n;
- compra automatica de midia;
- decisao autonoma irrestrita por IA;
- email marketing em massa sem limites e opt-out;
- provisionamento DNS totalmente automatico;
- migracao de provedores de email historicos.

## Fases Recomendadas

### Fase A - Fundacao De Automacoes Nativas

- catalogo de gatilhos, condicoes e acoes;
- tipos e regras puras;
- migration para evoluir Flow Builder Lite;
- execucoes versionadas;
- simulacao basica;
- docs e status.

### Fase B - Sequencias Comerciais

- entidade de sequencias separada de fluxos;
- cadencias por canal;
- inscricoes;
- metricas;
- pausar/retomar/encerrar;
- UI de sequencias.

### Fase C - SMTP2GO E Email Hub

- conexoes SMTP2GO;
- subcontas por cliente;
- limites;
- templates;
- send requests;
- webhook;
- suppressions;
- painel de uso.

### Fase D - Templates Setoriais

- templates por blueprint;
- aplicacao em cliente;
- preview;
- duplicacao;
- configuracao por setor.

### Fase E - IA Como Bloco Seguro

- classificacao;
- extracao;
- resumo;
- geracao;
- aprovacao humana;
- custo estimado;
- logs de IA.

### Fase F - Builder Avancado E Governanca

- branches;
- delays;
- error paths;
- versoes publicadas;
- auditoria;
- limites por contrato;
- dashboards de execucao.

## Criterios De Sucesso

- o produto nao depende de backend externo de marketing automation;
- clientes conseguem usar automacoes guiadas sem tela em branco;
- YUX consegue configurar fluxos tecnicos avancados;
- sequencias comerciais viram produto separado e mensuravel;
- qualquer modulo do Hub pode solicitar email por uma camada unica;
- SMTP2GO fica isolado em server-side;
- subcontas, limites, opt-out e suppressions sao respeitados;
- simulacao bloqueia automacoes inseguras antes da publicacao;
- execucoes e falhas sao auditaveis.
