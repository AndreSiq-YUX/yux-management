# Prioridade Comercial no CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar potencial, temperatura e prioridade configuráveis por instância de CRM, com cálculo auditável, filas operacionais e ativação gradual.

**Architecture:** Preservar os modos atuais e publicar versões imutáveis de um modelo de prioridade separado. Reusar os campos, eventos e permissões do CRM para avaliar fatos em um motor determinístico. Persistir avaliações por versão e processar recálculos na fila de manutenção, com tarefas opcionais habilitadas separadamente.

**Tech Stack:** TypeScript, Zod, Fastify, PostgreSQL nativo, BullMQ, React, shadcn/ui e Vitest.

**Spec:** [Especificação de prioridade comercial](2026-11-03-crm-priority-scoring-spec.md)

## Global Constraints

- Usar PostgreSQL nativo e migrations numeradas, transações, filas e componentes já presentes.
- Um modelo de prioridade publicado por instância, com versões imutáveis.
- A configuração pertence à instância de CRM e pode aplicar critérios a um tipo de lead.
- O código e as migrations da plataforma não devem incluir marcas, segmentos, valores comerciais ou faixas daquela operação.
- Aplicar RLS com `FORCE ROW LEVEL SECURITY`, grants mínimos e verificação dos vínculos entre versão, instância, lead e sinal.
- Respeitar as regras de audiência e direitos do Radar em `AGENTS.md`.
- Baseline e recálculo de publicação não criam tarefas.
- Separar merge, implantação do código, ativação por instância e habilitação de tarefas.

## Review Focus

- Zero conhecido na fonte principal vence uma alternativa estimada. Um campo arquivado vira desconhecido e fica identificado na prévia. Tarefas 1 e 2.
- O mesmo pedido registrado via WhatsApp e manualmente conta uma vez se houver referência comum. Uma resposta recebida fora de ordem respeita a data original. Tarefas 3 e 4.
- Uma ficha muda entre a prévia e a publicação. A publicação exige a revisão simulada e recalcula com os dados vigentes, exibindo **Calculando** enquanto o resultado novo estiver pendente. Tarefas 2, 4 e 5.
- A fila recebe uma tarefa após desativação, opt-out ou exclusão. O executor revalida estado e não grava a tarefa. Tarefa 6.
- Um gestor conhece o UUID de outro lead da mesma instância ou de outra conta. HTTP direto, histórico e prévia respeitam propriedade, equipe e conta. Tarefas 2, 3 e 5.

---

## Ponto de partida e ordem de entrega

Base analisada: `c2eccab`. Conferir `origin/main` e o próximo número livre de migration antes de iniciar. O modo `sum` usa `qualification-repository.ts`, que soma perfil e interesse e classifica temperatura pelo total. O modo `weighted` em `scoring-engine.ts` já calcula uma média ponderada. O novo caminho deve ser acionado explicitamente por instância. Adoção da nova UI não migra pesos, histórico nem regras de forma implícita.

- **Entrega 1, tarefas 1–2:** motor, rascunho e simulação pela API. Operação anterior continua disponível e a prévia já pode ser validada com uma carteira de teste.
- **Entrega 2, tarefas 3–5:** sinais, recálculo programado e uso diário no CRM. Ativação com recomendações.
- **Entrega 3, tarefas 6–7:** tarefa interna opcional, teste integrado e implantação controlada. Estimativa inicial de 3–5 semanas para uma pessoa, incluindo testes de integração. Conectores novos, classificação semântica e configuração comercial do cliente são trabalhos separados.

## Mapa de arquivos e contratos

| Área | Arquivos e responsabilidade |
| --- | --- |
| Motor | Criar `backend/src/modules/crm/priority-model.ts` para esquema e avaliação pura. Reusar operadores e faixas de `qualification.ts`. |
| Versões e prévia | Criar `priority-repository.ts` e `priority-routes.ts` no mesmo módulo. Integrar em `routes.ts` e reusar catálogo e contexto de `qualification-repository.ts`. |
| Sinais | Criar `priority-signals.ts`. Integrar com `backend/src/jobs/handlers/crm-scoring.ts` e com o compositor de atividade na ficha. |
| Execução | Criar `priority-recalculation.ts`. Integrar com `backend/src/worker.ts`, o processador e o roteamento de jobs existentes. Enfileirar no mesmo commit das alterações do lead. |
| Interface | Criar `frontend/src/types/crmPriority.ts`, `frontend/src/services/crmPriorityService.ts` e `frontend/src/components/crm/scoring/PrioritySettings.tsx`. Evoluir `PortalLeadScoringPage.tsx`, `LeadScoreSummary.tsx`, `CrmWorkspace.tsx` e `TodayWorkQueue.tsx`. |
| Dados | Criar `backend/src/db/migrations/0257_crm_priority_models.sql`, `0258_crm_priority_signals.sql` e `0259_crm_priority_evaluations.sql`, ajustando a numeração se a base avançar. Atualizar `docs/releases/yux-remediation-manifest.json` no commit de cada migration. |

