# Radar Comercial — CNPJá, Serper Places e Brave Place Search

## Estado desta etapa

- **CNPJá**: somente o Admin pode pesquisar e produzir candidatos persistidos na organização interna da YUX após ativação manual da fonte. O limite e o orçamento internos reservam conservadoramente uma unidade por pedido, mesmo com zero empresas; isso **não é a fatura real do CNPJá**, cuja documentação indica um crédito por dez estabelecimentos retornados. A reserva é confirmada antes da chamada e não desaparece caso falhe a gravação posterior. Lote máximo: dez resultados. A cidade e UF são conferidas com o código municipal do IBGE antes da pesquisa. A ausência de site na resposta permanece **desconhecida**, não “sem site”. O Radar guarda dados empresariais normalizados, sem o quadro de sócios.
- **Serper Places e Brave Place Search**: somente pré-visualização transitória na tela do Radar. Não são criados candidatos, empresas, diagnósticos nem leads a partir dessas respostas. Os IDs temporários da Brave não são devolvidos à interface. Sem gravação de payloads de busca no banco. A visualização pode mostrar site informado, endereço, telefone, e-mail, Instagram e avaliações quando o provedor os entregar; nenhum desses campos é tratado como verificado.
- **Scraping e crawl**: não executados nesta etapa.
- Nenhuma pesquisa externa foi realizada durante a implementação; os testes usam fixtures.

## Próxima configuração pelo Admin

1. Depois do deploy, abrir **Admin → Integrações globais**. Os cartões **Serper Places** e **Brave Place Search** já devem existir.
2. Salvar cada chave no campo próprio **API key**. A chave é criptografada no backend e não volta para o navegador. Não inserir chave em “Configuração pública JSON”.
3. O botão **Testar conexão** faz **uma consulta real** e pode consumir crédito, mesmo se a fonte do Radar continuar desligada. Conferir o plano e o saldo do provedor antes de clicar. O teste define o estado operacional da conexão.
4. Na campanha da organização interna da YUX, em **Fontes da campanha**, informar e salvar o custo estimado por consulta em **R$** para Serper e Brave. Usar o custo do plano contratado e câmbio/tributos aplicáveis; zero não libera uma fonte paga.
5. Ativar manualmente somente a fonte desejada. O Admin confirma que ela pode consumir créditos. A fonte continua limitada a dez consultas por dia e pelo limite diário da campanha. Configurar o orçamento da campanha antes do canário.
6. Em **Busca local (pré-visualização)**, escolher Serper ou Brave, segmento, cidade, UF e até dez resultados. O botão exibe os resultados apenas naquela tela. A troca de campanha ou de fonte limpa a prévia.

## Limitações e próxima decisão

O botão de teste do CNPJá já existente também consulta um CNPJ real e pode consumir crédito. A pesquisa avançada agora usa o contrato oficial `GET /office` com filtros por código IBGE, UF, data, CNAE e situação ativa. Ela ainda requer um canário real de até dez resultados para confirmar o contrato da conta e medir qualidade; nenhum crédito CNPJá foi consumido nesta implementação.

Serper utiliza resultados derivados do Google; os direitos de armazenamento e redistribuição precisam de confirmação contratual antes de qualquer importação para o CRM. Os termos padrão da Brave Search API não autorizam retenção de resultados, e seus IDs de lugar expiram. Sem uma licença adequada, manter somente a pré-visualização transitória. A criação do dossiê completo — verificação independente de site, extração de conteúdo próprio, diagnóstico por oferta e conversão explícita ao CRM — pertence à etapa posterior aprovada no plano maior. Nenhum resultado de busca autoriza contato por WhatsApp ou e-mail.

Referências: [SDK oficial CNPJá](https://github.com/cnpja/sdk-nodejs), [códigos municipais do IBGE](https://www.ibge.gov.br/explica/codigos-dos-municipios.php), [Serper](https://serper.dev/), [Brave Place Search](https://api-dashboard.search.brave.com/documentation/services/place-search), [termos da Brave API](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service), [termos do Google Maps Platform](https://cloud.google.com/maps-platform/terms).
