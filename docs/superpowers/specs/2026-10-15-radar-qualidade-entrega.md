# Radar Comercial: qualidade, pesquisa adaptativa e entrega comercial

## Solicitação aprovada e limites desta execução

O usuário aprovou as sete frentes propostas na conversa e acrescentou que páginas de governo, listas e diretórios apareceram como sites das empresas. O resultado esperado é um Radar configurável para qualquer segmento, região e oferta, com identidade confiável, canais úteis, retomada correta, resultados acionáveis e custo mensurável. Não criar uma pesquisa específica para cozinhas industriais, criação de sites ou uma cidade.

Esta etapa implementa e testa software com provedores simulados. Não autoriza novas chamadas pagas, escolha de modelos, alteração de limites de produção, credenciais, licenças, exceções TLS, envio de mensagens ou formulários. Publicar em main após testes conforme autorização permanente anterior; deploy e piloto real são operações separadas.

## Evidências locais e operacionais

- `source-identity.ts` identifica alguns domínios e padrões de diretórios; outros endereços HTTP válidos viram `institutional_candidate` por exclusão. Citar o CNPJ não demonstra titularidade.
- No último lote, apareceram páginas de balanços, diário oficial e compras governamentais no campo de site candidato. Devem continuar como fontes, não como presença institucional.
- `public-presence.ts`, `company-projection.ts` e a apresentação de `publicPresence` precisam aplicar a mesma distinção também aos dados históricos; corrigir só a próxima busca não resolve a lista atual.
- `site-discovery.ts` consulta presença local antes da web quando configurada. O fallback de `research-service.ts` usa outra fonte quando há erro/resultado vazio, não quando os resultados não ajudam a resolver a identidade.
- A retomada de 14/10/2026 encontrou novos hits sem ler páginas em 17 empresas porque `readingComplete` persistido encerrou a fase prematuramente. Um refresh delimitado contornou o problema; o defeito continua pendente.
- Seis análises ficaram com conclusão incerta. Não há evidência suficiente para afirmar que não foram cobradas; não podem ser repetidas silenciosamente.
- Há classificação de finalidade, perfil comercial, avaliação de porte, revisão, exportação e entrega idempotente ao CRM. Ampliar essas capacidades, não substituí-las nem apresentá-las como inexistentes.
- O resumo atual repete contatos encontrados em páginas diferentes. Contatos publicados para vagas, privacidade ou terceiros não são automaticamente apropriados à oferta.

## Requisitos

### R1 — Titularidade do site e referências externas

Separar site institucional candidato/associado, perfil social associado e fonte externa. Diretórios, notícias, documentos de terceiros, páginas de licitações, transparência, diários e listas nunca se tornam o site da empresa apenas por nome/CNPJ coincidente. Referências podem ajudar a encontrar uma marca ou domínio, mas este precisa ser consultado/associado separadamente.

Usar sinais de URL, título, estrutura e contexto; uma lista finita de domínios é somente uma camada. Não bloquear por palavras vagas como “fornecedor” ou por conter CNPJ: o formulário de fornecedores do próprio site é legítimo. Um portal governamental pode ser a presença legítima da entidade pesquisada; permitir esse caso somente com evidência de titularidade, não por citação em um documento de terceiros.

Aplicar na descoberta, identificação por IA, releitura/redirecionamentos, projeções históricas, lista, detalhes, exportação e novas entregas CRM. Fontes externas ficam na seção de evidências, com autoria/origem e data. Preservar dados históricos e contatos/leads aprovados; apontar necessidade de revisão sem reescrever o CRM existente.

### R2 — Retomada e análise incerta

Modelar trabalho de leitura por URLs normalizadas e versão do leitor, não por um booleano global obsoleto. Novos resultados devem abrir novas leituras elegíveis, respeitando orçamento de páginas. Não reler páginas já concluídas/recentes nem repetir chamadas concluídas. Falta de quota não significa leitura concluída.

Registrar duravelmente as solicitações de IA por tenant, request ID, finalidade e hash da entrada, com estados `reserved`, `completed`, `rejected_before_provider`, `uncertain`. Mesmo ID e mesmo conteúdo recuperam resposta concluída; ID reutilizado com conteúdo diferente é conflito. Solicitações concorrentes não debitam/chamam duas vezes. Só uma rejeição comprovadamente anterior ao provedor permite repetição segura. Para as seis chamadas antigas, diagnóstico somente dos registros disponíveis; ausência de registro não prova ausência de cobrança. Nenhum replay pago nesta implementação.

### R3 — Pesquisa adaptativa e condições de parada

