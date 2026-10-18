# Radar: continuidade e limites no Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurar a continuidade do Radar na versão visual atual e permitir configuração administrativa dos tetos operacionais sem regressões ou consumo externo não autorizado.

**Architecture:** Consolidar as histórias do portal e do Radar, sem sobrescrita. Introduzir política operacional versionada e um contrato único de continuação, com prova durável de cursor e confirmação transacional compartilhada por início e retomada. Manter o pipeline de aprofundamento e seus recibos; mudar apenas validação, configuração e recuperação de estado.

**Tech Stack:** Fastify, TypeScript, PostgreSQL/RLS, BullMQ/outbox, React/Vite, Vitest, navegador conectado com fontes simuladas.

**Spec:** `docs/superpowers/specs/2026-10-18-radar-continuacao-limites-admin-design.md`

## Global Constraints

- Somente `yux_admin` pode acessar política, fornecedores, custos e diagnósticos; aplicar no HTTP e na interface.
- Não executar API/LLM pago, modificar credenciais ou limites de produção nem fazer deploy sem autorização específica.
- Não apagar resultados, auditoria, uso/custo, overflow ou autorizações anteriores; não fazer reset/force-push.
- Preservar o portal visual e os demais módulos. Restrições de segurança e de transporte não serão desabilitadas.
- Política salva não inicia trabalho nem aumenta o consumo autorizado dos lotes existentes.
- Publicação não comprova implantação ou qualidade de uma busca paga.

## Review Focus

1. Outra branch substituir código corrigido: conferir ancestrais e SHA implantado, preservar também as alterações visuais.
2. Novo lote herdar token antigo/rejeitado de outro lote da mesma campanha: exigir aprovação antes da reserva paga, sem cruzar revisão/região.
3. Política global mudar com lote ativo ou formulário aberto: manter autorização identificável e rejeitar consentimento obsoleto sem mutação.
4. Página maior/continuação herdada trazer mais resultados que o pedido: reservar custo correto e guardar excedentes sem perda ou duplicação.
5. Quota/IA/rede falhar após descoberta: retomar os trabalhos existentes sem refazer descoberta ou chamadas com resultado desconhecido.

---

### Task 1: Consolidar a base de publicação sem perder o portal

**Files:** integração de Git de `main@b3151b2` e `feat/portal-identidade-visual@03244fb`; verificar conflitos em `frontend/src/components/radar/RadarWorkspace.tsx`, `RadarCaptureControls.tsx`, `RadarCaptureProgress.tsx` e respectivos testes; preservar todos os demais arquivos das duas linhas.

**Interfaces:** Consome ambas as histórias Git. Produz um commit de integração que tem as duas pontas como ancestrais, mantendo `capture-preflight.ts`, `capture-capacity.ts`, `capture-limit-authorization.ts` e a migração 0193.

- [ ] **Step 1:** Obter aprovação do plano e da consolidação; confirmar estado limpo dos checkouts, listar artefatos e reutilizar worktree adequado. Não tocar no checkout da outra tarefa.
- [ ] **Step 2:** Criar teste de contrato em `backend/tests/radar-capture-preflight.test.ts`: a resposta Admin de lote parcial por limite tem `canContinue: true`; preflight/retomada existem e não aparecem a outros papéis. Confirmar a ausência desses contratos na árvore visual anterior com inspeção de Git.
- [ ] **Step 3:** Integrar as duas histórias no checkout isolado e resolver conflitos preservando layout visual e recuperação durável. Não publicar branches compartilhadas nesta etapa.
- [ ] **Step 4:** Rodar testes backend e frontend, type-check e builds. Critério: nenhuma regressão nova, todas as correções e o portal presentes. Confirmar ambas as ancestralidades com `git merge-base --is-ancestor`.
- [ ] **Step 5:** Commit de integração; registrar os dois ancestrais no runbook.

### Task 2: Política persistida e validação única dos limites do Radar

**Files:** criar `backend/src/db/migrations/0194_radar_operational_limits.sql`, `backend/src/modules/radar/operational-limits.ts`, `backend/tests/radar-operational-limits.test.ts`; modificar `radar/routes.ts`, `search-configuration.ts`, `capture-operation.ts`, `capture-preflight.ts`, `capture-limit-authorization.ts`, `repository.ts`, `research-service.ts`, `sourceRules.ts` somente nos pontos específicos do Radar configurável.

