# Radar benchmark antecipado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa e sequencial, sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir classificação e descoberta antes de comprometer a entrega B com uma infraestrutura que pode não melhorar o resultado atual.

**Architecture:** Preparar casos humanos e um avaliador isolado do tráfego de produção. Comparar a rota atual de qualificação com respostas restritas a opções fixas, Jev e Luna Decisions usando as mesmas evidências. Rótulos e plano de descoberta começam antes de B; chamadas comparativas reais dependem de autorização e modelos exatos.

**Tech Stack:** Fixtures JSON, Vitest/pytest, transportes simulados e relatório interno.

**Spec:** `docs/superpowers/specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md`

## Global Constraints

- Não inventar rótulos humanos, executar novo gasto ou apresentar fixture como resultado real.
- Avaliar português brasileiro e mais de um setor, sem regra fixa para cozinhas industriais.
- Um grupo/filial só pode aparecer em uma partição; impedir vazamento entre ajuste e validação.
- Relatório técnico e custos somente no Admin YUX.

## Review Focus

1. Confiança discursiva da rota chat ser comparada como probabilidade calibrada: E0.2.
2. Perguntas/evidências diferentes favorecerem um modelo: E0.1/E0.2.
3. Diretórios contarem como empresas ou duplicatas inflarem cobertura: E0.3.
4. Taxa sem denominador ou custo ausente parecer zero: E0.2/E0.3.
5. Benchmark offline alegar melhoria de modelo sem chamadas reais: E0.4.

### Task E0.1 Preparar rótulos antes da integração B

**Files:** criar `contracts/radar/benchmark/v1/manifest.json`, `cases.json`, `discovery-scopes.json`, `backend/tests/radar-benchmark-dataset.test.ts`. Não depende do schema geral A1.

**Interfaces:** caso `{id,partition,criteria,evidence,expected:'compatible'|'outside_profile'|'investigate',expectedSourceIds,reviewedBy,reviewedAt}`. Planejar 100 casos: 30 aderentes, 30 fora do perfil e 40 ambíguos; partição estratificada 60/40, sendo validação 12/12/16. Um revisor humano rotula; segundo revisa positivos/descartes e divergências antes do congelamento. Arquivos começam com `labelStatus:'pending'` quando ainda não revisados, nunca com resultado atribuído ao usuário. A preparação humana pode ocorrer enquanto A0 é implementada, sem paralelizar alterações por agentes.

**Exemplo:** nome de tabacaria não basta como negativo; evidência de refeições corporativas pode tornar o caso positivo. Guardar página/data e motivo que o humano efetivamente verificou.

- [ ] **Step 1:** Criar testes de partição, rótulo pendente, conflito entre revisores, grupo em duas partições e trecho sem fonte; todos impedem relatório de qualidade final.
- [ ] **Step 2:** Rodar `npm test -- tests/radar-benchmark-dataset.test.ts` e confirmar falhas.
- [ ] **Step 3:** Implementar manifesto/validador e iniciar coleta de rótulos; congelar versões separadas de dados, critérios e pacote de contexto. Nenhuma chamada externa automática.
- [ ] **Step 4:** Provar partições e leitura do conjunto; commit `test(radar): prepare reviewed decision benchmark`.

### Task E0.2 Comparar rota existente e Decisions

**Files:** criar `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_decision_context.py`, `decision_providers.py`, `workers/marketing-studio-agent-runtime/scripts/evaluate_radar_decisions.py`, `tests/test_radar_decision_context.py`, `tests/test_decision_providers.py`, `tests/test_radar_decision_benchmark.py`; ler `yux_agent_runtime/radar_qualification.py` e `llm_routing.py:50`. B2 reaproveita os dois módulos, não cria outro cliente.

**Interfaces:** `DecisionProvider.decide(model,state,questions)->DecisionProviderResponse` usa o adaptador versionado e contexto limitado definidos em B2. Aqui só precisa `choice` e execução offline; não criar roteamento/Admin/novas tabelas ainda. O runner exige opção explícita `--allow-paid`, modelos exatos e orçamento aprovado para chamada real; padrão apenas fixtures. Rota atual `radar_business_qualification` recebe o mesmo contexto e saída estruturada `choice`, `evidenceIds`, `reasonCode`; não mudar seu prompt de produção nesta avaliação. Confiança declarada em texto não vira probabilidade: reportar `probabilities=null` para baseline que não as fornece.

**Exemplo:** os três avaliadores recebem a mesma descrição/evidência de uma empresa química; comparar resultado e custo, não o tamanho da justificativa. Cada modelo tem seus limiares escolhidos apenas na partição de ajuste.

