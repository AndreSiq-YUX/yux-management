# Radar decisões pesquisa e Perplexity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa, sequencial e sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir a qualidade de descoberta e aprofundamento com decisões roteáveis e pesquisa adaptativa, recuperando o fluxo existente sem perda de dados.

**Architecture:** Destravar primeiro o fluxo atual em A0 e medir classificação/descoberta em E0 antes de ampliar B. A fortalece recuperação/experiência; C fecha extração de empresas, identidade, descoberta por mapa/web e investigação opcional Perplexity. B só cresce se a comparação justificar; C pode usar a decisão estruturada atual. Contratos entram quando necessários, não como pré-requisito para A0.

**Tech Stack:** Fastify/PostgreSQL/BullMQ, Python/FastAPI e React/Vite; fontes atuais OSM/Places/web/cadastro; OpenRouter Decisions alpha e Perplexity Search/Agent opcionais.

**Spec:** `docs/superpowers/specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md`

## Global Constraints

- A experiência comercial do Radar não mostra ferramentas, fornecedores, modelos, rotas, recibos, tokens, licenças, custos ou falhas de infraestrutura. Administração técnica fica no painel administrativo do sistema, não em um accordion dentro da campanha.
- Não apagar candidatos, empresas, revisões, recibos, contadores, overflow, aprovações ou correções humanas. Descartes de aderência são reversíveis e ficam fora da lista principal.
- Uma resposta paga com resultado incerto não é reenviada automaticamente. Recuperar recibos/respostas; novas compras exigem autorização compatível com a política financeira vigente.
- Desenvolvimento usa transportes simulados e PostgreSQL isolado. Piloto real e implantação são autorizações separadas.

## Review Focus

1. Releitura e orçamento de uma fonte bloquearem trabalho de outra: A0.1/A0.4, A4.
2. Individual/em lote terem autorização diferente ou resumo desatualizado: A0.2/A0.3, A3/A6.
3. Trocar modelo conservar limiar errado, typo virar chat ou endpoint alpha mudar: E0, B1–B4.
4. Diretório virar empresa/site, ou empresa web duplicar CNPJ: C3.1–C3.3, C4.
5. Fallback/recibo incerto gerar compra duplicada ou dados técnicos vazarem: A1/A5, B2, C2/C5.

## Base verificada

Em 19/10/2026, após `git fetch origin main`, `git rev-list --left-right --count origin/main...HEAD` retornou **0 0**. HEAD e main remota estão em `2ae380adbe91ed46f54773dbfa450eb77ad00560`. O resultado **0 41** é contra a main local em `e6466ac`, não contra a main remota. Os commits e migrações 0193–0195 já estão integrados; não criar novo merge nem tocar no checkout principal sujo.

Na execução, conferir a base remota novamente e numerar migrações novas no próximo número livre; registrar números e commits aqui. Este plano não reserva 0196–0200 nem autoriza merge/push/deploy.

## Ordem de execução

1. Ler a [especificação revisada](../specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md) e o [inventário dos vinte itens](2026-10-19-radar-bloqueios-auditados.md). Cada bloqueio tem tarefa e prova de resolução; não partir só da contagem 1/8/11.
2. Implementar [A0 destravamento imediato](2026-10-19-radar-destravamento-a0.md): quatro correções pequenas, sem tabela geral de recibos ou contratos de decisão. Entrega testável independente.
3. Iniciar [E0 benchmark antecipado](2026-10-19-radar-benchmark-antecipado.md): rótulos humanos podem começar durante A0; execução de código segue sequencial. Comparar rota atual com opções fixas, Jev e Luna antes de B de produção. Definir agora também métricas de descoberta por fonte/região; comparação de adaptadores novos ocorre quando existirem.
4. Implementar [A recuperação e experiência](2026-10-19-radar-recuperacao-e-experiencia.md): A1–A6, incluindo conciliação dos recibos antigos, pedidos duráveis, BRL e vigia de lotes. Não esperar modelo novo para corrigir esses pontos.
5. Se E0 justificar, implementar [B roteamento de decisões](2026-10-19-radar-roteamento-decisoes.md): `kind` existente, endpoint alpha correto, contexto limitado e calibração por modelo/snapshot. Se houver empate sem vantagem, manter rota atual e postergar infraestrutura B. O protocolo mínimo de avaliação E0 é reaproveitado, não duplicado.
6. Implementar [C descoberta e pesquisa adaptativa](2026-10-19-radar-pesquisa-adaptativa-perplexity.md): C3.1 extração → C3.2 identidade/CNPJ → C3.3 orquestração de fontes atuais → C4; C1 Search/C2 Agent são integrações opcionais. C2 depende apenas da extensão `kind:research` de B1 e seu painel, que pode ser separada do restante de B se Decisions for postergada. C5 repete benchmark e fecha release.

