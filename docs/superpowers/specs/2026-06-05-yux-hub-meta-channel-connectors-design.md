# YUX Hub Meta Channel Connectors Design

## Contexto

O YUX Hub ja possui uma base omnichannel multi-tenant com `channel_connections`,
inbox interno, portal omnichannel, simulador, webchat, CRM sync, handoff,
mensagens, outbound runs e uma trilha tecnica inicial para WhatsApp oficial via
Meta Cloud API.

O WhatsApp atual ja reconhece payload oficial `whatsapp_business_account`,
usa `phone_number_id`, valida assinatura `x-hub-signature-256`, envia texto via
Graph API e mantem fallback generico por `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`.
Ainda falta transformar isso em uma experiencia comercial onde cada cliente
conecta seus proprios numeros, contas Instagram e paginas Facebook com pouca
friccao.

Esta fase implanta a abordagem aprovada: **Meta App da YUX como integracao
central**, com clientes autorizando seus proprios ativos por Embedded Signup e
Meta Login. Os clientes continuam donos de WABAs, numeros, paginas e contas
Instagram. A YUX Hub recebe permissao operacional para os canais contratados.

## Objetivos

- Implantar WhatsApp Embedded Signup por cliente usando API oficial Meta.
- Permitir multiplos numeros WhatsApp por cliente.
- Implantar gestao de numeros WhatsApp conectados.
- Implantar Instagram Direct por Meta Login/API oficial.
- Implantar Facebook Messenger por paginas conectadas.
- Criar tela unica "Canais conectados" no portal do cliente.
- Criar visao global "Canais conectados" no Admin YUX Hub.
- Adicionar health check, reautenticacao, desconexao e auditoria.
- Manter fallback generico via `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL` quando a
  YUX quiser intermediar um canal por n8n.

## Fora de Escopo

- API nao oficial, automacao por browser, Baileys, Evolution API, Z-API ou
  qualquer trilha que viole o modelo oficial Meta.
- Campanhas em massa por WhatsApp, Instagram ou Messenger.
- Gerenciamento completo de templates WhatsApp alem do minimo necessario para
  diagnosticar permissao e saude do canal.
- Billing automatico por conversas Meta.
- Tornar o n8n obrigatorio para WhatsApp oficial.

## Modelo de Produto

O cliente acessa uma area de canais conectados dentro do portal e ve cards para:

- WhatsApp;
- Instagram Direct;
- Facebook Messenger;
- Webchat, como canal proprio ja existente.

Cada card mostra status, conta conectada, ultimo evento, permissoes, acoes e
limites contratados. Quando o modulo `whatsapp_ai` ou o futuro modulo de canais
nao estiver contratado, o cliente nao ve o fluxo de conexao.

O Admin YUX Hub ve todos os clientes, canais e estados operacionais em uma
tela consolidada, com filtros por cliente, canal, status, token state, reauth,
falha de webhook, falha outbound e data do ultimo evento.

## Modelo de Integracao Meta

### Configuracao Global YUX

A YUX configura uma unica integracao Meta global:

- Meta App ID;
- Meta App secret reference;
- Graph API version;
- Embedded Signup configuration ID;
- webhook verify token reference;
- webhook app secret reference;
- escopos aprovados;
- App Review status;
- callback URLs de OAuth e webhook.

Valores secretos ficam apenas em secrets server-side. O banco armazena
referencias seguras e metadados operacionais.

### WhatsApp Embedded Signup

O portal dispara o Embedded Signup usando o Meta App da YUX. Ao final, o frontend
captura dados de sessao como WABA e phone number id e envia para uma Edge
Function autenticada. A Edge Function troca o codigo retornado por token em uma
chamada server-to-server, busca os ativos autorizados e cria ou atualiza
`channel_connections`.

Cada numero WhatsApp vira uma conexao:

- `channel = 'whatsapp'`;
- `adapter_key = 'meta-whatsapp'`;
- `provider_account_id = WABA ID`;
- `phone_number_id = Phone Number ID`;
- `provider_verify_state = 'verified'` quando a verificacao de webhook/ativo
  estiver valida;