**Interfaces:** Produz `getRadarOperationalLimits(db, user)`, `updateRadarOperationalLimits(db, user, {expectedVersion, limits})` e `validateRadarOperationalConfiguration(configuration, limits)`. DTO `{version, limits, updatedAt, updatedBy}`; conflito de versão retorna 409. Rotas `GET/PUT /api/radar/admin/operational-limits`, somente Admin YUX. Armazenamento singleton global e tabela append-only de auditoria; grants/RLS permitem somente Admin pelo papel API e leitura necessária por worker.

- [ ] **Step 1:** Escrever testes falhando: salvar/ler limites superiores a 10 páginas, 100 consultas e 25 verificações; negar zero, negativos, frações, números não seguros, NaN e escrita concorrente obsoleta. Negar leitura/escrita HTTP a operador, admin de conta e membro; a falha não divulga DTO técnico.
- [ ] **Step 2:** Rodar `node node_modules/vitest/vitest.mjs run tests/radar-operational-limits.test.ts --reporter=dot` com PostgreSQL isolado. Esperado: falhas pela API/persistência ausente, não por infraestrutura.
- [ ] **Step 3:** Implementar política/campos da spec. Defaults atuais; idade administrativa de continuação proposta em 60 minutos. Remover tetos de negócio duplicados dos schemas estáticos; aplicar a política nas rotas, serviços e reservas. Não alterar `assertSmallBatchLimit` globalmente para operações não relacionadas.
- [ ] **Step 4:** Testar redução/aumento com lote em andamento e formulário antigo: não iniciar consultas, não invalidar critérios nem aumentar autorização do lote. Identificar os valores aprovados/política efetiva. Se ampliar páginas de transporte, adicionar teste de 25 registros: previsão em três unidades de cobrança, uma chamada, excedentes preservados e continuação sem filtros; não afirmar teto externo não documentado.
- [ ] **Step 5:** Repetir testes e type-check; commit da política com migração forward-only e plano de rollback de código compatível.

### Task 3: Continuação durável antes da chamada, para início e retomada

**Files:** criar `backend/src/modules/radar/continuation-state.ts` e `backend/src/db/migrations/0195_radar_continuation_state.sql`; modificar `capture-continuation.ts`, `capture-preflight.ts`, `capture-operation.ts`, `capture-dispatch.ts`, `capture-discovery.ts`, `repository.ts`; testes `radar-capture-continuation.test.ts`, `radar-capture-capacity.test.ts`, `radar-capture-limit-authorization.test.ts` e `tests/integration/radar-capture-operation.test.ts`.

**Interfaces:** `inspectRadarContinuationState(db, scope, policy)` retorna `{stateId, generation, reason, requiresRestartConfirmation, replayEstimate}` sem token. `approveRadarContinuationRestart(client, scope, {expectedStateId, requestId, approvedBy})` reinicia somente o cursor exibido e registra auditoria. Consome a política da Task 2 e mantém compatibilidade de recibos legados. Preflight/início/retomada/reserva compartilham a mesma decisão; nenhuma chamada de rede na transação de aprovação.

- [ ] **Step 1:** Escrever regressão do histórico real: recibo legado recuperado + três páginas duplicadas bem-sucedidas + pausa longa + outro lote herdando cursor. Antes de confirmação, zero chamadas ao adaptador. Depois, reiniciar sem token, reencontrar 40 anteriores, admitir 20 novas e executar os 20 trabalhos de aprofundamento.
- [ ] **Step 2:** Rodar as suítes de continuação/capacidade com banco isolado e confirmar falha no cenário novo.
- [ ] **Step 3:** Persistir geração, data de obtenção e rejeição do cursor; não usar `updated_at` como emissão. Tratar token legado de idade desconhecida sem adivinhar validade. Revalidar consentimento e política sob lock antes da reserva; impedir reenvio de token já rejeitado. Preservar recibos incertos, contadores e overflow.
- [ ] **Step 4:** Acrescentar testes: duas abas, consentimento antigo após avanço do cursor, outra região/revisão/conta, HTTP 400 genérico sem prova de expiração, 503/timeout, erro na persistência, queda após aprovação e antes da fila, quota diária esgotada, IA indisponível no meio. Retomar somente etapas pendentes; nenhum reset de saldo/uso. Mostrar estimativa de páginas revisitadas e manter pausa de limite retomável.
- [ ] **Step 5:** Rodar todas as oito suítes de captação e a integração de worker; commit apenas com o ciclo completo aprovado.