Cada tarefa segue teste que falha, implementação, teste verde e commit pequeno. Âncoras `arquivo:linha` foram verificadas em `2ae380a`; localizar pelo símbolo ao executar sobre outra revisão. A0.3 cria a função de reconciliação reutilizada por A3; E0 cria adaptador/contexto promovidos por B2. Não recriar os mesmos módulos nem executar planos em paralelo sobre arquivos compartilhados.

## Rastreabilidade da revisão

| Ponto revisado | Tarefa responsável |
| --- | --- |
| Endpoint geral Decisions, alpha e fixtures versionadas | E0.2/B2 |
| Calibração por modelo/snapshot; troca volta a observação | E0.4/B3/B4 |
| Tamanho em bytes e escolha dos trechos da decisão | E0.2/B2 |
| Perplexity modelo único, max_steps, custo e marcadores de fonte | C2 |
| Main remota já integrada; referência local antiga | Base verificada/A0 |
| Limite por fonte, autorização, resumo e hash estável | A0.1–A0.4 |
| Vinte códigos ligados às correções | Inventário/A0/A1/A5/C4 |
| Benchmark antes de B, incluindo descoberta/custo por aderente novo | E0.1–E0.4/C5 |
| OSM/Places e suas limitações reais | E0.3/C3.3 |
| Diretórios/listas para menções verificáveis | C3.1 |
| Menção web para CNPJ/identidade, sem duplicata e com compra seletiva | C3.2 |
| Um único kind e validação de use cases | B1 |
| Vigia de lotes sem avanço | A6 |
| Estimativas BRL com cotação preservada | A4/B4/C1/C2 |
| Execução nativa consistente; exemplos e pontos de código | Todos os planos |

## Verificação comum e evidências de conclusão

- Backend: `npm test`, `npm run type-check`, `npm run build`; integração `npm run test:integration` com `YUX_RADAR_TEST_DATABASE_URL` e `YUX_INTEGRATION_DATABASE_URL` apontando exclusivamente a bancos PostgreSQL de teste. A suíte geral usa as duas variáveis em fixtures distintas; não aceitar testes pulados por ausência de variável como prova de integração.
- Frontend: `npm test`, `npm run type-check`, `npm run build`, `npm run lint:baseline`; navegador conectado local em desktop/mobile e fixtures sem fornecedores reais. Não usar contagens antigas de testes como evidência da mudança nova.
- Runtime: `python -m pytest tests -q` no ambiente do runtime. Testar chat, embeddings, planejamento de missões e atendimento para comprovar que a nova capacidade não muda suas rotas.
- Migrações: instalar em banco vazio e em banco de teste com estado v1, recibos incertos e lotes parciais; conferir grants, RLS, chaves compostas e índices. Toda mudança aditiva; nenhuma ativação/compra em SQL.
- Preservação: comparação antes/depois de IDs, contadores, aprovações e recibos do lote. Provar que corrigir limite não reinicia cursor e que atualizar uma empresa reconcilia a campanha.
- Qualidade: benchmark offline e depois avaliação real autorizada; separar funcionamento da integração de precisão do modelo. Provedor simulado não comprova qualidade de uma nova IA ou a cobertura de uma fonte.
- Release: conferir commit efetivamente implantado e identidade anunciada por API/workers/runtime. Metadados antigos de saúde não bastam para concluir que o código está antigo; validar ambos. Acompanhamento do piloto compara evidência e resultado, não apenas toast de sucesso.

## Aceitação e autoridade

- [ ] Revisar a especificação e confirmar a estratégia de pesquisa: fontes atuais preservadas, Perplexity opcional como alternativa e Agent seletivo.
- [ ] Revisar a versão corrigida do plano; método definido: nativo, sequencial, sem subagentes.
- [ ] Implementar A0/A com os testes de cada tarefa; E0 deve orientar o escopo de B antes da integração de produção.
- [ ] Revisar o conjunto e autorizar publicação, se desejada; este pedido de plano não é autorização de push/deploy.
- [ ] Autorizar separadamente modelo principal/fallback, fonte Perplexity e orçamento do piloto. Configurar no Admin sem editar código nem exigir identificador textual de licença.
- [ ] Primeiro provar recuperação de uma empresa e do lote v1 existente; só depois testar novo lote v2 e comparar estratégias de pesquisa.

Revisão final do conjunto antes de publicação. Não há delegação nem implementação nesta revisão documental. Os testes citados são critérios futuros, não testes da aplicação executados neste turno.
