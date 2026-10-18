# Radar: pesquisa configurável por campanha

O Radar não impõe setor, CNAE, produto ou região. Cozinhas industriais são um caso configurável, não um modo fixo do executor. O módulo pode ser contratado por cliente; pesquisas pagas são iniciadas pelo Admin YUX, com contato manual e entrega por CSV ou encaminhamento revisado ao CRM. As seções datadas abaixo registram a evolução e suas limitações na data da verificação.

## Qualidade e entrega — 15/10/2026

### Operação direta e visão comercial

Em **Pesquisa da campanha**, o Admin YUX informa **Novas empresas neste lote** diretamente na página (1–1.000, padrão 10) e usa **Pesquisar novas empresas**. Não há modal ou necessidade de editar a campanha. Durante o lote, a quantidade original fica travada; se houver pendência, a mesma ação se torna **Retomar pesquisa**. Uma resposta de início perdida conserva a quantidade e o identificador para tentar novamente sem duplicar. Depois do encerramento, o campo volta ao padrão para o próximo lote; as contagens do lote anterior continuam visíveis.

Duplicação fica em **Ações da campanha**. Descoberta isolada, atualização de disponibilidade, fontes e avanço manual por região permanecem numa única área fechada **Operação técnica — Admin YUX**, depois dos resultados. Não foi criado outro motor de pesquisa nem ampliada qualquer autorização paga.

Somente o papel global `yux_admin` recebe informações internas. Admin da conta, membro e operador YUX recebem DTOs comerciais explícitos: empresa/CNPJ, localização, site, contatos, perfil, porte, atividade, avaliação, evidências e histórico legível. Não recebem ferramentas, modelos, custos, licenças, parâmetros internos ou erros de infraestrutura, nem solicitam catálogo/disponibilidade/runs técnicos. A separação vale no servidor, não somente na tela; retornos de mutações, novas entregas CRM e exportações também são filtrados. O histórico original e leads já entregues permanecem intactos. Material cuja atribuição obrigatória seria incompatível com essa apresentação permanece restrito ao Admin até solução autorizada.

No portal, **Ver detalhes** expande o resumo junto à empresa; **Ver detalhes completos** abre e leva o foco à seção completa. **Critérios da campanha** mostra público/oferta/regiões, não a configuração técnica. Revisão, conferência e CRM continuam condicionados às permissões existentes. Nenhum contato é enviado automaticamente. A regra permanente de audiência consta em `AGENTS.md`.

Os títulos e procedimentos nas seções históricas abaixo descrevem versões anteriores; a operação vigente é a desta seção. Publicação de código não significa deploy.

Verificação desta reorganização: 1.074 testes backend, 699 frontend, 299 runtime (1 skip preexistente) e 42 testes PostgreSQL Radar aprovados; builds e orçamento de bundle aprovados. Lint comparativo permanece em 562 erros/27 avisos contra baseline 560/27, dívida já reproduzida na base; baseline não alterado. Chrome local, desktop e 430×920: campo inline/validação, sete novas empresas, reload, duas retomadas, resultado parcial honesto; cliente abriu lista, resumo, detalhes completos com foco automático, critérios e histórico sem ferramentas/custos, mantendo CNPJ/contato/perfil/porte. Sem chamadas externas pagas. Fila e provedores simulados: não é piloto de qualidade real nem validação de BullMQ/Redis de produção. Console apresentou avisos de migração do roteador e mensagens de listener da extensão no primeiro percurso; a reconferência final do cliente não registrou erros.

Revisão independente final encontrou quatro pontos importantes, corrigidos numa passagem com regressões RED→GREEN e suítes completas: atribuição CRM com schema explícito para todos os campos (inclusive escalares legados malformados/URLs sensíveis), dados comerciais legítimos coincidentes com nome de ferramenta preservados em contatos/perfil/evidências/CSV, acompanhamento automático de oportunidades em análise sem depender de captação ativa e restauração de **Importar/Descartar** para candidatos/permissões existentes. **Analisar após importar** continua opcional e desligado por padrão; importação não regional, estados e autorizações do servidor permanecem. O teste PostgreSQL inspeciona o registro realmente persistido no CRM. Nenhum achado menor adiado e nenhuma segunda revisão solicitada.

Decisões e limites desta execução, em ordem: ampliar os DTOs explícitos com destinos CRM/progresso comercial (custo: duas projeções a manter); restringir fatos OSM cuja atribuição seria incompatível com a apresentação confidencial (custo: cliente não vê esses fatos até solução autorizada); reutilizar Label/Input/formulário nativos YUX (custo: manutenção local do layout); manter composição comercial tipada separada da administrativa (custo: sincronizar novos campos comerciais em duas apresentações); limitar testes de provedores/fila a simulações autorizadas (custo: comportamento pago/produção ainda exige validação após deploy); não reescrever CRM anteriormente entregue (custo: registros antigos podem conservar metadados anteriores); preservar dívida de lint fora do escopo (custo: essas pendências permanecem).

### Nova captação com pesquisa completa

Na página de resultados, **Buscar e pesquisar empresas** permite escolher de 1 a 1.000 novas empresas únicas (padrão 10). A quantidade é deste lote; não altera a campanha e não garante empresas qualificadas/aprovadas. Duplicatas da campanha, empresas e leads existentes não consomem o alvo. Excedentes de uma página são guardados para o próximo lote antes de novas consultas.

A confirmação mostra as etapas salvas, teto estimado de descoberta CNPJá e de aprofundamento separadamente. IA usa exclusivamente rotas já autorizadas e créditos próprios, fora desses valores. Nenhuma opção, fonte, licença, modelo, quota ou orçamento é ampliado pelo clique. Aprofundamento desativado ou fonte/modelo indisponível impede iniciar o percurso completo. Os limites de consultas/páginas podem encerrar a descoberta antes da quantidade solicitada.

O lote é persistido com sua revisão, itens e pendências. A fila do servidor passa somente as novas empresas admitidas ao pipeline individual; não seleciona as empresas antigas da lista. O acompanhamento distingue solicitadas, encontradas, em pesquisa, concluídas, dados insuficientes e bloqueadas. “Encontrada” não significa “pesquisada”. Fechar/recarregar a página não coordena nem interrompe os jobs; ao voltar, o último lote é recuperado sem nova pesquisa.

