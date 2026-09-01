# Rollout e rollback — Conversas de Missão

**Data:** 2026-08-31
**Responsável:** operação YUX
**Escopo:** Harness existente, backend/worker e frontend do YUX Hub

## Princípios

- O Harness interpreta e seleciona conhecimento; o Action Engine valida, aprova e executa.
- Desabilitar a conversa impede novos pedidos, turnos e confirmações, mas mantém histórico e não cancela Missions já aprovadas.
- Nenhum rollback apaga conversas, mensagens, snapshots, aprovações ou ledgers.

## Variáveis no Dokploy

Configure no serviço do backend:

```text
MISSION_CONVERSATIONS_ENABLED=false
MISSION_CONVERSATIONS_TENANT_ALLOWLIST=
MISSION_CONVERSATIONS_MAX_TURNS=6
MISSION_CONVERSATIONS_POLL_MAX_SECONDS=5
```

Durante o canário, use `MISSION_CONVERSATIONS_ENABLED=true` e coloque somente o UUID da organização YUX na allowlist. Separe vários UUIDs por vírgula. Allowlist vazia com a flag ligada habilita todos os tenants, portanto não deve ser usada antes da liberação geral.

O modo de compatibilidade do frontend é definido no build:

```text
VITE_MISSION_FORM_COMPATIBILITY=false
```

Quando publicado com `true`, o botão principal muda para **Criar missão** e abre diretamente o formulário anterior. Como essa variável é incorporada ao build, a alteração exige novo deploy do frontend.

## Ordem de implantação

1. Fazer deploy do Harness e validar `/health` e o contrato de `/missions/conversations/respond`.
2. Fazer deploy do backend e worker com a flag desligada.
3. Aplicar migrations no container do backend.
4. Validar health do backend, fila e conectividade com o Harness.
5. Fazer deploy do frontend.
6. Ligar a flag somente para a organização interna YUX.
7. Executar o walkthrough de aceitação; depois ampliar a allowlist por contrato selecionado.

## Migration no Dokploy

O container observado em produção é `yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1` e o diretório da aplicação é `/app`. Para não depender do sufixo gerado pelo Dokploy, descubra e valide o nome antes:

```bash
docker ps --filter 'name=yux-backend-api' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
BACKEND_CONTAINER="$(docker ps --filter 'name=yux-backend-api' --format '{{.Names}}' | head -n 1)"
test -n "$BACKEND_CONTAINER" && docker exec -i "$BACKEND_CONTAINER" sh -lc 'cd /app && node dist/scripts/apply-migrations.js'
```

Com o nome atualmente conhecido, o comando direto é:

```bash
docker exec -i yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 sh -lc 'cd /app && node dist/scripts/apply-migrations.js'
```

Reexecutar é seguro: o runner aplica somente migrations ainda não registradas.

## Verificações de saúde

- Harness `/health` responde e o backend indica `planner.available=true`.
- `/api/action-engine/operations/health?organizationId=<UUID>` mostra a flag e a allowlist como esperado.
- `acceptedToFirstAgentMessageLatencyMs.p95` permanece abaixo de 20 segundos.
- Taxa de falhas de turno permanece abaixo de 5% em janela de 15 minutos.
- Vazamento entre tenants e sugestões não autorizadas permanecem em zero.
- Uma confirmação cria exatamente uma Mission e o plano no chat tem o mesmo subject da aprovação.
- Mensagens, fontes e atividade continuam visíveis após refresh.

## Sequência de canário

1. Organização interna YUX, com pelo menos campanha completa, funil + nutrição e revenue recovery.
2. Um contrato cliente com Campaigns, Landing Pages e Campaign Launch Agent.
3. Dois a cinco contratos adicionais, observados por 24 horas.
4. Liberação geral somente após os golden gates e SLOs permanecerem aprovados.

## Gatilhos objetivos de rollback

Rollback imediato se ocorrer qualquer um destes eventos:

- qualquer fonte, mensagem ou contexto de outro tenant;
- qualquer sugestão de capability não contratada ou não permitida;
- perda ou troca de ordem de mensagens;
- mais de uma Mission para a mesma confirmação;
- hash/subject do plano no chat diferente da aprovação;
- p95 de primeira resposta acima de 20 segundos por 15 minutos;
- taxa de erro de turnos acima de 5% por 15 minutos.

## Ação de rollback

1. Definir `MISSION_CONVERSATIONS_ENABLED=false` no backend e redeploy/restart pelo Dokploy.
2. Manter tabelas e mensagens; não executar limpeza nem migration reversa.
3. Interromper novos jobs `action-engine.processMissionConversation`. Jobs ainda não iniciados podem permanecer na fila porque o handler rejeita versões/estados obsoletos; durante incidente de segurança, pause o worker até a triagem.
4. Publicar o frontend com `VITE_MISSION_FORM_COMPATIBILITY=true` para direcionar novos pedidos ao intake de compatibilidade.
5. Permitir que Missions já aprovadas continuem sob seus envelopes, kill switches e aprovações existentes, salvo se o incidente afetar execução.

## Recuperação para frente

- Conversa em `collecting_context` sem resposta: confirme o health do Harness, reative o worker e reenvie o job com o mesmo `conversationId` e `requestedVersion`.
- Retry de mensagem usa o mesmo `clientMessageId`; nunca gere outro ID para uma tentativa incerta.
- Conversa em `planning`: reenvie `action-engine.planMission` com o `missionId` e a versão atual. O job idempotente não cria outro plano equivalente.
- Confirmação incerta: repita a confirmação com o mesmo `briefHash`; o vínculo idempotente retorna a Mission já criada.
- Projeção de chat ausente após aprovação: preserve a decisão; reconstrua a projeção a partir do ledger, sem reaplicar aprovação.
- Fonte com drift: publique/corrija a fonte no Harness, gere nova resposta e exija nova confirmação do briefing/plano.

## Evidências a preservar

Registre horário, tenant, conversation ID, Mission ID, job IDs, hashes de briefing/plano, versão do Harness e métricas agregadas. Não copie conteúdo de cliente para tickets externos; use IDs e traces redigidos.
