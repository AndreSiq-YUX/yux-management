# Radar destravamento imediato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa, sequencial, tarefa por tarefa, sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os quatro defeitos comprovados de continuidade sem esperar novos fornecedores, seis contratos compartilhados ou tabela geral de recibos.

**Architecture:** Alterações pequenas sobre o fluxo v1, suas chamadas, autorização e outbox existentes. A0 não libera replay incerto nem promete resolver falta real de evidência; esses casos têm responsáveis no inventário.

**Tech Stack:** Fastify/TypeScript, PostgreSQL, BullMQ, React/Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md`

## Global Constraints

- Preservar quantidade, pertencimento, cursores, excedentes e recibos do lote v1; zero redescoberta ao retomar as vinte empresas.
- Nenhum gasto pago nesta revisão. Desenvolvimento usa simulações; piloto/deploy exigem autorização própria.
- Apenas `yux_admin` recebe nomes técnicos, custos e diagnósticos; clientes recebem resultado e ação comercial.
- Não remover controles financeiros, de conta, licença, SSRF, robots ou certificado.

## Review Focus

1. Um teto agregado bloquear a fonte ainda sem uso: A0.1.
2. Autorização enviada pelo navegador dispensar validação no servidor: A0.2.
3. Atualização do filho terminar depois de um resumo concorrente: A0.3.
4. Hash novo provocar recompra de análise antiga apenas por formato: A0.4.
5. Correção de continuidade apagar recibo incerto ou invalidar cursor: todas as tarefas e ensaio final.

## Preparação da base

Em 19/10/2026, após `git fetch origin main`, `origin/main...HEAD` retornou `0 0`, ambos em `2ae380adbe91ed46f54773dbfa450eb77ad00560`. Os 41 commits existem apenas em relação à `main` **local**, em `e6466ac`; as migrações 0193–0195 já estão na main remota. Não criar merge duplicado nem alterar o checkout principal sujo. Na execução, conferir novamente a base remota e escolher o próximo número livre de migração.

Ler o [inventário dos vinte itens](2026-10-19-radar-bloqueios-auditados.md) antes de modificar código. Âncoras de linha abaixo referem-se a `2ae380a`; localizar também pelo nome da função quando as linhas mudarem.

### Task A0.1 Separar consultas por fonte

**Files:** modificar `backend/src/modules/radar/research-planner.ts:22`, `research-service.ts:297`/`:549`/`:614`, `site-discovery.ts:43–74`, `research-availability.ts:40–46`, `capture-preflight.ts:69`, `capture-operation.ts:14`, `search-configuration.ts:37`, `operational-limits.ts:8`; `frontend/src/components/platform/admin/RadarOperationalLimitsPanel.tsx`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx:167`, `frontend/src/lib/radar/radarSearchConfiguration.ts` e tipos `radarResearch.ts`. Testes: `backend/tests/radar-research-planner.test.ts`, `radar-research-persistence.test.ts`, `radar-operational-limits.test.ts`, `radar-capture-preflight.test.ts`, `radar-site-discovery.test.ts`, `radar-research-availability.test.ts` e testes dos painéis.

**Interfaces:** acrescentar à política `maxSearchQueriesBySource: Record<string,number>`, validada contra catálogo de fontes de busca, e `maxSearchQueriesTotalPerCandidate: number|null`. Ausente em configuração legada: cada fonte herda o antigo `maxSearchQueriesPerCandidate`; não criar teto agregado numérico oculto. Limites monetário, diário e de campanha existentes permanecem. `resolveRadarSearchCapacity({calls,policy,intentBaseline}): {bySource:Record<string,{used:number;remaining:number}>;totalRemaining:number|null}` usa fonte e status dos recibos existentes, sem zerar histórico. Planner recebe disponibilidade por fonte e devolve `source` na próxima busca. Uma mesma consulta tentada no Serper não conta como já tentada no Brave.

Todas as portas usam esse mesmo cálculo: descoberta inicial de presença (`site-discovery.ts`), consultas direcionadas de contatos (`research-service.ts:297`), reserva paga e planner. Remover o desconto artificial de uma consulta local do orçamento web (`site-discovery.ts:53`). A função de pesquisa recebe a fonte escolhida explicitamente, não dispara todas em cascata por callback. Disponibilidade e preflight somam reservas por fonte elegível com seus preços/cotas; não mantêm a antiga estimativa de `máximo preço × teto global`. DTO legado `maxQueriesPerCandidate`, enquanto necessário, é somente derivado explicativo, nunca novo bloqueio. Atualizar formulário Admin que hoje diz “Consultas totais por empresa”; a interface comercial não mostra fonte/limite técnico.

