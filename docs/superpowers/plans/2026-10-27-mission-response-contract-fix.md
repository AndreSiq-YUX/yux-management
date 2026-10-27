# Respostas da conversa de Missões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Impedir que uma resposta incompleta seja confundida com um objeto interno e reforçar o contrato da resposta da conversa sem aumentar consumo, limites ou permissões.

**Architecture:** O formato de saída da conversa é uma instrução confiável do sistema, separada dos dados recuperados. A leitura JSON aceita somente o primeiro objeto raiz completo. Saídas truncadas ou inválidas recebem diagnóstico específico e continuam recuperáveis, sem execução, sem inventar resposta e sem retry pago automático.

**Tech Stack:** Python/Pydantic, Harness, Fastify/TypeScript, React e testes com provedores simulados.

**Spec:** Solicitação e erro do usuário neste chat; contrato conversacional existente em `docs/superpowers/specs/2026-08-31-yux-conversational-mission-harness-integration-design.md`.

## Global Constraints

- Preservar mensagem salva, histórico, fontes verificadas, isolamento por conta e aprovações.
- Não alterar modelo, credenciais, limites de saída ou orçamento; não realizar chamadas pagas nem retries automáticos adicionais.
- Não aceitar um objeto interno de JSON incompleto como resposta raiz.
- Não descartar campos desconhecidos nem inventar um texto de resposta para fazer validação passar.
- Preservar interfaces públicas; não modificar Radar, Projetos ou migrations.

## Evidência inicial

- Conversa `d4c634fc-15c3-460b-82c3-3c58c85bb346`, versão 3, bloqueada com mensagem do usuário preservada.
- Harness: HTTP 422, `response_validation_failed`, ausência de `reply` e campos extras `primaryObjective`, `initialAudience`, `possibleExpansion`, `desiredYuxScope`, `operationalBoundary`.
- A leitura JSON atual procura objetos internos quando o objeto externo não é válido; os nomes encontrados são compatíveis com esse defeito. O conteúdo bruto e o motivo de término daquela chamada não foram preservados, portanto o truncamento específico ainda não está comprovado.
- Rota atual: teto de 2.200 tokens. Manter o teto e orientar resposta compacta e progressiva, sem duplicar uma estratégia longa em múltiplos campos.

## Review Focus

- Objeto externo incompleto com objeto interno válido: recusar, sem produzir briefing/aprovação.
- Raiz completa seguida de explicação ou rascunho repetido: manter compatibilidade com o primeiro objeto completo.
- Contrato de conversa prevalece como formato sobre prompts genéricos; contexto e usuário continuam dados não confiáveis.
- Resposta estratégica longa: instruções de concisão e fechamento do JSON respeitam teto atual; não aumentam limites nem chamam reparador pago.
- Erro do modelo: mostrar motivo legível e manter reprocessamento explícito da mensagem existente, sem duplicação.

### Task 1: Leitura da resposta e contrato confiável no Harness

**Files:** `workers/marketing-studio-agent-runtime/yux_agent_runtime/contracts.py`, `workflow.py`, `harness.py`, `mission_conversation.py`, testes correspondentes.

**Interfaces:** `parse_json_object(content)` continua retornando objeto ou `AgentContractError`; `_execute_harness_agent` aceita contrato de formato opcional definido pelo código, sem derivá-lo de entradas do cliente. O formato atual da resposta permanece inalterado.

- [x] Escrever e observar testes RED para objeto externo incompleto, array externo inválido e contrato confiável na mensagem de sistema enviada ao provedor simulado.
- [x] Implementar leitura da primeira raiz e contrato de formato com resposta compacta; recusar término por limite antes de interpretar JSON parcial.
- [x] Testar que saídas sem `reply`, campos extras, fontes falsas e ações fora das permissões continuam sendo recusadas.
- [x] Executar a suíte completa do runtime e registrar resultado, sem provedores reais.

### Task 2: Diagnóstico legível e validação integrada

**Files:** `backend/src/lib/agent-runtime-client.ts`, `backend/src/jobs/handlers/action-engine.ts`, `frontend/src/components/action-engine/MissionConversationThread.tsx`, testes e runbook de conversa.

**Interfaces:** Classificação usa códigos seguros de erro, sem repassar resposta bruta, modelos, rotas ou conteúdo técnico ao cliente. Não ampliar retry nem alterar o endpoint de reprocessamento.

- [x] Escrever testes RED para retorno inválido/incompleto e mensagem correspondente na interface.
- [x] Preservar código seguro de diagnóstico do runtime, classificar a falha e orientar nova tentativa explícita sem reenviar/duplicar a mensagem.
- [x] Executar testes, builds, revisão do diff e registrar evidências fora do repositório.
- [x] Preparar publicação/implantação, preservando configuração existente. Uma prova com o provedor real depende de autorização específica de consumo.

## Resultado da verificação

Runtime: 430 testes aprovados, 7 ignorados; backend: 1.594 aprovados, 126 ignorados; frontend: 1.263 aprovados. Builds backend e frontend aprovados. Navegador local confirmou falha explicada, uma tentativa explícita, uma mensagem e uma resposta persistidas, sem erro de aplicação. A revisão encontrou mais um caso de array prefixado e um erro de classificação de saída vazia interrompida; ambos foram reproduzidos em RED e corrigidos, com suíte runtime completa novamente aprovada.

- [ ] Prova real com a mensagem já salva: depende de autorização de uma tentativa de consumo nas rotas atuais. Nenhum modelo ou limite será alterado.
