# Admin YUX Hub

## Finalidade

O Admin YUX Hub e a area interna onde a YUX administra a plataforma como produto
SaaS consultivo. Ele centraliza clientes, contratos, pacotes, modulos, limites,
integracoes, provedores, saude operacional e auditoria.

Clientes nao acessam esta area. Clientes continuam acessando apenas o portal e
os modulos contratados.

## Acesso

O acesso ao Admin YUX Hub fica restrito a usuarios internos YUX. A camada de
dados nova usa RLS com `private.is_platform_admin()` e grants explicitos para a
Data API.

Perfis esperados:

- Admin YUX: configura plataforma, contratos, limites, integracoes e auditoria.
- Operador YUX: consulta operacao e saude, conforme permissoes futuras.
- Comercial YUX: consulta uso, modulos e oportunidades de expansao.

## Clientes, Contratos, Pacotes e Modulos

O contrato e a base da disponibilidade operacional. Um modulo so deve ser
considerado disponivel para o cliente quando estiver habilitado por contrato,
pacote ou override administrativo.

Areas relacionadas:

- `/admin`: painel central;
- `/contracts`: contratos, modulos contratados e limites;
- `/packages`: pacotes comerciais;
- `/modules`: registro modular;
- `/admin/modules-governance`: visao por modulo.

As telas `/packages` e `/modules` agora possuem operacao administrativa:

- `/modules` permite criar ou atualizar modulos, rotas internas, rotas do
  portal, permissoes exigidas e se o modulo e base ou opcional;
- `/packages` permite criar ou atualizar pacotes comerciais e vincular os
  modulos que entram na oferta;
- contratos continuam sendo o ponto onde pacote e modulos se tornam
  disponibilidade real para cada cliente.

## Limites

Limites sao registrados por cliente, contrato e modulo em
`client_module_limits`. Eles representam quotas e regras operacionais como:

- assentos de CRM;
- execucoes de automacao;
- envios de email;
- uso de IA;
- tickets de suporte;
- recursos financeiros.

O painel de contratos ja exibe a entrada "Limites" por modulo contratado. A
primeira versao e de leitura; edicao profunda entra em evolucoes futuras.

## Integracoes

A area `/admin/integrations` configura provedores globais da plataforma. Ela
lista e edita tipo, ambiente, status, fallback externo, configuracao publica,
ultima verificacao, erro e identificador da credencial gerenciada.

Credenciais reais nao devem aparecer de volta no frontend. No runtime VPS, a
fonte operacional deve ser o Admin YUX Hub: o operador cadastra a credencial no
painel, o backend valida, criptografa e armazena server-side. `secret_reference`
e `token_reference` continuam existindo como identificadores internos/legados,
nao como instrucao para configurar variavel de ambiente fora do Admin.

Tipos previstos:

- LLM/IA;
- email;
- WhatsApp;
- Ads;
- webhooks;
- automacao;
- storage;
- database;
- internal service.

Provedores globais ja seedados:

- OpenRouter (`OPENROUTER_API_KEY`) como roteador LLM principal;
- OpenAI direto (`OPENAI_API_KEY`) como fallback externo de LLM;
- SMTP2GO como infraestrutura compartilhada de email, com conta master
  cadastrada no Admin, provisionamento de subcontas por cliente e webhooks
  gerenciados pelo backend VPS;
- Jina AI (`JINA_API_KEY`) como servico interno para Reader, Search e Grounding
  controlados do Marketing Studio.
- Meta Marketing/Social e Google Marketing como provedores nativos do
  Marketing Studio, com OAuth por cliente/contrato e tokens criptografados em
  `provider_integration_secrets`.

## Canais Conectados

`/admin/channels` centraliza a governanca de canais Meta por cliente. O Admin
YUX ve cliente, canal, ativo conectado, status, token state, webhook state e
ultimo evento.

Clientes conectam canais no portal em `/portal/omnichannel/channels`. A YUX
pode acompanhar saude, reautenticacao e desconexao sem acessar tokens reais.

## Marketing Studio: Meta e Google

As integracoes nativas do Marketing Studio usam OAuth multi-tenant. Cada cliente
autoriza suas proprias paginas, contas de Instagram Business, perfis Google
Business Profile, contas Meta Ads ou customers Google Ads.

Secrets server-side exigidos:

