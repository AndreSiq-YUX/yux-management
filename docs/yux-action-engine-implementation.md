# YUX Action Engine MVP — Documento de Implementação

**Status:** implementação local concluída; pré-deploy  
**Data de consolidação:** 2026-08-21  
**Pack:** `revenue_recovery@0.1.0`

## 1. Resultado entregue

O YUX Hub agora possui uma camada de Missões orientada a outcome. O primeiro fluxo não depende de um DAG improvisado: toda missão de recuperação instancia o `Revenue Recovery Pack v0`, preserva sua topologia protegida e permite ao planner apenas preencher parâmetros ou usar extension points declarados.

A implementação local cobre:

- criação, readiness, lifecycle e optimistic concurrency da Mission;
- planner no Agent Harness e compilador determinístico no backend;
- aprovação de plano vinculada ao hash da revisão;
- executor persistente com dependências, attempts, retry e preflight;
- tarefas humanas duráveis, medição de tempo real e aprovações intrínsecas;
- waits duráveis, coleta recorrente de métricas e checkpoints de avaliação;
- replanejamento como nova revisão, diff material e aprovação por hash;
- Action Engine como owner da intenção e automações como subprocessos;
- ledger append-only de custos, inclusive trabalho humano e reversals;
- métricas que preservam `unknown` e economia sem float monetário;
- operação interna e portal/workspace com lista, wizard e detalhe de missões;
- health operacional e runbook de rollout.

## 2. Arquitetura implementada

```text
React (Missões)
  -> Fastify /api/action-engine
    -> Postgres: missão, plano, actions, approvals, ownership, custos e observações
    -> BullMQ: planner, scheduler, execução, waits, métricas e avaliação
    -> Agent Harness /missions/plan: proposta estruturada
    -> Capability Registry: única fronteira de execução
      -> tarefas humanas nativas e commands de CRM/cadência habilitados no piloto
```

Postgres continua sendo a fonte de verdade. Jobs podem ser repetidos; idempotency keys, locks, plan hash e preflight impedem que a fila seja tratada como estado de negócio.

## 3. Mapa de código

| Responsabilidade | Local |
| --- | --- |
| Domínio e estados | `backend/src/modules/action-engine/types.ts`, `state-machine.ts` |
| Persistência | `backend/src/modules/action-engine/repository.ts` |
| Pack protegido | `backend/src/modules/action-engine/packs/revenue-recovery-v0.ts` |
| Registry/capabilities | `backend/src/modules/action-engine/capability-registry.ts`, `capabilities/` |
| Planner/compilador | `backend/src/modules/action-engine/planner.ts` |
| Executor | `backend/src/modules/action-engine/executor.ts` |
| Ownership | `backend/src/modules/action-engine/execution-ownership.ts` |
| Métricas/economia | `backend/src/modules/action-engine/evaluator.ts`, `economics.ts`, `observer.ts` |
| API | `backend/src/modules/action-engine/routes.ts` |
| Jobs | `backend/src/jobs/handlers/action-engine.ts`, `backend/src/worker.ts` |
| Schema | `backend/src/db/migrations/0128_action_engine_foundation.sql` |
| Agent Harness | `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission.py` |
| UI compartilhada | `frontend/src/components/action-engine/` |
| Rotas interna/portal | `frontend/src/pages/action-engine/`, `frontend/src/pages/client-portal/PortalMission*` |

## 4. API operacional

Leitura: catálogo de capabilities, Action Packs, missions, revisions, actions, approvals, métricas, economia e health operacional.

Commands: criar/editar draft, qualificar, planejar, aprovar plano, iniciar, pausar, retomar, cancelar, avaliar, decidir aprovação, repetir action, ignorar extensão e concluir tarefa humana.

Toda rota exige sessão, organização autorizada e módulo `action_engine`. Mutations de lifecycle usam a versão esperada da Mission. Clientes recebem apenas a visão econômica pública; custos internos, taxa horária e margem não são serializados.

