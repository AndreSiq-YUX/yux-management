# Radar — correções de qualidade antes do piloto

> **For agentic workers:** use superpowers:executing-plans, implementação sequencial nesta sessão, com testes primeiro e revisão independente final.

**Goal:** cumprir os quatro ajustes aprovados antes de qualquer piloto pago.
**Architecture:** preservar recibos e reservas transacionais; continuar buscas somente após identidade explicitamente inconclusiva; relatório administrativo derivado de eventos e recibos do mesmo run/lote.
**Tech Stack:** TypeScript, PostgreSQL, Vitest, React.
**Spec:** pedido aprovado na conversa: totais de bloqueios e classificações/probabilidades, contrafactual não avaliável sem calibração, teto geral BRL do Agent, continuação barata, guarda anti-CNAE.

## Global constraints

- Sem chamadas pagas, ativação, deploy ou push nesta execução. Não alterar documentos não rastreados do usuário.
- Relatório e custos exclusivos de `yux_admin`; preservar DTOs comerciais e isolamento organizacional.
- Teto geral BRL é cumulativo da campanha, incluindo buscas e Agent; teto USD do Agent continua independente. Recuperar recibo existente não exige nova reserva.
- Não repetir efeitos incertos, aumentar limites ou descartar empresas automaticamente. Observação sem calibração não equivale a decisão de bloqueio.

## Review Focus

- Reservas concorrentes Agent/busca, gastos de dias anteriores, custo real maior que estimativa e recuperação sem nova compra.
- Identidade inconclusiva versus falha técnica; retomada após checkpoint sem repetir consultas nem criar recursão ilimitada.
- Probabilidade ligada ao request exato; relatório de lote não mistura runs nem usa calibração atual para interpretar evento antigo.
- Administração exclusiva, CSV seguro, funcionamento sem calibração e sem recibo antigo completo.
- Guarda anti-CNAE detecta política fixa sem proibir padrões de validação ou configuração dinâmica.

### Task 1: Orçamento compartilhado em reais

**Files:** deep-research-execution.ts, funnel-agent-readiness.ts, repository.ts, research-service.ts, capture-preflight.ts e testes correspondentes em backend.
**Interfaces:** reserva Agent e governança das outras fontes consomem o mesmo total BRL cumulativo sob lock da campanha; readiness é só prévia.
1. Teste falhando: Agent recusa reserva quando buscas anteriores consomem teto; outras fontes consideram reserva Agent. Incluir limite exato/zero/nulo, concorrência e recuperação.
2. Executar testes. Expected: falha de orçamento antes da correção.
3. Corrigir total cumulativo e checagem antes da chamada externa, sem transação durante rede.
4. Executar testes unitários e integração Radar. Expected: verdes.
5. Commit `fix(radar): enforce shared campaign budget for agent reservations`.

### Task 2: Continuar buscas após identidade inconclusiva

**Files:** funnel-discovery.ts, research-service.ts e testes radar-funnel-discovery/pipeline.
**Interfaces:** checkpoint registra evidência de identidade já avaliada; busca usa consultas ainda não executadas e limites existentes da Task 1.
1. Teste falhando: primeira página menciona empresa, resolução inconclusiva, próxima busca barata acha site correto com Agent desligado.
2. Executar teste. Expected: falha por busca encerrada cedo.
3. Implementar continuação limitada e persistida; falha técnica não autoriza repetição paga; conservar fatos e recibos.
4. Testar esgotamento, retomada, resultado incerto e fluxo legado. Expected: verdes.
5. Commit `fix(radar): continue cheap discovery after unresolved identity`.

### Task 3: Relatório administrativo verificável

**Files:** funnel-report.ts, funnel-gate-application.ts, research-types.ts, frontend types/radarFunnel.ts, RadarFunnelReportPanel.tsx e testes backend/frontend.
**Interfaces:** DTO administrativo agrega motivos e classificações por run/lote e expõe probabilidades do recibo exato; contrafactual boolean|null, null sem limiar histórico conhecido.
1. Testes falhando: resumo por motivo/classificação, probabilidades, ausência de calibração como não avaliável, histórico sem recibo e isolamento.
2. Executar testes. Expected: novos campos ausentes.
3. Implementar projeção segura e interface/CSV no padrão existente YUX, sem ações pagas ao abrir/exportar.
4. Testar quatro papéis, outro tenant, CSV e renderização. Expected: verdes.
5. Commit `feat(radar): summarize pilot decisions and blocking reasons`.

### Task 4: Guarda e verificação final

**Files:** testes de política CNAE e documentação de evidências.
1. Escrever teste de detector com exemplo sintético de CNAE fixo e validação dinâmica permitida. Expected: RED antes do detector.
2. Implementar guarda sobre fontes produtivas Radar e executar. Expected: GREEN sem CNAE fixo.
3. Rodar suites backend/frontend/runtime, integração PostgreSQL Radar, tipos/build e checagens de qualidade. Expected: verdes sem aumento da dívida preexistente.
4. Revisão independente da branch inteira; corrigir achados importantes em uma rodada RED→GREEN e suite verde.
5. Registrar evidências e commit `test(radar): guard configurable CNAEs and verify prepilot fixes`.
