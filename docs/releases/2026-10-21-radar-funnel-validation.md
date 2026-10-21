# Radar — funil por etapas (preparação local)

Plano: `docs/superpowers/plans/2026-10-21-radar-funil-decisao-por-etapas.md`, revisão 2 e aceite final. Base `8aea99c`. Publicação, ativação e piloto pago não autorizados nesta execução.

Implementado: estados terminais aditivos, atividades cadastrais com descrição e sinal do e-mail; regras comerciais editáveis; reposição pela proporção configurada e aproveitamento de excedentes; decisões nativas v2 com recuperação v1; calibração por campanha/modelo com conjunto congelado e avaliação separada; G0/G1/G3/G5; escalada única do Agent por rodada; reavaliação limitada da identidade; enriquecimento por finalidade e qualificação enxuta; fechamento histórico e reutilização de evidências; reabertura por portão/revisão; auditoria e retorno automático à observação; separação HTTP/UI entre Admin YUX e audiência comercial.

Migrações 0228–0234 são forward-only, sem eliminação de resultados ou recibos. Novo funil desligado por padrão. Catálogo oficial importável de modo idempotente, sem custos de pesquisa. Rotas, licenças, carteiras, orçamento, câmbio e critérios reais devem ser conferidos antes de qualquer ativação.

Evidência intermediária local: backend 1.365 testes; runtime Python 375, com sete dependências opcionais ignoradas; PostgreSQL isolado 134 testes do Radar. A primeira execução completa do frontend encontrou uma expectativa antiga de teste que não incluía o novo campo de limite de presença; a expectativa foi corrigida e os sete testes administrativos afetados passaram. A verificação final e a revisão independente serão registradas abaixo antes da conclusão.

UI local verificada com Chrome/Playwright em 1280×940 e 430×940, API real isolada e jobs externos bloqueados. Browser plugin não disponível; usado o runner do repositório. Os controles administrativos salvaram configuração na base sintética sem iniciar pesquisas. A visão comercial não mostrou nomes de ferramentas ou custos. Um botão longo foi ajustado para quebrar texto no celular. Nenhuma chave real, chamada paga, alteração de produção, push ou deploy.

Rulings de execução:

- Estados comerciais separados dos estados legados de fila: preserva compatibilidade; exige manter os dois campos sincronizados.
- Novo fluxo opt-in: preserva campanhas atuais; mantém dois caminhos até a migração autorizada.
- Excedentes pagos precedem o teto de páginas extras: pode aumentar leituras locais, não compras.
- Portões registram eventos; a publicação final consolida a ficha: evita invalidar a própria conferência de concorrência durante a pesquisa. G0 de admissão é a exceção gratuita sem execução filha.
- Falha de decisão opcional não bloqueia uma ficha concluída; o recibo continua protegido. A rodada segue a coleta determinística, sem a economia que a decisão poderia oferecer.
- Calibração e ativação reais são etapas separadas, não inferidas da implementação nem da autorização antiga de outros testes.

## Verificação final local

- Backend: 1.375 aprovados, 126 opt-in ignorados; TypeScript/build aprovado.
- Frontend: 1.174 aprovados; build de produção e orçamento do bundle aprovados (404.018 bytes gzip no máximo inicial).
- Runtime Python: 375 aprovados, sete ignorados por dependências opcionais.
- Integração Radar/PostgreSQL: 144 aprovados em 29 arquivos, banco isolado com todas as 131 migrações. Inclui worker→HTTP runtime→recibos nativos de decisão, legado, retomada, custos, Agent sintético, concorrência e quatro papéis.
- Navegação renderizada: dois testes aprovados em Chrome, 1280×940 e 430×940; API real local, nenhum efeito externo permitido. Confirmação final visual dos controles Admin e formulário comercial, sem vazamento de ferramentas/custos.
- Manifesto da entrega validado; `git diff --check` sem erros. A suíte geral foi limitada a quatro processos para evitar pressão de recursos do ambiente local. A primeira rodada paralela ilimitada apresentou timeouts e foi descartada; as execuções finais limitadas passaram.

## Revisão independente e correções