- `PROVIDER_SECRET_ENCRYPTION_KEY_B64`: chave AES-GCM de 32 bytes em base64;
- `META_APP_ID`, `META_APP_SECRET`, `META_MARKETING_OAUTH_REDIRECT_URI`;
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_MARKETING_OAUTH_REDIRECT_URI`;
- `GOOGLE_ADS_DEVELOPER_TOKEN`;
- opcionais: `META_GRAPH_VERSION`, `GOOGLE_ADS_API_VERSION`,
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

O frontend nunca recebe tokens reais. Ele exibe apenas status operacional,
asset/account conectado, `needs_reauth` e se existe credencial configurada.
Tokens de acesso e refresh ficam criptografados e acessiveis somente pelo
backend server-side autorizado.

## SMTP2GO

A area `/admin/email` trata SMTP2GO como infraestrutura compartilhada de email do
YUX Hub.

Ela resume:

- conexoes master;
- subcontas;
- enviados no dia;
- falhas no dia;
- suppressions.

Configuracao disponivel:

- provedor global SMTP2GO em `platform_provider_connections`, representando a
  conta master SMTP2GO cadastrada pelo Admin;
- credencial master SMTP2GO cadastrada no Admin, validada e criptografada pelo
  backend VPS;
- segredo de webhook gerado/armazenado pelo backend e associado a configuracao
  publica do provedor global;
- conexao SMTP2GO por cliente em `email_provider_connections`;
- subconta SMTP2GO por cliente em `smtp2go_subaccounts`;
- remetente padrao por cliente;
- limite diario de envios por cliente;
- metadados seguros para dominio, subconta ou observacoes operacionais.

Fluxo operacional correto:

- Admin cadastra a API key master SMTP2GO no painel;
- backend valida permissoes de envio, subcontas, dominios/remetentes, webhooks,
  suppressions, estatisticas e atividade;
- backend cria/vincula subcontas automaticamente para clientes habilitados;
- Admin configura dominio/remetente e acompanha verificacao;
- webhooks SMTP2GO apontam para rota do backend VPS e atualizam eventos,
  suppressions e contadores locais.

O fluxo antigo baseado em Supabase Edge Functions `send-email` e
`smtp2go-webhook`, variaveis `SMTP2GO_API_KEY`/`SMTP2GO_WEBHOOK_SECRET` como
configuracao primaria, ou criacao manual de subcontas por cliente foi
substituido pela arquitetura VPS/Admin.

## IA/LLM

A area `/admin/ai` controla a governanca operacional de IA.

Ela lista e edita provedores globais com `provider_type = llm` e organiza:

- modelos globais;
- uso por modulo;
- overrides por cliente;
- custos e falhas;
- aviso de credenciais server-side.

Modelo operacional atual:

- OpenRouter e o provedor principal de roteamento LLM;
- OpenRouter usa `OPENROUTER_API_KEY` como referencia segura;
- a configuracao publica define `primaryModel`, `fallbackModels` e
  `providerRouting.allowFallbacks`;
- OpenAI direto e o fallback externo aprovado quando o OpenRouter inteiro falha;
- OpenAI direto usa `OPENAI_API_KEY` como referencia segura.

Credenciais, API keys e segredos continuam fora do frontend.

## Jina AI

A area `/admin/integrations` tambem possui o provedor global Jina AI com
`provider_type = internal_service` e `provider_key = jina_ai`.

Configuracao disponivel:

- referencia segura da API key, normalmente `JINA_API_KEY`;
- endpoint base API `https://api.jina.ai/v1`;
- endpoint Reader `https://r.jina.ai`;
- endpoint Search `https://s.jina.ai`;
- ferramentas operacionais `jina_reader`, `jina_search` e `jina_grounding`.

O Marketing Studio usa esse provedor para Radar, leitura limpa de URLs, busca e
grounding sob demanda. O valor real de `JINA_API_KEY` deve ser cadastrado como
secret server-side.

## Governanca por Modulo

A area `/admin/modules-governance` responde quais modulos possuem disponibilidade,
contratos ativos, limites configurados e uso registrado.

Modulos acompanhados na primeira versao:

- CRM;
- Automacoes;
- Financeiro;
- Suporte;
- Email;
- IA.

## Saude e Auditoria

A area `/admin/health` consolida:

- provedores com falha;
- limites em atencao, excedidos ou bloqueados;
- eventos recentes de auditoria;
- clientes impactados por indicadores operacionais;
- falhas de email e IA.

Eventos administrativos ficam em `platform_admin_audit_events`.

## Implementado

- Sidebar agrupada por categoria.
- Logo interno atualizado para YUX Hub.
- Painel central `/admin`.
- Rota `/admin/integrations` com edicao segura de provedores globais.
- Rota `/admin/email` com indicadores SMTP2GO, provedor global e configuracao
  SMTP2GO por cliente.
- Rota `/admin/ai` com OpenRouter principal e OpenAI direto como fallback
  externo.
- Rota `/admin/modules-governance`.
- Rota `/admin/health`.
- Schema de limites, provedores, uso e auditoria.
- Servico frontend `adminPlatformService`.
- Mutacoes administrativas para provedores, conexoes SMTP2GO, pacotes e
  modulos.
- Seed de provedores globais OpenRouter, OpenAI direto, SMTP2GO e Jina AI.
- Painel de limites no contrato.
- Documentacao operacional inicial.

## Pendente Para Evolucao

- Testes de conexao de provedores via edge functions.
- Edicao de limites por modulo com auditoria completa.
- Provisionamento automatico de subcontas SMTP2GO.
- Regras de custo e orcamento de IA por cliente.
- Alertas ativos e notificacoes administrativas.
- Billing automatico e checkout self-service.