**Retomar pesquisa deste lote** conserva quantidade, itens, runs e recibos. Corrija a pendência indicada antes de retomar. Certificado vencido continua exigindo autorização própria nos detalhes. Uma resposta paga incerta nunca é repetida automaticamente: exige conferência. Mudança de configuração pausa a operação antiga; inicie uma operação na nova revisão somente após conferir o histórico. Aprovação, exportação, entrega ao CRM e contato continuam separados e humanos. Pesquisas pagas continuam restritas ao Admin YUX.

**Opções avançadas do Admin** preserva descoberta sem aprofundamento e verificação do próximo lote existente; não são a ação principal. A paginação manual por região continua disponível. Durante uma operação ativa na mesma revisão, a interface impede iniciar um lote concorrente e o servidor retorna a operação existente sem trocar sua quantidade.

Implantação requer backend, worker, frontend e migrações aditivas **0190/0191/0192**. O worker agenda reconciliação a cada 20 segundos, restrita a metadados de operações já autorizadas; antes de cada novo efeito pago o job verifica revisão, Admin, módulo e disponibilidade. Recuperar fatos/contadores de pesquisas terminadas não exige mais quota de busca. Cada pedido aceito fica associado à operação original, inclusive quando reutiliza um lote ativo; repetir a requisição depois do término não cria outro lote. Workers expirados retomam o mesmo run/recibos, e jobs tardios não reexecutam runs terminais sem retomada explícita.

Verificação local desta entrega: testes backend/frontend/runtime, builds/bundle e cinco arquivos PostgreSQL Radar com provedores simulados. Jornada Chrome desktop e 430×920: quantidade inválida bloqueada, sete empresas admitidas automaticamente, reload preservando o lote, bloqueio simulado e retomada sem nova descoberta, resultado parcial verdadeiro e atualização sem desmontar o cartão. Nenhuma chamada paga ou alteração de produção. Lint global mantém a dívida anterior (562 erros/27 avisos, baseline 560/27), sem novas ocorrências neste fluxo. Integrações externas aos cinco arquivos Radar e execução BullMQ/Redis real não são comprovadas pelo simulador local.

Para repetir: `backend/tests/journeys/start-radar-capture-server.ts` aceita apenas o banco local dedicado `127.0.0.1:55439/yux_radar_research_test`, inicia API em 4182 e imprime a campanha. Vite em 4174 usa `VITE_API_BASE_URL=http://127.0.0.1:4182/api` e `VITE_API_URL=http://127.0.0.1:4182`. Ele usa banco/API/pipeline reais, fila e provedores simulados e bloqueia as demais mutações; não usar esse servidor em produção. O primeiro child simula dois bloqueios sucessivos (crédito insuficiente e provedor indisponível) para testar duas retomadas, mesmo sem IA ligada no fixture. Após as correções finais, a jornada foi repetida no Chrome com uma empresa: duas pausas e duas retomadas na mesma tela, terminando parcial com um item pesquisado, dados insuficientes e zero bloqueadas; sem erro de aplicação no console (apenas avisos preexistentes do React Router). Evidências visuais locais foram salvas fora do repositório.

Revisão final independente: sete achados importantes corrigidos em uma passagem com regressões que falharam antes da correção; nenhum achado menor adiado. A passagem também protegeu contra job retido na fila e duplicata tardia de job terminal. A fixture TLS passou a representar explicitamente a retomada antes da execução; conceder exceção de certificado continua sem iniciar pesquisa. Verificação final: **1.049 backend, 678 frontend, 299 runtime aprovados (1 skip preexistente) e 31 casos PostgreSQL Radar**; builds/bundle aprovados. Não houve segunda revisão: a passagem foi verificada por testes e QA local. Publicar main não comprova implantação em produção.

Decisões desta execução: operações bloqueadas continuam ativas na revisão até retomada/configuração nova (pode exigir resolver pendências antes de outro lote); tetos existentes podem produzir quantidade parcial (não ampliamos custo); migração 0191 restringe worker e 0192 guarda identidade dos pedidos (as três migrações devem acompanhar o código); componentes existentes YUX foram reutilizados em vez de introduzir Field/Alert novos (markup local continua sendo mantido); integração real ficou nos cinco arquivos Radar, fila/provedores simulados (BullMQ real e outros módulos seguem sem QA end-to-end local); revisão/publicação foram gates finais após a implementação das três tarefas (nada foi publicado antes da revisão); o executor só aceita runs na fila/em execução, de modo que chamadores internos de retomada precisam passar pelo serviço existente de início/retomada. Nenhuma autorização/credencial/rota/limite de produção foi alterada.

- Documentos de governo, notícias e cadastros de terceiros são referências externas, não sites oficiais. A projeção de dados antigos aplica essa separação sem apagar a história nem alterar leads já entregues. Um domínio candidato ainda exige comprovação de identidade; busca limitada não comprova ausência de site.
- Em **Editar configuração**, escolha quando complementar com busca local: antes da web (compatibilidade), depois somente se necessário ou nunca. A primeira consulta usa o nome simples; marca, razão social e CNPJ são alternativas delimitadas. Se uma fonte só retorna referências inúteis, o fallback autorizado pode ser utilizado dentro do mesmo teto de consultas.
- Em **Quando a pesquisa está suficiente**, configure identidade, segmento, site opcional, tipos/finalidades e mínimo de canais úteis. Fica desligado nas campanhas antigas até edição explícita. Suficiência indica prontidão para revisão, não aprovação. CRM mantém revisão humana, versão, permissões e direitos de entrega, além dos critérios ativos.
- Identidade, contatabilidade, aderência e potencial por porte são dimensões independentes. Não estimado não significa pequeno ou zero. Contatos repetidos são consolidados com todas as fontes; vagas, privacidade e canais não associados não satisfazem compras. Telefone cadastral não vira WhatsApp confirmado.
- Em **Próxima ação**, filtre prontas para revisão, falta de contato, identidade ou qualificação pendente, aguardando liberação e fora do perfil. A **Conferência da equipe** registra retorno de verificação/contato manual com autor, data e revisão; não modifica fatos, aprovações ou CRM automaticamente.
- **Resultados e consumo da pesquisa** apresenta empresas únicas, identidades, canais úteis e prontidão. Busca é estimada em BRL, IA usa apenas custo reportado em USD, com ausência explicitamente desconhecida. Não há conversão de moeda implícita. O período usa UTC e o subtotal não equivale à fatura final do provedor.
- Retomar lê evidências ainda pendentes sem repetir chamadas concluídas. As migrações aditivas `0188_radar_analysis_receipts.sql` e `0189_radar_research_feedback.sql` acrescentam recibos de IA e feedback auditável com isolamento por organização. Resultado concluído com recibo pode ser recuperado após perda de resposta. Chamadas antigas sem prova persistente permanecem incertas; não se promete recuperar seis respostas históricas nem repetir cobranças automaticamente.

