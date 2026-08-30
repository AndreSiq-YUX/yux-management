# Runbook — Campaign Launch Agent (Release 3)

**Classificação:** vertical operacional governado para criar estratégia, público, criativos, landing page, formulário, tracking e campanha paga. A campanha externa nasce pausada e só ativa depois da aprovação exata. Esta release não é ainda o supervisor composto nem o modo autônomo geral.

## Autoridade e invariantes

- O Harness recebe Company Context, conhecimento publicado, baseline e conexões permitidas, mas não recebe tools nem credenciais. Ele só propõe artefatos tipados e citados.
- O Action Engine recompila `campaign_launch@1.0.0`, pina pack, catálogo, capability e contexto, verifica tenant/contrato e mantém a intenção da Mission. O provedor é uma capability subordinada.
- `shadow` e `prepare` nunca criam ou ativam campanha externa. Em `assisted`, `campaign.provider.create_paused@1` e `campaign.provider.activate@1` exigem aprovação e vêm desabilitadas por padrão para cada organização.
- A conexão escolhida precisa constar no snapshot de readiness da mesma organização e plataforma. Segredos permanecem no adapter do servidor.
- A campanha externa é sempre criada em `PAUSED`. Ativação usa a versão e o content hash aprovados; alteração de público, copy, página, tracking, datas ou orçamento invalida a decisão anterior.
- Intenção de efeito é persistida antes do dispatch. Timeout é `unknown`, nunca uma falha presumida nem autorização para retry cego. Mutation lease dura no máximo 30 segundos e o resource claim usa fencing por `campaign.provider_account/<connectionId>`.
- Receita e MROI só são conhecidos com tracking e identidade resolvidos. A tela mostra `campaign_last_touch_30d@1` e o hash exato da política de atribuição.

## Pré-requisitos de rollout

1. Aplicar migrations até `0142_campaign_launch_pack.sql`.
2. Configurar backend, worker e Harness com Redis, `YUX_AGENT_RUNTIME_URL`, `YUX_AGENT_RUNTIME_TOKEN`, provider do Harness, `ACTION_ENGINE_MUTATION_LEASE_SECRET` e chaves de redaction/segredos.
3. No contrato piloto, habilitar `action_engine`, `campaigns`, `landing_pages` e `campaign_launch_agent`. O último é o entitlement comercial e permanece opt-in.
4. Conectar uma conta Meta ou Google de teste, com token válido e conta de anúncios própria para sandbox. Confirmar Company Context publicado com ICP, oferta e regras de marca.
5. Confirmar que o catálogo expõe `campaign_launch@1.0.0` com o hash esperado do repositório. Não usar `latest`.
6. Executar primeiro em `shadow`, depois `prepare`. Só então habilitar, uma por vez, as policies de `campaign.provider.create_paused@1` e `campaign.provider.activate@1`; approval continua obrigatório.

## Aceitação autenticada no sandbox do provedor

Registrar organization, contract, Mission, context, plan, approval, action-run, effect, mutation-run, provider-reference e metric-snapshot IDs, mais hashes, operador, horários e custos.

1. Em Missões, escolher **Lançar campanha**, revisar teto total, orçamento diário, prazo e modo assistido.
2. Planejar e confirmar fontes de ICP/oferta/marca. O Harness deve escolher somente uma conexão presente no readiness e nunca expor token.
3. Revisar brief, público, criativo, landing page, formulário, tracking e economia no cockpit. O cliente vê conteúdo e fontes; controles operacionais e provas técnicas seguem a permissão do papel.
4. Executar os rascunhos. Confirmar que não há objeto externo em `shadow/prepare`.
5. Aprovar a criação externa exata. Confirmar no provedor que existe uma única campanha em `PAUSED`, com orçamento, destino e criativo correspondentes.
6. Alterar localmente um artefato e provar que o hash anterior não ativa a versão nova. Restaurar o artefato aprovado ou gerar uma nova revisão.
7. Aprovar a ativação e confirmar uma única transição para `ACTIVE`. Reentregar o mesmo job e confirmar ausência de segunda campanha/segunda ativação.
8. Ingerir métricas e confirmar spend, impressões, cliques, leads, CPL, custo total, intervenção humana e atribuição versionada. Tracking/identidade incompletos devem produzir `unknown`, não zero.
9. Simular estouro de orçamento. A avaliação determinística deve pausar a Mission e acionar `campaign.provider.pause@1`; confirmar `PAUSED` no provedor e no estado local.
10. Ativar o kill switch exato de `campaign.provider.activate@1`; confirmar bloqueio da ativação sem afetar leitura, drafts ou pause de segurança.