- `token_state = 'connected'` quando o token estiver funcional;
- `protected_metadata_references` aponta para o secret/token seguro.

### Instagram Direct

O portal usa Meta Login para autorizar paginas e contas Instagram profissionais
vinculadas. A Edge Function lista os ativos elegiveis, grava a conexao
selecionada e subscreve webhooks relevantes.

Cada conta Instagram conectada vira uma conexao:

- `channel = 'instagram'`;
- `adapter_key = 'meta-instagram'`;
- `provider_account_id = Instagram business account id`;
- metadados publicos seguros com page id, username e permissao;
- token state e webhook state independentes.

### Facebook Messenger

O portal usa Meta Login para autorizar paginas Facebook. O cliente escolhe uma
ou mais paginas elegiveis. Cada pagina conectada vira uma conexao de Messenger.

O schema atual aceita `whatsapp`, `instagram`, `email` e `webchat`. Esta fase
deve expandir o enum/check para incluir `messenger` ou `facebook_messenger`,
preferencialmente `messenger` por clareza operacional.

Cada pagina conectada vira:

- `channel = 'messenger'`;
- `adapter_key = 'meta-messenger'`;
- `provider_account_id = Page ID`;
- metadados publicos seguros com page name e username;
- token state e webhook state independentes.

## Dados

### Extensao de `channel_connections`

Manter `channel_connections` como tabela canonica de canais operacionais, mas
adicionar campos e tabelas auxiliares onde necessario:

- `provider_asset_id`: id do ativo especifico, quando diferente de
  `provider_account_id`;
- `provider_business_id`: Business Portfolio ID, quando disponivel;
- `provider_display_name`: nome visivel do numero, pagina ou conta;
- `provider_username`: username Instagram/Facebook, quando existir;
- `provider_scopes`: lista segura de permissoes concedidas;
- `connected_by_user_id`;
- `connected_at`;
- `disconnected_at`;
- `reauth_required_at`;
- `health_checked_at`;
- `health_status`;
- `health_summary`;
- `protected_metadata_references` para tokens e segredos.

Dados sensiveis continuam fora de colunas publicas. Tokens nao devem aparecer
no frontend, no payload de portal, em logs ou em auditoria bruta.

### Novas Tabelas

`meta_oauth_sessions` registra tentativas de conexao:

- organizacao;
- usuario;
- canal solicitado;
- status;
- state hash;
- code verifier hash quando aplicavel;
- resultado sanitizado;
- erro protegido;
- timestamps.

`channel_connection_audit_events` registra:

- conectado;
- reconectado;
- desconectado;
- falha de token;
- falha de webhook;
- mudanca de status;
- teste de envio;
- acao manual do Admin YUX.

`channel_health_checks` registra historico operacional:

- connection id;
- canal;
- status anterior;
- status novo;
- tipo de checagem;
- resposta sanitizada;
- erro protegido;
- timestamps.

## Edge Functions

Criar funcoes server-side para isolar OAuth, secrets e Graph API:

- `start-meta-channel-connect`: cria sessao OAuth/Embedded Signup e devolve
  parametros publicos seguros.
- `complete-meta-channel-connect`: recebe codigo/dados do fluxo, troca token,
  lista ativos e grava conexoes.
- `list-meta-channel-assets`: lista ativos autorizados para uma sessao ou token
  valido.
- `disconnect-meta-channel`: desativa conexao, limpa referencias operacionais e
  registra auditoria.
- `refresh-meta-channel-health`: checa token, webhook, permissao e ultimo sync.
- `send-meta-channel-test`: envia ou simula mensagem de teste quando permitido.

Funcoes de inbound/outbound existentes devem ser estendidas:

- `receive-channel-event` deve normalizar WhatsApp, Instagram e Messenger;
- `dispatch-outbound-message` deve enviar pelo adapter oficial quando existir;
- quando o adapter oficial nao estiver configurado ou a conexao estiver marcada
  para intermediacao, usar `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`.