### Verificação local desta entrega

Provedores simulados: 20 casos reduzidos de referência passaram, sem falsos sites oficiais nos casos negativos incluídos. Isso não garante ausência universal de falsos positivos nem mede a qualidade de um novo lote real. PostgreSQL 17 isolado: 86 migrações aplicadas e 24 testes Radar passaram, incluindo concorrência, RLS e entrega sem mensagens/eventos automáticos. Resultado final: **1.029 testes backend, 667 frontend e 299 runtime aprovados; 1 teste runtime preexistente ignorado**. Builds e orçamento de bundle passaram. Lint comparativo permanece reprovado em 562 erros/27 avisos contra baseline 560/27; as cinco ocorrências apontadas acima do baseline foram reproduzidas no commit-base, não foram introduzidas por esta entrega. Baseline não alterado.

Chrome local autenticado, API real e banco isolado: referência governamental separada, resumo inline, duas fontes consolidadas, feedback persistido, entrega de empresa previamente aprovada ao CRM fictício e alteração dos critérios gerando revisão 2. Foco dos detalhes e largura do resumo verificados em desktop e celular de 430 px (350 px de conteúdo dentro da tela). Nenhum provedor pago foi chamado. Houve um erro de configuração da URL da API no primeiro início local, corrigido antes da jornada; também apareceram avisos preexistentes do React Router e mensagens de canal assíncrono do navegador, sem pilha da aplicação (origem não determinada nesta tarefa). Na URL da campanha da verificação final não foram registrados novos erros. Um contato duplicado no dossiê histórico foi reproduzido e corrigido por teste RED→GREEN.

Uma revisão independente encontrou sete problemas importantes e um inicialmente menor, reclassificado como importante por poder interromper a leitura inteira de um registro histórico. Os oito foram corrigidos em uma passagem com regressões RED→GREEN: contexto de titularidade em páginas desconhecidas; contatos de domínio alheio no CRM; novos hits ignorados na retomada; recuperação de rejeição pré-provedor comprovada; homepage governamental com navegação comum; conclusões derivadas de vínculo invalidado; custo de rejeições pré-provedor; dados de contato/fontes malformados. Além da classificação de fontes, a associação direta exige sinal de autoria independente da citação do CNPJ (domínio da marca, apresentação própria ou rodapé identificador); aliases sem suporte seguem para a rota de IA já habilitada ou revisão, sem escolher modelo novo. A nova entrega ao CRM reaplica a projeção do dossiê atual, preservando aprovação manual e leads antigos, mas não promovendo canais incertos.

### Decisões e limitações registradas

1. Atualizar apenas inventário das migrações no manifesto, preservando bloqueios/gates. Se o inventário estiver errado, o deploy pode ser bloqueado; nenhuma liberação foi simulada.
2. Acrescentar a fila **Qualificação pendente**, para não chamar de pronta uma empresa cujo segmento obrigatório ainda não foi confirmado. Impacto: uma opção adicional de filtro, sem aprovações novas.
3. Limitar a integração real aos quatro arquivos Radar. O conjunto de integração entre outros módulos exige Redis/stack separado e não aceita o banco dedicado usado aqui. Risco residual: fluxos externos ao Radar não foram retestados de ponta a ponta nesta etapa.
4. Não executar piloto pago, avaliar cobertura real nem conciliar faturas. Risco residual: qualidade/custo específicos dos provedores dependem de piloto autorizado.
5. Não declarar resolvidas as seis análises históricas incertas. Risco residual: conciliação manual de cobranças/respostas pode ser necessária.
6. Não declarar deploy/migrações de produção verificados. Risco residual: a implantação precisa de verificação operacional própria.
7. Manter a verificação administrativa de limites de créditos como tarefa independente, conforme escopo. Risco residual: essa edição não foi comprovada por esta entrega.
8. Preservar fallback global existente, sem redesenhar roteamento. Risco residual: comportamentos preexistentes de fallback não foram avaliados nesta revisão.
9. Aceitar o ajuste de reinício do servidor de QA sem segunda revisão independente, após reproduzir erro de unicidade e verificar reinício local corrigido. Risco residual restrito ao teste: falha ao repetir ou acúmulo de campanhas sintéticas, sem efeito em produção.

Nenhuma observação menor nova da revisão ficou adiada. Não houve segunda revisão dos ajustes; a verificação da passagem de correções foi feita com testes e navegador local.

Para repetir a QA: inicie `backend/tests/journeys/start-radar-quality-server.ts` com `YUX_RADAR_TEST_DATABASE_URL` apontando exclusivamente para `127.0.0.1:55439/yux_radar_research_test`. O script exige esse destino, cria dados sintéticos, escuta em 4182 e recusa pesquisa paga/fila. Inicie Vite em 4174 com `VITE_API_BASE_URL=http://127.0.0.1:4182/api` e `VITE_API_URL=http://127.0.0.1:4182`. Use a URL de campanha impressa e o usuário fixture `yux-admin@integration.test` / `integration-password`. A jornada opt-in `radar-quality-review.pw.ts` registra o percurso repetível; nesta sessão a interação foi executada pelo navegador conectado, não pelo runner Playwright.

