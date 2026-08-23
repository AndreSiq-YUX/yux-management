# Runbook — Mission Supervisor Foundation (Release 1A)

**Classificação:** validação de engenharia de um vertical slice limitado. Esta release não deve ser apresentada como agente autônomo geral.

## Escopo liberado

- Intake de objetivo em linguagem natural e quick-start de Revenue Recovery.
- Snapshot imutável de contexto governado, sem PII bruta no portal.
- Supervisor do Harness limitado ao catálogo publicado, às fontes permitidas e a no máximo três perguntas.
- Compilação determinística, aprovação pelo conteúdo legível e hash secundário de integridade.
- Modos `shadow`, `prepare`, `assisted` e `autonomous`, todos presos a envelope com prazo e orçamento.
- `shadow` é o modo obrigatório do primeiro ensaio; nenhuma mutação de domínio é permitida.

## Configuração e rollout

1. Aplicar as migrations até `0131_mission_supervisor_foundation.sql`.
2. Configurar `YUX_AGENT_RUNTIME_URL`, `YUX_AGENT_RUNTIME_TOKEN`, `OPENROUTER_API_KEY` no Harness e `ACTION_ENGINE_MUTATION_LEASE_SECRET` + `ACTION_ENGINE_TELEMETRY_REDACTION_KEY` no backend/worker.
3. Configurar `MISSION_SUPERVISOR_ENABLED=true` apenas no ambiente de validação.
4. Habilitar `action_engine` no contrato piloto e conceder `action_engine.write` somente aos papéis autorizados.
5. Confirmar `/api/action-engine/operations/health`: planner disponível, catálogo pinado, zero envelopes vencidos e NFR dentro do alvo após haver amostras.

Para interromper novo planejamento sem destruir histórico, definir `MISSION_SUPERVISOR_ENABLED=false` e reiniciar backend/worker. Planos já compilados continuam determinísticos; pausar Missions separadamente se também for necessário impedir execução.

## Aceitação ponta a ponta

1. Admin abre `/missions` ou o workspace do cliente e cria uma intenção genérica.
2. Cliente sem `action_engine.write` consegue visualizar, mas não vê controles de mutação.
3. Mission é qualificada e enviada para planejamento em `shadow`.
4. Se houver esclarecimento, responder e confirmar que nenhum `action_plans` foi criado antes das respostas.
5. Confirmar que as fontes exibidas são apenas títulos/categorias client-safe.
6. Aprovar a descrição legível do plano; o hash é apenas prova secundária.
7. Iniciar e concluir as ações; confirmar zero alterações em CRM, campanhas, automações, e-mail e WhatsApp.
8. Confirmar um `redacted_model_trace` por chamada, manifest/hash em cada plano e evidence chain em cada action run.

Registrar: URL, Mission ID, modelo/perfil, schema hash, pack hash, capability catalog hash, context hash, plan hash, horário, resultado do health e operador.

## SLOs e alertas

- Planejamento p95: até 60 s.
- Execução p95: até 30 s, excluindo waits duráveis e tarefas humanas.
- Disponibilidade do executor: 99,5%.
- Alertas de orçamento: 50%, 80% e 95%; o teto continua bloqueante.
- Retenção: traces redigidos 90 dias, audit manifests 365 dias e payload de reconciliação criptografado 30 dias, salvo legal hold.

## Gatilhos objetivos de rollback

Executar rollback imediato quando ocorrer qualquer item:

- exposição cross-tenant, segredo ou PII não autorizada;
- qualquer efeito não autorizado ou mutação em `shadow`;
- duas janelas consecutivas de 15 minutos fora do SLO;
- regressão de segurança nas golden missions;
- falha de integridade de migration, schema, pack, capability manifest, context hash ou plan hash.

## Rollback

1. Definir `MISSION_SUPERVISOR_ENABLED=false`.
2. Ativar kill switch global ou granular para a capability afetada.
3. Pausar Missions ativas quando a contenção também exigir parar execução.
4. Reconciliar efeitos externos `unknown`; nunca tentar “desenviar” efeitos irreversíveis.
5. Voltar backend, worker, frontend e Harness para a última imagem aprovada.
6. Preservar snapshots, planos, aprovações, traces redigidos, attempts, custos, eventos e evidências.
7. Rodar migrations somente para frente; não apagar tabelas aditivas durante incidente.