**Exemplo:** cinco consultas Serper e nenhuma Brave: com teto cinco por fonte e orçamento disponível, Brave continua elegível. Com teto agregado explícito cinco, mostrar essa causa ao Admin. Leitura de página salva e reanálise continuam elegíveis em ambos os casos.

- [ ] **Step 1:** Criar assertions `serperUsed5_braveUsed0 => next.source==='brave_web_search'`, `explicitTotal5 => noNewSearch`, `savedPages => next.kind==='read'`, `legacyPolicy => noSilentAggregateCap`. Cobrir descoberta inicial, busca de contato e retomada, além de fonte desativada/reserva concorrente. Preflight e execução devem concordar no mesmo cenário. Tentativas por `(source,query)`; fonte local não reduz cota web e rejeição comprovada antes do efeito não consome unidade como chamada incerta.
- [ ] **Step 2:** Executar `npm test -- tests/radar-research-planner.test.ts tests/radar-research-persistence.test.ts tests/radar-operational-limits.test.ts` no backend; comprovar falha das assertions novas.
- [ ] **Step 3:** Implementar capacidade e campos Admin no caminho existente. Persistir política em JSON existente, sem nova tabela. Recontar chamadas históricas por fonte; chamadas incertas conservam reserva. Campos comerciais não aparecem na configuração do cliente como diagnóstico técnico.
- [ ] **Step 4:** Repetir testes, teste do painel e type-check backend/frontend; provar que trocar a política não troca cursor/revisão comercial. Commit `fix(radar): account research capacity per source`.

### Task A0.2 Mesma autorização no individual e no lote

**Files:** modificar `frontend/src/components/radar/RadarWorkspace.tsx:640`, `RadarCandidateResearchPanel.tsx:62`, controles de retomada, `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`, `backend/src/modules/radar/routes.ts:444`/`:550`, `research-service.ts:427`, `capture-operation.ts`, `capture-dispatch.ts:55`/`:106` e tipos. Acrescentar migração pequena `radar_capture_analysis_authorizations` no próximo número livre. Testes de componentes, `backend/tests/radar-research-persistence.test.ts` e `radar-capture-dispatch.test.ts`.

**Interfaces:** `RadarResearchAuthorization={allowSemanticRefresh:boolean;configurationRevision:number}` acompanha a intenção individual, seleção e retomada. A0 usa o mesmo caminho existente; A3 poderá acrescentar ID de autorização durável. O servidor valida papel, conta, escopo, versão e política financeira para cada filho. Autorizar nova análise por mudança de evidência **não** autoriza reenviar recibo incerto, aumentar orçamento ou ignorar TLS.

Acrescentar `allowSemanticRefresh?:boolean` ao schema HTTP de retomada e à entrada `resumeRadarCaptureOperation`; schema `.strict()` atual o rejeitaria se só a UI mudasse. Persistir em coluna JSONB aditiva `analysis_refresh_authorizations` do lote registros `{requestId,approvedBy,approvedAt,configurationRevision,candidateIds}` produzidos pelo servidor; não editar snapshot imutável de critérios nem perder autorizações antigas. Dispatcher só propaga a autorização do pedido/revisão/filho correspondentes. Permissões são reconferidas antes do efeito, mesmo após recarga/worker novo. A3 migra os vínculos para intenções duráveis sem apagar esses registros.

**Exemplo:** quatro empresas selecionadas com autorização de atualização devem receber exatamente a autorização que o botão individual enviaria. A empresa com recibo incerto continua pedindo conciliação específica; as demais prosseguem.

- [ ] **Step 1:** Testar seleção de quatro IDs e retomada do lote pelo endpoint real: flag passa pelo schema, é persistida e chega aos filhos após reiniciar worker; sem autorização não há nova análise. Flag adulterada/escopo de outra conta retorna 403; revisão antiga não autoriza, requestId duplicado não duplica aprovação; erro de uma empresa não impede as outras.
- [ ] **Step 2:** Rodar testes de Workspace/painel e `npm test -- tests/radar-research-persistence.test.ts tests/radar-capture-dispatch.test.ts`; observar falha do transporte atual em lote.
- [ ] **Step 3:** Unificar montagem e validação da intenção; devolver feedback por item. Retomar continua avaliando todas as etapas aplicáveis, reaproveitando apenas resultados válidos; não responder somente “execução existente reaproveitada”.
- [ ] **Step 4:** Testar recarga, duplo clique, revisão alterada e quatro papéis. Commit `fix(radar): share research authorization across actions`.

