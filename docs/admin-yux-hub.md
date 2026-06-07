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
ultima verificacao, erro e referencia segura.

Credenciais reais nao devem aparecer no frontend nem no banco. O frontend salva
apenas `secret_reference` e metadados operacionais. O valor real da credencial
deve existir como secret server-side no runtime das Edge Functions, Vercel ou
ambiente equivalente.

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
- SMTP2GO (`SMTP2GO_API_KEY` e `SMTP2GO_WEBHOOK_SECRET`) como infraestrutura
  compartilhada de email;
- Jina AI (`JINA_API_KEY`) como servico interno para Reader, Search e Grounding
  controlados do Marketing Studio.

## Canais Conectados

`/admin/channels` centraliza a governanca de canais Meta por cliente. O Admin
YUX ve cliente, canal, ativo conectado, status, token state, webhook state e
ultimo evento.

Clientes conectam canais no portal em `/portal/omnichannel/channels`. A YUX
pode acompanhar saude, reautenticacao e desconexao sem acessar tokens reais.

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

- provedor global SMTP2GO em `platform_provider_connections`;
- referencia segura da API key, normalmente `SMTP2GO_API_KEY`;
- referencia do webhook secret, normalmente `SMTP2GO_WEBHOOK_SECRET`, dentro da
  configuracao publica do provedor global;
- conexao SMTP2GO por cliente em `email_provider_connections`;
- remetente padrao por cliente;
- limite diario de envios por cliente;
- metadados seguros para dominio, subconta ou observacoes operacionais.

O valor real de `SMTP2GO_API_KEY` e `SMTP2GO_WEBHOOK_SECRET` deve ser cadastrado
como secret server-side. A Edge Function `send-email` le `SMTP2GO_API_KEY` ou a
secret apontada por `token_reference`. A Edge Function `smtp2go-webhook` valida
`SMTP2GO_WEBHOOK_SECRET`.

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
