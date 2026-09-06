# T29 — Carregamento inicial e jornada do frontend

Data da coleta: 2026-09-06. As medidas sintéticas usam o build de produção gerado localmente a partir do commit `c7fa8ce`; não substituem dados de campo.

## Resultado do orçamento

| Medida | Antes da divisão | Atual | Resultado |
| --- | ---: | ---: | --- |
| JavaScript inicial, sem compressão | 3.041.824 bytes | 399.596 bytes | -86,86% |
| JavaScript inicial, gzip | 808.036 bytes | 127.579 bytes | -84,21% |
| Maior chunk observado na auditoria | 2.333.020 bytes | 521.920 bytes | chunk atual é tardio e exclusivo de Mermaid |
| Maior chunk gzip observado na auditoria | 601.080 bytes | 163.150 bytes | não participa do carregamento inicial |

O limite executável é 404.018 bytes gzip no JavaScript inicial, correspondente à redução mínima de 50%. `npm run build` gera `dist/bundle-report.json` a partir do manifest real e falha quando o limite ou a redução deixam de ser atendidos.

## Custo das jornadas

Os totais abaixo incluem a base inicial e todas as dependências estáticas da entrada da rota. Editores, gráficos e canvas carregados somente após uso ficam fora até serem efetivamente necessários.

| Jornada | Total gzip | Incremento sobre a base |
| --- | ---: | ---: |
| Visão geral do portal | 162.648 bytes | 35.069 bytes |
| Marketing Studio | 145.894 bytes | 18.315 bytes |
| Automações | 172.269 bytes | 44.690 bytes |
| Detalhe de missão | 168.306 bytes | 40.727 bytes |

Não foram encontradas dependências duplicadas nos caminhos estáticos do manifest. Cada arquivo é contado uma única vez pelo coletor recursivo.

## Piloto sintético da jornada

- Dispositivo fixo: viewport de 390 × 844 em Chromium.
- Rede fixa: preview local do build de produção, sem limitação artificial; respostas autenticadas e dados mínimos foram controlados no navegador, sem escrever em backend.
- Abertura fria da visão geral: TTFB 3,9 ms, FCP 60–76 ms, LCP 80 ms e CLS 0,03. O DOM ficou pronto em 32,8 ms.
- Navegação quente para uma missão: FCP 56 ms e DOM pronto em 17,6 ms; a tela exibiu título, estado e os comandos possíveis.
- Primeira ação utilizável da missão: duração de evento de 24 ms para “Continuar pedido”, sem erro visível ou de página.
- Marketing Studio: um planejamento parcialmente preenchido foi recarregado na mesma aba e os campos “Campanha preservada” e “PMEs de Londrina” permaneceram intactos.

Os valores atendem aos alvos sintéticos LCP ≤ 2,5 s e interação ≤ 200 ms com grande margem. Como não há telemetria de campo nesta tarefa, a decisão de produção deve continuar acompanhada por dados reais de usuários após a liberação.

## Continuidade e falha de versão

- Autenticação, papel e contexto do workspace continuam resolvidos antes do componente de rota ser carregado.
- O shell protegido permanece montado enquanto a rota tardia carrega.
- Uma falha simulada com a assinatura `Failed to fetch dynamically imported module` apresenta recuperação explícita, registra a rota e oferece atualização; não há tela branca.
- Rascunhos compatíveis do planejamento de marketing e do grafo de automação usam armazenamento da própria aba, isolado por organização, contrato ou fluxo. Salvar com sucesso remove o rascunho.
- O componente do Marketing Studio é remontado quando organização ou contrato mudam, evitando transportar estado local entre workspaces.

## Verificação

- 137 arquivos e 562 testes frontend aprovados.
- Type-check aprovado.
- Build de produção e orçamento de bundle aprovados.
- Baseline de lint preservada em 560 erros e reduzida de 27 para 26 avisos, sem assinatura nova.
- Navegador validado sem overlay nas jornadas de visão geral, missão e Marketing Studio; a captura visual móvel confirmou conteúdo e comandos utilizáveis.
- Aceite persistente: execução GitHub Actions `34056093562`, commit `c7fa8ce`, conclusão `success` nos sete jobs, incluindo build reproduzível do frontend e as três imagens com SBOM.