### Contrato compartilhado

```ts
type PrioritySignal = {
  id: string
  canonicalKey: string
  kind: string
  channel: 'whatsapp' | 'email' | 'call' | 'meeting' | 'crm'
  actor: 'buyer' | 'operator' | 'system'
  occurredAt: string
  targetDate?: string
}
type PriorityInput = {
  leadId: string
  recordTypeId: string | null
  fields: Record<string, string | number | boolean | null>
  signals: readonly PrioritySignal[]
  status: 'open' | 'won' | 'lost'
  deleted: boolean
  contactBlocked: boolean
}
type PriorityResult = {
  versionId: string
  fitScore: number | null
  temperatureScore: number
  priorityScore: number | null
  coveragePercent: number
  fitBandId: string | null
  temperatureBandId: string
  queueId: string | null
  state: 'ranked' | 'needs_data' | 'excluded'
  reasons: readonly PriorityReason[]
  nextEvaluationAt: string | null
}
```

`PriorityReason` é uma união de `criterion`, `missing_data`, `signal`, `expired_signal`, `penalty` e `exclusion`. Cada variante leva o ID e rótulo de negócio, pontos efetivos quando aplicável e a data do fato quando houver. `criterion` informa a chave de campo autorizada e se a alternativa é estimada. `signal` leva o ID interno do sinal acessível na ficha. A versão define pesos, mínimo de cobertura, grupos, bandas, filas, matriz, impedimentos, política temporal e janela histórica. `PriorityVersion` inclui ID, revisão e definição validada pelo esquema do motor. O resultado pendente é um estado de leitura da API, fora do resultado do motor.

### Tarefa 1 — Motor e catálogo de critérios

**Arquivos:** criar `priority-model.ts` e `backend/tests/crm-priority-model.test.ts`. Modificar `qualification-repository.ts` para disponibilizar o catálogo e os valores comerciais permitidos.

**Interfaces:** `priorityDefinitionSchema`; `evaluatePriority(version: PriorityVersion, input: PriorityInput, now: Date): PriorityResult`. Recebe dados normalizados e horário explícito. Sem acesso a banco ou relógio global.

- [x] Criar testes `first_known_zero_wins` (alternativa principal 0, estimativa 20 → grupo 0), `coverage_gates_ranking` (30 de 40 conhecidos de 100 aplicáveis → potencial 75, cobertura 40, sem fila de ranking com mínimo 50), `warmth_is_independent` (potencial 100, nenhum sinal → temperatura 0), `exclusion_wins` (bloqueio em conta com nota 100 → sem fila e sem prioridade).
- [x] Executar `npm --prefix backend test -- tests/crm-priority-model.test.ts` e confirmar falha por ausência do motor.
- [x] Implementar o esquema e o cálculo. Validar pesos, IDs duplicados, matriz completa, cortes e faixas ordenados, tetos, limites de janela e referências de campos. Separar grupos positivos e penalidades. Ordenar contribuições por ID e timestamp para resultado reproduzível. Avaliar somente a previsão de compra mais recente ainda vigente. Determinar a próxima mudança temporal a partir da primeira expiração, saída da janela histórica, limite de prazo de compra ou faixa de inatividade futura.
- [x] Rodar o mesmo teste junto de `tests/crm-qualification.test.ts` e `tests/crm-scoring.test.ts`. Esperado: motor novo e modos atuais passam.
- [x] Commit `feat(crm): evaluate configurable lead priority`.

### Tarefa 2 — Versões, permissões e prévia

**Arquivos:** criar migration `0257_crm_priority_models.sql`, `priority-repository.ts`, `priority-routes.ts`, `backend/tests/integration/crm-priority-models.test.ts`. Integrar em `routes.ts`.

**Interfaces:** `GET /crm/priority/model?crmInstanceId=...`; `PUT /crm/priority/draft` com `{crmInstanceId, expectedRevision, definition}`; `POST /crm/priority/preview` com `{crmInstanceId, revision, runId?, afterId?}`. A primeira página cria o run. A continuação exige seu ID e o cursor retornado. A prévia retorna `{revision, runId, results, nextCursor, totals}`, com 50 leads por página. O servidor armazena conclusão, totais e revisão da prévia, sem persistir os scores de simulação.

