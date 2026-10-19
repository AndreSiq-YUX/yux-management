# Radar decisões pesquisa e Perplexity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução nativa, sequencial e sem subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir a qualidade de descoberta e aprofundamento com decisões roteáveis e pesquisa adaptativa, recuperando o fluxo existente sem perda de dados.

**Architecture:** Destravar primeiro o fluxo atual em A0 e preparar classificação/descoberta em E0. A fortalece recuperação/experiência; B1–B5 conectam as decisões ao fluxo atual conforme a atualização autorizada em 19/10. O benchmark humano continua gate de qualidade/calibração, não da implementação autorizada. C fecha extração de empresas, identidade, descoberta por mapa/web e investigação opcional Perplexity; pode usar a decisão estruturada atual. Contratos entram quando necessários, não como pré-requisito para A0.

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

**Atualização de escopo autorizada em 19/10:** o pedido mais recente libera implementar B1–B5 agora, incluindo o consumo operacional das decisões no aprofundamento. Substitui o gate de código condicionado ao comparativo E0 nos itens históricos abaixo; não autoriza comparação paga, ativação de modelos, calibração fictícia ou implantação. O benchmark real continua necessário para aprovar limiares e exclusão automática. Perplexity e a orquestração C3.3/C4 permanecem independentes e não estão entregues por B.

1. Ler a [especificação revisada](../specs/2026-10-19-radar-decisoes-pesquisa-perplexity-design.md) e o [inventário dos vinte itens](2026-10-19-radar-bloqueios-auditados.md). Cada bloqueio tem tarefa e prova de resolução; não partir só da contagem 1/8/11.
2. Implementar [A0 destravamento imediato](2026-10-19-radar-destravamento-a0.md): quatro correções pequenas, sem tabela geral de recibos ou contratos de decisão. Entrega testável independente.
3. Iniciar [E0 benchmark antecipado](2026-10-19-radar-benchmark-antecipado.md): rótulos humanos podem começar durante A0; execução de código segue sequencial. Comparar rota atual com opções fixas, Jev e Luna antes de B de produção. Definir agora também métricas de descoberta por fonte/região; comparação de adaptadores novos ocorre quando existirem.
4. Implementar [A recuperação e experiência](2026-10-19-radar-recuperacao-e-experiencia.md): A1–A6, incluindo conciliação dos recibos antigos, pedidos duráveis, BRL e vigia de lotes. Não esperar modelo novo para corrigir esses pontos.
5. Implementar [B roteamento de decisões](2026-10-19-radar-roteamento-decisoes.md), conforme a atualização de escopo: `kind` existente, endpoint alpha correto, contexto limitado, calibração por modelo/snapshot e integração B5 no aprofundamento atual. Reaproveitar o adaptador/contexto E0. Sem calibração real correspondente, o resultado opera em observação e preserva a coleta atual.
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

## Execução local autorizada em 19 de outubro de 2026

A0 implementada em quatro commits pequenos: `ff3f3ca`, `7573ec2`, `45d4277`, `e47ed00`. Migração aditiva usada: **0196**. Os testes locais incluem PostgreSQL isolado, worker individual com transportes simulados, preservação das vinte admitidas e dos efeitos incertos; não houve recuperação do lote de produção, implantação ou compra externa.

E0 tem conjunto pendente, validador, contexto/adaptador offline e protocolo de custo/cobertura. A [decisão de escopo](../reports/2026-10-19-radar-benchmark-decision.md) é **inconclusiva**, pois não há cem rótulos humanos nem comparação paga autorizada. Não promover B a produção por testes simulados. A recuperação A e a descoberta C não são concluídas por esta preparação.

A1–A6 foram implementadas localmente em sequência, com recibos recuperáveis, intenções duráveis, estabilidade de evidência, capacidade incremental, conversão BRL explícita, experiência comercial e vigia administrativa. A5 está em `cffe8a5`; A6 usa migrações **0211–0213**, após a normalização de políticas em **0210**. Os critérios e evidências estão no [plano A](2026-10-19-radar-recuperacao-e-experiencia.md). Essa entrega não significa recuperação do lote real nem comprova a qualidade de uma nova IA. C continua como próxima entrega; B mantém o gate E0 inconclusivo. Não houve publicação, ativação de modelo ou compra de pesquisa.

C3.1 e C3.2 foram implementadas em `547a1d5` e `6e3a643`: extração estruturada com trechos verificáveis, preservação de resposta antes do parser/revalidação sem nova IA, associação conservadora web–cadastro e vínculos reversíveis. Migrações **0214–0216** foram aplicadas somente nos bancos locais isolados. C3.3 tem apenas o planejador puro preparado; sua orquestração, C4, integrações opcionais C1/C2 e fechamento C5 **não estão concluídos**. A versão nova não foi ligada à produção. B continua dependendo de E0, que não tem rótulos humanos ou comparação real autorizada. O plano completo não deve ser apresentado como entregue.

A1 acrescentou os três contratos necessários, captura protegida de resposta por tentativa antes da validação e revalidação interna gratuita, sem construir modelo ou debitar créditos. Autorizações de nova tentativa são separadas, restritas ao Admin global e vinculadas ao recibo anterior/política atual; A3 implementou seu consumo pela intenção durável. Migrações usadas: **0197–0199** (a última reforça a chave composta da conta no consumo). Os recibos reais sem corpo não foram reclassificados ou reenviados. Backend, runtime e migrações requerem implantação coordenada posterior; nenhuma foi executada nesta implementação local.

### Atualização B — integração operacional local

O usuário autorizou B independentemente do comparativo pago. B1 foi registrado em `37467ba`; B2–B5 implementam o adaptador, fallback por tentativa, calibração exata, painel administrativo e as três decisões no processamento real da empresa. Migrações **0217–0220**, somente em PostgreSQL local isolado. Testes cobrem servidor → HTTP runtime → papel de serviço → recibos por tentativa → transporte simulado, inclusive o executor real de pesquisa, recuperação sem rede, autorização de retry, troca de modelo e segregação das quatro audiências. Evidências e limites estão no [relatório de prontidão](../reports/2026-10-19-radar-decisions-readiness.md) e no [runbook](../../runbooks/radar-pesquisa-configuravel.md).

Esta atualização substitui as frases históricas acima que mantinham o código B condicionado a E0. O comparativo real continua inconclusivo e nenhuma qualidade de modelo foi comprovada por fixtures. Não há modelo ativo, calibração aprovada, compra, recuperação do lote real, push ou deploy. C3.3/C4, Perplexity e o encerramento do plano completo continuam pendentes.
