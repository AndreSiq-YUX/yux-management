# Runbook — Mission Decision Experience (Release 1B)

**Classificação:** funcionalidade implementada e validada localmente no repositório. Produção permanece pendente de deploy, migrations, configuração, ensaio autenticado e registro dos IDs reais. Release 1B é uma experiência governada de decisão e simulação; ainda não é o agente autônomo geral.

## Escopo e autoridade

- O usuário aprova efeitos, público, custo máximo, premissas e riscos em linguagem de negócio; o hash é prova secundária.
- Parecer externo, inclusive favorável, nunca autoriza execução.
- Mudança de artefato, público, orçamento, provider, capability/recovery class ou revisão produz novo `decisionSubjectHash` e exige nova aprovação.
- Motivos de rejeição são append-only, redigidos e não transferem autoridade para uma nova revisão.
- Alertas de 50/80/95% são únicos por Mission e versão do envelope. O teto continua bloqueante.

## Pré-requisitos de rollout

1. Aplicar migrations até `0135_action_engine_operational_controls.sql`.
2. Manter `MISSION_SUPERVISOR_ENABLED=true` somente no ambiente/piloto aprovado.
3. Configurar, por padrão, `MISSION_DECISIONS_ENABLED=true`, `MISSION_DECISION_NOTIFICATIONS_ENABLED=true`, `MISSION_SIMULATION_REPORTS_ENABLED=true` e `MISSION_DECISION_FEEDBACK_ENABLED=true`.
4. Confirmar `YUX_AGENT_RUNTIME_URL`, token, chave de mutation lease, chave de redaction, Redis/worker, SMTP2GO e consentimento WhatsApp quando o canal for habilitado.
5. Verificar `/api/action-engine/operations/health`: flags esperadas, catálogo pinado, redaction pronta, zero envelopes vencidos e NFRs dentro do alvo quando houver amostra.

## Aceitação autenticada

Em organização descartável, registrar: Mission ID, context snapshot ID/hash, plan ID/revision/hash, approval ID/subject hash, report ID/hash, notification IDs, feedback evidence ID, modelo/prompt/schema/catalog hashes e horários.

1. Criar Mission `shadow`; responder uma única ficha com no máximo três perguntas.
2. Resolver um blocker pelo link permitido e confirmar que outro papel sem permissão não recebe o mesmo link.
3. Gerar o resumo; validar quantidades, contatos atuais/futuros, custo estimado/máximo, premissas e todos os efeitos irreversíveis em desktop e viewport móvel.
4. Compartilhar o relatório; baixar duas vezes a mesma revisão e confirmar hash/PDF idênticos, expiração e ausência de PII/segredos/provider references.
5. Enviar parecer externo `request_changes`; confirmar que a Mission não foi aprovada.
6. Produzir nova revisão; confirmar que o hash antigo recebe `409` e não autoriza a nova revisão.
7. Entregar notificação somente ao destinatário/canais configurados; aprovar o resumo exato como usuário autorizado.
8. Confirmar burn-down, alertas 50/80/95 e pausa de `email.send@1` sem desativar capabilities de CRM.

## SLOs e gatilhos objetivos

- Progresso visível da interface: até 1 segundo.
- Planejamento p95: até 60 segundos.
- Execução p95: até 30 segundos, excluindo waits e tarefas humanas.
- Executor: disponibilidade mínima de 99,5%.
- Rollback imediato: PII/segredo/cross-tenant; mutação em `shadow`; aprovação de revisão diferente; parecer externo concedendo autoridade; efeito após kill switch; falha de redaction; ou duas janelas consecutivas de 15 minutos fora do SLO.

## Contenção granular

As chaves abaixo pausam novas operações sem apagar histórico:

- decisões: `MISSION_DECISIONS_ENABLED=false`;
- notificações: `MISSION_DECISION_NOTIFICATIONS_ENABLED=false`;
- criação/leitura pública de relatórios: `MISSION_SIMULATION_REPORTS_ENABLED=false`;
- novos pareceres: `MISSION_DECISION_FEEDBACK_ENABLED=false`;
- planejamento geral: `MISSION_SUPERVISOR_ENABLED=false`;
- efeitos: kill switch global, por organização, pack ou `capability@version` no cockpit/API.

Após alterar variáveis, reiniciar backend e worker. A revogação dos links já emitidos é explícita:

```sql
UPDATE public.action_simulation_reports
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE revoked_at IS NULL AND expires_at > NOW();
```

Não apagar approvals, feedback, notificações, snapshots, relatórios, custos, alertas ou eventos. Jobs de notificação concluídos como “feature disabled” não devem ser reenviados automaticamente; ao reabilitar, um operador deve revisar as aprovações ainda pendentes antes de reprogramar qualquer entrega.

## Rollback de aplicação

1. Ativar a contenção granular adequada; se a fronteira for desconhecida, desligar decisões, notificações, relatórios/feedback e o supervisor.
2. Pausar Missions ativas e aplicar kill switch às capabilities afetadas.
3. Revogar links públicos e reconciliar efeitos externos `unknown`; nunca prometer undo de envio irreversível.
4. Reverter backend, worker, frontend e Harness para a última imagem aprovada.
5. Manter migrations aditivas e dados auditáveis; migrations são somente para frente durante o incidente.
6. Validar leitura do histórico, isolamento tenant, ausência de novos efeitos/entregas e recuperação do SLO antes de remover a contenção.

## Registro desta entrega

- Validação local: backend e frontend completos, builds de produção e testes Python/contratos/golden devem ser anexados ao checklist de deploy.
- Validação VPS autenticada: **pendente**.
- IDs de produção, métricas reais, entrega de canais e ensaio de rollback: **pendentes; não preencher com dados simulados**.
