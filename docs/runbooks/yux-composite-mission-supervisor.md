# Runbook — Composite Mission Supervisor (Release 4)

## Escopo aceito

Uma única Mission pode compor versões publicadas de `funnel_nurture@1.0.0` e
`campaign_launch@1.0.0`. O Harness interpreta e produz artefatos fundamentados;
o Action Engine recompila cada pack isoladamente, aceita somente bindings
declarados e executa um DAG imutável com ownership, orçamento, aprovação,
fencing, kill switches e avaliação comuns à Mission.

Esta release não autoriza capabilities arbitrárias nem autonomia sem envelope.
O lançamento real de mídia continua condicionado à aceitação do sandbox do
provedor e à aprovação do hash exato.

## Pré-requisitos de ativação

1. Aplicar migrations `0128` a `0143`, sem lacunas, e confirmar a tabela
   `action_plan_artifact_bindings` com RLS forçada.
2. Implantar backend, worker, frontend e Agent Harness da mesma revisão.
3. Configurar `YUX_AGENT_RUNTIME_URL`, `YUX_AGENT_RUNTIME_TOKEN`,
   `ACTION_ENGINE_MUTATION_LEASE_SECRET` e habilitar
   `MISSION_SUPERVISOR_ENABLED` somente para o piloto.
4. No contrato piloto, habilitar Action Engine, CRM, Automations,
   Funnel + Nurture Agent, Campaigns, Landing Pages e Campaign Launch Agent.
5. Conectar CRM, e-mail e um provedor de anúncios de sandbox. Manter
   `campaign.provider.create_paused@1` e `campaign.provider.activate@1`
   desabilitadas até concluir os testes sem efeitos reais.
6. Publicar Company Context mínimo: ICP, oferta e regras de marca. Confirmar que
   os source IDs recuperados pertencem à organização da Mission.

## Smoke test do piloto

1. Criar uma Mission em `shadow` com o pedido “crie um funil com sequência de
   e-mails e lance uma campanha paga para esse funil”.
2. Confirmar seleção de dois packs, versões e hashes exatos; nenhum terceiro
   pack ou capability pode aparecer.
3. Confirmar os grupos Funil + Nutrição e Campaign Launch no cockpit e a seta
   `crm.funnel` entre `pack.publish_funnel` e `pack.draft_campaign`.
4. Verificar que o plano mostra custo total somado, custo por pack, fontes,
   riscos, aprovações e efeitos irreversíveis em linguagem de negócio.
5. Em `prepare`, publicar os artefatos internos aprovados. Confirmar que a
   campanha só é criada no provedor no estado pausado.
6. Aprovar o hash exato e ativar uma vez. Repetir o callback/idempotency key e
   confirmar que não há segunda mutação externa.
7. Coletar métricas. Confirmar chaves por pack, economia agregada e que falha ou
   pausa do funil afeta também a campanha dependente.
8. Pausar e cancelar a Mission durante a execução; confirmar que nenhum pack
   ganha novos claims e que efeitos de outcome desconhecido são reconciliados.

## Gatilhos objetivos de rollback

Rollback imediato se ocorrer qualquer um destes eventos:

- leitura, binding ou efeito cruzando organizações;
- pack, versão, hash, source ID ou capability fora do catálogo congelado;
- campanha ativa antes da aprovação exata ou criada ativa em vez de pausada;
- duas mutações externas para a mesma chave idempotente;
- execução de um pack depois de pause, cancel ou kill switch da Mission;
- binding consumido sem run produtor bem-sucedido, hash de artefato ou versão de
  schema declarada;
- custo agregado acima do envelope sem pausa automática;
- duas janelas consecutivas de 15 minutos fora do SLO do executor ou do
  reconciliador de outcomes desconhecidos.

## Procedimento de contenção e rollback

1. Acionar primeiro o kill switch da capability afetada. Para mídia, bloquear
   `campaign.provider.activate@1`; se houver dúvida sobre a fronteira, desligar
   também `campaign.provider.create_paused@1`.
2. Pausar todas as Missions compostas do piloto. Não apagar planos, bindings,
   runs, efeitos externos, snapshots ou evidências.
3. Pausar no provedor as campanhas que já existirem. E-mail enviado não é
   compensável: registrar no incident ledger, suprimir novos envios e preservar
   o evento original.
4. Rodar a reconciliação dos efeitos com outcome desconhecido antes de liberar
   claims. Claims são liberados por último, depois que nenhum worker puder
   iniciar nova mutação.
5. Retirar temporariamente os entitlements Funnel + Nurture Agent e Campaign
   Launch Agent do contrato piloto. Se a contenção granular não for suficiente,
   definir `MISSION_SUPERVISOR_ENABLED=false` e reiniciar backend/worker.
6. Reimplantar a revisão anterior. As migrations `0128`–`0143` são aditivas e
   permanecem aplicadas; não remover tabelas nem reescrever manifests.
7. Só reativar após causa raiz, teste de regressão, duas janelas saudáveis de 15
   minutos e nova aprovação operacional registrada.

## Evidência e auditoria

Preservar por Mission: context snapshot/hash, packs e hashes, capability
manifest/hash, plano e aprovação, artifact bindings, specialist trace summaries,
resource claims/fencing tokens, mutation leases, provider effect ledger,
reconciliações, métricas por pack, economia agregada e eventos de pause/cancel.

## Estado desta revisão

- Compilação, bindings, execução, métricas compostas, cockpit e cenários de
  ataque/fake provider: validados localmente.
- Migration `0143`, smoke test autenticado e sandbox real na VPS: pendentes.
- Ativação autônoma contínua (Release 5): fora do escopo desta release.