Publicação do código não equivale a deploy. Atualize backend, frontend e runtime para usar os recibos. Nenhuma credencial, licença, limite, rota de modelo ou exceção TLS de produção foi alterada nesta entrega, e não houve novo piloto pago.

## Configurar pelo painel

1. Como Admin, em Radar, o tipo **Pesquisa configurável — estados ou cidades** abre por padrão. Informe nome, segmento/público, oferta e produtos/serviços opcionais. O segmento é uma descrição: não vira silenciosamente um filtro. Defina nomes e CNAEs explicitamente. **Criação rápida local — uma cidade** preserva as campanhas locais e de empresas recém-abertas, com cidade obrigatória somente nesse modo.
2. Em **Abrangência geográfica**, escolha **Estados inteiros — um ou mais** e selecione as UFs entre as 27 disponíveis; nenhuma cidade é exigida. Para restringir por município, escolha **Cidades específicas — uma ou mais** e informe uma `Cidade/UF` por linha; nesse caso só essas cidades são consultadas, cada uma com paginação independente. Sua UF deve estar selecionada. Um lote não cobre automaticamente toda a UF: continue a paginação até a conclusão, respeitando os limites.
3. Configure nomes e exclusões, CNAEs opcionais principal ou principal/secundário, situação cadastral e período de abertura. Vírgulas separam alternativas nos nomes; palavras dentro de uma alternativa são enviadas juntas à CNPJá. Nenhum CNAE específico é injetado se o campo estiver vazio.
4. Habilite ou desabilite o aprofundamento Brave licenciado e a inspeção do site público. A descoberta persistente atual usa CNPJá; Serper/Brave transitórios continuam separados e não alimentam a lista persistente. Na consulta Brave, `{name}` é obrigatório; `{segment}` e `{terms}` são opcionais. Cidade/UF vão em campos separados. Chaves e direitos de retenção continuam em Admin → Integrações.
5. Defina expressões de qualificação: pelo menos uma, todas as obrigatórias, exclusões, CNAE obrigatório e tratamento de site não verificado. As regras são literais, ignoram acentos e exigem identidade do site comprovada por nome/razão social ou CNPJ observado. Não são uma análise semântica por LLM. Sem critérios positivos, a empresa fica para revisão humana.
6. Defina os termos de aderência à oferta separadamente da confirmação do público. Termos encontrados sinalizam aderência possível, não comprovam compra, orçamento, volume ou responsável.
7. Configure estabelecimentos por página CNPJá (1–10), páginas por região por lote (1–10), consultas totais por lote (1–100), empresas por lote de verificação (1–25), limite diário e orçamento. Limites das fontes/provedor continuam obrigatórios.
8. Selecione campos da lista de entrega. Isso controla as colunas do CSV; não inventa informação ausente. Identidade, localização, contatos públicos, site, Instagram, avaliações e proveniência são exportados quando disponíveis. Com o novo aprofundamento habilitado, a leitura inclui páginas públicas de contato, sobre/empresa e serviços, dentro do limite configurado. Não há navegação autenticada em redes sociais nem garantia de nomes de responsáveis.
9. **Criar pesquisa** e **Salvar configuração** apenas salvam os critérios. Não executam consultas nem iniciam contatos.

Abra uma campanha e use **Editar configuração** para modificar os valores. **Duplicar pesquisa** cria uma campanha independente, com configurações editáveis, sem copiar empresas, cursores, evidências ou aprovações.

## Execução e entrega

Em **Admin → Integrações**, as permissões são confirmadas pelos checkboxes: na CNPJá, **Confirmo permissão de entrega a cliente**; na Brave, **Confirmo licença de armazenamento dos resultados** e, para entrega, **O contrato também permite entregar a lista ao cliente**. Marque as permissões correspondentes e clique em **Salvar provedor**. Não é necessário informar referência de contrato ou reenviar uma API key já cadastrada. A confirmação é uma declaração do administrador sobre os direitos da credencial/plano, não uma verificação independente desses direitos. Desmarcar e salvar revoga a permissão. Ativação de fontes, custos e limites continuam controles separados.

Na mesma página, o painel **Fontes do Radar Comercial** centraliza ativação/desativação, custo estimado por consulta em R$ e limite diário por organização de CNPJá (pesquisa e consulta), Brave, Serper e OSM. Não é necessário abrir uma campanha ou o workspace interno. Fontes globais valem para as organizações com Radar liberado; registros específicos mostram o cliente e prevalecem sobre o global. Confirmar licença não ativa uma fonte. Brave/Serper precisam de custo definido antes de ativar; configure o valor do plano real, sem presumir gratuidade. **Salvar custo e limites** e **Ativar fonte** não executam consultas nem substituem chaves.

No workspace, os cartões mostram o estado e a pendência real (desativação ou custo). Para o Admin há o link **Configurar fontes no Admin**; **Atualizar estado das fontes** relê somente o catálogo, sem buscar empresas ou consumir créditos do provedor. Os controles duplicados do workspace interno foram removidos. Jina e fontes futuras não são ativadas pelo novo painel. A contratação do Radar e os direitos de retenção/entrega continuam obrigatórios para os usos correspondentes.

- **Buscar próxima página — região** retoma uma UF/município. **Buscar lote nas regiões configuradas** percorre regiões em rodízio, respeitando limites, orçamento e quotas. Regiões concluídas não ocupam o teto de consultas. Não há três UFs ou três páginas fixas.
- **Verificar lote configurado** aplica o número salvo na campanha. Brave só é consultada se habilitada, com licença/chave/fonte válidas e candidato sem site. O painel pede confirmação do consumo potencial antes de executar.
- Revise motivos, URLs, contatos e identidade. A inspeção respeita `robots.txt`, limites de rede/tempo/tamanho e bloqueia rede privada/redirecionamento externo. Site omitido, bloqueado ou inacessível não prova ausência de site.
- Correspondências Brave ambíguas exigem associação humana. Se não houver evidência suficiente, Admin pode confirmar manualmente com fonte pública e justificativa documentada. Campos não comprovados ficam vazios/desconhecidos.
- **Exportar lista verificada** inclui apenas aprovados da configuração atual e colunas selecionadas, respeitando direitos de entrega CNPJá/Brave. Distribuição/importação no CRM e contatos são manuais; não há sincronização nativa desta lista regional com funis CRM.

