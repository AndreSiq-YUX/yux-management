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

A area `/admin/integrations` mostra provedores globais da plataforma. Ela lista
tipo, ambiente, status, ultima verificacao, erro e referencia segura mascarada.

Credenciais reais nao devem aparecer no frontend. O frontend exibe apenas
`secret_reference`, mascarada, e metadados operacionais.

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

## SMTP2GO

A area `/admin/email` trata SMTP2GO como infraestrutura compartilhada de email do
YUX Hub.

Ela resume:

- conexoes master;
- subcontas;
- enviados no dia;
- falhas no dia;
- suppressions.

Esta tela ainda nao edita credenciais, dominios ou subcontas. Ela mostra o
estado operacional inicial para CRM, Automacoes, Suporte, Financeiro,
notificacoes e futuros envios comerciais.

## IA/LLM

A area `/admin/ai` controla a governanca operacional de IA.

Ela lista provedores globais com `provider_type = llm` e organiza:

- modelos globais;
- uso por modulo;
- overrides por cliente;
- custos e falhas;
- aviso de credenciais server-side.

Credenciais, API keys e segredos continuam fora do frontend.

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
- Rota `/admin/integrations`.
- Rota `/admin/email`.
- Rota `/admin/ai`.
- Rota `/admin/modules-governance`.
- Rota `/admin/health`.
- Schema de limites, provedores, uso e auditoria.
- Servico frontend `adminPlatformService`.
- Painel de limites no contrato.
- Documentacao operacional inicial.

## Pendente Para Evolucao

- CRUD completo de provedores e credenciais.
- Edicao de limites por modulo com auditoria completa.
- Testes de conexao de provedores via edge functions.
- Provisionamento automatico de subcontas SMTP2GO.
- Regras de custo e orcamento de IA por cliente.
- Alertas ativos e notificacoes administrativas.
- Billing automatico e checkout self-service.