### Task 4: Controles no Admin e uma confirmação clara na campanha

**Files:** criar `frontend/src/components/platform/admin/RadarOperationalLimitsPanel.tsx` e teste; modificar `AdminIntegrationsPage.tsx`, `radarService.ts`, `types/radarResearch.ts`, `RadarCampaignConfigurationForm.tsx`, `RadarCaptureContinuationDialog.tsx`, `RadarCaptureControls.tsx`, `RadarWorkspace.tsx`, `RadarCaptureProgress.tsx` e testes correspondentes.

**Interfaces:** Consome `GET/PUT /admin/operational-limits` e o estado de continuação da Task 3. Admin recebe versão e tetos dinâmicos; campanhas usam os mesmos valores do servidor. A confirmação aplica explicitamente apenas limites/cursor selecionados ao mesmo lote, sem copiar critérios comerciais nem trocar a quantidade solicitada.

- [ ] **Step 1:** Escrever testes falhando: editar teto no Admin, atualizar formulário, propor valores antes impossíveis e verificar persistência; salvar não chama API de pesquisa. Cliente/admin de conta/operador não recebem/veem política técnica. Campanha com lote 20 não transforma um pedido de 10 em continuidade silenciosa de 20.
- [ ] **Step 2:** Rodar os testes dos componentes e confirmar falha da nova interação.
- [ ] **Step 3:** Implementar painel no padrão visual existente, com valores atuais, limites da campanha versus do lote e botão de salvar. Carregar a política sem duplicar requisições; erro de leitura não pode substituir autorização salva por defaults silenciosos.
- [ ] **Step 4:** Unificar confirmação de retomada/início com token antigo: explicar páginas revisitadas, quantidade restante e alterações autorizadas. Tratar política/recibo desatualizado e respostas HTTP perdidas sem dupla submissão. Manter uma ação primária e não mostrar fornecedores/custos ao cliente.
- [ ] **Step 5:** Rodar testes frontend, type-check, build e lint comparativo; validar no navegador local Admin → política → campanha → confirmação → progresso concluído com fontes simuladas. Conferir recarga, console, desktop e mobile. Commit.

### Task 5: Gate de release e verificação proporcional de regressões

**Files:** atualizar `docs/runbooks/radar-pesquisa-configuravel.md`; estender `backend/tests/journeys/start-radar-capture-server.ts` para o cenário novo; preservar a infraestrutura de identidade em `backend/src/modules/health/routes.ts`.

**Interfaces:** Consome commit consolidado e evidências de testes; produz checklist de implantação com SHA esperado e estado de migrações. Não usa uma branch isolada de visual/bugfix como substituto da integração.

- [ ] **Step 1:** Rodar suíte completa backend/frontend e integrações isoladas. Verificar CRM, missões, permissões do portal e configurações de IA como regressão, sem mudar o comportamento desses módulos.
- [ ] **Step 2:** Repetir no navegador os estados: lote legado parcial, novo lote com token antigo, confirmação obsoleta, limite insuficiente, esgotamento real, worker interrompido e retomada. Registrar prova sem segredos fora do repositório.
- [ ] **Step 3:** Revisar diff e confirmar que a política/cursor não ampliou capacidades de papéis ou relaxou segurança de leitura. Comparar efeitos fora do Radar com o commit visual aprovado, não com o main antigo apenas.
- [ ] **Step 4:** Publicar o commit consolidado em main conforme autorização de publicação existente; registrar testes e pendências. Solicitar autorização específica antes de mudar a branch do Dokploy/deploy e antes do piloto pago, com teto atualizado.
- [ ] **Step 5:** Após autorizações, conferir o SHA backend/frontend, migrações e preflight do lote real. Executar piloto limitado, observar novas admissões e aprofundamento até estado terminal verdadeiro. Só então reportar resolução em produção; restaurar limites temporários se houver autorização de aumento temporário.