## Versões, histórico e deploy

Filtros, localidades, oferta, fontes e regras possuem versão. Alterá-los inicia nova paginação e invalida aprovações antigas. Empresas/evidências permanecem preservadas no banco. No modo antigo, registros da versão anterior ficam no histórico até nova descoberta. Com aprofundamento automático habilitado, candidatos existentes permanecem visíveis e podem ser pesquisados na revisão atual **sem refazer a descoberta CNPJá**. Apenas resultados reavaliados na revisão atual podem seguir para aprovação/entrega; aprovados não são reescritos silenciosamente. Jobs de revisão antiga são recusados. Para manter finalidades diferentes em paralelo, duplique a pesquisa.

Alterar apenas nome, orçamento, limite diário, lotes ou colunas de entrega não muda os critérios nem invalida aprovações.

O deploy inclui `0183_radar_candidate_research.sql`: cria histórico de pesquisas por candidato com isolamento por organização e a fonte **Brave Web Search — aprofundamento**, inicialmente desativada, custo zero e limite 10. Não altera credenciais, não ativa fontes e não executa pesquisas. Migrações anteriores já aplicadas permanecem intactas. Campanhas novas não possuem preset setorial/geográfico.

## Aprofundamento automático: configurar e usar

1. Em **Admin → Integrações → Brave**, reutilize a chave já cadastrada. Confirme retenção e, para busca web complementar, o checkbox específico de escopo de **busca web com retenção**. Não é exigida referência contratual. Confirme apenas direitos realmente disponíveis no plano. Salvar não consome consultas.
2. Em **Fontes do Radar Comercial**, configure custo real aprovado em R$ e limite da fonte web e/ou local escolhida; ative somente as fontes autorizadas. A confirmação de licença sozinha não ativa fontes. Fonte específica da organização prevalece sobre a global. Nenhuma ativação ou alteração de limites foi feita na implementação.
3. Na campanha, **Editar configuração → Aprofundamento automático**: habilite pesquisa, selecione busca local e/ou web, mantenha inspeção de site público se desejar leitura multipágina. Ajuste teto total de consultas por empresa (1–5, compartilhado entre os endpoints), páginas (1–10) e validade (1–30 dias). A configuração é genérica e não impõe segmento, cidade ou produto.
4. Opcionalmente, em **Admin → LLMs**, configure **Radar — qualificação de empresas pela oferta**, com modelo, provedor e fallbacks autorizados. Só depois habilite a qualificação semântica na campanha. Sem rota própria ativa, nenhum modelo global/legado é chamado silenciosamente para iniciar este caso. Uma rota própria pode usar seus fallbacks e o fallback global já autorizado. Nenhuma outra rota/função foi removida. A coleta de fatos funciona sem LLM.
5. No candidato, **Pesquisar e enriquecer automaticamente** não pede URL. Mostra confirmação de teto estimado de busca e aviso de créditos de IA, quando habilitada. O lote **Pesquisar e enriquecer lote existente** enfileira trabalhos individuais. Preserva candidatos anteriores inconclusivos e não chama novamente CNPJá. O teto do lote é conservador; quotas e orçamento são conferidos antes de cada chamada.
6. **Ver resultado e disponibilidade** mostra fila/etapa, site e associação, telefone cadastral separado, telefones/e-mails públicos, WhatsApp publicado, redes e contatos profissionais encontrados, fontes/data, sinais de atividade e pendências. **Atualizar disponibilidade da pesquisa** relê controles sem executar consulta. Erros distinguem fonte/custo/chave/licença/quota/campanha. **Corrigir associação / confirmação humana** é opcional, para ambiguidades.
7. Revise o dossiê e aprove os elegíveis antes de exportar. As colunas novas de entrega incluem contatos públicos, WhatsApp publicado, redes, sinais de atividade e fontes. Os direitos CNPJá/Brave existentes continuam obrigatórios. Não há mensagem, ligação, criação de lead ou automação de contato neste fluxo.

### Identidade, resultados parciais e retomada

Nome/cidade isolados não confirmam identidade. A associação exige CNPJ exato do estabelecimento sem conflito, ou nome/localidade mais endereço/telefone corroborado. Páginas de outra filial ou com múltiplos CNPJs ficam para conferência. Contatos incertos aparecem como pendentes e não entram silenciosamente nos campos confirmados da entrega. O número do cadastro não é substituído pelo telefone publicado.

HTTP 200, CNPJ ativo e copyright não provam funcionamento. Sinais datados de operação/encerramento conservam fonte e podem resultar em inconclusão ou conflito. WhatsApp é apenas um link publicado, não conta sondada nem consentimento. Ausência em buscas limitadas não prova inexistência de site. Páginas que exigem JavaScript, login, CAPTCHA ou que bloqueiam o leitor ficam com limitação explícita. A leitura pública aplica DNS fixado em IP público, restrição de redirecionamento, robots por caminho, tempo e tamanho máximos; não usa cookies nem sessões pessoais.

Pesquisas persistem em `radar_candidate_research_runs`, fatos confirmados em `radar_b2b_evidence` e resumo versionado no candidato. Respostas de busca concluídas e etapas salvas são reaproveitadas, inclusive após reiniciar o processo. Cliques concorrentes reutilizam o mesmo run. Chamadas reservadas com resposta incerta **não são repetidas automaticamente**, para evitar cobrança duplicada: deixam pendência. Falha de qualificação mantém contatos e fatos; habilitar/liberar uma fonte permite retomar candidatos antes inconclusivos. A pesquisa concluída é reutilizada dentro da validade; expirando, uma nova execução exige confirmação e continua sujeita aos limites.

### Verificação histórica da entrega inicial de aprofundamento

