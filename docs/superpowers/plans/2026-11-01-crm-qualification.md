# CRM Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a ficha personalizada visível, pontuar leads por perfil e atividades, e permitir exclusão recuperável diretamente no CRM.

**Architecture:** Três entregas verificáveis: apresentação da ficha/destaques; configuração e cálculo de pontuação/temperatura; exclusão operacional. Reutilizar definições de campos, motor de eventos e regras do CRM, com contribuições de estado recalculáveis separadas de eventos idempotentes. Manter as notas do Radar isoladas.

**Tech Stack:** React 18, TypeScript, componentes Radix locais, Fastify, PostgreSQL com RLS, BullMQ, Vitest e testes de navegador.

**Spec:** [2026-11-01-crm-qualification-spec.md](2026-11-01-crm-qualification-spec.md)

## Global Constraints

- Sem migração, deploy, chamadas pagas, envio de mensagens, alteração de credenciais ou exclusão de leads reais nesta etapa de desenvolvimento.
- Não importar nem reutilizar notas, fornecedores ou mecanismos técnicos do Radar. Dados novos expostos por DTO usam allowlists explícitas; nada de JSON bruto ou metadados técnicos em destaques/explicações.
- Validar Admin YUX, operador, administrador da conta e membro com chamadas HTTP diretas e isolamento entre organizações e instâncias CRM. Acesso a vendedor/gestor continua respeitando o escopo já previsto pelo CRM.
- Campos/definições e respostas existentes continuam íntegros. Nenhuma regra ilustrativa é ativada automaticamente.
- Seguir componentes, linguagem e layouts existentes; verificar desktop e celular. Implementação sem novos serviços externos.

## Evidência da investigação

- Base limpa `5b82018`, igual à `origin/main` consultada em 01/11/2026.
- `CrmWorkspace.tsx:746`: modal abre em Follow-up; `LeadProfilePanel` existe somente na aba Perfil do cliente. A listagem não recebe valores personalizados.
- `PortalLeadScoringPage.tsx`: quando `model` é nulo, mostra apenas orientação para falar com a equipe. Backend oferece GET/PATCH do modelo, mas nenhum POST; `createScoringModel` já existe no repositório.
- `ScoringRuleEditor.tsx`: campo livre `payload.source`, sem catálogo legível e sem faixas. Engine recebe campos comuns e payload do evento, sem respostas personalizadas.
- `scoring-engine.ts`: incrementa notas por evento. Usar essa lógica diretamente para alterações da ficha inflaria a nota a cada salvamento.
- Webhook `omnichannel.inbound.received` nasce sem `leadId`/`crmInstanceId`; não basta adicionar esse nome ao seletor para pontuar respostas. É necessário emitir evento comercial depois de resolver o relacionamento.
- Não há DELETE de lead no módulo CRM. Consultas e execução de sequências precisam compartilhar a regra de exclusão.

## Review Focus

- Zero/falso/ausência, mudança de tipo e versões arquivadas: preservar valores e exibir somente o perfil aplicável (tarefa 1).
- Faixas adjacentes, notas saturadas e edição repetida: contribuição correta sem sobreposição, inflação ou perda de pontos ao recalcular (tarefa 3).
- Webhooks duplicados ou fora de ordem e resposta ainda sem lead: nenhum ponto inventado ou duplicado (tarefa 4).
- Exclusão durante execução de job: barrar novos efeitos e preservar auditoria sem retomada implícita ao recuperar (tarefa 5).
- Usuário muda de organização ou revoga acesso com modal aberto: nenhuma ficha, destaque ou explicação de outra conta no HTTP/cache/UI (tarefas 1–5).

---

### Task 1: Ficha inicial e campos em destaque

**Files:**
- Create: `backend/src/db/migrations/0250_crm_profile_highlights.sql`
- Modify: `backend/src/modules/crm/record-profile.ts`, `backend/src/modules/crm/repository.ts`
- Modify: `frontend/src/types/crmRecordProfile.ts`, `frontend/src/types/crm.ts`, `frontend/src/services/crmRecordProfileService.ts`
- Create: `frontend/src/components/crm/LeadProfileSummary.tsx`, `frontend/src/components/crm/LeadHighlights.tsx`
- Modify: `frontend/src/components/crm/CrmRecordConfiguration.tsx`, `LeadProfilePanel.tsx`, `CrmWorkspace.tsx`, `LeadKanbanBoard.tsx`
- Test: `backend/tests/crm-record-profile.test.ts`, `backend/tests/integration/crm-record-profile.test.ts`, `frontend/src/components/crm/LeadProfile.test.tsx`, `CrmWorkspace.test.tsx`

