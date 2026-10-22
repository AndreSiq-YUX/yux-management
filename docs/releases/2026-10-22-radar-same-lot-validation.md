# Radar — recuperação do mesmo lote da Villeman

## Publicação e escopo

Correção publicada na main em `a2e9f762709f8d2f139752a67a5c827fa29f8fc3`, a partir de `f337f08`. Dez empresas da campanha Cozinhas Industriais São Paulo; nenhuma nova descoberta, mudança de modelo, credencial, orçamento ou exclusão automática sem calibração. A autorização de retomada não é uma autorização de exceção TLS.

## Evidências de desenvolvimento

- Backend completo: 1.473 testes aprovados, 126 skips de ambientes opcionais; build aprovado.
- Runtime completo: 388 aprovados, 7 skips opcionais.
- Integração com PostgreSQL isolado e provedores sintéticos: 37 aprovados, incluindo o lote com duas antigas conclusões, cinco lacunas, duas respostas pagas inválidas e uma restrição TLS.
- Audiência HTTP: 27 aprovados; ferramentas, modelos, custos e diagnósticos continuam exclusivos do Admin YUX.
- Frontend: TypeScript, build Vite e orçamento de bundle aprovados; sem alteração de componentes nesta correção.
- Revisão direta pelo autor, em sessão sem subagentes conforme solicitado. Não houve revisão independente.

## Correções verificadas

Capacidade reservada para a decisão final, renovada apenas por intenção explícita de recuperação. Respostas com citações inexistentes continuam rejeitadas; normalização aceita somente espaços e composição Unicode, preservando o trecho original. Qualificação considera o objetivo comercial, sem exigir expressão literal ou estrutura própria não solicitada.

Conclusão de fila não significa aderência comercial comprovada. Contatos de terceiros e URLs de posts/vídeos não aparecem como canais da empresa; as fontes permanecem na auditoria interna. Descarte humano atualiza os contadores do lote sem apagar execução ou cobrança anterior e pode ser revertido.

A retomada mantém os mesmos candidatos e execuções, admite atualização de etapas pendentes e consultas baratas ainda não realizadas, preserva o Agent já concluído e trava a descoberta do lote. Clique repetido com o mesmo pedido não renova novamente a capacidade.

## Situação anterior à recuperação real

Sete consultas de descoberta; dez empresas admitidas. Duas execuções encerradas, mas com aderência apenas possível; cinco com lacunas; três falhas técnicas. Nenhuma aderência confirmada. O custo original total conhecido/estimado era aproximadamente R$ 1,12, incluindo respostas inválidas cobradas. Conversão interna: dólar a R$ 6,00 com margem de 15%; valores estimados não são fatura do provedor.

## Validação em produção

Primeira implantação `a2e9f76` confirmada no Dokploy: migração terminou com código zero; API, runtime e worker externo novos em execução. Revalidação gratuita: Qualita recuperada; Grupocine ainda inválido. O descarte humano reversível do cinema mudou os contadores para uma empresa fora do perfil e duas falhas técnicas, preservando as sete consultas e o histórico pago.

A conciliação identificou e ganhou uma regressão adicional: recuperar o recibo exato anterior antes de comparar o hash dos critérios atuais, sem confundir uma resposta salva com permissão de repetir sua compra. A retomada paga do lote só começa após a implantação dessa correção adicional. Validação final das dez empresas ainda em andamento.

Rodada real em `f4633a2`: Novita e L'Allegro passaram de possível a confirmado; Grupocine permanece descartado por revisão humana. Três consultas estreitas retornaram erro de interpretação, e o checkpoint antigo da Qualita permaneceu reservado atrás da etapa de identidade. Os erros foram rastreados sem refazer consultas.

O adaptador passou a aceitar a seção `web` nula somente em uma resposta tipada de sucesso, conforme a [referência oficial Brave](https://api-dashboard.search.brave.com/api-reference/web/search/post), e a preservar respostas brutas de todas as buscas licenciadas. Falha de busca complementar esgotada permanece auditada, mas não mantém um lote encerrado preso em retomadas. Recibos concluídos são conciliados mesmo quando uma etapa anterior impede o avanço. A associação comprovada de um site só é reaproveitada com a mesma identidade, as mesmas fontes citadas e nova validação de propriedade/escopo; novas páginas irrelevantes não compram outra identificação por si só.

O diagnóstico de certificado vencido é recuperado do histórico da leitura, se ainda não houve leitura válida daquele endereço. A exceção continua específica, expira em uma hora e reprova certificado alterado, domínio diferente, IP privado e autorização revogada. Uma autorização específica prioriza uma única leitura da homepage, sem dispensar robots ou ampliar permissões para outros sites. Não foi concedida autorização TLS para Galbiatti nesta etapa.

O teto de identificação continua o configurado, mas é contado por orçamento de recuperação explicitamente autorizado e correspondente ao pedido atual. Compras antigas não são apagadas nem repetidas; entradas incertas continuam exigindo conciliação/autorização própria. Os testes reais de TLS, audiência e reconciliação passaram antes da publicação dessa correção.