- [x] Criar testes HTTP `stale_draft_is_rejected` (409), `preview_has_no_operational_effects` (zero avaliações, tarefas e eventos de negócio), `archived_field_is_unknown` e `direct_http_scopes_same_account_and_cross_account`. Usar Admin YUX, operador, Admin da conta, membro e gestor com lead de outra equipe. O gestor só visualiza a carteira autorizada. Publicação e edição pertencem ao administrador autorizado.
- [x] Executar `npm --prefix backend run test:integration -- tests/integration/crm-priority-models.test.ts` com `YUX_INTEGRATION_DATABASE_URL` apontando para banco isolado. Confirmar falha pelos endpoints ausentes.
- [x] Criar `crm_priority_configs` (uma linha por instância, rascunho, revisão, apontador ativo e efeitos), `crm_priority_versions` (definição imutável e autor), `crm_priority_preview_runs` (revisão, cursor, totais, autor e instante de referência). Validar chaves de vínculo, RLS, grants e autorização explícita. Mudança de rascunho invalida a prévia anterior. Calcular a prévia com os dados acessíveis àquele usuário e rejeitar paginação fora do cursor do servidor. Usar o mesmo instante de referência nas páginas. Nesta entrega, informar que a prévia avalia o perfil com sinais vazios. A Tarefa 3 conecta o histórico ao mesmo avaliador.
- [x] Reexecutar testes HTTP e verificar que configuração e score dos dois modos atuais seguem operando.
- [x] Commit `feat(crm): version and preview priority models`.

### Tarefa 3 — Sinais comerciais com identidade estável

**Arquivos:** criar `priority-signals.ts` e `0258_crm_priority_signals.sql`. Modificar `priority-routes.ts`, `priority-repository.ts`, `backend/src/jobs/handlers/crm-scoring.ts` e `LeadActivityComposer.tsx`. Testar em `backend/tests/integration/crm-priority-signals.test.ts`.

**Interfaces:** `ingestPrioritySignal(db: QualificationDb, event: DomainEventEnvelope): Promise<boolean>`; `loadPrioritySignals(db: QualificationDb, leadId: string, since: Date): Promise<PrioritySignal[]>`; `GET /crm/leads/:id/priority-signals`; `POST /crm/leads/:id/priority-signals` com `{requestId, kind, channel, occurredAt, sameAsSignalId?, targetDate?}`; `POST /crm/leads/:id/priority-signals/:signalId/revoke` com `{requestId, reason}`. Exigir `targetDate` em `purchase_window` e calcular dias em relação à data no fuso da instância.

- [ ] Criar testes de resposta WhatsApp duplicada, sinal manual vinculado à mesma resposta, vínculo de outra instância rejeitado, ocorrência fora de ordem, correção preservando auditoria e tarefa/etapa sem atualizar a última interação do comprador. Assertar uma contribuição canônica por grupo e zero cópias de texto bruto no DTO.
- [ ] Rodar `npm --prefix backend run test:integration -- tests/integration/crm-priority-signals.test.ts`. Esperado: falha pelos contratos novos ausentes.
- [ ] Persistir `crm_priority_signals` com chaves únicas de origem por lead, `canonical_key`, `occurred_at`, data prevista, autor, canal, categoria e revogação. Derivar ator e escopo no servidor. Deduplicar evento externo pelo ID de mensagem. Aceitar vínculo somente a sinal ativo do mesmo lead. Tornar idempotentes gravação e revogação, rejeitando reutilização do ID de pedido com conteúdo diferente. Para a prévia, combinar sinais persistidos com eventos elegíveis de `domain_events` projetados em memória dentro da janela, deduplicando pela mesma chave da ingestão. A ativação usa o mesmo leitor. Preservar o tratamento legado do evento.
- [ ] Reexecutar os testes de sinais e a suíte de qualificação HTTP. Confirmar que deduplicação e classificação legadas continuam válidas.
- [ ] Commit `feat(crm): record structured buying signals`.

### Tarefa 4 — Publicação e recálculo seguro

**Arquivos:** criar migration `0259_crm_priority_evaluations.sql` e `priority-recalculation.ts`; modificar `priority-routes.ts`, `priority-repository.ts`, `worker.ts`, `record-profile.ts`, `repository.ts`, `routes.ts`, `crm-reconciliation.ts` do Radar e o registro de jobs. Testar em `backend/tests/integration/crm-priority-recalculation.test.ts`.