## 5. Hierarquia com Automations

O contrato `automation.flow.execute` está definido para a evolução do produto, mas não é publicado no catálogo executável do primeiro piloto. O runtime de automação já consulta ownership antes do run e antes de cada efeito; uma Mission pausada/cancelada ou um ownership exclusivo impede novos efeitos conflitantes. Quando o adaptador mission-bound for habilitado, ele deverá receber `missionId`, versão congelada e correlation sem alterar essa hierarquia.

Esta hierarquia é deliberada:

1. a Mission decide intenção, budget, continuidade e conclusão;
2. a Automation executa seu subprocesso;
3. eventos retornam ao observer;
4. o evaluator determinístico decide continuar, pausar, propor replan ou encerrar.

## 6. Economia da missão

Cada custo possui categoria, natureza, moeda original, taxa de conversão, valor BRL, fonte e idempotency key. Correções criam reversal; não editam o passado.

Os KPIs materializados são:

- valor produzido;
- custo total de execução;
- valor líquido;
- razão valor/custo;
- valor por hora humana;
- taxa de execução sem intervenção humana.

Denominador zero resulta em `not_applicable`. Receita sem fonte confirmada continua `unknown`; a interface não a converte em zero.

## 7. Estados e operação assíncrona

O planner muda a Mission para `planning` antes de enfileirar o trabalho. A aprovação verifica `planHash` e `mission.version`. Ao iniciar, action runs são materializados a partir da revisão aprovada.

`system.signal.wait` não mantém processo aberto: o run persiste `waitUntil`, fica sob `durable_wait` e o scheduler o conclui quando vence. A coleta recorrente materializa métricas e enfileira avaliações. O evaluator é a única peça que transforma snapshots em decisão de lifecycle.

`human.task.create` também é durável: cria o artefato da intervenção, mantém a action em `running` e só conclui após uma pessoa informar o resultado e os minutos reais. Em trajetória `off_track` após a amostra mínima, o evaluator solicita uma nova revisão; o planner recebe o plano anterior e observações, o backend calcula o diff e qualquer alteração material exige aprovação antes de substituir o plano ativo.

## 8. O que ainda depende de ambiente

Os itens abaixo exigem infraestrutura ou autorização operacional:

- aplicar `0128_action_engine_foundation.sql` em banco descartável e depois no ambiente alvo;
- habilitar `action_engine` no contrato/workspace piloto;
- configurar e validar `YUX_AGENT_RUNTIME_URL` e token entre backend e Agent Harness;
- confirmar ledger de permissão/suppression e dados elegíveis no CRM;
- publicar processos backend, worker, frontend e Agent Harness;
- executar smoke/QA autenticado contra a infraestrutura implantada;
- autorizar humanamente o lote canário de no máximo 20 contatos.

O escopo executável do piloto é deliberadamente `human_task`, mais commands internos de tarefa, owner e cadência. Os adaptadores mission-bound de envio direto por e-mail, WhatsApp e execução de Automation permanecem backlog de produto e não aparecem em `/capabilities`; uma conexão existente, sozinha, não os torna executáveis.

Enquanto esses itens não forem concluídos, o estado correto é **implementado localmente, não lançado**.

## 9. Gates de aceite

- TypeScript do backend e frontend sem erros — **aprovado**;
- backend: 84 arquivos / 347 testes — **aprovado**;
- frontend: 102 arquivos / 475 testes — **aprovado**;
- Agent Harness: 82 testes Python — **aprovado**;
- build de produção do frontend, com chunks próprios para as páginas de Missões — **aprovado**;
- migration smoke em Postgres descartável — pendente por ausência de Postgres/Docker no ambiente local;
- browser QA com contrato mockado nas rotas interna, detalhe e wizard — **aprovado**; repetir autenticado após deploy;
- checklist do runbook aprovado antes do canary.

Runbook: `docs/runbooks/yux-action-engine-pilot.md`.
