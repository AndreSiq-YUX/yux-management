# YUX CRM - Fase 2 - WhatsApp e IA Comercial

## Objetivo

Conectar profundamente o CRM ao omnichannel e a IA para que conversas de
WhatsApp gerem, atualizem e priorizem leads com resumo, intencao, urgencia,
objeccoes, sugestao de resposta, handoff e controle de SLA.

## Contexto Atual

O repositorio ja possui:

- modulo omnichannel com conversas, mensagens, handoff, AI runs e webchat;
- `omnichannelService`, workspaces internos e portal;
- sincronizacao CRM/omnichannel de base;
- CRM governado por contrato e pronto para owner/equipe;
- automacoes provider-neutral.

O problema e que WhatsApp e CRM ainda parecem modulos relacionados, nao uma
experiencia comercial unificada.

## Escopo

Implementar:

- vinculacao manual e automatica de conversa a lead;
- criacao de lead a partir de conversa sem lead existente;
- deteccao de duplicidade por telefone, email e contato omnichannel;
- painel de conversa dentro do detalhe do lead;
- resumo de conversa e resumo do lead;
- classificacao de intencao, urgencia, sentimento, objeccoes e risco;
- sugestao de resposta e proximos passos;
- handoff com motivo e bloqueio de automacao quando humano assume;
- devolucao controlada para IA;
- alertas de conversa sem resposta;
- SLA de primeiro atendimento e ultima resposta;
- templates aprovados e respostas rapidas no CRM;
- preenchimento de campos do lead a partir da conversa.

Fora desta fase:

- provisionamento de provedor WhatsApp em producao;
- IA treinada por cliente com RAG completo;
- scoring preditivo financeiro;
- Mautic e email marketing.

## Modelo de Produto

O vendedor deve abrir um lead e ver a conversa recente, o resumo da IA e a
proxima resposta sugerida. O gerente deve ver conversas sem resposta, handoffs
pendentes, SLAs vencidos e filas por equipe.

## Modelo de Dados

Novas entidades planejadas:

- `lead_conversation_links`
- `lead_ai_insights`
- `lead_ai_field_suggestions`
- `lead_response_suggestions`
- `lead_sla_events`
- `lead_handoff_locks`
- `crm_quick_replies`
- `crm_message_templates`

Extensoes em entidades existentes:

- `conversations.lead_id` quando a relacao direta for segura;
- `messages.crm_visibility` para ocultar mensagens internas quando necessario;
- `leads.ai_summary`, `leads.intent`, `leads.sentiment`, `leads.urgency`.

## Regras

- Nenhuma conversa pode ser vinculada a lead de outra `crm_instance`.
- Sugestoes de IA sao rascunhos; envio real exige usuario ou automacao
  autorizada.
- Handoff humano pausa automacoes de resposta ate liberacao explicita.
- Opt-out bloqueia envio ativo e fica visivel no CRM.
- Templates respeitam provider, status de aprovacao e canal.
- Logs de IA registram custo, modelo, status e campos atualizados.

## Fluxos

### Criacao automatica de lead

1. Conversa chega pelo omnichannel.
2. Sistema busca lead por telefone/email/contato.
3. Sem match seguro, cria lead em fila configurada.
4. IA resume conversa e sugere campos.
5. Vendedor confirma ou edita os campos sugeridos.

### Handoff

1. IA ou regra identifica necessidade de humano.
2. Conversa entra na fila da equipe.
3. Vendedor assume atendimento.
4. Automacao fica bloqueada enquanto humano esta ativo.
5. Vendedor finaliza ou devolve para IA.

## UI

- Painel de conversa no lead 360.
- Caixa de resposta com sugestao de IA, respostas rapidas e templates.
- Badges de intencao, urgencia, sentimento e SLA.
- Fila de conversas sem resposta dentro da visao Hoje.
- Tela de supervisao para gerente.

## Validacao

Sucesso da fase:

- conversa pode criar lead e vincular a lead existente;
- detalhe do lead mostra conversa, resumo e sugestao;
- handoff bloqueia automacao corretamente;
- SLA aparece no cockpit;
- testes cobrem deduplicacao, permissao, handoff, opt-out e payloads de IA.
