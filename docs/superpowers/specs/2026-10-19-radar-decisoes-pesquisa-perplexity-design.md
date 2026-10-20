# Radar Comercial com decisões de IA e pesquisa adaptativa

## Objetivo e decisão de arquitetura

Entregar listas comerciais aderentes à campanha, com identidade e contatos sustentados por fontes, uma operação intuitiva de pesquisar ou retomar e explicações úteis sobre lacunas. A IA de decisão seleciona caminhos dentro de um fluxo durável; não substitui autorização, coleta, validação ou contabilização. O modelo principal e os fallbacks são editáveis no roteamento central do Admin YUX.

O desenvolvimento preserva Fastify, PostgreSQL, BullMQ, runtime Python e React existentes. Não migrar para outro framework de agentes. Começar por A0, quatro correções pequenas no fluxo atual; preparar e medir E0 antes da infraestrutura B. A fortalece recuperação/experiência independentemente de modelo novo. C amplia descoberta/identidade e integra Perplexity opcional. Se a classificação atual empatar com modelos de decisão sem ganho relevante, reduzir/postergar B, mantendo sua escolha no Admin como objetivo condicionado à medição. C pode consumir a classificação estruturada atual.

Status: especificação para revisão, não implementação ou ativação. Base inspecionada: `2ae380a`, em 19/10/2026. Não autoriza compra de créditos, novas chamadas pagas, alteração da campanha, push ou deploy.

Execução escolhida para o plano: nativa, sequencial e sem subagentes, com revisão e testes por tarefa. `origin/main` e HEAD estão no mesmo `2ae380adbe91ed46f54773dbfa450eb77ad00560` após fetch; os 41 commits de divergência são contra a main local antiga. Não há ramo pendente de integrar à main remota nesta base; migrações 0193–0195 já estão nela.

## Requisitos globais

- A experiência comercial do Radar não mostra ferramentas, fornecedores, modelos, rotas, recibos, tokens, licenças, custos ou falhas de infraestrutura. Administração técnica fica no painel administrativo do sistema, não em um accordion dentro da campanha.
- Somente o papel global `yux_admin` pode receber os dados técnicos. Aplicar allowlists aninhadas no backend, incluindo erros HTTP, histórico, exportações, CRM e atualizações de progresso. Preservar o CNPJ cadastral da empresa e suas fontes comerciais legítimas.
- Não apagar candidatos, empresas, revisões, recibos, contadores, overflow, aprovações ou correções humanas. Descartes de aderência são reversíveis e ficam fora da lista principal.
- Uma resposta paga com resultado incerto não é reenviada automaticamente. Recuperar recibos/respostas; novas compras exigem autorização compatível com a política financeira vigente.
- Não relaxar bloqueios SSRF, DNS fixado, TLS, robots, acesso privado, permissões de conta ou licenciamento. Exceções de certificado continuam específicas e temporárias.
- Critérios comerciais e geográficos são configuráveis por campanha ou missão. Nenhum preset fixo de segmento, cidade, estado ou oferta. Este caso de teste não vira regra global.
- Preservar visual e componentes YUX. Não alterar regras de CRM, WhatsApp, missões, cobrança ou outros consumidores das rotas de chat e embeddings.
- Desenvolvimento usa transportes simulados e PostgreSQL isolado. Piloto real e implantação são autorizações separadas.

## Diagnóstico que esta evolução precisa resolver

O [inventário das vinte empresas](../plans/2026-10-19-radar-bloqueios-auditados.md), conferido por leitura em 19/10 às 13:08 UTC, é a entrada da implementação. O pai tem 1 concluída, 8 insuficientes e 11 bloqueadas: seis autorizações de atualização pendentes e cinco chamadas incertas. Cada item tem código, tarefa e aceite. Duque/Gourmet mostram causas diferentes no dossiê e no pai; consultar os recibos antes de afirmar que um motivo substituiu o outro. Insuficiência de identidade/leitura não é automaticamente erro de infraestrutura. A descoberta atingiu a quantidade, não provou esgotamento do mercado; registros relidos/duplicados não demonstram perda dos melhores candidatos.

A entrada principal chama CNPJá, mesmo quando a campanha deveria descobrir empresas na web por segmento e região. CNAEs principais ou secundários amplos trazem empresas não aderentes. O planner de pesquisa também compartilha um teto acumulado entre consultas de fontes distintas. Aumentar o teto diário não libera esse orçamento individual antigo.

