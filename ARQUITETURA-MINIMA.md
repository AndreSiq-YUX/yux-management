# Arquitetura Minima de Estabilizacao

Este documento registra a direcao tecnica minima antes de novas funcionalidades.
Ele nao define a arquitetura final do produto; apenas evita que a estabilizacao
reforce decisoes antigas que ja nao representam o sistema.

## Decisoes Atuais

- O frontend React/Vite continua sendo a interface principal do produto.
- O Supabase e a fonte operacional de dados para CRM, clientes, projetos, leads,
  campanhas, autenticacao e RLS.
- A camada `supabaseService` e a fronteira padrao entre UI e banco. Componentes
  nao devem montar payloads SQL nem conhecer detalhes de snake_case do banco.
- O `apiService` fica como legado temporario para funcionalidades que ainda
  dependem de uma API inexistente ou futura, como importacao/exportacao em lote.
- Novas telas devem consumir contratos em camelCase, tipados e centralizados.
- n8n, agentes IA, scraping, WhatsApp e integracoes de Ads nao devem rodar no
  frontend. Essas partes entram depois como workers, backend dedicado ou
  orquestracoes externas.

## Escopo Desta Estabilizacao

- Fazer o projeto compilar localmente.
- Padronizar contratos entre UI e Supabase.
- Alinhar tipos TypeScript com o schema usado pela UI.
- Criar migration idempotente para estabilizar tabelas centrais.
- Atualizar seed local para refletir o schema estabilizado.

## Fora do Escopo Agora

- Deploy de producao.
- Dominio e configuracao final da Vercel.
- Hardening completo de seguranca/RLS.
- Multi-tenant definitivo.
- Workers, filas, n8n e agentes IA.
- Redesenho visual ou novas funcionalidades.

## Direcao Para Crescimento

Quando o sistema crescer, a arquitetura recomendada e:

`Vercel frontend -> Supabase Auth/DB/RLS -> Backend/Workers para integracoes -> n8n para blueprints e automacoes replicaveis`

Supabase e Vercel seguem validos como base, mas nao devem absorver toda a logica
assincrona, integracoes externas, processamento de IA ou jobs longos.

## Spec e Plano Aprovados

- Spec: `docs/superpowers/specs/2026-05-29-yux-os-platform-design.md`
- Plano: `docs/superpowers/plans/2026-05-29-yux-os-foundation-implementation-plan.md`

A implementacao agora segue a fundacao integrada do YUX OS: primeiro dados,
permissoes, contratos, pacotes, modulos e blueprints; depois navegacao modular;
depois superficies operacionais e portal do cliente.

## Fundacao Modular Incluida

- Tabelas Supabase para organizacoes, membros, roles, permissoes, modulos,
  pacotes, contratos e blueprints.
- Registro TypeScript de modulos e regras puras de permissao/ativacao.
- Navegacao interna e portal derivada de modulos ativos.
- Superficies iniciais para administracao de modulos, blueprints e Portal YUX.

## Primeira Fatia Funcional

A primeira fatia funcional apos a fundacao e o controle de contratos, pacotes e
modulos ativos. O portal do cliente deriva sua navegacao, cards e acesso direto
as rotas de modulo do contrato ativo, evitando menus hardcoded e evitando
exposicao de modulos nao contratados.
