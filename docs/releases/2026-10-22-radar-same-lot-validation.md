# Radar — recuperação do mesmo lote da Villeman

## Publicação e escopo

Correções publicadas na main, de `f337f08` até `59be4a7b3e4a973a1080d527196e129e4158aeb0`. Dez empresas da campanha Cozinhas Industriais São Paulo; nenhuma nova descoberta, mudança de modelo, credencial, orçamento ou exclusão automática sem calibração. A autorização de retomada não é uma autorização de exceção TLS.

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

A conciliação identificou e ganhou uma regressão adicional: recuperar o recibo exato anterior antes de comparar o hash dos critérios atuais, sem confundir uma resposta salva com permissão de repetir sua compra. A rodada paga começou somente após a implantação dessa correção adicional. O resultado final está registrado abaixo.

Rodada real em `f4633a2`: Novita e L'Allegro passaram de possível a confirmado; Grupocine permanece descartado por revisão humana. Três consultas estreitas retornaram erro de interpretação, e o checkpoint antigo da Qualita permaneceu reservado atrás da etapa de identidade. Os erros foram rastreados sem refazer consultas.

O adaptador passou a aceitar a seção `web` nula somente em uma resposta tipada de sucesso, conforme a [referência oficial Brave](https://api-dashboard.search.brave.com/api-reference/web/search/post), e a preservar respostas brutas de todas as buscas licenciadas. Falha de busca complementar esgotada permanece auditada, mas não mantém um lote encerrado preso em retomadas. Recibos concluídos são conciliados mesmo quando uma etapa anterior impede o avanço. A associação comprovada de um site só é reaproveitada com a mesma identidade, as mesmas fontes citadas e nova validação de propriedade/escopo; novas páginas irrelevantes não compram outra identificação por si só.

O diagnóstico de certificado vencido é recuperado do histórico da leitura, se ainda não houve leitura válida daquele endereço. A exceção continua específica, expira em uma hora e reprova certificado alterado, domínio diferente, IP privado e autorização revogada. Uma autorização específica prioriza uma única leitura da homepage, sem dispensar robots ou ampliar permissões para outros sites. Não foi concedida autorização TLS para Galbiatti nesta etapa.

O teto de identificação continua o configurado, mas é contado por orçamento de recuperação explicitamente autorizado e correspondente ao pedido atual. Compras antigas não são apagadas nem repetidas; entradas incertas continuam exigindo conciliação/autorização própria. Os testes reais de TLS, audiência e reconciliação passaram antes da publicação dessa correção.

Verificação adicional em produção: três resultados derivados foram conciliados pelo serviço da aplicação, na mesma operação, com contadores de consumo inalterados. O lote mantém dez empresas, sete consultas de descoberta e um descarte humano reversível. A leitura pública normal de Galbiatti em 22/10 às 20:02 UTC confirmou certificado vencido em 29/07/2026; o diagnóstico real foi preservado, sem conceder exceção. Em execuções legadas, o diagnóstico também precisa sobreviver no histórico de evidências, pois nem todas possuem recibo de leitura pública.

Um diretório regional desconhecido estava sendo proposto como site da Qualita. A classificação agora reconhece a estrutura de cadastro por estado/cidade/CNPJ; o portal genérico gov.br também não é site do prospecto. Regressões RED/GREEN aprovadas. Backend completo: 1.475 aprovados/126 skips; 34 integrações reais de TLS e audiência aprovadas; type-check e build aprovados. A publicação desta última correção precede a validação final da Qualita.

## Resultado persistido e visto na interface

Dokploy confirmou `59be4a7`: Docker Compose Deployed; migração encerrada e API/worker externo em execução. A aplicação respondeu com a nova classificação de diretórios. O diálogo nativo de confirmação do navegador falhou duas vezes antes de salvar o pedido da Qualita. Para não repetir cliques, foi conferida a ausência de pedido novo e usada a função administrativa `queueRadarResearchRequest` da aplicação, com o Admin ativo, intenção `resume`, consentimento de atualização e identificador idempotente `3884fd6a-1036-4759-a824-c480a439060e`. O outbox e o worker normais executaram esse pedido; nenhum resultado ou recibo protegido foi marcado válido manualmente.

A operação original `b0285306-6a60-4df6-8eeb-f65ca9d831e6` terminou `completed`, com os mesmos dez candidatos/execuções, sete consultas de descoberta e motivo `target_reached`. Contadores finais: **2 concluídas, 7 concluídas com lacunas, 1 fora do perfil, 0 falhas técnicas e 0 aguardando retomada**. A tela mostra “Pesquisa concluída — revise os resultados”. Há três empresas com contato útil; nenhuma foi aprovada automaticamente para contato ou CRM.

| Empresa | Resultado | Qualidade/limitação principal |
| --- | --- | --- |
| Novita Restaurantes | Aderência confirmada | Site institucional, telefone, perfis associados e formulário com assunto Compras; refeições coletivas/corporativas. |
| L'Allegro Restaurante | Aderência confirmada | Site institucional, `comercial@lallegro.com.br` e telefone; atendimento de alimentação empresarial. |
| LPQBR | Com lacunas | Marca/global não comprova o estabelecimento brasileiro; sem atribuição automática de contatos do grupo à unidade. |
| Almanara | Com lacunas/revisão | Restaurantes, delivery e eventos não bastam para confirmar o objetivo; ausência de prova industrial não justifica exclusão conclusiva. |
| Qualita Alimentos | Com lacunas | Cadastro de Ribeirão Preto não foi vinculado com segurança ao site da marca de outra localidade; diretório não aparece mais como site oficial. Recibo anterior recuperado gratuitamente; sem falha técnica pendente. |
| Toninho's | Com lacunas | Nome promissor, mas site/identidade pública não comprovados; não descartada por ausência de site. |
| Nectar Original | Com lacunas | Identidade/site e aderência não comprovados pelas fontes disponíveis. |
| Prospera Trabalho Temporário | Com lacunas | Perfil aparentemente distante; fontes homônimas não comprovam o vínculo com o CNPJ. Sem descarte baseado apenas em nome/CNAE. |
| Galbiatti Refeições | Com lacunas | Certificado de `galbiatti.com.br` venceu em 29/07/2026, confirmado por leitura normal. Autorização excepcional específica solicitada, ainda não concedida; pode aprofundar este mesmo registro depois da aprovação. |
| Grupocine | Fora do perfil | Site e cadastro de exibição cinematográfica; descarte humano reversível, sem nova análise paga do cinema. |

Isto prova a recuperação operacional, **não** dez leads bons. A descoberta original admitiu empresas pouco aderentes; esta entrega não a repetiu nem ampliou o mercado. Sete casos continuam exigindo evidência adicional ou revisão, sem inventar contatos, aprovar homônimos ou excluir empresas potencialmente aderentes para deixar o painel verde.

## Etapas, ferramentas e modelos efetivamente usados

- Descoberta: sete chamadas CNPJá originais; nenhuma na recuperação.
- G1: dez decisões originais em observação. G3: seleção efetiva de próxima ação/fonte. G5: observação, sem poder de exclusão automática não calibrada. Modelo de decisão observado: OpenRouter `perplexity/pplx-decider-v1.2`. Histórico acumulado: G1 10, G3 67, G5 12; a recuperação adicionou 34 decisões G3/G5, não dez triagens repetidas.
- Busca complementar acumulada: Serper Web 29, Brave Web 18, Brave Places 2, Perplexity Fast 16 e Perplexity Web 7. São consultas diferentes ainda não realizadas, não repetição das respostas concluídas. Quatro falhas Brave permaneceram na auditoria; três eram o bloqueio opcional esgotado conciliado, e uma ocorreu numa empresa que conseguiu concluir por outras fontes. Sem resposta bruta legada, não foram chamadas novamente só para corrigir o recibo.
- Agent Perplexity `perplexity/sonar`: oito resultados antigos reaproveitados e **uma primeira execução para Novita**, total nove. Nenhum Agent concluído foi recomprado. Até três passos, uma tentativa, orçamento existente.
- Leitura pública, extração de contatos, associação de identidade e qualificação por `anthropic/claude-haiku-5.5` via OpenRouter. Não foi observado uso do fallback. Acumulado: 16 identificações e 9 qualificações, incluindo histórico inválido/recuperado. Qualificação não prossegue como se a identidade estivesse confirmada quando não está.
- Citações continuam exigindo trecho real verificável. Contatos de portais, diretórios, homônimos e URLs de posts/vídeos não viram canais oficiais. Essas informações operacionais permanecem restritas ao Admin YUX, conforme 27 testes de audiência HTTP.

## Conciliação financeira — Admin YUX

| Componente acumulado | Valor em reais |
| --- | ---: |
| Descoberta CNPJá, estimativa | 0,175000 |
| Serper, estimativa | 0,290000 |
| Brave Web + Places, estimativa incluindo falhas | 0,800000 |
| Perplexity Fast + Web, estimativa | 0,357000 |
| Agent, custo informado convertido | 0,586293 |
| Decisões, custo informado convertido | 0,030667 |
| Identificação e qualificação, custo informado convertido, incluindo inválidas | 0,229488 |
| **Total conhecido + estimado** | **2,468448** |

IA informada pelos recibos: USD 0,12267364. Conversão interna já configurada: USD/BRL 6,00 mais margem de 15% (fator 6,90), não cotação de mercado nem fatura. O recibo inválido do cinema (USD 0,0008057), ainda sem custo no checkpoint legado, foi incluído à parte na conciliação; a qualificação antiga da Qualita já aparece recuperada. Reservas de R$ 0,207 do Agent **não** foram somadas novamente ao custo efetivo.

Original: R$ 1,121247. Recuperação incremental: **R$ 1,347201**. Total médio: **R$ 0,246845 por empresa examinada**, ou **R$ 1,234224 por aderência confirmada** (duas, ainda não aprovadas comercialmente). As buscas usam preços administrativos estimados; saldo/fatura do provedor podem diferir. Orçamento, modelos, credenciais e tetos não foram aumentados.

## Pendência explícita e prova visual

Somente a leitura excepcional de Galbiatti depende da resposta à autorização específica. Até lá, permanece com lacunas; isso não mantém as outras nove empresas pausadas. O diagnóstico fresco foi preservado no histórico real de leitura, sem liberar TLS globalmente. A tela de autorização e o fechamento do lote foram registrados nas evidências locais `radar-galbiatti-consent-20261022.jpg` e `radar-lote-final-20261022.jpg` em `.codex/visualizations`.

Não foi executada nova descoberta, envio ao CRM, formulário de fornecedor ou mensagem. A instância PostgreSQL isolada de testes foi desligada após os testes; os dois documentos não rastreados preexistentes do experimento foram preservados.