- [ ] **Step 1:** Testar mesmos IDs/contexto para três avaliadores, português/acentos, teto de bytes e resultados sem probabilidade; fixture alpha incompatível falha tipada. Assert modo padrão `externalCalls===0`.
- [ ] **Step 2:** Rodar `python -m pytest tests/test_radar_decision_context.py tests/test_decision_providers.py tests/test_radar_decision_benchmark.py -q`.
- [ ] **Step 3:** Implementar transporte mínimo `openrouter-decisions-alpha-v1`, request único por modelo, relatórios por caso e custo. Usar `/api/alpha/decisions`, sem SDK TypeSafe/System One. Guardar exemplos oficiais como documentais; somente chamada real autorizada produz fixture marcada `real_response` sanitizada, com snapshot do modelo, data e versão do adaptador.
- [ ] **Step 4:** Validar offline, commit `test(radar): compare current qualification with decision models`. Após autorização, executar e congelar relatório real; não marcar este último passo feito sem rótulos e gastos aprovados.

### Task E0.3 Medir descoberta e enriquecimento separadamente

**Files:** criar `backend/scripts/evaluate-radar-discovery.ts`, `backend/tests/radar-discovery-benchmark.test.ts`; consumir `discovery-scopes.json`, `repository.ts:740`/`:1368`, `web-search.ts:4`, `cnpjaClient.ts:86` e, depois, adaptadores C1/C3. Dados externos ausentes ficam `not_evaluated`, não nota zero.

**Interfaces:** relatório por `{source,strategy,segment,region,queryPlanVersion,startedAt,rateSnapshot}`. Mesmos segmentos/cidades, recorte temporal, orçamento comparável e regras de identidade. Incluir OSM, Places elegíveis, Serper Web, Brave Web, CNPJá e Perplexity quando configurada. Mapas podem acrescentar cobertura, mas a cobertura brasileira deste segmento precisa ser medida. OSM usa índice municipal/segmentos disponíveis; ausência de snapshot é indisponibilidade, não ausência de empresas.

**Exemplo:** três fontes retornam 30/50/20 itens, mas 8/10/12 empresas aderentes novas após deduplicação. Mostrar esses últimos números, interseção entre fontes e quantas só cada fonte acrescentou, não declarar vencedora a que trouxe cinquenta links.

- [ ] **Step 1:** Assertions de diretório com dez nomes contar dez menções e só as identidades verificadas como empresas; duplicata interfontes não é nova; grupo não elimina filiais legítimas. Denominador zero gera `null`, nunca divisão por zero ou custo fictício.
- [ ] **Step 2:** Rodar `npm test -- tests/radar-discovery-benchmark.test.ts`.
- [ ] **Step 3:** Medir candidatos brutos, identidades únicas, aderentes revisados, **aderentes novos**, contribuição marginal por fonte, completude/contato útil, tempo p50/p95, custo BRL por aderente novo e por aderente pronto para uso. Custo inclui buscas, extração, decisões, cadastro e aprofundamento; incertos em coluna separada. Usar a mesma cotação de comparação; preservar moeda original e cotação da operação.
- [ ] **Step 4:** Validar com fixtures e congelar protocolo antes de C. Execução real de fontes novas e extrator C3 ocorre depois de sua implementação autorizada, sem adiar a definição das métricas. Commit `test(radar): benchmark qualified discovery yield`.

### Task E0.4 Gate de escopo de B

**Files:** criar `docs/superpowers/reports/2026-10-19-radar-benchmark-decision.md` somente com resultados disponíveis; atualizar índice do plano e manifesto.

**Interfaces:** comparar matriz de confusão, falsos descartes, precisão, abstenções/investigações, latência e custo total por caso. Calibração por modelo/snapshot/tarefa e não por fornecedor genérico. Validação exige zero falso descarte de positivo confirmado; nenhuma divulgação de contato de terceiro, vazamento técnico ou replay incerto. Amostra pequena não autoriza alegar taxa zero no mercado.

**Exemplo de gate:** se Decisions empatar com baseline em qualidade/abstenção e não entregar redução de pelo menos 20% no custo total da triagem ou latência p95 sem regressão da outra, manter a rota atual com opções fixas e postergar B de produção. Esse 20% é critério de produto proposto, não precisão publicada. Se houver melhora consistente de erros relevantes, registrar quais casos justificam B mesmo sem esse ganho financeiro.

- [ ] **Step 1:** Testar gerador do relatório com empate, custo desconhecido e ganho que esconde falso descarte; nenhum habilita exclusão automática.
- [ ] **Step 2:** Rodar `python -m pytest tests/test_radar_decision_benchmark.py -q` e testes TS do benchmark.
- [ ] **Step 3:** Registrar decisão `proceed|keep_current|inconclusive` com números e limitações. Sem avaliação real, resultado é `inconclusive`; não executar B inteira alegando gate concluído.
- [ ] **Step 4:** Revisar relatório com o responsável pelo produto antes de B1. A0 e recuperação A seguem independentes. C pode consumir a decisão estruturada da rota atual se B for postergada.
