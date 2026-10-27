# Radar: feedback, aderência e exclusões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução direta, sem subagentes, conforme preferência explícita já fornecida pelo usuário.

**Goal:** Mostrar pendências acionáveis por empresa, aplicar a aderência semântica de verdade e impedir reinserção/reenriquecimento de empresas excluídas da mesma campanha.

**Architecture:** Um estado comercial canônico alimenta lote, linha e detalhe; diagnósticos permanecem exclusivos do Admin YUX. A qualificação semântica existente governa o resultado comercial e a reposição; exclusões manuais têm registro durável e escopo por campanha, consultado em todos os caminhos de entrada e execução.

**Tech Stack:** TypeScript/Fastify/PostgreSQL, React, runtime Python existente, Vitest e pytest, contratos Radar já gerados para TS/Python.

**Spec:** `docs/superpowers/specs/2026-10-27-radar-fit-feedback-exclusions.md`

## Global Constraints

- Somente `yux_admin` vê ferramentas, fornecedores, modelos, rotas, licenças, custos internos e diagnósticos técnicos. Allowlists explícitas e aninhadas no backend.
- Nenhuma lista global nova de palavras, empresas, ramos ou CNAEs. Decidir aderência por significado e evidência da identidade certa.
- Sem afrouxar citação, identidade, calibração, direitos de entrega, RLS, aprovação comercial ou proteção contra repetição de cobrança incerta.
- Não executar provedores/LLMs pagos, ativar/trocar modelos ou aumentar quotas durante desenvolvimento. Testes simulados.
- Excluir é retirar da campanha com histórico e bloqueio de reinserção; não apagar dados globais nem registros do CRM.
- Base auditada: `origin/main` em `59a3c9b`; branch local `codex/radar-fit-feedback-exclusions`. Preservar os dois documentos preexistentes de experimento não rastreados.

## Review Focus

1. Uma nova execução individual substitui o estado antigo do lote sem deixar resumo e linha divergirem — Task 1, teste de atualização individual.
2. Empresa multissegmento ou homônima tem nome sugestivo, mas evidência contraditória — Task 2, casos de identidade e contraexemplos sem listas.
3. Mesma empresa excluída chega por outro provedor/alias sem CNPJ — Task 3, chaves corroboradas e isolamento entre campanhas.
4. Exclusão ocorre enquanto um worker aguarda resposta paga — Task 3, recibo preservado e proibição de próxima etapa/reinserção.
5. Admin da conta chama diretamente endpoints/DTOs, sem passar pela interface — Task 4, matriz HTTP de quatro papéis e isolamento.

---

## Task 1 — Estado comercial de execução e retomada acionável

**Files:**
- Create: `backend/src/modules/radar/research-attention.ts`.
- Modify: `contracts/radar/v1/radar-research.schema.json`, `backend/src/modules/radar/commercial-status.ts`, `commercial-view.ts`, `repository.ts`, `capture-reconciliation.ts`, `research-requests.ts`, `routes.ts`.
- Modify: `frontend/src/types/radarCommercial.ts`, `frontend/src/services/radarService.ts`, `frontend/src/components/radar/RadarCaptureProgress.tsx`, `RadarCommercialResults.tsx`, `RadarCommercialWorkspace.tsx`, `RadarWorkspace.tsx`, `RadarCandidateResearchPanel.tsx`, `RadarCommercialResearchActions.tsx`.
- Test: `backend/tests/radar-commercial-status.test.ts`, `radar-commercial-view.test.ts`; `backend/tests/integration/radar-capture-reconciliation.test.ts`, `radar-commercial-audience.test.ts`; testes dos componentes acima.

**Interfaces:**
- `projectRadarResearchAttention(input: {assessment: RadarCaptureResearchAssessment; callStates: Array<{kind: 'presence'|'semantic'|'discovery'|'profile'; status: string; error?: string}>; canResumeSafely: boolean; requiresAttemptReview: boolean})`: retorna atenção comercial ou `null`.
- Atenção comercial tem `stage: 'website_identity'|'commercial_fit'|'public_research'`, `reason` enumerado abaixo, `nextAction: 'review_company'|'resume_available_steps'|'review_previous_attempt'` e `canResume: boolean`. Permissões e elegibilidade são calculadas no serviço, nunca pelo cliente.
- Estender opcionalmente `CommercialResearchStatusV1.attention` no contrato existente; gerar novamente os consumidores. Motivos: `identity_analysis_incomplete`, `commercial_analysis_incomplete`, `attempt_confirmation_pending`, `public_research_interrupted`. Não transportar texto bruto de erro.
- Candidato e detalhe retornam o mesmo `feedback`; lote recebe `attentionSummary: Array<{reason, count}>` e filtro por situação. O Admin mantém diagnóstico completo em superfície separada.

