# Missões: entrada por conversa e limites zero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Iniciar pedidos por conversa natural com o Harness e preservar os limites confirmados, inclusive zero.

**Architecture:** A disponibilidade continua sendo resolvida pelo backend, com autorização, módulos, flag e allowlist. Conta fora da liberação recebe um estado explicativo; nunca é desviada silenciosamente ao intake antigo. A conversão do briefing mantém zero no envelope, parâmetros e orçamento, sem aumentar um teto confirmado.

**Tech Stack:** React, TypeScript, Fastify, PostgreSQL, Vitest e navegador local com provedores simulados.

**Spec:** Requisitos do usuário neste chat e `docs/superpowers/specs/2026-08-31-yux-conversational-mission-harness-integration-design.md`.

## Global Constraints

- Preservar isolamento entre organizações, módulos contratados, permissões e aprovações antes dos efeitos.
- Conhecimento estratégico e funcional comum; realidade e estratégia da empresa isoladas por organização.
- Não chamar provedores pagos. Publicar código não autoriza deploy nem piloto pago.
- Não alterar a frente concorrente de Radar ou Projetos.
- Não alterar migrations já existentes ou versões/hashes de packs publicados.

## Review Focus

- Conta habilitada para Action Engine, mas fora da allowlist: explicar a indisponibilidade do chat sem apresentar o formulário.
- Frontend novo com backend antigo retornando `mode=form`: não reintroduzir a troca silenciosa.
- Briefing com custo, horas e contatos zero: conservar todos os zeros na persistência.
- Limite inválido ou negativo: rejeitar antes de criar missão; não substituir por orçamento maior.
- Conversa estratégica sem mídia paga: permitir conversar sem escolher pack, verba ou execução; não converter automaticamente em campanha paga.

### Task 1: Entrada conversacional e disponibilidade explícita

**Files:** `backend/src/modules/workspace/context.ts`, `backend/tests/workspace-context.test.ts`, `frontend/src/components/action-engine/MissionsWorkspace.tsx`, `frontend/src/components/action-engine/MissionsWorkspace.test.tsx`.

**Interfaces:** Consome `WorkspaceContextV1.missionCreation`; mantém schema compatível e os motivos existentes. Produz `conversation` ou `unavailable` para novos contextos; aceita `form` antigo como indisponibilidade explicada.

- [x] Atualizar a matriz de testes: conta fora da allowlist e flag desligada nunca retornam `form`; membro sem escrita e outro tenant continuam bloqueados.
- [x] Testar contexto legado no frontend, conversa livre sem formulário e preservação do texto em falha.
- [x] Observar falhas, implementar e executar as duas suítes.

### Task 2: Zero é um limite válido e não pode ser ampliado

**Files:** `backend/src/modules/action-engine/mission-conversations.ts`, `backend/tests/mission-conversation-conversion.test.ts`, `backend/src/modules/action-engine/readiness.ts`, `backend/tests/action-engine-readiness.test.ts`, `frontend/src/components/action-engine/MissionIntake.tsx`, `frontend/src/components/action-engine/MissionIntake.test.tsx`, `backend/src/modules/action-engine/routes.ts`.

**Interfaces:** `confirmMissionConversationBrief` preserva limites não negativos. Campos ausentes de custo/horas assumem zero; valores presentes inválidos geram erro de domínio. Packs pagos continuam exigindo requisitos próprios e aprovação.

- [x] Reproduzir a substituição de zero por 1000/8 e a perda de `maxExternalContacts=0`; afirmar parâmetros, envelope e orçamento inseridos.
- [x] Testar limites inválidos, validade de prontidão com zero e o intake legado com zero/negativo.
- [x] Observar falhas e implementar validadores sem fallback para valores inválidos.
- [x] Manter seleção de pack restrita às funcionalidades implementadas; traduzir a rejeição do intake em mensagem útil, sem classificar campanha genérica como mídia paga.
- [x] Executar testes de conversão, prontidão, limites e rotas.

### Task 3: Verificação integrada e preparação operacional

**Files:** `docs/runbooks/mission-conversation-rollout.md`, `backend/.env.example`, configurações obsoletas do build do frontend se comprovadamente sem consumidor.

**Interfaces:** O runbook descreve a autoridade real da disponibilidade no backend e liberação específica da organização; não confunde liberação do chat com autorização de consumo pago ou execução.

- [x] Remover configuração obsoleta do modo de formulário no build e exemplo do limite de seis mensagens já removido.
- [x] Testar no navegador local: Missões → conversar → mensagem livre → resposta simulada, sem formulário/pack/verba; conta não liberada → mensagem explícita; viewport desktop atual.
- [x] Executar suítes completas backend/frontend, type-check, build e revisão do diff. Provedores sempre simulados.
- [x] Registrar evidências fora do repositório e deixar mudança operacional pronta: preservar allowlist existente e adicionar somente `972e8163-81b7-4e3f-b964-777110b660b8` em API e worker. Aplicação em produção depende de autorização de deploy.

## Resultado e operação pendente

Implementação revisada sem achados críticos ou importantes. Backend: 1.588 testes aprovados; frontend: 1.261; integração com PostgreSQL: 2. Builds aprovados. Navegador local confirmou mensagem e resposta simulada persistidas após recarregar. Nenhuma chamada paga ou alteração em produção. A verificação global de lint aponta um aviso herdado de RadarResearchAttention.tsx no commit-base cf64a90; o arquivo não foi alterado por esta correção.

- [ ] Após autorização de implantação: integrar e publicar esta correção, preservar as organizações já liberadas e acrescentar somente a conta escolhida à allowlist da API e do worker; conferir contexto e saúde sem enviar mensagens pagas.
