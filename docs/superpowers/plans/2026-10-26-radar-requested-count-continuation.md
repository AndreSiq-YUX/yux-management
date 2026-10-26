# Radar Requested Count Continuation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans diretamente nesta sessão, conforme método escolhido pelo usuário; sem subagentes. Passos em TDD com revisão final em passe separado.

**Goal:** Prosseguir até a quantidade solicitada sem paralisar todo o lote por falhas individuais e sem indicar execução inexistente.

**Architecture:** Separar as condições de continuidade da descoberta dos bloqueios individuais. Recuperar agendamento órfão pelo job de manutenção existente, com transações por organização/campanha/lote. Não criar outro pipeline, API ou regra de cobrança.

**Tech Stack:** TypeScript, PostgreSQL isolado, Vitest, fila e manutenção existentes.

**Spec:** `docs/superpowers/specs/2026-10-26-radar-requested-count-continuation.md`.

## Global Constraints

- Preservar contagem e revisão congeladas, empresas, recibos e consentimentos. Não repetir efeitos incertos.
- Nenhum aumento de orçamento/cota, troca de modelo/serviço ou descarte automático novo. Recuperação usa o pedido original e suas autorizações existentes.
- Apenas `yux_admin` recebe dados internos; manter limites de escopo e RLS.
- Não reabrir lotes terminais/históricos/pausados, revisão antiga ou campanha/solicitante sem autorização.
- Reutilizar o worktree isolado atual; preservar os documentos preexistentes do experimento e o trabalho das outras frentes.

## Review Focus

- Uma empresa incerta, uma com resposta inválida e oito com lacunas não impedem completar 40: integração de ponta a ponta.
- Descoberta incerta e erro global de capacidade não podem ser convertidos em nova compra automática: testes de planejador e manutenção.
- Job repetido/concorrente não cria duas outboxes, outro lote ou página adicional após alcançar o alvo: Postgres real.
- Histórico encerrado, revisão alterada, campanha suspensa, usuário desativado e outra organização não podem ser reativados: testes de manutenção sob RLS.
- Qualidade e quantidade são distintas: os resultados problemáticos permanecem com lacunas/bloqueios; não virar sucesso nem descarte artificial.

### Task 1: Continuidade e recuperação de agendamento

**Files:** modificar `backend/src/modules/radar/discovery-plan.ts`, `capture-reconciliation.ts`, `backend/src/jobs/handlers/maintenance.ts`; criar `backend/src/modules/radar/capture-scheduling.ts`. Testar em `backend/tests/radar-discovery-plan.test.ts`, `backend/tests/integration/radar-capture-scheduling.test.ts` e suites de captura, conciliação e vigia existentes.

**Interfaces:** `planRadarAdaptiveDiscoveryTurn` mantém o contrato, mas só espera atenção individual quando não existe mais descoberta utilizável. `reconcileRadarCaptureSummary` conserva os bloqueios individuais e agenda descoberta ativa. `repairRadarCaptureScheduling(pool,organizationId):Promise<number>` reconcilia lotes ativos órfãos com bloqueios de descoberta separados; `repairRadarCaptureSchedulingAcrossTenants(pool):Promise<{recovered:number}>` aplica contextos de worker por organização antes da entrega normal da outbox.

- [x] Testes RED: empresa aguardando atenção permite outra descoberta; página incerta continua sem replay. Integração reproduz 10/40, perde agendamento e falha ao tentar completar o lote.
- [x] Implementar a menor mudança do planejador e do agendamento; manutenção recupera somente lotes elegíveis, sob locks campanha→lote, rechecando revisão, autorização, leases e outbox.
- [x] Testar recuperação idempotente/concorrente, RLS, estados terminais, pausas e limite global; dispatcher e workers reais chegam a 40 usando transportes sintéticos, preservam as duas chamadas e não compram outra página.
- [x] Executar suites completas, integrações relacionadas e build; revisar o diff inteiro separadamente. Registrar comandos, resultados e limites da evidência.
- [ ] Commit, integrar/publicar em main conforme autorização persistente desta correção; conferir deploy e retomada do mesmo pedido sem refazer a descoberta anterior nem repetir análises incertas.

## Self-review

Planejador, conciliação e recuperação compartilham o estado existente do lote; os testes atravessam as três fronteiras. A manutenção recupera autorização durável do pedido ativo, não autoriza uma nova tentativa incerta. Uma pausa legítima continua explícita; o alvo solicitado não substitui limites reais nem significa inventar resultados. A implementação detalha a correção que o usuário acaba de ordenar e usa a execução direta já escolhida.

## Evidência de execução

- Baseline: 1.540 testes backend aprovados. Após correção: 1.541 aprovados/126 opcionais ignorados; build TypeScript aprovado.
- 72 integrações aprovadas em Postgres isolado, incluindo 17 casos de continuidade e recuperação, as suites de descoberta adaptativa, operação legada, conciliação, vigia, quatro perfis HTTP e isolamento entre organizações.
- O caso 10/40 usa dispatcher e workers reais, transportes sintéticos e nenhuma chamada paga. Preserva oito lacunas e dois bloqueios anteriores, pesquisa mais 30 empresas, termina a descoberta em 40 e realiza exatamente quatro páginas no total, sem outro lote.
- Revisão do autor em passe separado, sem subagentes conforme preferência do usuário. Encontrou falha de isolamento: um erro na recuperação poderia impedir entregas saudáveis. Teste com trigger de falha no banco reproduziu o problema; após correção, lotes saudáveis continuam na mesma organização e nas outras, enquanto o erro permanece observável.
- A manutenção normal já executa a cada 20 segundos; não foi criado outro agendador, API, limite de pesquisa ou regra de cobrança. Nenhum DTO cliente foi alterado.