**Interfaces:** `markPriorityDirty(db: QualificationDb, leadId: string): Promise<void>`; job `crm.priorityRecalculate`, registrado em `backend/src/jobs/queue.ts` e `backend/src/jobs/registry.ts`; `POST /crm/priority/publish` com `{crmInstanceId, revision, runId, expectedActivationId, requestId}`; `POST /crm/priority/activate` com `{crmInstanceId, versionId: string | null, expectedActivationId, requestId}` para retorno ou desativação. `expectedActivationId` aceita nulo antes da primeira ativação ou após desativar. Os dois comandos retornam a ativação registrada em repetição idempotente.

- [ ] Criar testes `publish_requires_complete_current_preview`, `edits_after_preview_use_latest_facts`, `retry_keeps_one_current_result`, `time_boundary_applies_once`, `late_signal_cannot_reset_buyer_clock`, `old_version_job_cannot_change_visible_score` e `rollback_reuses_legacy_scores`. Usar relógio fixo e conferir recálculo sem edição humana, transição no dia exato e ausência de efeitos de baseline.
- [ ] Rodar `npm --prefix backend run test:integration -- tests/integration/crm-priority-recalculation.test.ts`. Esperado: falha pelos contratos de publicação e recálculo ausentes.
- [ ] Criar `crm_priority_activations` (ID, versão, autor, data e cursor da carga), `crm_priority_evaluations` com chave `(lead_id, activation_id)`, resultado, data de cálculo e `next_evaluation_at`, `crm_priority_transitions` para mudanças relevantes e `crm_priority_work` com marca durável por lead, motivo e ativação solicitada. Publicar em transação com bloqueio do apontador, comparação da revisão e registro da nova ativação. Reiniciar a carga e desligar efeitos em publicação, retorno ou desativação. Consumir páginas de 50 por cursor estável, usando o histórico pelo leitor da Tarefa 3. Usar o agendador líder para drenar pendências e avaliações vencidas a cada minuto. Indexar escopo, cursor e data de próxima avaliação. Calcular com fatos atuais em transação por lead e impedir perda de marca concorrente. Usar a ordem de locks lead → trabalho por lead em escritores e consumidor. A leitura só apresenta resultados do ID de ativação vigente. A publicação bloqueia a configuração e enfileira a carga, sem bloquear fichas nessa transação.
- [ ] Marcar como pendente no commit de criação, atualização, troca de etapa, alteração de perfil, opt-out, recuperação, sinais e reconciliação do Radar. Enfileirar a instância quando campos usados forem arquivados ou restaurados, com recálculo sem efeitos. Criar teste por entrada relevante. Reusar escopo de serviço worker e lead ativo no consumo. Excluir avaliações antigas da leitura com o apontador ativo, mesmo durante o backfill. Testar retorno à versão anterior com ficha alterada durante a ativação intermediária.
- [ ] Reexecutar testes do recálculo e validar plano de consulta com `EXPLAIN` em carteira sintética de 10 mil leads distribuídos entre instâncias. Esperado: páginas delimitadas e seleção de pendências/vencidos por índices, sem varredura integral a cada tick.
- [ ] Commit `feat(crm): publish and refresh lead priority safely`.

### Tarefa 5 — Configuração e fila no CRM

**Arquivos:** criar `PrioritySettings.tsx`, `crmPriorityService.ts`, `crmPriority.ts`, `PrioritySettings.test.tsx` e `backend/tests/integration/crm-priority-visibility.test.ts`. Modificar `PortalLeadScoringPage.tsx`, `LeadScoreSummary.tsx`, `CrmWorkspace.tsx`, `TodayWorkQueue.tsx`, `frontend/src/types/crm.ts`, `frontend/src/services/crmService.ts`, `priority-routes.ts` e `listLeads` em `backend/src/modules/crm/repository.ts`.

**Interfaces:** `GET /crm/leads/:id/priority` retorna avaliação e explicação da versão ativa ou estado `pending`; `GET /crm/leads/:id/priority/history?afterId=...` retorna transições autorizadas com cursor, em páginas de 50. As respostas de lista e Kanban têm apenas resumo da versão atual, consultado junto da listagem. `priority: null` preserva a apresentação atual. A leitura aplica bloqueio, exclusão e status vigentes mesmo enquanto o recálculo está pendente. A ordenação comercial usa fila, nota decrescente, próxima ação crescente com nulos no fim e ID como desempate.