Testes usam respostas simuladas, sem API/LLM pagos. A jornada com PostgreSQL 17 isolado aplicou as 80 migrações e validou persistência real com papel de worker, clique concorrente, releitura, revisão, exportação, bloqueio entre organizações e reaproveitamento sem nova chamada. O teste opt-in exige `YUX_RADAR_TEST_DATABASE_URL` em `127.0.0.1` e banco exclusivo `yux_radar_research_test`; não aponta para produção.

Suítes: 820 testes backend, 623 frontend, 275 runtime e 1 jornada PostgreSQL aprovados; 1 teste runtime já existente permaneceu ignorado. Builds/type-check e orçamento de bundle aprovados. Lint comparativo aprovado (558 erros/26 avisos existentes, baseline 560/27), sem modificar baseline e sem afirmar que o repositório está livre de avisos. Verificação: Vitest das suítes backend/frontend, pytest do runtime, `npm run build` em ambos os projetos, `npm run lint:baseline` no frontend e a jornada opt-in PostgreSQL.

Navegador: Chrome local, Vite, API interceptada, componentes reais; fallback Playwright porque o plugin de navegador não estava disponível. Fluxo verificado: fonte bloqueada → atualização de disponibilidade simulada → iniciar sem URL → resultado parcial com contatos/fonte → recarregar e consultar novamente, sem novo POST. Desktop 1440×1000 e celular 390×844, sem transbordamento horizontal.

| Checagem visual/interativa | Resultado |
| --- | --- |
| Página e rota corretas | Aprovado |
| Conteúdo visível, sem tela vazia | Aprovado |
| Sem sobreposição de erro | Aprovado |
| Interações de início, bloqueio e retomada | Aprovado com API simulada |
| Persistência após recarga | Aprovado na UI simulada e no banco real isolado |
| Console e layout desktop/mobile | Sem erros; sem corte horizontal |

Isso não comprova qualidade de uma busca real nem implantação em produção. Após deploy do usuário, falta configurar/autorizar fontes e eventual rota LLM e executar piloto pago de até **3 candidatos existentes**, com teto previamente informado e sem aumentar quotas por conta própria. Só ampliar depois de conferir identidades, contatos, cobertura, falsos vínculos e custo real.

Testes automatizados usam fornecedores simulados, sem API/LLM pagos. Eles não equivalem a deploy ou qualidade comercial comprovada. Após configurar fontes/limites, valide um lote pequeno autorizado no painel; não há promessa de cobertura total. Para impedir novas chamadas, desative a fonte. Uma chamada já iniciada pode ter sido cobrada; confira logs/créditos antes de repetir falhas.

## Teste da chave Brave

A requisição usa `search_lang=pt-br`, `ui_lang=pt-BR` e localização no formato cidade/país para o Brasil; a UF também acompanha o texto da consulta. O idioma genérico `pt` não pertence à enumeração da API e pode gerar HTTP 422. Se houver outro erro de validação, o teste informa os nomes dos parâmetros reconhecidos, sem mostrar chave, valores enviados ou mensagens arbitrárias do provedor. Testar a chave no painel consome uma consulta; os testes automatizados não consomem créditos.

## Correção de leitura e dossiê aprofundado — 12/10/2026

O leitor mantém DNS fixado, bloqueio de rede privada, robots por caminho e timeout de 8 segundos. O HTML bruto aceita até 2 MiB; robots até 256 KiB; o texto sanitizado continua limitado a 20.000 caracteres. Falhas de transporte não são tratadas como proibição do site. O limite de páginas conta leituras úteis, com no máximo duas tentativas por página configurada.

### Configuração por campanha

1. Após implantar backend, frontend e runtime, abra **Editar configuração → Aprofundamento automático**. Ative **perfil aprofundado** se desejar resumo, soluções, públicos, regiões e sinais de escala. Isso usa a rota existente **Radar — qualificação de empresas pela oferta**, configurada pelo Admin; não seleciona nem troca um modelo automaticamente.
2. Escolha a finalidade do contato: geral, fornecedores/compras, comercial/vendas, financeiro ou recrutamento. O sistema usa o contexto publicado junto ao contato, não apenas o nome do e-mail. Sem suporte, a finalidade permanece não identificada. Todos os contatos encontrados continuam no dossiê; os corroborados para a finalidade ficam prioritários.
3. Opcionalmente, ative **Porte e prioridade**. Configure métricas, pesos, validade e faixas de pontos, escolhendo priorizar maiores ou menores. Não existe preset setorial/geográfico. Sem critérios ou evidência comparável, o resultado é desconhecido, não zero. Cobertura mede o peso dos critérios comprovados, separadamente da pontuação, aderência à oferta e intenção de compra.
4. Os critérios disponíveis são funcionários, unidades, receita anual em BRL, refeições anuais, capital cadastral em BRL e anos desde a abertura. Capital não é receita; S.A. não gera pontos automaticamente. Métricas antigas, contraditórias, sem data ou relativas apenas ao grupo não pontuam o estabelecimento. Ano sem dia/mês usa o primeiro dia conservadoramente.
5. Selecione as colunas de entrega desejadas: perfil, soluções, públicos, regiões, e-mail de fornecedores, pontuação, cobertura e fontes de porte. Exportação continua restrita aos aprovados da revisão atual e aos direitos confirmados de entrega. Alterar critérios gera nova revisão; aprovados não são sobrescritos silenciosamente.

O perfil e a qualificação são produzidos na mesma etapa de IA, não em uma chamada extra escondida. O runtime solicita até 4.000 tokens de saída com perfil/porte, sempre limitado pela rota do Admin. A confirmação mostra modelo e limites; a estimativa em R$ das buscas **não inclui IA ou fallbacks**. O orçamento da rota é uma referência administrativa, não uma cotação de tokens.

### Recuperar empresas já pesquisadas

Use **Ver resultado e disponibilidade → Retomar pesquisa automática**. Leituras com erro recuperável são refeitas, mantendo buscas já concluídas. Mesmo com quota/orçamento de busca esgotados, uma execução parcial recente com descoberta salva pode retomar apenas leitura pública, com teto de novas buscas zero. Isso não contorna licença, contratação, chave, fonte desativada ou campanha pausada.