## UI Portal Cliente

Criar `ConnectedChannelsPage` ou equivalente em `/portal/omnichannel/channels`.

Estados esperados:

- nao contratado;
- nao conectado;
- conectando;
- conectado;
- requer revisao;
- precisa reconectar;
- falhou;
- desconectado.

Acoes esperadas:

- conectar WhatsApp;
- conectar Instagram;
- conectar Facebook Messenger;
- ver numeros/contas/paginas conectadas;
- definir canal ativo/inativo;
- reconectar;
- desconectar;
- testar recebimento/envio;
- abrir logs seguros.

O texto da UI deve ser operacional e direto, sem expor detalhes tecnicos demais
para o cliente.

## UI Admin YUX Hub

Criar tela global em `/admin/channels` ou expandir `/admin/integrations` com
uma secao dedicada a canais Meta. Recomenda-se rota propria `/admin/channels`
porque a operacao por cliente sera recorrente.

O Admin YUX deve ver:

- cliente;
- contrato/modulo;
- canal;
- numero/conta/pagina;
- provider account;
- status;
- token state;
- webhook state;
- ultimo evento;
- ultima checagem;
- erros protegidos;
- acoes de reconectar, pausar, desconectar, testar e auditar.

## Health e Estados

Estados canonicos:

- `not_configured`: canal sem conexao;
- `pending`: fluxo iniciado ou aguardando validacao;
- `connected`: token e webhook funcionais;
- `stale`: sem evento/checagem recente;
- `needs_reauth`: token ou permissao precisa ser renovado;
- `failed`: falha operacional persistente;
- `disabled`: conexao pausada manualmente;
- `disconnected`: desconectado pelo cliente ou pela YUX.

Regras iniciais:

- 401/403 de provider marca `needs_reauth`;
- falha de assinatura/webhook marca `failed` ou `pending`, conforme fase;
- ausencia prolongada de health check marca `stale`;
- desconexao manual remove uso operacional mas preserva auditoria.

## Seguranca

- Usar `state` anti-CSRF para todo OAuth/Embedded Signup.
- Validar organizacao e permissao antes de completar conexao.
- Nunca aceitar `organization_id` do cliente sem conferir membership/contrato.
- Nunca armazenar access token em coluna exposta ao frontend.
- Sanitizar respostas e erros da Meta antes de persistir.
- RLS deve permitir cliente ver apenas suas conexoes e logs seguros.
- Admin YUX pode ver todas as conexoes, mas nao tokens reais.
- Webhooks publicos continuam com validacao de assinatura e idempotencia.

## Auditoria

Toda acao de conexao deve gerar evento:

- usuario;
- organizacao;
- canal;
- connection id;
- acao;
- antes/depois seguro;
- erro protegido;
- origem: portal, Admin YUX ou health job.

Auditoria deve ser suficiente para responder: quem conectou, quando, qual ativo
foi autorizado, quando falhou, quem desconectou e se houve reauth.

## Rollout

1. Base Meta global e schema de canais conectados.
2. WhatsApp Embedded Signup e gestao de numeros.
3. Tela "Canais conectados" no portal.
4. Admin YUX Hub de canais.
5. Instagram Direct.
6. Facebook Messenger.
7. Health checks, auditoria e jobs de reauth/stale.
8. Hardening final, probes e documentacao operacional.

## Testes e Validacao

- Testes unitarios para mapeamento de conexoes, estados e sanitizacao.
- Testes Deno para troca de payload Meta, normalizacao de webhooks e envio.
- Probes SQL para RLS, isolamento multi-tenant, auditoria e ausencia de tokens
  em tabelas expostas.
- Testes de UI para portal e Admin YUX.
- Smoke local das rotas.
- Validacao manual contra app Meta em modo desenvolvimento antes de producao.

Antes da implementacao, revisar a documentacao oficial Meta atual para os
detalhes finais de Embedded Signup, Meta Login, Instagram Messaging API,
Messenger Platform, App Review, permissoes e Graph API version vigente.