Preservar limites existentes de 1–5 chamadas de busca e 1–10 páginas por execução. Acrescentar ordem configurável da consulta local (`before_web`, `after_web_if_needed`, `disabled`), mantendo o padrão legado nos registros existentes. Nenhuma campanha de produção é migrada automaticamente para uma nova estratégia.

Avaliar a utilidade dos resultados por possibilidade de resolver identidade e lacunas da campanha, não por quantidade de hits. Diretórios isolados não encerram a pesquisa. Consultar outra fonte selecionada quando a primeira não fornecer candidato útil, sem promover o primeiro resultado automaticamente. Consultas de marca, razão social, região e finalidade devem responder a lacunas específicas. Após identificar o domínio, priorizar páginas pertinentes ao objetivo. Parar quando os critérios forem atendidos ou os limites atingidos; manter motivo explícito.

### R4 — Canais consolidados e adequados à finalidade

Consolidar por tipo, valor normalizado, identidade e escopo; preservar todas as fontes e datas. Um mesmo telefone não deve aparecer repetido no resumo por estar em três páginas. Não misturar contato do grupo com contato confirmado da filial.

Priorizar a finalidade escolhida na campanha e indicar alternativas (contato geral, formulário). Recrutamento, financeiro, privacidade e créditos da agência não viram contato preferencial comercial sem suporte apropriado. Não inferir WhatsApp de um telefone; apenas link/publicação explícita. Publicação não comprova atendimento, entrega de e-mail ou consentimento. Pessoas somente em contexto profissional publicamente evidenciado, sem coleta de cadastros pessoais.

### R5 — Qualidade independente e entrega configurável

Exibir identidade, contatabilidade, aderência e potencial separadamente. Potencial reutiliza avaliação de porte com cobertura e fontes; ausência de dado é desconhecido, nunca baixo potencial por padrão. Capital social não é faturamento, idade não prova escala e S.A. não prova grande porte.

Adicionar critérios de suficiência editáveis: identidade associada, segmento confirmado, site associado quando necessário e ao menos um canal elegível dentre tipos/finalidades escolhidos. Desativados por padrão em campanhas legadas para não modificar suas aprovações. Uma campanha pode aceitar empresa sem site. Resultado suficiente significa pronto para revisão humana, não aprovado nem autorizado para contato.

### R6 — Fila comercial e retorno da equipe

Adicionar filtros por pronto para revisão, falta canal útil, identidade pendente, bloqueio operacional e fora do perfil, com motivo objetivo. Preservar revisão, seleção, paginação, exportação, histórico e encaminhamento ao CRM. Manter padrão visual YUX e diagnósticos de fornecedores restritos ao contexto administrativo.

Registrar retorno estruturado da equipe: empresa correta/incorreta, canal válido/inválido, segmento confirmado/divergente e observação. Retorno auditado por usuário/data/canal não modifica silenciosamente a campanha, não treina modelo, não atualiza um lead entregue sem revisão e não dispara contato. Não conceder novos privilégios de pesquisa paga a clientes como efeito desta melhoria.

### R7 — Custos e verificação objetiva

Mostrar buscas estimadas, IA com valor informado pelo provedor quando disponível e custo desconhecido/pendente separadamente. Créditos internos não são reais nem dólares. Não inventar custo zero para chamadas sem informação; não converter USD em BRL sem taxa e data explícitas. Preservar teto de buscas separado da IA e limites administrativos atuais.

Indicadores por campanha/período: empresas pesquisadas, identidade associada, canal útil, prontas para revisão, chamadas por fonte, custo estimado de buscas por resultado e cobertura de custos IA. Não somar custos em joins que multipliquem linhas nem confundir 195 chamadas com 195 empresas. Divisão por zero retorna ausência de métrica.

Montar benchmark local com 20 casos sintéticos ou evidências reduzidas já disponíveis, distribuídos por segmentos/regiões: diretório, governo, homônimo, matriz/filial, formulário, ausência de site, contatos duplicados, fonte desatualizada, interrupção e quota. Exigir zero promoção de terceiros como site/canal oficial nos casos conhecidos, retomada sem duplicação e resultados explicáveis. O benchmark é regressão controlada, não prova de cobertura do mercado brasileiro; piloto real posterior depende de autorização de consumo.

## Fora do escopo

Novos provedores/modelos, navegador de scraping generalizado, bypass de bloqueios/CAPTCHA, alteração da política TLS, contato automático, carteira de créditos redesenhada, exclusão de histórico e migração destrutiva de leads. A revisão manual de limites de créditos solicitada anteriormente permanece uma pendência independente, não será declarada concluída por estas mudanças.