- [x] **1. RED:** fixture de 40 com 26 lacunas + 14 bloqueios na distribuição 10/2/1/1 da spec. Assertar os mesmos 14 IDs e motivos no resumo, linha e detalhe; atualizar uma empresa individualmente e conferir que a contagem muda junto.
- [x] **2. Implementar projeção:** consultar a execução atual, com revisão e contexto corretos, ao listar candidatos. Não usar “site não encontrado” como sinônimo de execução travada. Acrescentar contrato opcional de atenção e rodar `npm run generate:radar-contracts` no backend.
- [x] **3. Implementar interface:** badges explícitos, filtro “Aguardando retomada”, botão do resumo que aplica esse filtro, motivo no topo dos detalhes. Ao retomar, retornar progresso efetivo e pendências remanescentes. Se uma nova tentativa exige revisão/autorização, mostrar isso ao Admin; para clientes, motivo e orientação comercial sem recibos/custos/modelos. Não apresentar retomada sem efeito como sucesso.
- [x] **4. GREEN:** casos recebida inválida/revalidável, tentativa sem resposta, falha anterior, ausência normal de contato, execução ativa, estado terminal e recarregamento após retomada externa. Testar polling/revalidação para que uma página pausada não fique presa ao estado antigo.
- [x] **5. Commit:** `fix(radar): expose actionable per-company research progress`.

## Task 2 — Aplicar qualificação semântica, reservar conclusão e contar aderentes