### Task A0.3 Reconciliar o lote após mudanças individuais

**Files:** modificar `backend/src/modules/radar/capture-research-state.ts:15`, `capture-dispatch.ts:80`, `research-service.ts` nos caminhos de checkpoint, término, falha e recuperação; criar `backend/src/modules/radar/capture-reconciliation.ts`, `backend/tests/radar-capture-reconciliation.test.ts`, `backend/tests/integration/radar-capture-reconciliation.test.ts`.

**Interfaces:** `reconcileRadarCaptureItems(db,{organizationId,candidateId}):Promise<void>` usa `assessRadarCaptureResearch` e atualiza todos os itens que apontam ao run pertinente; recalcula contagens/motivos dos respectivos pais, em transação. Atualização condicionada ao `run_id`/versão ainda atual: um run antigo não sobrescreve o novo. Publicação de progresso ocorre depois do commit. GET não precisa iniciar pesquisa ou reparar o banco.

**Exemplo:** Duque pode ter simultaneamente um recibo incerto e necessidade de nova associação. Não limpar o primeiro porque só o segundo aparece no dossiê; mostrar causa principal e dependências corretas no Admin. Se o filho avança, o pai deixa de exibir o snapshot antigo.

- [ ] **Step 1:** Criar teste de lote 1/8/11, atualizar quatro filhos e comparar pai com avaliação atual; repetir com eventos fora de ordem, dois lotes e conta diferente. Assert `oldRunEvent => currentItemUnchanged` e `uncertainReceipt => stillBlocked`.
- [ ] **Step 2:** Rodar `npm test -- tests/radar-capture-reconciliation.test.ts` e integração homônima em PostgreSQL isolado, comprovando falha antes da implementação.
- [ ] **Step 3:** Extrair reconciliação do dispatcher e chamar após mudanças individuais. Preservar permissões, ordem dos locks e recibos; reusar outbox existente para entrega de progresso se a fila estiver fora.
- [ ] **Step 4:** Testar queda antes/depois do commit e idempotência. Confirmar resumo correto após recarga sem clicar em retomar. Commit `fix(radar): reconcile capture after candidate updates`.

### Task A0.4 Hash estável das evidências

**Files:** modificar `backend/src/modules/radar/research-service.ts:205–213` e `:326`; criar `backend/src/modules/radar/evidence-version.ts`, `backend/tests/radar-evidence-version.test.ts`; ampliar `radar-research-persistence.test.ts`.

**Interfaces:** `radarEvidenceContentHash({identity,criteria,purpose,evidence}):string` ordena por chave estável de evidência e usa URL canônica, texto normalizado, escopo/tipo e conteúdo relevante. Excluir `observedAt`, horários de atualização, posição de resultado, IDs `page-0`/`search-0`, tentativa e orçamento. Manter o texto original para conferir citações. Registrar `hashVersion:2`. Migrar um checkpoint somente quando seu material salvo permite reconstruir o mesmo conjunto; preservar o hash antigo como alias do recibo, não fazer nova chamada por diferença de formato.

**Exemplo:** mesmo site e contato lidos às 10h e 11h, em ordem invertida, produzem o mesmo hash. Mudança real de telefone ou CNPJ produz outro hash. Atualizar o teto de páginas não invalida associação já sustentada.

- [ ] **Step 1:** Assertions `sameTextDifferentObservedAt => sameHash`, `reverseEvidenceOrder => sameHash`, `newPhone => differentHash`, `legacyReceiptAlias => providerCalls===0`, `missingOldMaterial => preserveAndExplainNotReplay`.
- [ ] **Step 2:** Rodar `npm test -- tests/radar-evidence-version.test.ts tests/radar-research-persistence.test.ts` e observar falhas novas.
- [ ] **Step 3:** Implementar canonicalização e compatibilidade de checkpoints sem alterar corpo de evidência, identidade humana confirmada ou chaves de efeitos já pagos.
- [ ] **Step 4:** Repetir testes, type-check e integração. Commit `fix(radar): stabilize evidence identity across rereads`.

## Aceite de A0

- [ ] Reproduzir os vinte itens com fontes simuladas, com `discoveryCalls===0`, nenhum ID perdido e nenhum recibo incerto repetido.
- [ ] Provar separadamente os quatro defeitos acima; não exigir A1/B/C para publicar esta correção.
- [ ] Atualizar inventário código→tarefa→teste. Falta real de leitura/identidade e os cinco recibos antigos permanecem explicitamente atribuídos a A1/A5/C4, nunca marcados resolvidos por A0 sem evidência.