- [ ] Criar testes de edição e prévia da mesma revisão, confirmação explícita de publicação, exibição de **Calculando**, ordenação com duas filas e explicação de potencial alto com temperatura baixa. Garantir que leads excluídos da prioridade não apareçam na fila de contato e que um SLA existente continue acessível. Incluir teste HTTP direto de resumo e histórico nas quatro audiências previstas em `AGENTS.md`, com conta cruzada e valores comerciais legítimos intactos.
- [ ] Executar `npm --prefix frontend test -- src/components/crm/scoring/PrioritySettings.test.tsx`. Esperado: falha por falta da tela nova.
- [ ] Implementar editor por grupos, pesos, matriz, impedimentos e sinais. Validar configuração com mensagens do servidor. A prévia mostra distribuição, mudanças, dados pendentes e penalidades separadas. Na ficha, mostrar potencial, temperatura e prioridade com explicação. Na lista e Kanban, usar rótulo compacto e permitir filtro por fila. Na fila Hoje, separar prazos operacionais da ordem de prioridade comercial. Reutilizar identidade, histórico e componentes de layout existentes.
- [ ] Rodar o teste novo, `PortalLeadScoringPage.test.tsx`, `LeadQualification.test.tsx` e os testes HTTP do DTO. Validar no navegador a 390 px e no desktop com duas contas, uma no modelo novo e outra no modelo atual.
- [ ] Commit `feat(crm): surface scoring configuration and priority queues`.

### Tarefa 6 — Próxima ação e tarefa opcional

**Arquivos:** criar `priority-actions.ts`; modificar `priority-recalculation.ts`, `priority-routes.ts`, `task-repository.ts` e `PrioritySettings.tsx`. Testar em `backend/tests/integration/crm-priority-actions.test.ts`.

**Interfaces:** `applyPriorityTransition(db: QualificationDb, input: PriorityTransition): Promise<void>`. Recebe lead, ativação, fila anterior e nova, ID da transição persistida e motivo `baseline | change | time`. `PATCH /crm/priority/effects` aceita `{crmInstanceId, expectedActivationId, enabled}`. A versão define as filas com ação de criar tarefa e o prazo em dias. A ativação começa com efeitos desligados.

- [ ] Testar transição que recomenda ação, efeitos desligados, baseline sem efeitos, repetição gerando uma tarefa, entrada posterior na mesma fila gerando uma nova tarefa e opt-out/exclusão/desativação ocorridos antes da gravação impedindo ação.
- [ ] Executar `npm --prefix backend run test:integration -- tests/integration/crm-priority-actions.test.ts`. Esperado: falha pelo contrato ainda ausente.
- [ ] Mostrar recomendação da fila. Se houver autorização de efeitos e a transição estiver configurada, usar o repositório de tarefas e chave única por transição. Persistir a tarefa e a marca de efeito atomicamente. Revalidar estado operacional e versão dentro da transação. Baseline registra avaliação e segue sem efeitos. Usar prazo em dias da configuração e responsável atual; sem responsável, a sugestão continua visível para atribuição.
- [ ] Reexecutar testes, incluindo falha injetada após gravar a tarefa e repetição do job, com uma única tarefa persistida.
- [ ] Commit `feat(crm): suggest and schedule priority follow-ups`.

### Tarefa 7 — Homologação, publicação e piloto

**Arquivos:** `docs/crm-lead-management.md`, `docs/releases/yux-remediation-manifest.json`, `docker-compose.dokploy.yml` como referência da ordem de inicialização.

- [ ] Atualizar a documentação da operação e o inventário de migrations. Validar com `npm --prefix backend run verify:remediation-release`. Manter os controles de autorização de outros pilotos conforme a configuração vigente.
- [ ] Rodar testes e builds de backend e frontend, incluindo integração PostgreSQL com roles reais. Conferir migrations em banco vazio e em uma cópia sanitizada do esquema anterior.
- [ ] Em homologação, simular uma carteira genérica com tipos diferentes, campos vazios, históricos duplicados, resposta tardia, bloqueio e dados importados. Verificar os resultados do mesmo lead na ficha, na fila e no Kanban. Ensaiar desativação e retorno de versão durante o recálculo.
- [ ] Após autorização de implantação, publicar no Dokploy. Verificar execução das migrations antes da API, saúde, frontend servido e worker de manutenção. Validar uma instância no modelo anterior.
- [ ] Preparar configuração de piloto separada para a conta escolhida. Inventariar fluxos legados que consomem pontuação. Revisar amostra com alto potencial frio, interesse alto com cobertura baixa, bloqueio e regras alternativas. Aprovar a prévia antes de ativar para a conta. Conferir cobertura, distribuição, fila de pendências, idade do recálculo e histórico das mudanças.
- [ ] Habilitar tarefas automáticas somente após validação operacional da conta. Se a avaliação se mostrar incorreta, desligar efeitos e voltar o apontador para a versão anterior ou desativar a prioridade. O rollback preserva histórico, fichas, sinais e migrations.