**Files:**
- Create: `backend/src/modules/radar/semantic-eligibility.ts`.
- Modify: `backend/src/modules/radar/research-service.ts`, `capture-research-state.ts`, `company-projection.ts`, `funnel-replenishment.ts`, `search-configuration.ts`, `operational-limits.ts`, `funnel-discovery.ts`, `decision-service.ts`, `capture-operation.ts`, `capture-preflight.ts`, `commercial-view.ts`.
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_qualification.py` e testes correspondentes; controles técnicos existentes do Admin para limites/política se o contrato ganhar um teto novo.
- Test: `backend/tests/radar-funnel-pipeline.test.ts`, `radar-funnel-replenishment.test.ts`; `backend/tests/integration/radar-funnel-round.test.ts`, `radar-funnel-states.test.ts`; Create: `backend/tests/radar-semantic-eligibility.test.ts`.

**Interfaces:**
- `resolveRadarSemanticEligibility(input: {qualification, identityBinding, criteriaRevision, evidenceVersion})`: retorna `compatible | outside_profile | needs_evidence`, com fundamento validado e vínculo de versão; não recebe limiar de probabilidade.
- `outside_profile` válido alimenta projeção, resultado canônico, contador e supressão semântica da Task 3. Nunca reaproveitar uma exclusão de critérios/identidade antigos.
- Verificação compacta antecipada usa a rota existente `radar_business_qualification`, sem perfil longo; reusar a conclusão enquanto o material não mudar. G1/G5 probabilísticos continuam sujeitos à calibração; não simplesmente trocar `shadow` por `enforce`.
- Configuração: `research.semanticFitRequired=true` e `research.maxSemanticFitAssessmentsPerCandidate=2` por padrão para novas campanhas/pedidos completos; teto operacional editável `maxSemanticFitAssessmentsPerCompany=2`. Não reescrever snapshots nem ativar modelos ao ler lotes antigos. Uma avaliação é um material semântico distinto; fallback continua sujeito ao limite de tentativas por efeito e ao orçamento existentes. O valor efetivo é o menor entre configuração e teto Admin, sem aumento silencioso. Sem rota autorizada, retornar pendência explícita, não aprovar por falta de análise.

- [x] **1. RED:** reproduzir `not_target` válido de Gali que continua visível e conta como lacuna. Assertar fora do público, ocultação padrão, impedimento de novo envio ao CRM e ausência na meta de aderentes. Testar evidência de homônimo, falta de informação e resposta inválida: nenhuma delas autoriza exclusão.
- [x] **2. Implementar efeito canônico:** respeitar status terminal, identidade, revisão e citações válidas. Um `not_target` comercial atual não depende do portão opcional de decisão em observação. Corrigir as duas interfaces (Admin e cliente), com acesso à visão de empresas fora do público e restauração para revisão.
- [x] **3. Implementar verificação econômica:** usar dados cadastrais descritivos e evidência pública suficiente antes do aprofundamento caro. Evidência insuficiente produz investigação curta, não um descarte por nome. Conclusão comercial final tem capacidade reservada; limitar escolhas opcionais dentro do teto existente, sem aumentá-lo. Expor os dois campos de limite semântico acima nos controles Admin existentes, versionados e testados. Cache por identidade + critérios + evidência + modelo, excluindo horários de observação.
- [x] **4. RED/GREEN de quantidade:** novas pesquisas comerciais criam `counting_mode='qualified'`; esse modo exige N compatíveis finais e não usa `minPassRatio` para declarar uma meta menor concluída. Duplicatas, fora do público, excluídas manualmente e inconclusivas não ocupam a meta; lacuna de contato opcional pode coexistir com aderência confirmada. Preservar os modos/limiares congelados de lotes antigos e mostrar neles descoberta e aderência separadamente. Depois de descoberta encerrada e sem lease/compra pendente, análises antigas aguardando atenção não impedem pedir outro lote de N novas aderentes na mesma campanha. Reposição usa esse novo pedido explícito, reaproveita páginas salvas e não recompra a descoberta anterior. Nunca iniciar reposição paga por mera conciliação ou exclusão manual. Testar independência dos dois lotes e manutenção dos 14 impedimentos antigos.
- [x] **5. GREEN sem listas:** modelos simulados classificam refeições coletivas mesmo com marca contendo “Energia”/“Higiene”; empresa de energia, loja de equipamento e fornecedor de limpeza não são operadores de refeições só por citarem clientes alimentícios. Repetir com outro segmento/campanha sem mudar código. Provar que G3 no teto não elimina a conclusão final e que erro de análise não equivale a aprovação.
- [x] **6. Commit:** `fix(radar): enforce evidenced semantic fit in commercial results`.

## Task 3 — Exclusão durável, individual/em lote e restrita à campanha

**Files:**
- Create: `backend/src/modules/radar/campaign-exclusions.ts`, `backend/src/db/migrations/0248_radar_campaign_exclusions.sql` (confirmar número livre antes de aplicar).
- Modify: `backend/src/modules/radar/routes.ts`, `repository.ts`, `candidate-admission.ts`, `entity-resolution.ts`, `capture-operation.ts`, `adaptive-capture.ts`, `research-requests.ts`, `research-service.ts`, `crm-delivery.ts`, `commercial-view.ts` e importações legadas de descoberta.
- Modify: `frontend/src/services/radarService.ts`, `frontend/src/types/radarCommercial.ts`, `frontend/src/components/radar/RadarWorkspace.tsx`, `RadarCommercialResults.tsx`, `RadarCommercialWorkspace.tsx`.
- Test: Create `backend/tests/integration/radar-campaign-exclusions.test.ts`; estender `radar-entity-resolution.test.ts`, `radar-crm-delivery.test.ts` e testes de seleção/listagem.

**Interfaces:**
- `excludeRadarCampaignCandidates(db, user, {organizationId, campaignId, candidateIds, requestId, reason?})`: ação idempotente, transacional e autorizada no escopo inteiro do lote; falha por IDs de outra conta/campanha antes de modificar qualquer item.
- `isRadarCampaignExcluded(db, {organizationId, campaignId, identity, criteriaRevision})`: usa chaves canônicas corroboradas; retorna o registro de supressão sem executar provedores.
- Persistir organização/campanha, identidade canônica e snapshot de chaves, candidato opcional, origem manual/semântica, fundamento, revisão semântica, autor/data e revogação. Exclusão manual independe de revisão; semântica vincula-se aos critérios. RLS e índices por organização/campanha/identidade; sem propagação global.
- Rotas comerciais explícitas: `POST /campaigns/:id/exclusions`, `GET /campaigns/:id/exclusions`, `POST /campaigns/:id/exclusions/:exclusionId/restore`. Compatibilizar `/candidates/:id/discard` com a mesma operação. Respostas por allowlist, sem chaves internas de matching.

- [x] **1. RED:** excluir dois candidatos e repetir a mesma solicitação; eles somem da lista principal, permanecem no arquivo de excluídos e não reaparecem por outra fonte, alias corroborado, CNPJ, página repetida ou edição de critérios. Mesma empresa é elegível na campanha B e em uma duplicação da campanha A. Homônimo com identidade diferente não é suprimido por nome isolado.
- [x] **2. Implementar armazenamento e API:** reutilizar normalização/chaves de `entity-resolution.ts` e o descarte existente; manter tombstone independente da existência futura do candidato. Migrar descartes anteriores para preservação equivalente. Bloquear novo enriquecimento de excluídos antes de lookup/IA/enfileiramento e bloquear nova entrega ao CRM/exportação da campanha.
- [x] **3. Implementar corrida de worker:** conferir exclusão antes de cada efeito e antes da projeção final. Uma resposta já em trânsito é auditada, mas não reinclui o candidato nem inicia outra etapa. Restaurar revoga a supressão e devolve à revisão; não liga pesquisa paga nem aprovação automaticamente. Não apagar lead existente no CRM.
- [x] **4. Implementar interface:** ação “Excluir da campanha” no item e na seleção, confirmação com quantidade/escopo, visão “Excluídas desta campanha”, motivo comercial e ação de restauração. Tirar excluídas da seleção e recalcular contadores; mostrar que não ocupam resultado aderente. Não depender de botão técnico enterrado nos detalhes.
- [x] **5. GREEN:** HTTP idempotente, lote com IDs de duas contas rejeitado integralmente, RLS, corrida de exclusão durante resposta simulada, restauração explícita e ausência de chamadas pagas para excluídos. Confirmar entrada antiga por CNPJá, web/Perplexity, mapas e importação sem duplicar supressão global.
- [x] **6. Commit:** `feat(radar): add durable campaign-scoped exclusions`.

## Task 4 — Validação integrada e recuperação do lote atual

**Files:**
- Modify tests: `backend/tests/integration/radar-commercial-audience.test.ts`, `radar-administrative-resume.test.ts`, `radar-capture-reconciliation.test.ts`, `radar-funnel-round.test.ts`, `frontend/src/components/radar/RadarWorkspace.test.tsx`, `RadarCommercialResults.test.tsx`, `RadarCommercialResearchActions.test.tsx`.
- Update: este plano com resultados verificáveis e registro da publicação, quando autorizada.

- [x] **1. Executar matriz de audiência:** Admin YUX, operador, Admin da conta e membro; chamadas HTTP diretas a lista, pesquisa, lote, exclusões, histórico e CRM. Clientes recebem motivo comercial, nunca provedores/modelos/recibos/JSON bruto. Preservar nomes comerciais legítimos e direitos de entrega.
- [x] **2. Executar jornada de qualidade:** cenário com N solicitado, incompatíveis e duplicatas intercalados; comprovar N aderentes ou déficit explicado por capacidade real, sem preencher com irrelevantes. Usuário encontra as pendentes, vê o motivo, retoma apenas etapas elegíveis e exclui/restaura sem reinserção por outra fonte.
- [x] **3. Executar verificações:** backend geral, integração PostgreSQL isolada, pytest do runtime alterado, testes/build frontend e build backend. QA visual em desktop e largura móvel, usando navegador e serviços simulados. Não executar novo piloto pago em nome dos testes.
  - Backend: `npm test -- --maxWorkers=2`, `npm run build`; sucesso é saída 0.
  - Banco isolado: configurar `YUX_RADAR_TEST_DATABASE_URL` para fixture local descartável, aplicar migrações nessa fixture e executar `npx vitest run --config vitest.integration.config.ts tests/integration/radar-campaign-exclusions.test.ts tests/integration/radar-commercial-audience.test.ts tests/integration/radar-funnel-round.test.ts tests/integration/radar-capture-reconciliation.test.ts tests/integration/radar-administrative-resume.test.ts`. Os casos selecionados devem passar sem skip; nunca usar o banco de produção.
  - Runtime, em `workers/marketing-studio-agent-runtime`: `python -m pytest tests/test_radar_qualification.py tests/test_radar_presence.py tests/test_radar_receipts.py`; sucesso é saída 0.
  - Frontend: `npx vitest run src/components/radar/RadarWorkspace.test.tsx src/components/radar/RadarCommercialResults.test.tsx src/components/radar/RadarCommercialResearchActions.test.tsx`, depois `npm run build`; sucesso é saída 0 e orçamento de bundle preservado.
- [ ] **4. Recuperação em produção após publicação (pendente):** depois de revisão/publicação autorizadas, conciliar projeções e contagens atuais com resultados semânticos válidos já existentes. Revalidação gratuita não pode promover citação inválida. Os 12 casos com resposta salva, Rosamar sem resposta e a falha anterior de MANGARDEN recebem o motivo/ação corretos; nova geração só com autorização específica. Não prometer zerar 14 falhas sem essa distinção.
- [x] **5. Revisão final do autor em passe separado:** não alegar revisão independente/subagentes. Concluir apenas com evidências de API + banco + interface da mesma versão; preservar as mudanças de outras frentes.
- [ ] **6. Publicação separada (pendente):** preparar commit verificável. Main aciona deploy automático, portanto obter autorização explícita para essa publicação/deploy caso ainda não fornecida para esta entrega. Pedir eventual autorização de reavaliação paga somente após existir uma versão concreta, testada e com os casos/modelos/custos delimitados.

## Handoff

Plano aprovado e implementado diretamente nesta sessão, sem subagentes. Alterações de software verificadas localmente; publicação, deploy e reprocessamento pago em produção permanecem separados. Nenhum modelo/credencial/orçamento de produção foi alterado e nenhuma chamada paga foi executada.

## Registro da implementação local — 27/10/2026

- Pendências comerciais enumeradas, motivos agrupados por lote e identificação na linha/resumo/detalhe, com filtro de retomada nas interfaces comercial e administrativa.
- Qualificação semântica fundamentada passa a produzir exclusão canônica reversível. Checagem antecipada usa a rota existente; decisões probabilísticas continuam protegidas pela calibração. Associação apenas ao grupo e citações inválidas não excluem uma unidade.
- Citações antigas com ordem diferente de páginas são conferidas pela URL vinculada e trecho literal, sem recomprar análise para corrigir a projeção.
- Novas pesquisas completas usam a quantidade final de aderentes. Lotes históricos e operações técnicas legadas preservam seu contrato de contagem; não há reposição paga por mera exclusão/consulta de resultados.
- Exclusão individual/em lote guarda identidade e pedido idempotente por organização/campanha. Impede admissão/lookup/etapas seguintes, inclusive em corrida com worker. Outra campanha continua elegível.
- Restauração não pesquisa nem aprova automaticamente: preserva a aprovação anterior no histórico, devolve à revisão e é idempotente mesmo após uma aprovação posterior.
- Migrações: `0248_radar_campaign_exclusions.sql` e `0249_radar_semantic_assessment_limit.sql`; inventário de migrações atualizado. Nenhuma migração aplicada em produção.
- Limite global e limite da campanha para avaliações semânticas editáveis nos controles técnicos do Admin YUX.

### Verificação

- Backend geral: 1.573 testes aprovados; 126 testes opcionais de banco ignorados nessa suíte geral, com integração Radar executada separadamente em PostgreSQL.
- Frontend completo: 1.258 testes aprovados em 230 arquivos, incluindo confirmação/recuperação de exclusão, permissões de consulta e progresso pela quantidade aderente.
- PostgreSQL Radar completo: 39 arquivos, 206 testes aprovados. Banco local isolado; nenhuma chamada real a fornecedores pagos. Instância descartável encerrada após os testes.
- Política/contratos/aderência com fixture PostgreSQL: 76 testes aprovados.
- Runtime: 39 testes aprovados de presença, qualificação e recibos.
- Builds backend/frontend aprovados; orçamento de bundle aprovado.
- Navegador real: filtro por pendência, resumo expandido, exclusão, arquivo e restauração com serviços simulados; desktop e área móvel 390×844; sem erros de console.
- Regressões adicionais: arquivo respeita restrições de atribuição por audiência; confirmação mantém a seleção original em nova tentativa; progresso de uma meta de aderentes não conta empresas fora do perfil como concluídas.

### Decisões e limites desta entrega

1. Revisão final feita pelo autor, sem subagentes, conforme escolha do usuário. Limite: não houve revisão independente.
2. Contratos, projeção e exclusão são publicados em um único commit local coeso. Custo: revisão por commit menos granular; evita uma versão intermediária com contratos incompatíveis.
3. O qualificador usa o escopo de identidade/revisão já imposto pelos serviços e evidências vinculadas, em vez de duplicar parâmetros de versão. Chamadores futuros devem preservar esse escopo.
4. Testes de entrega manual ao CRM selecionam explicitamente a política legada da fixture; as verificações de conclusão do fluxo completo em produção permanecem ativas e têm testes próprios.
5. Pesquisa completa nova conta N aderentes; lotes históricos de 40 e operações técnicas legadas mantêm seu contrato. Custo: o lote antigo não compra automaticamente substitutas ao recalcular exclusões.
6. A atualização do fluxo completo pode reutilizar um site associado ainda válido e executar nova análise, sem cobrar uma busca web redundante. O teste verifica as análises novas e o consumo real registrado.

### Pendências deliberadas após a entrega de código

- Mesclar/publicar/deploy dependem da escolha explícita do usuário para esta entrega.
- Os 14 casos reais não foram reprocessados nesta implementação. As respostas existentes continuam preservadas; 12 são revalidáveis sem nova geração, o que não garante sua validade, e a tentativa sem resposta exige conferência/autorização específica antes de outra chamada.
- Não há benchmark calibrado novo, troca de modelo nem promessa de acerto de 100% de uma classificação. O fluxo exige evidência válida e mantém revisão quando não há suporte suficiente.
