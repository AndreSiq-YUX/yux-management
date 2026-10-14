# Radar: créditos internos, diagnóstico e retomada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o bloqueio por carteira interna ausente sem confundi-lo com saldo do OpenRouter, preservando evidências e a proteção contra cobranças duplicadas.

**Architecture:** A reserva interna continua obrigatória para operações atribuídas a contratos. O runtime diferencia recusa anterior ao provedor de falha posterior/resultado incerto. O backend persiste essa distinção e permite retomada somente quando a não execução do provedor é comprovada. Nenhum saldo será inventado ou concedido automaticamente.

**Tech Stack:** Python/FastAPI, TypeScript, PostgreSQL, Vitest e unittest.

**Spec:** Requisitos e evidências na seção abaixo deste documento.

## Requisitos e evidências

- Pedido: investigar e corrigir o Radar; o usuário confirmou saldo no OpenRouter.
- Produção, 14/10/2026: `/radar/resolve-presence` respondeu HTTP 402 às 12:38:16; worker concluiu com resultado parcial.
- Consulta `BEGIN READ ONLY` confirmou que a organização `972e8163-81b7-4e3f-b964-777110b660b8` (Villeman e Massas), cliente `89565e62-562b-4d5c-a087-955a5243b49e`, contrato ativo `6675ead3-946c-4312-91b0-b482bbcd27e2`, não possui carteira em `ai_credit_wallets` nem configuração em `marketing_studio_settings`.
- Execução `0f115bef-0028-4a2f-89da-6ff75bcfaf08`: `partial`, `calls.presence.status=reserved`.
- `reserve_credits` exige uma carteira existente, retorna `insufficient_ai_credits_or_invalid_wallet` e é chamado antes de `chat_completion`. A ausência da carteira explica esta recusa sem chamada ao provedor.
- `safeResearchError` não aceita esse detalhe nem `openrouter_credit_required`, descartando ambos como `radar_qualification_failed`.
- O código não tem fluxo de provisionamento das carteiras. Corrigir a carteira atual exige decisão explícita sobre quantidade de créditos ou uso ilimitado. Uma área administrativa completa de gestão de carteiras é um projeto separado, não está implicitamente autorizado por esta correção.

## Global Constraints

- Não chamar modelos, pesquisas ou ferramentas pagas nos testes; usar dependências falsas.
- Não alterar modelo, fallback, chaves, licença, política de cobrança, RLS ou cotas de outros clientes.
- Não interpretar HTTP 402 genérico como prova de que o provedor não executou.
- Não repetir automaticamente chamadas marcadas como reservadas/resultado incerto.
- Preservar páginas, contatos, evidências, histórico e revisão da campanha.
- Publicar código verificado em `main`, conforme autorização vigente; não disparar deploy.
- Ajuste pontual de produção somente depois de autorizada a cota deste contrato; sem executar IA ao final.

## Review Focus

1. Carteira inexistente versus saldo insuficiente versus erro real do provedor: manter mensagens e estágios distintos.
2. Falha após envio, timeout ou resposta inválida: manter bloqueio contra repetição/cobrança duplicada.
3. Carteira de outro contrato/organização: nunca autorizar nem debitar a carteira errada.
4. Retomada após recusa interna comprovada: reaproveitar buscas e páginas, executar apenas a etapa pendente quando o usuário solicitar.
5. Execuções históricas `reserved`: não converter em recusadas apenas com base em ausência de saldo atual.

