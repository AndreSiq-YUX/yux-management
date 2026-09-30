# Radar B2B: cozinhas industriais em MG, SP e PR

> Este recorte foi generalizado após correção explícita do usuário. A pesquisa deve ser configurável para qualquer segmento e UF/cidade, sem regras setoriais no executor. Ver [pesquisa configurável](../../runbooks/radar-pesquisa-configuravel.md) para o funcionamento atual. Este documento registra a demanda específica original, não limites do produto.

**Estado:** recorte aprovado para implementação em 30/09/2026; primeira versão técnica entregue para piloto controlado, ainda sem validação com dados reais nem deploy confirmado. Contato telefônico manual pela equipe do cliente, com entrega por CSV para acompanhamento no CRM. Nenhum crédito de API ou modelo pago é autorizado por este documento.

## Resultado esperado

Uma campanha de prospecção para fornecedor de massas frescas e congeladas, massas para pães e salgados deve produzir uma lista auditável de estabelecimentos ativos que operam cozinhas industriais em Minas Gerais, São Paulo e Paraná. Cada registro deve distinguir cadastro, operação efetivamente verificada, adequação comercial aos produtos e contatos profissionais comprovados. Descobrir uma empresa não autoriza abordá-la.

## Recorte comercial inicial

- Núcleo: operadores que preparam e fornecem refeições para empresas, inclusive cozinhas centrais e alimentação coletiva. O CNAE 5620-1/01 (principal **ou secundário**) é um sinal inicial, não uma conclusão.
- Busca complementar: nomes/descrições como `cozinha industrial`, `alimentação coletiva`, `refeições corporativas`, `unidade de alimentação e nutrição` e `cozinha central`, sempre sujeitos a verificação.
- Restaurante comum, buffet eventual, comércio de alimentos e fabricante de massas não entram automaticamente. Caso haja evidência de operação industrial B2B apesar do cadastro ambíguo, vão para revisão, não descarte silencioso.
- A qualificação comercial é separada da classificação setorial: observar se a operação usa/compra pães, salgados ou massas, sua escala e região atendida; ausência dessa informação fica `desconhecida`, sem inventar volume de compra.
- Confirmar com o cliente se cozinhas de hospitais, escolas, hotéis, redes de restaurantes e centrais de produção próprias entram no público-alvo. Até lá, ficam em fila separada de expansão.

## Fluxo

1. **Briefing da campanha:** três UFs, segmento-alvo, produtos oferecidos, critérios de inclusão/exclusão, orçamento, fonte e versão das regras. A campanha não deve depender de uma cidade única.
2. **Descoberta com direito de retenção:** começar por CNPJ ativo filtrado por UF e CNAE; paginar com checkpoint e deduplicar CNPJ/estabelecimento. CNPJá é uma opção para piloto condicionado aos termos comerciais; dados abertos oficiais da Receita são alternativa para escala. A Brave terá chave específica com licença de retenção obtida pelo usuário; a rota de persistência só fica habilitável depois de registrar no Admin essa licença, sua referência e a chave específica. Serper continua transitória até contrato próprio. Não raspar resultados do Google Maps ou contornar restrições.
3. **Verificação da operação:** combinar cadastro com evidências de site oficial e outras fontes de uso permitido. Diferenciar `confirmada`, `provável/revisão`, `não é alvo` e `evidência insuficiente`; guardar fatos, trechos, URLs, datas e justificativa. Site ausente ou bloqueado não prova que a empresa não exista ou não seja cozinha industrial.
4. **Enriquecimento:** validar associação entre domínio e CNPJ/nome/endereço; extrair produtos/serviços, abrangência, telefones e e-mails corporativos publicados; localizar responsável profissional apenas quando houver fonte permitida e identificação inequívoca. Nunca adivinhar nome, e-mail ou cargo; não transformar sócios cadastrais em compradores presumidos.
5. **Qualificação:** classificar aderência aos produtos do cliente separadamente da certeza sobre a atividade. IA roteável no Admin pode resumir evidências ambíguas com resposta estruturada, citações e custo limitado; regras determinísticas cuidam dos filtros simples. Modelo pago só depois de autorização do usuário e configuração explícita.
6. **Revisão e entrega:** painel com filtros por UF, status, evidência, aderência, qualidade dos contatos e custo; revisão humana de casos incertos e amostra dos confirmados; exportação/CRM por organização autorizada. A equipe do cliente fará os contatos por telefone manualmente; nenhum disparo de e-mail/WhatsApp nesta fase.