As retomadas individuais alteram o dossiê sem reconciliar imediatamente todos os motivos do lote. O botão em lote não transporta a mesma autorização de atualização semântica do painel individual. O hash de evidências contém metadados voláteis; uma releitura pode invalidar análise sem mudança comercial relevante.

A0 resolve capacidade por fonte (`research-service.ts:549/614`, `research-planner.ts:26`), autorização em lote (`RadarWorkspace.tsx:640`, comparado ao painel individual `:62`), reconciliação pai/filho (`capture-research-state.ts:15`, `capture-dispatch.ts:80`) e hash estável (`research-service.ts:205–213`). Não depende de contratos de decisão nem de tabela geral de recibos. Não remover os cinco recibos incertos para aparentar lote liberado; A1 faz a conciliação com a prova existente ou autorização específica.

Cinco análises de 18/10 ficaram com recibos incertos, sem resposta ou motivo original suficiente para revalidação. Há uma geração interrompida por limite de saída no horário da análise da Nutrisaúde; isso não demonstra a causa individual das outras quatro. Não converter esses recibos em falha sem cobrança por presunção.

## Perplexity e impacto financeiro

### Serviços diferentes

A [Search API](https://docs.perplexity.ai/docs/search/quickstart) entrega resultados ranqueados e conteúdo extraído, não um parecer gerado por LLM. Pode usar filtros de idioma, região e domínio. Até cinco consultas relacionadas cabem em uma requisição; manter relação entre consulta e resultado e não presumir cobertura completa. O conteúdo extraído é evidência de busca, não prova de que o transporte local verificou o site ao vivo.

A [Fast Search](https://docs.perplexity.ai/docs/search/fast-search) é um modo dessa busca; não confundir com preset de agente. Testar a modalidade rápida no caminho comum e a modalidade padrão em ambiguidades, em vez de consultar ambas sempre.

A [Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart) combina modelo, busca, leitura de URLs e síntese. Pode substituir um bloco de investigação, desde que devolva fontes e afirmações verificáveis. Não substituir automaticamente cadastro fiscal, comprovação de titularidade, validação de contato ou revisão de entrega. Uma citação não torna todo o parágrafo verdadeiro.

### Preços de referência

Valores de referência consultados em 19/10/2026. O provedor publica USD; o **Admin mostra BRL estimado**, com cotação/data e custos originais preservados. Impostos e tarifas de pagamento não são conhecidos por essa conversão. [Tabela oficial](https://docs.perplexity.ai/docs/getting-started/pricing).

| Operação | Unidade e valor |
| --- | --- |
| Search padrão | US$ 5 por 1.000 requisições bem-sucedidas |
| Search rápida | US$ 1 por 1.000 requisições bem-sucedidas |
| Agent web padrão | US$ 0,0025 por invocação, além do modelo |
| Agent web rápida | US$ 0,001 por invocação, além do modelo |
| Agent leitura de URL | US$ 0,0005 por invocação, além do modelo |

Uma requisição Search com até cinco consultas é uma unidade faturada; o controle de taxa conta as consultas. Resposta válida vazia pode ser cobrada. Não contabilizar consultas e requisições como se fossem a mesma grandeza.

Exemplo aritmético, não previsão de produção: uma requisição por empresa custa US$ 0,02/0,10 para 20 empresas e US$ 1/5 para 1.000 empresas, rápida/padrão. Cada empresa pode precisar de mais requisições e algumas consultas de descoberta produzem várias empresas.

Configuração administrativa `usdToBrl`, `rateAsOf`, `rateSource:'manual'` e margem explícita, inicial zero. Congelar cotação por reserva e usar decimal. Exemplo **hipotético**, não cotação atual: R$ 5,50/US$ transforma busca rápida/padrão em R$ 0,0055/R$ 0,0275 por requisição, ou R$ 0,11/R$ 0,55 para vinte. Agent acrescenta tokens, cache e ferramentas de todas as rodadas conforme modelo; usar os [preços vigentes do modelo escolhido](https://docs.perplexity.ai/docs/agent-api/models) e conciliar custo reportado. Sem cotação não assumir paridade nem custo zero; exigir configuração para autorizar novo efeito USD, sem impedir revalidação gratuita.

Não projetar Sonar com tabelas antigas ou equiparar teste no aplicativo Perplexity ao retorno da Search API. O modelo, as ferramentas e o contexto do aplicativo podem ser diferentes.

### Papel recomendado

Adicionar Perplexity Search como alternativa configurável de descoberta e enriquecimento, não como dependência obrigatória. Prever Agent como investigação seletiva: ausência de domínio convincente, conflitos marca/grupo/filial, aderência ambígua ou contato de finalidade específica ainda não encontrado. Agente não roda em todo registro por padrão. Quando o bloco externo satisfizer as lacunas, pular ações equivalentes internas, mas manter validações independentes.

Não remover Serper, Brave, CNPJá, OSM ou Places. Comparar descoberta na mesma região e aprofundamento na mesma amostra, com custo por aderente **novo**, contribuição marginal de fonte e custo por contato útil, não só por chamada. Search/Agent usam conexão Perplexity criptografada; OpenRouter não autentica automaticamente a API direta.

Retenção e distribuição são políticas distintas. [Privacidade da API](https://docs.perplexity.ai/docs/resources/privacy-security) não promete retenção zero por padrão. Antes de ativar persistência e entrega externas, o Admin confirma os direitos aplicáveis; não exigir novo identificador textual de contrato. Não afirmar que todos os conteúdos citados podem ser redistribuídos. Desenvolver normalização e evidências com testes simulados sem depender dessa ativação.

## Roteamento de modelos e fallback

Estender o campo existente `kind` de `LlmUseCaseDefinition` (`llm-routing.ts:4`) para `chat|embedding|decision|research`, sem criar `routeKind` paralelo. `isEmbeddingUseCase` consulta definição/catálogo, não nomes fixos. Chave técnica desconhecida ou digitada errada é rejeitada antes da rede, nunca tratada como chat silenciosamente. Perfis/agentes realmente cadastrados continuam chat; classificar rotas legadas desconhecidas explicitamente, preservando usos legítimos. Funções `radar_initial_triage`, `radar_next_action` e `radar_quality_gate` herdam apenas `radar_decision_default` compatível; exceções por organização/contrato e fallbacks ordenados usam `model_routing_rules` e painel central.

Integração geral de decisões por **POST `https://openrouter.ai/api/alpha/decisions`**, adaptador `OpenRouterDecisionsAlphaV1Provider`, protocolo interno versionado `openrouter-decisions-alpha-v1`. `/api/v1/systemone` é a compatibilidade com SDK TypeSafe, não o endpoint geral adotado para Jev/Luna. [Referência OpenRouter Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request). Modelo compatível pode ser trocado no Admin sem deploy; protocolo novo precisa de adaptador/testes. Não congelar quantidade de modelos como enum nem tratar ID desconhecido como já validado.

Guardar fixtures oficiais e respostas reais sanitizadas, identificadas distintamente, com data, modelo pedido/snapshot servido, versão do adaptador e schema. Não fazer chamada paga para fingir fixture documental. Mudança incompatível alpha conserva resposta e produz erro tipado, sem reaproveitar parser de chat nem aceitar escolha indevida. O retorno pode trazer snapshot diferente do alias solicitado; registrar ambos.

Configuração administrativa: principal, fallbacks ordenados, timeout, orçamento, capacidade por modelo, estado ativo/pausado, versão e teste explicitamente pago. Um teste verifica escolhas e probabilidades com um caso sintético, não apenas credencial ou endpoint de modelos. Mostrar cadeia efetiva e origem da herança. Não mudar chat/embeddings existentes nem criar permissões por ser administrador de conta.

Fallback de disponibilidade é distinto de escalonamento por dúvida. 401/403/429/5xx e resposta inválida são erros tipados com informação sobre início e resultado do efeito. Resposta comercial inconclusiva válida gera mais investigação, não tentativas de obter uma resposta favorável de outro modelo. Duplicar modelo na cadeia ou criar ciclo é inválido.

Resultado incerto de transporte exige conciliação ou aprovação administrativa agregada para uma nova tentativa identificada, nunca replay silencioso. Falha confirmada com resposta recebida pode acionar o próximo modelo autorizado dentro da reserva financeira, mesmo se houve custo; registrar ambos os custos. O resto do lote continua quando uma empresa depende de atenção.

Criar rota `radar_deep_research` de capacidade `research` para Agent, no mesmo painel, sem herdar chat/decisão incompatíveis. Modelo explícito e lista limitada de ferramentas web/leitura. Não usar presets mutáveis como configuração financeira de produção. Search é configurado como fonte, não como LLM.

### Calibração e contexto por modelo

Não adotar 0,90/0,98 globais. Calibração possui chave por provedor, modelo pedido/snapshot servido, versão do adaptador, tarefa/pergunta, seleção de contexto, rubrica e dataset. Guardar métrica escolhida (`top_probability` ou `confidence`), limiar por ação, validação e aprovação. Sem calibração correspondente, modo efetivo `observe` e limiares nulos. Troca de modelo principal/fallback, snapshot, pergunta ou contexto volta a observação; fallback nunca herda limiar do principal. Reativar encaminhamento/exclusão só com calibração compatível aprovada; coleta segura atual continua funcionando. [Confiança TypeSafe](https://docs.typesafe.ai/confidence).

O pacote de texto da decisão começa com limite de **24.000 bytes UTF-8 do JSON inteiro**, `state` de até 16.000 bytes e no máximo seis trechos de até 1.500 bytes, editáveis por modelo no Admin e respeitando limites de tokens. Reservar espaço de perguntas/envelope, cortar em fronteira válida e registrar omissões. Priorizar identidade/critério, atividade/abrangência, propriedade e finalidade de contato; remover duplicatas/rodapés e manter evidência contraditória pertinente. Não enviar páginas completas nem usar imagens nesta versão. Se trecho essencial não couber, investigar/revisar em vez de descartar. Jev no OpenRouter pode ativar modo longo em torno de **32.000 bytes**, distinto da janela em tokens. [Contexto Jev](https://openrouter.ai/blog/insights/what-is-jev/).

### Controle do Agent e fontes

Perplexity Agent recebe um único `model` por requisição, sem `models`, `preset` ou perfil de seleção implícita. Fallback do aplicativo usa requisição/recibo separado; nenhum replay incerto automático. [Fallback nativo](https://docs.perplexity.ai/docs/agent-api/model-fallback) não será delegado ao provedor. Tentativas internas não expostas não ganham custo individual fictício.

Usar `max_steps` (inicial 3, editável), não `max_tool_calls`; passos não são teto de invocações nem de custo. **Política revisada com autorização expressa em 20/10:** Agent pode funcionar com orçamento estimado acompanhado, sem garantia de teto remoto. Exigir aceite no Admin, estimativa por tentativa e orçamentos próprios por investigação/campanha; reservar antes da chamada, conciliar consumo e impedir novas compras ao atingir o orçamento. Chamada em andamento pode superar a estimativa. Orçamento do Agent não reduz o orçamento de buscas sem IA. Nenhuma fonte/modelo é ativado nem chamada paga de desenvolvimento autorizada por essa política. Conciliar `usage.cost.total_cost` com detalhamento sem somar total às parcelas novamente; incerteza não vira zero. Fontes em blocos `search_results` resolvem marcadores `[web:1]` mesmo com `annotations` vazias; fonte ausente/ambígua não é adivinhada por posição. Cada afirmação ainda precisa de trecho e identidade compatíveis. [Exemplos do Agent](https://docs.perplexity.ai/docs/agent-api/quickstart).

## Contratos compartilhados

Definir incrementalmente em `contracts/radar/v1/radar-research.schema.json`, com fixtures TS/Python. A0 não depende desse gerador. A1 inclui somente evidências, recibos e estado comercial; B2 acrescenta contexto/resultado de decisão; C4 acrescenta ação de pesquisa:

- `DecisionContextV1`: organização, campanha, candidato ou escopo de descoberta, revisão de critérios, versão da política/rota, estágio, fatos, evidências relevantes e opções permitidas. Sem credenciais.
- `DecisionResultV1`: versão, decisão, distribuição das opções, confiança quando fornecida, IDs selecionados de evidência e motivo enumerado. Motivos sem suporte são `insufficient_evidence`. Não inventar explicação discursiva para uma decisão não generativa.
- `ResearchActionV1`: `registry_search`, `web_search`, `local_search`, `read_url`, `extract_businesses`, `match_registry`, `deep_research`, `resolve_identity`, `qualify`, `finish`, `review`. Parâmetros restritos; só executar ações disponibilizadas pelo servidor no contexto atual.
- `ResearchEvidenceV1`: URL, tipo de fonte, conteúdo/trecho, data de observação, origem de coleta, escopo empresa/grupo/estabelecimento, estado da leitura e direitos de uso. Separar snippet de leitura pública direta.
- `EffectReceiptV1`: identidade da operação, tentativa, ação, hash de entrada, provedor/modelo efetivos, resultado do transporte, resultado da validação, referência de resposta, consumo, custo conhecido/estimado/incerto, motivo seguro e tempos.
- `CommercialResearchStatusV1`: etapa comercial, estado, achados, lacunas, motivos comerciais, possibilidade de atualização e sugestão de conferência. Não contém o contexto técnico.

Textos externos são dados, nunca instruções. Nenhum retorno pode autorizar rede privada, mensagens, login, envio de formulário, uso de fonte desativada ou alteração de limite. Descartes dependem de critérios observáveis; probabilidades não equivalem a certeza factual.

## Fluxo e quantidade desejada

1. Descobrir candidatos por plano configurável de termos e regiões, com uma ou mais fontes selecionadas no Admin. Web e cadastro são entradas independentes, não uma obrigação de começar pelo cadastro.
2. Deduplicar por identidade apropriada; telefone/e-mail compartilhado é sinal de possível grupo, não motivo suficiente para eliminar CNPJs diferentes.
3. Triar como compatível, investigar ou fora do perfil. Sem evidência suficiente, investigar. Um CNAE secundário isolado não comprova aderência nem justifica rejeição absoluta.
4. Confirmar identidade; distinguir domínio do grupo de estabelecimento específico e diretórios/publicadores. Contatos do publicador nunca são contatos do prospecto.
5. Aprofundar lacunas: site, atividade observável, contatos gerais e da finalidade escolhida, redes oficiais, formulário de fornecedores, perfil e sinais de porte com fonte e escopo.
6. Validar qualidade e apresentar conclusão comercial. Não afirmar telefone atendido, consentimento ou funcionamento atual somente por haver site ativo.

O modelo de decisão pode selecionar fonte, URL ou classe de investigação dentre opções fornecidas. Termos e buscas livres são produzidos por regras configuradas ou LLM de planejamento validado, não pelo modelo não generativo. Não hardcodificar combinações de cidades do caso atual.

### Resultado web para empresa e identidade fiscal

C3.1 introduz extrator generativo estruturado `radar_discovery_extraction`, roteável no Admin com fallback. Página/lista/diretório gera menções com nome, localidade, eventual CNPJ/domínio e trecho específico de cada campo. O contato/rodapé do publicador nunca é copiado para empresas citadas. Uma página com dez menções pode gerar dez candidatos a verificar; SERP ou domínio editorial não é empresa nem site oficial. Guardar resposta antes da validação e revalidar sem nova IA.

C3.2 casa menções com candidatos da conta: CNPJ completo válido com evidência; identificador externo já associado; ou domínio oficial confirmado mais nome e endereço/município compatíveis. Nome, telefone compartilhado ou domínio de grupo isolados não mesclam. CNPJs de filiais permanecem distintos; associação ambígua vai à revisão, com junção reversível e sem apagar histórico. Usar cadastro salvo primeiro. Pagar lookup apenas se existir CNPJ confiável e lacuna fiscal requerida; sem CNPJ, busca nominal estreita exige triagem promissora, lacuna/conflito relevante e orçamento aprovado. Busca ambígua não provoca varredura ilimitada. Campanha que dispensa CNPJ pode manter identidade provisória identificada como tal.

### Mapas e cobertura do OSM

Fontes elegíveis incluem OSM, Serper Places, Brave Places, Serper Web, Brave Web, CNPJá e Perplexity opcional. OSM existente (`repository.ts:740`) usa índice municipal e segmento validado; hoje `osm-segment-map.ts:3` só mapeia clínicas médicas, e o caminho é interno. C3.3 acrescenta mapeamento de tags versionado/configurável e disponibilidade por município, não um preset de cozinhas. Ausência de índice ou mapeamento é falta de cobertura da fonte, não inexistência de empresas. Custo externo zero não elimina infraestrutura nem obrigações de atribuição.

Places com licença apenas de visualização não passa à persistência por entrar no planner; verificar direito de armazenamento/entrega por fonte/plano. Material com atribuição incompatível com a apresentação comercial fica restrito até solução autorizada, sem violar licença para esconder ferramenta.

Novos lotes v2 têm meta de empresas novas aderentes; descartados e duplicados não preenchem a meta. Continuar descoberta, dentro do orçamento autorizado, até a meta ou uma condição explícita de parada. Exibir também investigadas, descartadas, prontas, incompletas e aguardando atenção; não ocultar insuficiência para aparentar sucesso. Evitar coleta infinita quando o perfil é raro.

Lotes v1 existentes mantêm sua quantidade e pertencimento. Retomar as 20 empresas não compra substitutas por conta própria. Pode recuperar/reavaliar os mesmos registros, mas novo lote v2 e preenchimento adicional exigem pedido distinto. `pipelineVersion` e `countingMode` ficam congelados por lote; não reinterpretar histórico.

Cada fonte tem seu mecanismo de continuação. Search sem cursor não ganha um cursor fictício: persistir plano de consultas, resultados, deduplicações e cobertura. Uma consulta estadual não prova cobertura de todas as cidades nem esgotamento do estado. Regiões/cidades podem ser planejadas incrementalmente a partir de catálogo territorial verificável, sem limite oculto de interface impedir campanha estadual ou multiestadual.

## Retomada e atualização

- `novo lote`: avaliar todas as etapas aplicáveis, com descoberta e critérios congelados; não apenas admitir N candidatos e encerrar.
- `retomar`: reavaliar o estado de cada empresa, recuperar respostas/checkpoints válidos, executar só pendências autorizadas e reconciliar o lote.
- `atualizar dados`: criar intenção nova de atualização, pesquisar lacunas ou informações antigas e comparar antes/depois. Nunca responder só `reused=true`; se nada mudou, explicar quais verificações terminaram sem novidade.
- `reanalisar`: reprocessar evidência/resposta salva sem nova busca; não confundir com atualização pública.

Hash de conteúdo exclui horário de observação, ordem incidental e IDs de tentativa. Inclui conteúdo relevante, identidade, escopo e versão do critério correspondente. Mudança em orçamento ou apresentação não reinicia cursor nem invalida identidade. Mudança material invalida apenas dependências afetadas. Identificar resposta antiga por sua versão; nunca remover fatos ainda válidos só porque nova etapa não terminou.

Critérios, política operacional, rota e coleta têm versões independentes. Mudança de rota aplica-se à próxima tentativa ainda não reservada; uma tentativa em andamento usa o snapshot autorizado. Não misturar modelos ou critérios dentro de recibo com o mesmo identificador.

Salvar resposta e metadados seguros antes da validação; JSON cortado e afirmação rejeitada são resultados recebidos com erro de validação, não automaticamente cobrança desconhecida. Revalidar resposta salva sem recomprar. Recebido, validado, publicado e cobrado são estados separados.

Os cinco recibos antigos podem continuar sem corpo recuperável. Ferramenta administrativa de conciliação apresenta o que existe e permite autorizar nova tentativa em conjunto sem apagar o recibo anterior. Nunca prometer recuperação de texto que não foi armazenado.

Todas as operações, individuais ou em lote, compartilham outbox durável, leases, reserva e projeção. Duplo clique e entrega repetida geram no máximo uma execução do mesmo efeito. Uma pesquisa individual atualiza todos os resumos de lote aos quais pertence.

A6 amplia o reconciliador existente (`capture-dispatch.ts:99`, manutenção em `jobs/registry.ts:190`) com vigia de ausência de avanço real. Admin edita `stalledAfterMinutes`, inicial 10. Polling não conta como avanço; distinguir job perdido, lease válido, espera por autorização/capacidade e recibo incerto. Alerta técnico aparece só no Admin, não reexecuta chamada paga nem substitui reparo da causa. Não criar daemon novo quando já existe manutenção durável.

## Limites e controle de custo

Admin edita limites comerciais de requisições por lote, fonte/dia, leituras, decisões, pesquisas profundas e orçamento monetário. Orçamentos por atualização são incrementais: não zerar consumo passado para liberar tentativa nova. Exibir no Admin os limites efetivos, origem, uso e atualização necessária ao lote.

A0 separa consumo por fonte e mantém agregado somente quando explicitamente configurado. Cinco consultas Serper não esgotam Brave sem uso; políticas monetária/diária continuam valendo. Leituras e revalidação salva não consomem cota de busca. Não usar o câmbio fixo 1 de outra área nem mudar finanças do Action Engine para introduzir BRL no Radar.

Separar requisições cobradas, consultas dentro de uma requisição, páginas lidas, tokens e custo. Fonte indisponível não bloqueia trabalho útil com evidência salva. Simular o custo máximo razoável da cadeia de fallback antes de aprovar a operação e reconciliar consumo real depois.

Limite diário deve gerar espera durável e mensagem comercial, não encerramento definitivo ou botão sem ação. Aumentar limite no Admin permite retomar o mesmo pedido sem reiniciar descoberta. Proteções de transporte e fronteiras de armazenamento não são limites comerciais a remover.

## Qualidade e experiência

A tela comercial mantém quantidade e uma ação contextual. Detalhes resumidos abrem na linha; detalhes completos têm navegação explícita. Feedback imediato indica pedido recebido, etapa, atualização e resultado. Não mostrar 100% por descobrir todas as empresas quando o aprofundamento não terminou.

Mostrar site encontrado separado de identidade confirmada, origem cadastral separada de contato público e ausência de resultado separada de etapa não executada. Fora do perfil, insuficiente, concluído e falha operacional são estados diferentes. Oferecer a lista de excluídos para recuperação, com linguagem comercial.

A IA de qualidade decide suficiência de evidência e próximo passo, mas os requisitos mínimos da campanha continuam verificados por código. Nenhum modelo pode aprovar sozinho envio de mensagem ou entrega de dado sem licença. Não classificar prospecto como aprovado para contato apenas por terminar pesquisa.

## Avaliação e liberação

E0 começa **antes de B**: coletar 100 rótulos humanos (30 aderentes, 30 fora do perfil, 40 ambíguos), setores/UFs diversos, 60 ajuste e 40 validação estratificada, sem grupo em ambas as partições. Rótulos podem ser preparados enquanto A0 é implementada; isso não autoriza delegação nem chamadas pagas. Antes de B de produção, comparar `radar_business_qualification` com opções fixas, Jev e Luna Decisions sobre o mesmo contexto. Baseline chat sem probabilidades não ganha probabilidade fictícia. Adaptador mínimo de avaliação é promovido por B2, não reescrito depois.

Gate: se qualidade/abstenção empatarem e não houver redução de pelo menos 20% no custo total de triagem ou latência p95 sem piorar a outra, manter baseline e postergar B completa. O 20% é critério de produto proposto; melhora consistente em erros relevantes pode justificar B por decisão registrada. Sem medição real, gate é inconclusivo, nunca aprovado por fixture.

Gates da validação: zero contato de terceiro publicado, zero descarte automático de positivo confirmado, zero vazamento técnico e zero replay incerto. Medir precisão, falsos descartes, abstenção, site/contato útil, completude e latência p50/p95. **Descoberta também é benchmark:** na mesma região, medir identidades únicas, aderentes novos após deduplicação, contribuição exclusiva/interseção por fonte e custo BRL por aderente novo/pronto, incluindo buscas, extração, decisões, cadastro e aprofundamento. Separar custo incerto de zero. Cobertura OSM/Places/web é medida, não presumida. C5 repete protocolo definido em E0, não o cria no final. Amostra pequena não garante taxa zero no mercado.

Começar em observação, sem descarte automático. Encaminhamento/exclusão só com limiar calibrado e aprovado para modelo/snapshot/tarefa/contexto efetivos; troca retorna a observação. Benchmark em português e empresas brasileiras, sem assumir que desempenho publicado ou confiança declarada se transfere à campanha. [Modelos TypeSafe](https://docs.typesafe.ai/models).

Piloto real: primeiro recuperar uma empresa e depois o lote existente, sem redescoberta; novo lote v2 separado. Comparação Perplexity deve usar orçamento explícito e idênticos critérios de qualidade. Substituir estratégias só quando o ganho medido justificar; não atribuir automaticamente melhoria a um fornecedor.

Rollback desativa capacidades novas para pedidos futuros, preserva recibos e drena tentativas iniciadas. Não executar engine antiga sobre um lote v2 parcialmente pago. Migrações são aditivas; nenhuma ativação paga por migração ou variável padrão.