## Gatilhos objetivos de rollback

- imediato: segredo/PII/cross-tenant, conexão inventada, efeito em `shadow/prepare`, criação ativa em vez de pausada, ativação sem approval, hash/versão divergente, mutação após kill switch ou perda do entitlement;
- provider: campanha duplicada, orçamento/público/destino divergente, retry automático de outcome `unknown`, pause de segurança não confirmado ou callback aplicado duas vezes;
- economia: gasto total/diário acima do guardrail, custo sem ledger, valor atribuído sem identidade/tracking ou política de atribuição não exibida;
- operação: provider effect `unknown` além de 15 minutos, backlog de reconciliação crescente, falha de fencing/lease ou duas janelas consecutivas de 15 minutos fora do SLO;
- qualidade: regressão das golden missions, schema/catalog drift, falha de migration ou corpus adversarial.

## Contenção e rollback

1. Aplicar kill switch primeiro à capability exata (`campaign.provider.activate@1` ou `campaign.provider.create_paused@1`). Se a fronteira não for conhecida, retirar `campaign_launch_agent` do piloto e desligar `MISSION_SUPERVISOR_ENABLED`.
2. Pausar localmente todas as Missions afetadas. Não liberar claims ainda.
3. Acionar `campaign.provider.pause@1` para cada provider reference potencialmente ativo. O pause é um novo efeito auditado, não um “undo”.
4. Para cada efeito `unknown`, reconciliar pelo provider idempotency key/request hash. Resolver como `confirmed_created` ou `confirmed_failed`; após o deadline, mover para `manual_review` e abrir incidente. Nunca repetir criação/ativação enquanto o outcome estiver aberto.
5. Registrar reversal apenas para reserva/custo que de fato não ocorreu. Mídia já gasta e serviço consumido permanecem como custo real.
6. Reverter imagens de backend, worker, frontend e Harness. Migrations são aditivas e permanecem; correção de banco é forward-only.
7. Preservar snapshots, planos, approvals, traces redigidos, attempts, effect events, provider mutation runs, métricas, custos e incidentes.
8. Liberar resource claims por último, somente após confirmar que não há worker antigo, lease válido ou efeito externo não resolvido.
9. Reabilitar em ordem: leitura → shadow → prepare → create-paused → activate em uma Mission canário. Repetir isolamento tenant, idempotência, orçamento e reconciliação.

## Ensaio de provider-unknown e SLO

1. No fake/sandbox, provocar timeout depois do dispatch. Confirmar `unknown`, Mission/action bloqueada e ausência de retry de mutação.
2. Fazer o resolver retornar `created`; confirmar finalização do mesmo action-run e callback duplicado ignorado. Repetir com `failed`.
3. Manter dois efeitos de ensaio sem resolução até o deadline de 15 minutos. Ambos devem virar `manual_review`, com incidente e evidência preservados.
4. Simular duas janelas operacionais consecutivas de 15 minutos fora do SLO: manter kill switch de activate, pausar Missions/provedores, retirar o entitlement do piloto e só restaurar depois de duas janelas saudáveis.

## Estado desta entrega

- Fake provider, races, hash/catalog drift, duplicate activation/callback, timeout/reconciliation, kill switch, mutation lease, fencing e budget containment: validados pela suíte local.
- Browser acceptance com conta de anúncios real de teste: **pendente de credenciais/configuração do sandbox; não foi simulada como evidência real**.
- Migration `0142` e aceitação autenticada na VPS: **pendentes**.
- Produção deve continuar com create/activate desabilitados até o checklist acima ser anexado ao rollout.