## Campos e estados mínimos

`campaign_id`, `organization_id`, `cnpj_estabelecimento`, `cnpj_raiz`, razão social/fantasia, UF/cidade/endereço, situação cadastral, CNAEs principal/secundários, domínio oficial e estado de verificação, telefones/e-mails corporativos, contatos profissionais opcionais e respectivas fontes, `industrial_kitchen_status`, `product_fit_status`, confiança, motivo, fontes/datas, revisão, custo e versão da análise. Todo campo desconhecido deve continuar nulo/desconhecido, nunca preenchido por inferência sem marcação.

## Limites e governança

- Hoje a campanha Radar exige uma cidade/UF; a busca CNPJá para em 10 resultados sem continuação; o Radar é restrito à organização interna YUX; Serper/Brave são apenas prévias transitórias; não há verificação setorial profunda nem dossiê de contatos. Portanto, **o produto solicitado ainda não está pronto**.
- Reutilizar o Radar e suas permissões, mas habilitar acesso de cliente somente por organização e plano/entitlement explícitos, com isolamento de dados. Se o serviço for operado pela própria YUX, pode começar no workspace interno e entregar lista revisada sem abrir o módulo ao cliente.
- Checar termos de retenção/entrega de cada fonte antes de usar dados em lista entregue a terceiros. Os termos padrão da Brave impedem armazenar resultados como banco de leads; somente uma chave contratualmente habilitada, com atestação e referência da licença registradas pelo Admin, poderá alimentar a rota persistente. A simples presença da chave não é atestação.
- Leitura de sites, se autorizada, deve ficar em worker com limitação de páginas/tempo/tamanho, proteção de rede privada/SSRF, respeito a restrições publicadas e nenhuma área autenticada. Não usar perfis pessoais, dados sensíveis ou bypass de bloqueios.
- Dados de pessoas físicas exigem finalidade, minimização, transparência, prazo e base legal avaliados; contato profissional publicamente disponível não equivale a autorização para mensagem automática. Aplicar bloqueios e opt-out antes de qualquer futuro outreach.
- Orçamento explícito por campanha/fonte/modelo, idempotência, pausa e reexecução segura. Nenhuma chamada externa paga no desenvolvimento/testes automatizados; somente mocks.

## Piloto e aceite

1. Configurar a campanha MG/SP/PR sem precisar criar uma campanha por cidade; iniciar com lote pequeno por UF e teto de crédito aprovado separadamente.
2. Demonstrar paginação/checkpoint, reexecução sem duplicatas e empresa com CNAE apenas secundário descoberta.
3. Mostrar exemplos de restaurante descartado com motivo, cozinha industrial confirmada com evidência e caso ambíguo retido para revisão.
4. Mostrar que site não encontrado permanece desconhecido, contato não publicado permanece vazio e dados de outra organização nunca aparecem.
5. Medir precisão dos `confirmados` por revisão manual estratificada por UF; antes de escalar, definir com o cliente o volume desejado e limiar de qualidade. Não prometer cobertura total do mercado.
6. Exportar apenas registros com proveniência e direitos de uso validados, sem abordagem automática.

## Fontes de referência

- [IBGE/Concla: CNAE 5620-1/01 e descrição de cozinha industrial](https://cnae.ibge.gov.br/?Itemid=6160&chave=5620-1&option=com_cnae&versao_classe=7.0.0&versao_subclasse=10.1.0&view=atividades).
- [CNPJá SDK: filtros por UF, CNAE principal/secundário e paginação](https://github.com/cnpja/sdk-nodejs).
- [Receita Federal: dados abertos cadastrais](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/cadastros).
- [Brave Search API: termos de retenção](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service).
- [ANPD: guia de legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse).
