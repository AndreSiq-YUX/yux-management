# YUX CRM - Fase 5 - Marketing Automation Avancado e Mautic

## Objetivo

Adicionar marketing automation avancado como modulo opcional, sem tornar Mautic
dependencia do CRM nativo. O YUX Hub continua sendo a interface do cliente; o
Mautic, quando contratado, funciona como motor invisivel e dedicado por cliente.

## Contexto Atual

O repositorio ja possui:

- CRM nativo com follow-up e automacoes provider-neutral;
- Flow Builder Lite;
- campanhas e landing pages;
- omnichannel;
- contratos e modulos por cliente.

O problema e que nutricao avancada por email, segmentos dinamicos e campanhas de
marketing automation exigem motor especializado. Isso nao deve contaminar o CRM
principal nem criar risco de isolamento entre clientes.

## Decisao

Mautic nao e CRM principal. Ele sera modulo opcional de "Marketing Automation
Avancado" para clientes que precisam de nutricao, email, segmentos e campanhas
mais robustas.

Modelo recomendado:

- uma instancia Mautic dedicada por cliente quando contratado;
- credenciais criptografadas no YUX Hub;
- sincronizacao via API;
- cliente opera tudo pelo YUX Hub;
- logs e falhas ficam visiveis para YUX admin.

## Escopo

Implementar:

- cadastro de conexao de provedor marketing;
- entidade de instancia Mautic por cliente/contrato;
- sync de contatos CRM para Mautic;
- mapeamento de segmentos;
- mapeamento de campanhas;
- logs de eventos e sync;
- opt-out e preferencias de comunicacao;
- tela YUX admin de conexoes;
- tela portal com status, listas, segmentos e campanhas;
- acoes de sincronizar, pausar e reprocessar.

Fora desta fase:

- provisionamento automatico de servidor Mautic;
- edicao completa de emails dentro do YUX Hub;
- multi-cliente em uma unica instancia Mautic compartilhada;
- substituir Flow Builder Lite.

## Modelo de Dados

Novas entidades planejadas:

- `marketing_provider_connections`
- `mautic_instances`
- `mautic_contact_mappings`
- `mautic_segment_mappings`
- `mautic_campaign_mappings`
- `marketing_sync_runs`
- `marketing_event_logs`
- `communication_preferences`

## Regras

- Uma conexao Mautic pertence a uma `crm_instance` ou contrato.
- Credenciais nunca aparecem no frontend.
- Sync respeita opt-out e consentimento LGPD.
- Falhas de sync nao bloqueiam operacao do CRM nativo.
- Cliente nao ve credenciais nem URLs administrativas sensiveis.
- Cada cliente usa instancia dedicada para reduzir risco de vazamento.

## Fluxos

### Configuracao

1. Cliente contrata marketing automation avancado.
2. YUX provisiona ou informa instancia dedicada.
3. Admin YUX cadastra credenciais no Hub.
4. Sistema testa conexao.
5. Cliente passa a ver status e metricas no portal.

### Sincronizacao

1. Lead criado ou atualizado no CRM.
2. Worker cria/atualiza contato no Mautic.
3. Segmentos sao aplicados conforme regras.
4. Eventos voltam para timeline e relatorios.
5. Falhas geram logs e retry.

## UI

- Admin YUX: conexoes, credenciais, status, sync runs e erros.
- Portal: contatos sincronizados, segmentos, campanhas, status e metricas.
- CRM lead: historico de nutricao e preferencias de comunicacao.

## Validacao

Sucesso da fase:

- CRM funciona sem Mautic;
- cliente com modulo contratado sincroniza contatos;
- opt-out bloqueia sync/ativacao;
- falhas aparecem em logs e podem ser reprocessadas;
- testes cobrem payloads, permissoes, sanitizacao e retries.
