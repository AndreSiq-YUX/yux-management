# YUX Campaign Optimization — Runbook de rollout e rollback

## Escopo

Este runbook cobre `campaign_optimization@1.0.0`, migration `0145` e o job
`action-engine.campaignOptimizationCheckpoint`. O pack permanece
`published_for_internal_pilot` e suas capabilities de mutação nascem
desabilitadas por organização.

## Pré-condições

- Migrações aplicadas até `0145`.
- Releases 0–4 e grants/preflight da Release 5 validados no ambiente.
- Contrato com `campaigns`, `campaign_launch_agent` e
  `campaign_optimization_agent` habilitados.
- Provider sandbox conectado e reconciliação de efeitos externos saudável.
- Mission em modo `autonomous` com grant ativo, temporal e com allowlist exata.
- `ACTION_ENGINE_MUTATION_LEASE_SECRET` configurado no worker.

## Sequência de rollout

1. Habilitar somente `campaign.optimization.evaluate@1` e
   `marketing.creative.optimization_draft@1` no workspace interno.
2. Rodar checkpoints em shadow/prepare e confirmar amostra, tracking, CPL, CTR,
   idempotência por janela e ausência de publicação externa.
3. Habilitar `campaign.provider.pause@1` e
   `campaign.budget.decrease_bounded@1` apenas no provider sandbox.
4. Confirmar que redução acima de 20%, direção invertida, grant expirado,
   fencing obsoleto e lease repetido são negados.
5. Habilitar um canário assistido com orçamento baixo. A capability
   `campaign.budget.increase@1` continua com aprovação obrigatória.
6. Somente depois das evidências anteriores, emitir grant autônomo curto com
   allowlist mínima. Não habilitar publicação de novo criativo.

## Sinais esperados

- Um único checkpoint por Mission e janela horária/diária.
- `observe` enquanto a amostra mínima não foi atingida.
- Mission pausada e avaliação persistida quando tracking fica desconhecido.
- No máximo uma ação proposta por checkpoint.
- Reduções limitadas ao percentual aprovado, com teto absoluto de 20%.
- Aumentos aparecem como aprovação `budget_increase`; nunca são silenciosos.
- Rascunhos de criativo não alteram o criativo publicado.

## Gatilhos objetivos de rollback

- Qualquer efeito externo duplicado ou sem grant/lease/fencing válido.
- Ajuste acima do teto percentual ou na direção diferente da decisão.
- Aumento de orçamento sem aprovação exata.
- Mais de um checkpoint ou uma ação para a mesma Mission/janela.
- Tracking desconhecido sem contenção da Mission.
- Efeito `unknown` acima do SLO do provider.
- Regressão de isolamento entre organizações, hash do pack ou golden missions.

## Procedimento de rollback

1. Desabilitar as capabilities exatas de orçamento e provider para a organização.
2. Revogar grants ativos e pausar as Missions afetadas.
3. Pausar a campanha no provider quando o estado local não comprovar contenção.
4. Reconciliar todos os efeitos `reserved`, `dispatched`, `unknown` ou
   `manual_review`; não liberar claims antes disso.
5. Preservar checkpoints, aprovações, avaliações, leases, efeitos e custos.
6. Reverter o deploy da aplicação somente após impedir novos jobs. A migration
   `0145` é aditiva e não precisa ser removida para rollback funcional.

## Critério de saída

O piloto só avança quando checkpoints repetidos forem idempotentes, todos os
limites forem negados no preflight, o provider sandbox confirmar pausa/redução,
e o caminho de aumento exigir aprovação autenticada e hash exato.