Revisor independente sobre `8aea99c..68808d6`, sem alterações de código ou chamadas externas: nenhum crítico, cinco importantes e um menor. Uma rodada consolidada de correções, sem nova revisão, com regressões observadas falhando e passando:

1. Pedidos/outbox, projeção comercial e retomada agora usam o resultado terminal do funil. Lacunas e exclusões encerram; incerteza obrigatória continua aguardando. Evita a pausa artificial pelo caminho dos botões.
2. URLs de contato retornadas pelo Agent ainda são lidas dentro do orçamento gratuito mesmo com identidade confirmada, inclusive na recuperação salva. Só a origem institucional associada é seguida; nenhuma busca paga adicional.
3. Dataset congelado seleciona G1 após G0 e G5 com evidência institucional do estabelecimento; grupo e ausência de site não contam. Executor real e avaliação compartilham contexto e flags. Amostra sem elegibilidade registrada não pode ser aprovada pelo executor.
4. G1 em observação não ocupa a capacidade que pode ser necessária ao G3 efetivo ou à última decisão G5; não aumenta limite nem compra capacidade adicional.
5. Relatório e CSV do lote usam o run associado, seus eventos e sua admissão G0. A revisão atual da ficha fica separada, sem misturar caminhos de duas rodadas da mesma revisão.

A execução teve desvios documentados de RED-first em refinamentos de relatório, interface e suporte: esses trechos foram verificados depois da edição. As cinco correções da revisão tiveram reprodução falhando antes da correção; erros iniciais de preparação dos novos testes de relatório/amostra foram corrigidos antes de observar a falha relevante.

## Decisões adicionais e limites da comprovação

- O aceite humano final prevaleceu sobre trechos anteriores sobre 50%, calibração global e Agent vitalício. Custo: comportamento diferente do texto substituído, conforme autorizado.
- Observação não ganha orçamento implícito: uma compra G1 pode ser omitida para preservar decisões efetivas. Custo: menos amostras passivas; a avaliação separada permanece disponível mediante confirmação.
- Qualidade e cobrança reais dos provedores não foram julgadas. Mantido o pré-piloto separado; custo: testes sintéticos não comprovam qualidade/disponibilidade em produção.
- Migrações e configuração em produção não foram julgadas. Nenhum push/deploy/ativação nesta autorização; custo: os pré-requisitos de produção ainda precisam de conferência no rollout.
- Uma janela de interrupção entre reabertura G0 e criação do pedido não foi confirmada como defeito. Mantido o fluxo idempotente sem reparo especulativo; custo: uma interrupção nessa janela pode exigir repetir o mesmo pedido explícito.

## Pendência menor adiada

Leituras públicas gratuitas (`public_read`) sem custo real explícito podem aparecer como valor não conciliado no relatório exclusivo do Admin YUX. Isso não gera cobrança nem altera os limites da pesquisa. Não foi incluído na rodada de correções importantes.

## O que ainda não foi feito

Não houve publicação, ativação do novo funil, mudança de configurações reais, importação do catálogo oficial, rótulos humanos, calibração paga ou piloto em empresas reais (T11/T12). A entrega local é implementação verificada, não confirmação de funcionamento/qualidade em produção. Os dois documentos não rastreados de experimento, preexistentes à execução, foram preservados.

## Integração na main — autorização posterior

Após o usuário autorizar expressamente mesclar e enviar, a main local foi atualizada até `origin/main` (`8aea99c`) e recebeu os quatro commits da implementação até `0b76a05` por fast-forward, sem conflitos. O workspace principal de outros trabalhos e os documentos não rastreados foram preservados.

Verificação repetida na main: backend 1.375 aprovados/126 opt-in ignorados; integração Radar/PostgreSQL 144 aprovados; runtime Python 375 aprovados/sete opcionais ignorados; frontend 1.174 aprovados; builds e orçamento do bundle aprovados; manifesto e regeneração dos contratos sem divergência. A checagem de lint identificou três imports com tipo `any` nos próprios testes novos; foram substituídos por imports tipados. Lint baseline e TypeScript passaram sem aumentar a baseline ou alterar componentes de produção.

Enviar a main não ativa o funil, não configura provedores e não executa o piloto. A conclusão do deploy automático e o funcionamento em produção exigem confirmação posterior; não são inferidos desses testes locais.
