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