### Task 1: Distinguir recusa interna e falha externa

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_store.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_runtime_credit_policy.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_api_credits.py`

**Interfaces:**
- Consumes: `reserve_credits(..., credits, action)` e rotas `/radar/resolve-presence`, `/radar/qualify`.
- Produces: erros próprios de reserva interna, derivados de `RuntimeError` para compatibilidade; respostas Radar HTTP 402 com detalhes `radar_ai_wallet_missing` ou `radar_ai_credits_insufficient`, exclusivamente antes da chamada ao provedor.

- [ ] Escrever testes RED: carteira ausente gera erro próprio; carteira existente sem saldo gera erro distinto; carteira ilimitada continua contabilizando uso; contexto de outro tenant não debita; runtime não chama o provedor em ambas as recusas.
- [ ] Rodar `python -m unittest discover -s tests -p "test_*credit*.py" -v` no diretório do runtime e verificar as novas falhas esperadas.
- [ ] Implementar classificação de reserva sem mudar autorização ou criar saldo: após UPDATE sem linha, consulta tenant-scoped da carteira distingue ausência de insuficiência. Mapear apenas erros próprios de reserva nas rotas Radar; exceções inesperadas não viram falsos erros de crédito.
- [ ] Registrar diagnóstico estruturado seguro da falha com estágio e request_id, sem prompts, conteúdo das páginas, respostas do provedor ou credenciais.
- [ ] Rodar testes de crédito e API do runtime; verificar compatibilidade dos demais endpoints e que recusa real OpenRouter mantém `openrouter_credit_required`.
- [ ] Commit: `fix(radar): distinguish internal credit rejection from provider failures`.

### Task 2: Persistir recusa comprovada e permitir retomada segura

**Files:**
- Modify: `backend/src/modules/radar/research-service.ts`
- Modify: `frontend/src/lib/radar/radarResearchMessages.ts`
- Test: `backend/tests/radar-research-persistence.test.ts`
- Test: `backend/tests/radar-research-service.test.ts`
- Test: `frontend/src/lib/radar/radarResearchMessages.test.ts`

**Interfaces:**
- Consumes: códigos explícitos anteriores ao provedor produzidos na Task 1.
- Produces: `calls.presence/semantic.status='rejected_before_provider'` com erro seguro e hash; retomada solicitada pelo usuário pode refazer somente essas etapas. Timeout, 402 genérico e chamadas antigas reservadas continuam incertos.

- [ ] Escrever testes RED para ambos os callbacks: recusa interna preserva páginas e persiste estado específico; nova solicitação de retomada conclui após disponibilidade; buscas já concluídas não se repetem; respostas incertas permanecem bloqueadas.
- [ ] Escrever teste RED de mensagens: carteira ausente menciona créditos internos YUX e não recomenda trocar modelo ou recarregar OpenRouter; insuficiência interna e crédito externo têm explicações distintas.
- [ ] Rodar testes focados de backend e frontend e conferir as falhas esperadas.
- [ ] Implementar captura limitada aos dois códigos comprovados, persistência com lease e retomada explícita. Manter histórico anterior de falha no registro da chamada; não liberar um `reserved` legado automaticamente.
- [ ] Corrigir sanitização: preservar códigos conhecidos de crédito; para detalhe não permitido preservar ao menos o status HTTP seguro, nunca ecoar texto arbitrário do provedor.
- [ ] Rodar suítes completas de backend/frontend e testes do runtime; compilar backend/frontend e verificar release manifest. Não iniciar pesquisa real.
- [ ] Commit: `fix(radar): preserve credit diagnostics and safely resume rejected analysis`.

### Task 3: Reparo pontual autorizado e entrega

**Files:**
- Modify: este plano, seção de verificação.

**Interfaces:**
- Consumes: decisão humana sobre cota inicial ou uso ilimitado do contrato identificado, sem inferir autorização para outros contratos.
- Produces: carteira do contrato atual provisionada com valor autorizado, auditoria da operação e execução antiga preservada com reparo pontual documentado quando comprovado seguro.

- [ ] Obter decisão do usuário sobre créditos internos e aprovação deste plano/método de execução. Não conceder saldo antes disso.
- [ ] Verificar novamente vínculo organização/cliente/contrato, ausência da carteira e estado da execução, usando consultas somente de leitura.
- [ ] Provisionar somente a carteira autorizada em transação com auditoria antes/depois; não usar upsert que substitua uma carteira criada concorrentemente. Não alterar `marketing_studio_settings` para forçar saldo.
- [ ] Para a execução antiga específica, verificar ausência de débito/uso de IA e as evidências da recusa antes do provedor. Reparar somente o marcador `presence` em transação auditada, com compare-and-set do estado e hash observados; se houver ambiguidade, preservar `reserved` e pedir conferência, sem replay.
- [ ] Confirmar carteira e marcador com nova leitura; fechar console. Não retomar nem enfileirar IA automaticamente.
- [ ] Registrar resultados, publicar commits em `main`, confirmar SHA remoto e informar necessidade de deploy e retomada manual.

## Verificação

- Diagnóstico de produção: confirmado em consultas somente de leitura; nenhuma chamada paga, concessão de créditos ou alteração de configuração executada durante a investigação.
- Implementação: aguardando revisão do plano e decisão de cota do contrato.