Se novas páginas mudarem as evidências de uma análise por IA já concluída, marque **Autorizo nova análise por IA se as evidências mudaram** antes de retomar. Sem essa autorização, os fatos são preservados e a análise fica pendente. Respostas pagas incertas/reservadas não são repetidas automaticamente nem liberadas por esse checkbox. Uma execução expirada pode exigir nova pesquisa e nova confirmação.

O resultado mostra presença pública acessível sem confundi-la com funcionamento atual, fontes, finalidade dos contatos e pendências acionáveis. Links para balanços/PDFs financeiros são listados como **não analisados**: não há OCR, leitura de PDF nem inferência de faturamento a partir do nome do arquivo. Consultas CNPJá antigas não são refeitas automaticamente para obter capital/natureza jurídica; campos novos são preservados quando retornados em consultas autorizadas.

### Validação desta correção

Teste público do leitor corrigido no Viva Food: homepage de 728.010 bytes lida; nome/endereço corroborados; telefone publicado e e-mail de fornecedores extraídos com a finalidade correta. Não houve chamada Brave, Serper ou LLM, envio de mensagem ou alteração de produção.

A jornada PostgreSQL foi ampliada para perfil, finalidade, porte e exportação, mas **não foi executada nesta correção**: `YUX_RADAR_TEST_DATABASE_URL` não está configurada. O teste permaneceu ignorado e só aceita `127.0.0.1/yux_radar_research_test`. A validação histórica acima não comprova esses campos novos no banco real. Implantação e piloto comercial com consumo autorizado continuam pendentes.

Verificação automatizada desta versão: **844 testes backend, 625 frontend e 277 runtime aprovados**; um teste preexistente do runtime permaneceu ignorado. A regressão específica do Radar passou com 172 testes backend e 34 frontend. Builds backend/frontend e orçamento de bundle aprovados. Lint comparativo: 558 erros/26 avisos preexistentes, abaixo do baseline 560/27; isso não significa ausência de dívida técnica no repositório. Não houve nova validação visual de navegador nesta correção.

Commits funcionais publicados em `main` e `codex/radar-brave-state-fixes`: `46934a5`, `b6a7556`, `090d6c9`. Push confirmado; **não equivale a deploy**. Esta versão não adiciona migração: os novos campos usam os JSONB existentes. Para o perfil aprofundado, atualize também o runtime, além de backend e frontend.

## Compatibilidade da retomada com recuperação antiga — 18/10/2026

A conferência dos recibos também reconhece a auditoria antiga `output_payload.captureRecovery`, que versões anteriores gravavam sem preencher `input_payload.captureOperationId`. Ela só comprova uma tentativa rejeitada quando pertence ao mesmo lote, organização, campanha, revisão e região, contém o motivo `legacy_validation_rejection`, data de recuperação válida, execução finalizada com falha de validação e zero candidatos. Auditorias ausentes, conflitantes, incompletas ou respostas incertas continuam bloqueadas. Não há alteração de contadores, custo, cursor ou recibos ao consultar esse histórico; uma rejeição nunca conta como página obtida.

O cenário de regressão usa PostgreSQL isolado e reproduz três tentativas (a primeira recuperada no formato antigo), continuação expirada já reiniciada, quarenta empresas anteriores e um lote de vinte novas. Após aprovação explícita de oito páginas e trinta consultas **apenas no teste**, quatro páginas duplicadas são preservadas sem admissão duplicada, duas páginas novas atingem a quantidade e os vinte trabalhos executam descoberta de presença, leitura, extração de contatos e consolidação com provedores simulados. Não há chamada externa de busca ou IA.

Após reiniciar uma continuação expirada, a previsão de capacidade é **teórica**, não desconta as empresas antigas que podem reaparecer. Quatro páginas anteriores mais vinte empresas novas, com dez por página e mesma ordenação, podem exigir pelo menos seis páginas bem-sucedidas. Três páginas autorizadas podem terminar só com duplicatas. O Admin deve conferir e aprovar limites suficientes no diálogo de retomada; não aumentamos cotas, orçamento ou créditos automaticamente. Os limites por fonte do aprofundamento também são independentes dos limites de descoberta. Chaves presentes e disponibilidade local não comprovam saldo/aceitação externa sem uma chamada real autorizada.

Validação desta correção: 109 testes das oito suítes de captação com PostgreSQL local aprovados, incluindo onze recusas de auditoria inválida e a jornada de quarenta empresas antigas mais vinte novas; suíte geral backend com 1.100 aprovados e 98 ignorados por condições opt-in; type-check e build backend aprovados. Sem mudança de interface, nova migração ou teste pago. A conferência de produção foi somente de leitura; publicação do código não comprova implantação nem conclusão do lote real.

## Continuação durável e limites no Admin — 18/10/2026

### Base de implantação

A integração `ddf64e9` preserva como ancestrais o portal visual `03244fb` e o Radar de `main@b3151b2`. As correções posteriores precisam ser implantadas junto dessa integração. Não selecionar a antiga branch visual isoladamente nem voltar ao main anterior: isso deixa parte das correções ou do portal de fora. A publicação em main não modifica a branch selecionada no Dokploy.

### Onde editar

Somente o Admin global YUX acessa **Admin → Integrações → Limites operacionais do Radar** (`/admin/integrations#radar-operational-limits`). Ali estão os tetos de empresas por lote, registros por página, páginas por região, consultas de descoberta, verificações, consultas/páginas por empresa, consultas diárias por campanha/fonte, validade da pesquisa e pausa administrativa da continuação.

1. Salvar essa política cria uma versão e auditoria. Não inicia buscas, não troca chaves/modelos e não aumenta limites de campanhas ou lotes existentes.
2. Em **Editar configuração** da campanha, escolha os limites operacionais desejados dentro dos tetos. Fontes mantêm ainda suas cotas diárias na mesma área Admin.
3. Para um lote já salvo, use **Retomar pesquisa**. O diálogo compara os limites autorizados no lote com os da campanha. **Usar os limites salvos na campanha** apenas preenche a proposta: revise os totais e confirme. A quantidade e os critérios daquele lote permanecem os originais.
4. Um novo pedido com quantidade diferente não é associado silenciosamente ao lote ativo. Atualize o acompanhamento e retome o lote correto.
5. Em caso de conflito de versão ou confirmação obsoleta, recarregue e revise de novo. Falha ao ler a política não é substituída por defaults apresentados como salvos.