**Interfaces:** `CrmCustomField.isHighlighted: boolean`; `CrmLead.profileSummary?: { recordTypeName: string | null; fields: Array<{ key: string; label: string; fieldType: CustomFieldType; value: CustomFieldValue; isHighlighted: boolean }> }`. Backend constrói explicitamente esse DTO a partir de definições vigentes e valores aplicáveis, com consulta em lote; nunca copia linhas ou JSON arbitrário.

- [ ] Escrever testes: `{value:0}` aparece como 0 e `{value:false}` como Não; resposta de outro tipo/versão não aparece; cross-tenant não retorna destaques; mesma tela lista 50 leads sem 50 requisições de perfil.
- [ ] Executar `node node_modules/vitest/vitest.mjs run tests/crm-record-profile.test.ts` no backend; confirmar falha das novas expectativas.
- [ ] Adicionar coluna `is_highlighted BOOLEAN NOT NULL DEFAULT FALSE`, schemas POST/PATCH e DTO. Carregar resumo em lote depois de filtrar leads autorizados.
- [ ] Mostrar resumo no início da visão Follow-up com Editar dados levando à edição. No save, invalidar resumo/lista/lead selecionado; configuração de destaque também atualiza cards.
- [ ] Executar testes de perfil frontend/backend e integração PostgreSQL; conferir responsividade e rótulos longos. Commit da entrega.

### Task 2: Modelo acessível e catálogo de campos/regras

**Files:**
- Create: `backend/src/modules/crm/scoring-configuration.ts`, `backend/src/modules/crm/scoring-configuration-routes.ts`
- Create: `backend/src/db/migrations/0251_crm_qualification_rules.sql`
- Modify: `backend/src/modules/crm/routes.ts`, `scoring-repository.ts`, `frontend/src/services/crmScoringService.ts`, `frontend/src/types/crm.ts`
- Modify: `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.tsx`, `frontend/src/components/crm/scoring/ScoringModelForm.tsx`, `ScoringRuleEditor.tsx`
- Create: `frontend/src/components/crm/scoring/ScoringProfileRuleEditor.tsx`
- Test: `backend/tests/crm-scoring-configuration.test.ts`, `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.test.tsx`

**Interfaces:** `POST /crm/scoring/model` cria modelo somente se não existe ativo (transação e lock da instância, 409 no concorrente). `GET /crm/scoring/fields?crmInstanceId=...` fornece catálogo de campos permitidos com tipo/opções/tipo de cliente. Regras possuem `kind: 'profile' | 'activity'`, condições tipadas e faixas. Modelos novos `calculationMode:'sum'`, limites morno=40/quente=70; existentes recebem `weighted` por padrão na migration.

- [ ] Testar criação sem modelo, concorrência, permissões e isolamento nos quatro papéis; desabilitar edição no cliente não substitui autorização HTTP.
- [ ] Testar catálogo sem detalhes técnicos, chaves de outra instância, tipo incorreto, limites invertidos, sobreposição e valor booleano falso.
- [ ] Implementar rotas/repositorio com allowlists de campos padrão (tipo, empresa, origem, etapa, valor e região somente se cadastrada), campos personalizados por stableKey e validadores por tipo.
- [ ] Substituir campo técnico livre por seletor com nomes do catálogo; editor de faixas mostra início inclusivo/fim exclusivo e permite limites abertos. Mostrar CTA Configurar pontuação no estado vazio e ajustar precedência do papel global interno sobre papel CRM.
- [ ] Executar testes de configuração/página e type-check; commit da entrega.

### Task 3: Contribuições de perfil, recálculo e explicação