Os valores iniciais da política preservam os tetos anteriores. A nova pausa de 60 minutos é uma precaução configurável, **não uma afirmação sobre o prazo de validade do provedor**. Permanecem as proteções de rede, TLS, robots, tamanho de resposta, leases, idempotência, credenciais e direitos de entrega. Os limites físicos de inteiros e o contrato externo não são ampliados por preencher um campo no Admin.

### Continuação e consumo

O preflight de início/retomada e a reserva verificam organização, campanha, revisão, região e geração da continuação. Token legado sem emissão confiável, pausa acima da política ou rejeição comprovada exigem confirmação antes de outra chamada. A autorização é vinculada ao estado exibido e auditada; uma aba antiga não autoriza outro cursor. Reiniciar preserva empresas, revisões, páginas anteriores e contadores, mas pode revisitar páginas e consumir novas consultas. A estimativa de páginas anteriores não garante que a ordenação externa permaneça igual.

Resposta desconhecida, timeout ou persistência incerta não permitem repetição automática. Recibos de bloqueio anterior ao despacho não contam como chamadas compradas. Excedentes já pagos são consumidos primeiro, inclusive quando precisam de vários turnos limitados do worker. Uma continuação herda o tamanho da página original: uma página de 25 registros reserva três blocos de dez no custo, mas apenas uma chamada na quota diária. O preflight considera esse custo herdado; registros excedentes não são truncados nem descartados.

Somente Admin YUX vê política, fontes, licenças, modelos, custos e diagnósticos. Operador, Admin de conta e membro continuam recebendo projeções comerciais permitidas; nenhuma nova informação técnica é liberada a esses papéis.

### Checklist de release e recuperação

- Aplicar as migrações forward-only **0194** e **0195** com o migrador do release. O replay limpo das 92 migrações foi validado em PostgreSQL 17 isolado.
- Implantar backend, worker e frontend do **mesmo commit consolidado em main**, registrando o SHA exato que será publicado. Depois conferir a identidade de release nos endpoints de saúde e a presença das novas rotas/DTOs; a mensagem de sucesso do deploy, isoladamente, não prova isso.
- Conferir as carteiras/rotas de IA, cotas das fontes e orçamento da campanha sem testar provedores pagos por conta própria. Política salva e chave testada não comprovam capacidade financeira externa.
- Consultar o preflight do lote real antes de retomar. Confirmar explicitamente qualquer reinício e alteração de limites; não herdar aumentos temporários autorizados para outro piloto.
- Para conter falhas, desativar novas chamadas, preservar recibos/outbox e reconciliar efeitos incertos. Não apagar cursores, resultados ou histórico para destravar o fluxo.
- Rollback de banco não é necessário nem recomendado. Uma imagem antiga que impõe os antigos tetos pode não ler campanhas/lotes com valores maiores: usar somente código comprovadamente compatível com os novos campos e autorizações; caso contrário, manter novas pesquisas pausadas e corrigir para frente. Não reduzir snapshots ou excluir dados para adaptar a imagem antiga.

Validação local: política Admin com persistência e auditoria, HTTP/RLS para diferentes papéis, reserva pelo worker com permissão somente de leitura na política, retomada de 40 empresas anteriores + 20 novas e início de sete novas com continuação de dez horas. Os dois lotes passaram por pesquisa e leitura simuladas até estado terminal, preservados após recarga. Como os dados sintéticos não comprovam toda a qualificação, a interface mantém o resultado parcial em vez de marcar aprovação artificial. Desktop e 390×844 verificados, sem erro de aplicação no console; avisos preexistentes de futura atualização do React Router permanecem. Isso **não comprova deploy, aceitação externa ou qualidade comercial em produção**. Deploy e piloto pago exigem autorização específica e orçamento novo.

### Revisão final dos caminhos de retomada

A autorização durável também encerra a pendência do recibo antigo correspondente à mesma região, revisão, geração e hash do token. Se a disponibilidade falhar depois da aprovação, mas antes de uma nova consulta, o Admin pode retomar após restabelecê-la sem reviver a rejeição antiga. O histórico original não é apagado e nenhuma consulta é repetida nessa conferência.

O teto global de registros por página é uma permissão, não o tamanho obrigatório da compra. Antes de haver uma proposta, a análise usa um limite inferior otimista de consumo para permitir abrir a confirmação; o tamanho proposto e os tamanhos herdados passam novamente pela verificação exata de custo/quota na aprovação e na reserva. Uma proposta maior ou mais cara pode ser recusada nessa segunda conferência, sem consumo externo.

O contrato antigo de confirmação continua legível, mas a mutação exige também `continuationStateId`, devolvido ao Admin junto do recibo. Uma confirmação somente com o recibo ou sob política antiga retorna 409, sem alterar cursor, auditoria ou fila. O estado é calculado com campos canônicos de organização, campanha, revisão e região, sem depender da ordem ou de campos temporários do objeto. A interface atual usa o contrato unificado por região.

Os três limites de correção tiveram regressão PostgreSQL RED→GREEN: aprovação moderna seguida de indisponibilidade antes do despacho; teto global de 100 com compra proposta/herdada de 10 e orçamento de R$ 0,05; confirmação HTTP antiga ou sem vínculo após alteração da política. Os testes usam apenas fontes sintéticas.

Verificação final: 140/140 testes de captação/política no PostgreSQL isolado que recebeu todas as migrações, 8/8 na integração real do worker com permissões restritas e 1.134/1.134 no frontend. A suíte geral backend passou com 1.112 testes e 117 opt-in ignorados, executados separadamente quando aplicáveis. Builds, TypeScript, orçamento de bundle e manifesto de migrações aprovados. Lint comparativo: 547 erros/25 avisos preexistentes contra baseline de 560/27; não há alegação de lint zerado. As regressões de teto agora usam a política efetiva, sem presumir que 11 páginas sejam sempre proibidas.