**Files:**
- Create: `backend/src/modules/crm/scoring-profile.ts`, `scoring-summary.ts`, `scoring-recalculation.ts`
- Modify: `backend/src/modules/crm/scoring-engine.ts`, `scoring-repository.ts`, `record-profile.ts`, `routes.ts`
- Create: `frontend/src/components/crm/scoring/LeadScoreSummary.tsx`
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`, `frontend/src/pages/client-portal/commercial/PortalLeadScoringPage.tsx`
- Test: `backend/tests/crm-scoring-profile.test.ts`, `backend/tests/integration/crm-qualification.test.ts`, `frontend/src/components/crm/scoring/LeadScoreSummary.test.tsx`

**Interfaces:** `evaluateProfileRules(rules, profile): ProfileContribution[]` pura; `reconcileLeadScore(db, leadId): ScoreSummary` usa ledger de contribuições com chave única `(lead_id,rule_id,source_key)`, distinguindo estado de atividade. `ScoreSummary` expõe somente nota, temperatura, rótulos, pontos e motivo comercial. `POST /crm/scoring/recalculate` aceita modo preview/apply e instância; apply em lotes limitados com progresso, sem duplicar jobs.

- [ ] Testar refeições 499/500/999/1000 e faixas abertas; ausente não equivale a zero; salvar 10 vezes mantém nota; trocar tipo remove contribuição; outra regra de campo soma; desativar regra retira contribuição.
- [ ] Testar soma acima de 100 seguida de retirada da contribuição: recalcular pelas contribuições, nunca pelo total já truncado; modelo weighted preserva compatibilidade.
- [ ] Implementar ledger com RLS/índices na migration 0251; salvar perfil e recalcular contribuição na mesma transação. Demais alterações elegíveis alimentam recálculo pelo evento real. Serializar por lead e usar estado vigente, inclusive em evento atrasado.
- [ ] Implementar explicação e prévia/recálculo para leads existentes; página mostra progresso e erros comerciais com retry. Regras não pontuam dados importados do Radar como se fossem dados de perfil.
- [ ] Executar testes e integração de recálculo concorrente, HTTP cross-tenant e não exposição de metadados; commit da entrega.

### Task 4: Respostas, temperatura e próximas ações

**Files:**
- Modify: `backend/src/modules/events/catalog.ts`, `backend/src/modules/crm/scoring-engine.ts`, `frontend/src/components/crm/scoring/ScoringRuleEditor.tsx`
- Modify: `backend/src/jobs/handlers/omnichannel.ts` (`persistInboundWhatsAppMessage`, após persistência e associação da conversa), `backend/src/jobs/handlers/domain-events.ts` (consumidor do evento comercial).
- Create: `backend/src/modules/crm/scoring-activity.ts`, `frontend/src/lib/crm/scoreActions.ts`, `frontend/src/components/crm/scoring/LeadTemperature.tsx`
- Modify: `frontend/src/components/crm/Lead360Panel.tsx`, `LeadKanbanBoard.tsx`, `CrmWorkspace.tsx`
- Test: `backend/tests/crm-scoring-activity.test.ts`, `frontend/src/lib/crm/scoreActions.test.ts`

**Interfaces:** evento `lead.response_received` só após associação inequívoca, com channel, messageId e conteúdo textual comercial limitado no processamento; nenhuma credencial/provedor no DTO. Regras de atividade com condição tipada e limite de contribuição; chave idempotente por mensagem/tarefa/entrada de etapa. `scoreTemperature(score, warm, hot)` e `scoreActions(summary)` determinísticas; ações retornam comandos manuais existentes, sem disparar envios.

- [ ] Testar associação de `persistInboundWhatsAppMessage` e evento comercial após nova mensagem. A investigação não encontrou ingestão de resposta de e-mail associada ao CRM: oferecer registro manual explícito de resposta de e-mail por `lead.interaction_recorded`, sem afirmar rastreamento automático. Cobrir envio desse registro no formulário de interação existente.
- [ ] Testar duplicata/retry, evento sem lead, outro tenant, tarefa concluída/reaberta/concluída, condições de texto e canal, limite por regra e evento fora de ordem.
- [ ] Emitir evento comercial após associação e adaptar consumo idempotente. Eventos de pontuação derivados não se autoalimentam. Testes usam provedores simulados.
- [ ] Mostrar temperatura em português na ficha/lista/cards e ações contextuais (ex.: agendar contato, preparar proposta) por faixa configurada; links levam ao fluxo existente. Preview não executa tarefas nem mensagens.
- [ ] Executar testes de evento/automação/score e navegador com tarefa/resposta/etapa simuladas; commit da entrega.

### Task 5: Exclusão fácil e recuperável

**Files:**
- Create: `backend/src/db/migrations/0252_crm_lead_trash.sql`, `backend/src/modules/crm/lead-trash.ts`, `lead-trash-routes.ts`
- Modify: `backend/src/modules/crm/routes.ts`, `repository.ts`, `record-profile.ts`, `scheduler.ts`, `scoring-engine.ts`
- Modify: `backend/src/modules/crm/task-repository.ts`, `backend/src/modules/automation/command-adapters.ts`, `action-handlers.ts`, `backend/src/jobs/handlers/crm-dispatch.ts`, `omnichannel.ts`; aplicar guarda compartilhada ao resolver o lead antes de qualquer novo efeito.
- Modify: `frontend/src/services/crmService.ts`, `frontend/src/components/crm/CrmWorkspace.tsx`, `LeadKanbanBoard.tsx`
- Create: `frontend/src/components/crm/LeadDeleteDialog.tsx`, `LeadTrashPanel.tsx`
- Test: `backend/tests/crm-lead-trash.test.ts`, `backend/tests/integration/crm-lead-trash.test.ts`, `frontend/src/components/crm/LeadDeleteDialog.test.tsx`

**Interfaces:** `deleted_at`, `deleted_by` na tabela leads; `POST /crm/leads/trash` para lote limitado com validação atômica de todos IDs autorizados; `GET /crm/leads/trash?crmInstanceId=...`; `POST /crm/leads/:id/restore`. Não usar DELETE físico nem alterar status perdido/rejeitado. UI lê `canDelete/canRestore` calculado pelo backend conforme acesso comercial e vínculo ativo.

- [ ] Testar exclusão unitária/lote, duplicata, ID de outra conta no lote e rollback completo, recuperação e status comercial preservado. Conta sem permissão não exclui via HTTP direto.
- [ ] Implementar exclusão/auditoria e pausa das inscrições/jobs ainda não enviados na mesma transação; bloquear claims/envios/novas tarefas/scoring de excluído. Preservar histórico e documentos.
- [ ] Integrar filtro de exclusão em listagens, indicadores, busca, tarefas operacionais e comando direto; inventariar todos leitores/escritores antes de fechar tarefa.
- [ ] Adicionar ação Excluir em linha/card/ficha, seleção múltipla e confirmação com nomes/quantidade; toast de desfazer e painel Leads excluídos para recuperação posterior. Recuperar deixa sequências pausadas.
- [ ] Testar disputa de job e exclusão com lock: nenhum novo envio iniciado depois da exclusão; retornar estado correto em corrida com atualização de ficha.
- [ ] Executar testes HTTP, PostgreSQL e frontend; commit da entrega.

### Task 6: Verificação integrada e entrega para revisão

**Files:** `docs/crm-lead-management.md`; atualizar inventário de migrations em `docs/releases/yux-remediation-manifest.json` sem promover gates existentes; registrar evidências neste plano.

- [ ] Em banco local isolado, migrar a base e testar fluxo completo: configurar tipo/refeições/faixas/destaque, salvar lead com 0, editar para 1000, visualizar card/lista/ficha, simular tarefa/resposta, explicar score, excluir/recuperar. Não criar dados de teste em produção.
- [ ] Executar `npm test` e `npm run build` em backend/frontend; integração com config dedicada. Lint dos arquivos alterados e baseline, distinguindo erro já existente em RadarResearchAttention.
- [ ] Conferir browser desktop/celular, teclado, campos longos, modal trocando de lead e organização, empty/error/retry e atualização imediata sem reload manual.
- [ ] Revisar DTOs com quatro papéis e chamadas diretas; não expor JSON/fornecedores internos do Radar. Não executar serviços pagos durante validação.
- [ ] Atualizar documentação com onde consultar/editar, somar/recalcular pontos, disponibilidade dos sinais de resposta e recuperar excluídos. Entregar resultado verificável localmente, migrations pendentes e limitações reais. Deploy exige pedido específico posterior.
