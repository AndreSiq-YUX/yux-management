# Catálogo de funcionalidades e capacidades da YUX Hub

**Versão:** 1.1 — 26/09/2026

**Público:** equipe YUX, administradores e agentes de estratégia e planejamento de missões.
**Escopo:** produto SaaS para organizações de diferentes setores e regiões do Brasil; funções implementadas, funções condicionais e lacunas verificadas no código. A disponibilidade para uma organização depende de contrato, permissões, configurações, integrações e saúde dos provedores.

## 1. Como interpretar este catálogo

A YUX Hub reúne aquisição de oportunidades, CRM, comunicação, marketing, automações, execução de serviços e mensuração em um workspace por organização. O público-alvo, setor, oferta, região, canais e metas pertencem ao **cliente e à missão atual**. Nenhuma cidade, nicho, empresa, oferta ou perfil de agente citado como exemplo constitui limite permanente do produto. O agente deve substituir variáveis como `{região}`, `{segmento}`, `{oferta}` e `{canal}` pelo contexto confirmado do workspace.

Um módulo visível no produto, uma integração conectada e uma ação executável pelo Action Engine são coisas distintas:

- **Funcionalidade do Hub:** recurso que uma pessoa pode usar ou acompanhar em uma tela, API ou fluxo do produto.
- **Capacidade de missão:** ação registrada no Action Engine com entradas, efeito, pré-requisitos e política de aprovação próprios. A lista fechada está na seção 5.
- **Integração:** provedor externo necessário para certas ações, como pesquisa CNPJa, WhatsApp, e-mail, anúncios ou publicação.
- **Serviço YUX:** trabalho humano contratado, como estratégia, criação ou remodelagem de um site completo. Pode ser coordenado pelo Hub com projetos, aprovações e tarefas, mas isso não equivale a um construtor nativo de sites completos.

**Regra para o agente de missões:** explique a estratégia possível com as peças do Hub e como elas se conectam; depois confronte-a com contrato, conexão e prontidão do workspace. Fale em **captar, qualificar, conversar, nutrir, converter, entregar, recuperar e medir**, com canais e efeitos concretos. Um agente pode tratar muitas conversas em paralelo quando o canal e a política permitem; a plataforma também pode operar com perfis especializados. Diferencie a arquitetura possível do caminho efetivamente ligado em produção para aquela organização. Não prometa envio, publicação ou ativação sem os controles correspondentes.

**Estado desta publicação:** este arquivo é documentação no repositório. Criá-lo não o publica automaticamente na Base de Conhecimento nem altera o contexto recebido pelo agente de missões. A disponibilidade em produção deve ser verificada no workspace e no catálogo de capacidades no momento de planejar.

## 2. Mapa da plataforma

| Área | O que a YUX Hub oferece | Exemplo individual | Como se conecta |
| --- | --- | --- | --- |
| Empresa e conhecimento | Perfil, marca, produtos/serviços, integrações e documentos publicados por organização | Registrar oferta, público, tom, restrições e perguntas frequentes | Alimenta atendimento, Marketing Studio, Radar e planejamento |
| Radar Comercial | Busca ativa por segmento/região, importação e leitura de sites, pesquisa cadastral de empresas recém-abertas, análise, triagem e conversão | Identificar empresas de um perfil escolhido em qualquer região atendida | Oportunidade aprovada pode virar lead no CRM e plano de prospecção; hoje a operação Radar é interna à YUX |
| CRM e Funis | Leads, contas, pipelines, etapas, tarefas, histórico, segmentos, score e sequências | Acompanhar cada empresa desde descoberta até fechamento | Recebe formulários, Radar e conversas; aciona automações e relatórios |
| Atendimento e IA | Conversas simultâneas por canal, agentes com perfil e conhecimento, qualificação, resposta automática/assistida, filas e transbordo humano | Um SDR virtual responde e qualifica entradas elegíveis | Atualiza o contexto comercial e pode conectar pré-venda, vendas, suporte e retenção; a passagem automática entre perfis ainda precisa de conclusão no caminho nativo de WhatsApp |
| Campanhas e aquisição | Campanhas, criativos, landing pages, formulários, rastreamento e métricas | Preparar campanha de geração de leads com formulário | Entradas viram leads; orçamento e receita alimentam relatórios |
| Marketing Studio | Ideias, conteúdo, versões, calendário, revisão, aprovação e publicação configurada | Produzir artigo, post, mensagem ou variação de criativo | Usa marca/conhecimento; pode abastecer campanhas e canais |
| Automações | Fluxos por gatilho, condição e ação, sequências, simulação, versões e execuções | Criar tarefa quando um lead muda de etapa | Coordena CRM, mensagens, IA, suporte e integrações |
| Missões / Action Engine | Diálogo estratégico, plano, simulação, decisão, execução controlada, observação e replanejamento | Planejar aquisição, atendimento e conversão para a oferta definida no workspace | Encadeia capacidades publicadas e mede o resultado |
| Propostas e projetos | Propostas, revisão/aceite, entregáveis, tarefas, aprovações e acompanhamento | Converter oportunidade de site em proposta e projeto | Fecha o ciclo comercial e organiza a entrega do serviço |
| Relatórios | Funil, campanhas, fontes, custos, conversão, MROI e resultados observados | Comparar investimento, leads, propostas e clientes | Retroalimenta campanha, abordagem e missão |
| Administração | Contratos, módulos, limites, conexões, modelos de IA, Strategy Packs e saúde | Habilitar módulo e conectar um provedor para um cliente | Define o que o agente pode propor e executar naquele workspace |

O catálogo comercial de módulos do portal inclui `action_engine`, `clients`, `crm`, `projects`, `proposals`, `whatsapp_ai`, `landing_pages`, `campaigns`, `marketing_studio`, `bi_reports`, `automations`, `support`, `finance` e `blueprints`. Algumas capacidades usam ainda chaves técnicas específicas, por exemplo `campaign_launch_agent`, `campaign_optimization_agent`, `email` e `omnichannel`; a autorização efetiva é resolvida pelo contrato e pelas regras do executor, não apenas pelo nome mostrado no menu.

### 2.1 Resultados comerciais que podem combinar módulos

| Objetivo do cliente | Combinação possível | Valor entregue e medição |
| --- | --- | --- |
| Descobrir oportunidades | Radar por busca web/nicho, leitura de sites, fonte cadastral quando cabível, revisão e CRM | Lista qualificada com proveniência, score, hipóteses e taxa de conversão em lead |
| Gerar demanda que procura a oferta | Marketing Studio, criativos, campanhas, landing pages, formulários e CRM | Leads com origem rastreada, custo por lead e avanço no funil |
| Atender em escala | Canais conectados, perfis de agente, conhecimento, marca, modos de resposta, filas e CRM | Tempo de primeira resposta, conversas qualificadas, handoffs e reuniões |
| Aumentar conversão | Funil, pontuação, sequências, automações, tarefas, propostas e agente comercial | Etapas percorridas, propostas aceitas e receita atribuída quando mensurável |
| Reativar relacionamento | Busca de inativos, histórico, segmentação, mensagens/cadências permitidas e relatório | Respostas, oportunidades reabertas e receita recuperada verificada |
| Entregar e expandir | Projetos, aprovações, suporte, relatórios e análise de carteira | Prazos, aceite, satisfação e novas oportunidades identificadas |

Essas combinações são **padrões adaptáveis**, não pacotes fixos nem promessa de automação integral. O planejador deve propor pelo objetivo e confirmar as peças disponíveis para cada organização.

## 3. Funcionalidades em detalhe

### 3.1 Empresa, marca e conhecimento

**Perfil da empresa.** Registra nome, descrição, setor, site, posicionamento, diferenciais, regiões e dados operacionais de cada organização. O preenchimento pelo site pode sugerir fatos com evidência e página de origem para revisão; ele não substitui a validação humana de promessas, restrições legais e informações sensíveis. A missão deve partir da oferta real, da área de atuação e da capacidade de atendimento do cliente, seja local, regional ou nacional.

**Marca e tom de voz.** Organiza personas, tom, vocabulário, promessas permitidas, termos e temas proibidos e diretrizes visuais. Essas regras podem orientar conteúdo e respostas de IA; bloqueios também servem como controle antes de envio automático. O agente deve ajustar abordagem ao público e ao estágio de compra sem inventar garantia, desconto ou condição comercial.

**Base de Conhecimento da organização.** Aceita texto, URL e arquivos como PDF, DOCX, TXT e Markdown; prepara trechos/fatos para revisão, controla visibilidade e perfis autorizados e exige publicação. Conteúdo publicado pode ser recuperado pelos agentes conforme organização, consulta e política. O cliente pode publicar catálogo de produtos/serviços, condições de atendimento, processos, FAQ, objeções, portfólio e políticas para que o agente responda com precisão. Documentos internos não devem ser expostos em canal externo sem permissão.

**Integrações da empresa.** Mostra conexões de comunicação, mídia e publicação e seus estados. Exemplo: o planejador pode sugerir WhatsApp e e-mail, mas precisa verificar se os canais estão conectados e operacionais antes de incluí-los como execução imediata.

**Strategy Engine.** É a base de metodologia interna da YUX: Strategy Packs, documentos privados, trechos, cartões, playbooks, regras, revisão, publicação e vínculos por perfil/workflow. Seu conteúdo orienta *como pensar* a estratégia; a documentação do produto neste arquivo explica *o que a plataforma oferece*. O livro The Black Book não substitui o catálogo operacional da YUX Hub.

### 3.2 Radar Comercial e prospecção ativa

**Papel no produto.** O Radar é a porta de entrada para prospecção ativa. Ele deve identificar empresas compatíveis com a oferta do cliente, preservar a fonte, encontrar sinais úteis, propor hipóteses e priorizar revisão. O fluxo comercial continua no CRM, na sequência de contato permitida, no atendimento, na proposta e na mensuração. O Radar **não se resume a empresas recém-abertas**: também há busca por nicho, termo e localização, importação de listas e análise de URLs.

**Campanhas de descoberta.** O código admite `local_niche` e `recently_opened`, com segmento, cidade, UF, palavras-chave, CNAEs, oferta e limites. A campanha escolhe a região da prospecção; não existe restrição de produto a uma cidade específica. Atualmente o formulário tem valores iniciais fixos de setor, cidade, UF e oferta da própria YUX. São defaults de interface, não limites do mecanismo, mas precisam ser removidos para uma experiência SaaS neutra.

**Caminhos de entrada existentes:**

- Cadastro manual e CSV: a equipe fornece empresas e dados conhecidos.
- URL/site: Jina Reader lê cada URL fornecida, extrai título, contatos, links e indícios de CTA e registra esses sinais para análise; o lote é limitado a dez URLs.
- Busca web assistida: Jina Search consulta termo + cidade + UF e devolve até dez **candidatos**. As opções de interface “Jina Search” e “Web search” chamam atualmente a mesma implementação Jina; não representam dois provedores independentes.
- Pesquisa cadastral CNPJa: quando a fonte e a credencial estão habilitadas, filtra termo, cidade, UF, CNAE e período de abertura, produzindo candidatos revisáveis.

**Triagem e inteligência.** Candidatos passam por revisão de duplicidade, importação como oportunidade, análise assíncrona por agentes do Harness, diagnóstico, pontuação, sugestão de mensagem e revisão humana. O diagnóstico deve separar fato observado, inferência e dado não verificado. A origem e as evidências seguem para o CRM quando a oportunidade é aprovada e convertida em lead. Métricas registram candidatos, oportunidades, aprovações, conversões e custo estimado por fonte.

**Limite verificado da busca web:** resultados encontrados pela Jina Search são gravados com URL, resumo e contatos extraídos da resposta de busca. Importar um candidato e solicitar análise **não executa automaticamente a leitura do site feita na importação direta de URLs**. O analisador recebe os campos e endereços públicos gravados, não o corpo integral do site. Mesmo na importação de URL, são registrados sinais extraídos, não uma auditoria completa de páginas. Por isso o agente não deve dizer que toda empresa encontrada na busca web já teve seu site auditado. Para investigar um site, usar a leitura de URL e conferir as evidências; unir e aprofundar essas etapas automaticamente é trabalho pendente.

**Google Maps/Perfil da Empresa.** Não há conector de descoberta pelo Google Maps/Places no Radar atual. Um campo `google_business_url` pode constar do enriquecimento e há integração de **publicação** no Google Business Profile em outra área, mas isso não constitui uma busca ativa oficial de empresas no Maps. A Places API oferece busca textual por localização/tipo e pode retornar endereço, telefone e URL do site conforme campos solicitados; sua adoção exigiria conector, respeito aos termos de uso, credenciais, limites e faturamento por campos/requisições. **Nenhuma chamada paga deve ser ativada sem decisão explícita do administrador.** O planejador pode propor essa fonte como evolução, sem tratá-la como coleta já operacional.

**Prospecção após o Radar.** Uma oportunidade aprovada pode virar lead no CRM. A operação interna então pode criar plano com sequência e canal, aprovar e iniciar a cadência. A política revalida habilitação, revisão legal, horários, opt-out, limites diários/por lead, permissão de contato e conexão do canal. E-mail e WhatsApp só podem entrar na cadência com evidência exigida; WhatsApp fora da janela usa template aprovado. A primeira decisão é humana no fluxo de prospecção atual. Depois de iniciado, os passos permitidos da sequência podem ser executados e acompanhados automaticamente.

**Limite SaaS atual:** a navegação e a API do Radar/prospecção aceitam hoje apenas usuários internos da YUX; o código de análise fala em “prospecção interna da YUX” e a conversão para lead grava uma oferta padrão da YUX. Logo, a arquitetura por organização existe, mas **não está pronta como Radar autônomo, configurável e acessível diretamente por qualquer cliente SaaS**. Adaptar papéis, oferta e contexto é requisito para essa promessa comercial.

### 3.3 CRM, contas, funis, tarefas e pontuação

**Registro 360 do lead.** Reúne identidade, origem, contatos, empresa, etapa, responsável, interações, conversas, tarefas, propostas, receita, eventos e próximas ações. A interface oferece Kanban, lista, fila “Hoje”, calendário e fontes, com filtros por etapa, origem, temperatura e paralisação. Em vendas B2B, uma conta agrupa contatos; em outras jornadas, o registro acompanha uma pessoa ou oportunidade individual. O CRM pode receber entradas do Radar, formulários, campanhas e conversas e manter o histórico para a equipe e para automações.

**Funis configuráveis.** A equipe pode inspecionar pipelines e etapas, simular um novo funil, guardar uma versão em rascunho e publicá-la após aprovação. Cada etapa pode ter critérios de saída e marcação de ganho/perda. A sequência de estágios deve refletir o ciclo de compra do cliente, que pode envolver consulta, visita, demonstração, orçamento, assinatura, compra ou renovação; não existe um funil universal.

**Tarefas e follow-up.** É possível criar, atribuir, reagendar, concluir e acompanhar tarefas ligadas a leads e responsáveis. Uma automação ou missão pode criar tarefa quando uma proposta ficar parada, ou transferir um caso sensível para pessoa da equipe.

**Segmentos, sequências e score.** Os filtros permitem formar públicos por origem, etapa, responsável, atividade, campanha, pontuação e proposta. Há modelos/regras de scoring e simulação; sequências de nutrição podem combinar passos e ser publicadas antes da inscrição de leads. Não se deve chamar todo score de “qualificação automática por IA”: a regra e os dados usados precisam ser examinados.

**Uso individual:** localizar oportunidades paradas por um período configurável, distribuir tarefas por responsável e medir quantas voltaram ao estágio ativo; ou segmentar contatos por origem e intenção para uma campanha de nutrição.

### 3.4 Atendimento, WhatsApp e outros canais

**Capacidade comercial.** Um canal conectado pode atender várias conversas ao mesmo tempo, inclusive fora do horário de uma equipe humana, usando conhecimento publicado sobre empresa, produtos, preços/regras permitidos e tom da marca. O agente pode identificar intenção, tirar dúvidas, coletar dados de qualificação, recomendar o próximo passo e manter contexto para o atendimento comercial. A operação mede tempo de resposta, resolução, qualificação, transferência e avanço do lead, em vez de tratar o chat apenas como caixa de mensagens.

**Perfis de agente.** O modelo de dados e o Strategy Engine distinguem funções como SDR/pré-venda, closer/objeções e proposta, suporte e retenção/crescimento. Perfis podem ter objetivos, campos necessários, regras de segurança, fontes de conhecimento, prioridade e política de autonomia próprios. Um SDR pode levantar necessidade e critérios de compra; um closer pode trabalhar objeções após proposta; suporte pode resolver solicitações recorrentes; retenção pode identificar oportunidade na carteira. Esta especialização é relevante para desenhar o fluxo, não garante que o roteamento automático entre esses perfis esteja ligado em cada canal.

**Inbox e operação.** A Central Omnichannel reúne histórico, mensagens, canais, contatos, equipes/filas, atribuição, status, resolução, reabertura, respostas humanas e sugestões aprováveis. WhatsApp, Instagram Direct, Facebook Messenger e webchat dependem de conexão/adapter operacional; há simulador para testar entradas. Conversas podem ser vinculadas ao CRM, criando continuidade entre pré-venda, proposta, suporte e retorno comercial.

**Autonomia graduada.** Em `manual`, uma pessoa responde; em `assisted`, a IA prepara resposta para aprovação; em `automatic`, respostas elegíveis podem ser despachadas sem aprovação individual. A política considera perfil, canal, intenção, risco, confiança, regras de marca, conhecimento e modo da conversa. Conteúdo sensível, baixa confiança, falha do runtime ou proibição da marca podem bloquear envio e encaminhar para humano. Isso permite atendimento autônomo em escala **dentro do escopo autorizado**, com transbordo quando necessário.

**O que o WhatsApp nativo faz hoje.** O worker persiste a entrada, chama o Harness, grava classificação/qualificação e proposta de resposta, aprova ou retém conforme política e modo, despacha quando permitido e registra resultado de entrega. O processamento é por mensagem/conversa, portanto pode lidar com múltiplas conversas, sujeito à capacidade operacional e aos limites do provedor. Para saída ativa, usa conexão e template aprovado quando exigido, permissão, supressão e idempotência; “enfileirado” não significa “entregue”.

**Lacuna de passagem entre agentes.** Existe lógica de seleção por papel/regras no caminho de compatibilidade e estrutura de perfis/handoffs no banco. Porém o worker nativo de entrada do WhatsApp resolve atualmente o assistente ativo com papel `sdr` (ou sem papel) da organização para a execução; ele não usa nessa etapa as regras de troca dinâmica SDR → closer → suporte/retenção, nem o `assistant_id` configurado na conexão como seleção final. Portanto um fluxo multiagente completo deve ser apresentado como **arquitetura suportada em parte e integração pendente**, não como alternância automática já verificada em produção.

**Exemplos adaptáveis:** responder dúvidas frequentes e qualificar uma entrada; abrir tarefa para vendedor quando o lead demonstrar intenção alta; levar uma conversa iniciada por campanha ao CRM; continuar uma cadência autorizada após resposta; transferir assunto financeiro ou complexo a uma pessoa. Os agentes e canais escolhidos dependem do contrato e da jornada do cliente.

### 3.5 Landing pages, formulários, campanhas e anúncios

**Landing pages.** O Hub lista páginas, versões, preview, formulário, status e indicadores de visitas/leads/conversão. A capacidade de missão cria um **rascunho para preview interno** com CTA para formulário, WhatsApp, telefone ou URL externa. Isso permite testar oferta e captar intenção em campanhas. Não representa criação automática de um site institucional completo, loja, portal ou remodelagem integral.

**Formulários.** Permitem definir campos mapeados ao CRM, mensagem de confirmação e referências de consentimento. A captação externa pode criar/rotear leads e registrar origem. A validação de tracking checa UTM, destino e evento de conversão antes da publicação de uma campanha.

**Campanha 360.** Organiza objetivo, oferta, público, orçamento, criativos, anúncio, página, formulário, mensagem, automação, aprovação e relatório. Pode servir a geração de leads, tráfego, conversão ou reconhecimento, conforme os objetivos aceitos pelo conector. O Action Engine pode produzir rascunho versionado, gerar e anexar criativo, vincular ativos, criar campanha pausada em provedor de anúncios, ativar ou pausar com controle e observar métricas. A criação local de rascunho não inicia gasto em mídia; ativação externa exige conexão, aprovação e preflight.

**Otimização.** Métricas de gasto, impressões, cliques, leads e receita atribuída alimentam decisão de observar, pausar, ajustar orçamento dentro do limite ou criar novo rascunho criativo. Ausência de UTM/atribuição deve ser indicada como dado desconhecido, não estimada como receita comprovada.

**Uso individual:** testar propostas de valor ou criativos para um segmento, comparar custo por lead e qualidade comercial antes de aumentar orçamento; ou captar inscrições para atendimento, demonstração ou orçamento conforme a oferta.

### 3.6 Marketing Studio e conteúdo

**Do objetivo à pauta.** O workspace reúne planejamento, ideias, conteúdos, versões, calendário, agentes/workflows, criativos e execuções. Uma pauta pode partir de dúvida recorrente, objeção comercial, etapa do funil, lançamento, sazonalidade ou lacuna de busca identificada pela equipe. Público, promessa autorizada, formato, canal e chamada para ação devem acompanhar a ideia; publicar por volume sem relação com uma meta não é a recomendação padrão.

**Produção e reutilização.** Pode preparar posts, artigos, roteiros, newsletters, copies de anúncios e mensagens conforme o fluxo configurado. Marca, produto, público, fontes e estratégia publicada dão contexto à produção. Uma mesma tese pode gerar peça educativa, resposta de FAQ, conteúdo de campanha, argumento de atendimento e sequência de nutrição, com redação ajustada a cada canal. Conteúdo pode educar um mercado, responder objeções, criar demanda, sustentar campanhas ou fortalecer relacionamento, e não se limita a “postar nas redes”. O agente deve preservar atribuição de fatos, revisar alegações e evitar transformar exemplos em promessas universais.

**Revisão, calendário e distribuição.** Conteúdo segue rascunho, versão, revisão, aprovação e publicação. O backend possui comandos de plano, nova versão, submissão, decisão e publicação; conexões específicas permitem criar/atualizar rascunho ou publicar quando disponíveis. Calendário e estado de cada peça ajudam a coordenar equipe, datas e dependências de campanha. Não se deve prometer postagem automática em qualquer rede sem conferir conector, permissão e aprovação. Um criativo de campanha em rascunho também não é anúncio veiculado.

**Valor comercial e avaliação.** O Studio pode reduzir tempo de produção, dar consistência à marca e abastecer aquisição e relacionamento. Exemplo adaptável: transformar perguntas frequentes de `{segmento}` em conteúdo explicativo, derivações curtas para canais conectados e material para uma sequência comercial; revisar, aprovar, publicar e medir interesse gerado. Atribuir leads ou receita a um conteúdo exige origem e tracking suficientes, não apenas visualizações.

### 3.7 Automações e sequências

**Construtor.** Fluxos usam gatilho → condição → ação, têm simulação, versões, publicação/ativação, pausa, duplicação, histórico e execução rastreada. Condições incluem igualdade, diferença, conteúdo, comparações e existência. A interface também oferece modelos por setor e objetivos guiados.

**Ações registradas no fluxo.** O validador aceita criar tarefa, mudar etapa/pipeline, atribuir responsável, atualizar campo, registrar atividade, enviar WhatsApp/e-mail, abrir ticket, chamar webhook/API, converter proposta, criar projeto/fatura, classificar lead ou gerar mensagem/proposta com IA, inscrever/pausar sequência, adicionar tag e ajustar score. A presença de um tipo no validador não prova que todas as integrações externas estejam configuradas; cada ação deve passar pela política e pelo executor. Efeitos externos requerem aprovação no fluxo.

**Sequências comerciais.** Uma cadência publicada pode programar contatos e tarefas com intervalos; o sistema registra inscrição, execução e pausa. Pode acompanhar novo lead, proposta em análise, confirmação, pós-venda ou reativação, sempre de acordo com permissão e contexto. Exemplo genérico: após uma solicitação de contato, criar tarefa, enviar resposta permitida, aguardar sinal e oferecer acompanhamento humano se a pessoa demonstrar interesse ou objeção.

### 3.8 Missões, execução e aprendizado

**Planejamento conversacional.** O agente transforma objetivo e contexto em briefing, identifica hipóteses, lacunas e alternativas, consulta conhecimento estratégico e capacidades disponíveis e propõe um plano verificável. Ele deve saber explicar os caminhos de aquisição ativa, demanda capturada, atendimento, nutrição, conversão, entrega e recuperação; pode combinar ações digitais e humanas. Perguntas servem para decisões que alteram o fluxo, como objetivo, investimento, público, área de atuação, capacidade de resposta/entrega, prazo e autorização de contato. Ele deve trazer de antemão as possibilidades conhecidas do Hub.

**Execução governada.** O Action Engine usa capacidades publicadas, verifica prontidão, simula/gera rascunhos, pede decisões para efeitos sensíveis, executa com identidade e idempotência, observa resultados e avalia checkpoints. Autonomia, orçamentos, contatos e versões possuem limites e podem ser pausados. Automação publicada pode ser chamada como subprocesso de uma missão.

**Limite essencial:** o registro da seção 5 é uma lista de ações executáveis pelo supervisor. Radar, Marketing Studio e demais telas também possuem funções operacionais fora desse registro. O planejador pode recomendar essas funções como etapa assistida ou dependência, mas só deve prometer execução automática da missão quando houver uma capacidade/fluxo de execução correspondente e habilitado.

### 3.9 Propostas e fechamento

**Da oportunidade ao escopo.** A equipe pode criar proposta ligada a lead, definir itens e regras de preço, editar condições, gerar rascunho e preservar versões. O diagnóstico e o histórico do CRM ajudam a justificar o escopo; não devem ser convertidos automaticamente em garantia de resultado. A proposta pode combinar serviço, implantação, recorrência e entregáveis conforme a oferta real da organização.

**Decisão e conversão.** Há envio, revisão pública controlada por token, decisão de aceite ou rejeição e registro de tentativas de conversão. Uma proposta aceita pode se relacionar a contrato e projeto; se houver objeção ou ajuste, o histórico permite nova versão e tarefa de follow-up. O agente de missões deve distinguir “proposta preparada”, “enviada”, “aceita” e “convertida”: cada estado exige confirmação própria.

**Valor comercial.** Qualificação, escopo, aprovação, fechamento e início da entrega podem formar um encadeamento mensurável. Para vendas consultivas, isso evita perder o contexto levantado no atendimento; para ofertas padronizadas, favorece agilidade sem ocultar preço, prazo e responsabilidades.

### 3.10 Projetos, suporte e continuidade

**Entrega coordenada.** Projetos, fases, tarefas, prazos, responsáveis, orçamento, entregáveis, documentos e aprovações permitem acompanhar serviços de diferentes naturezas. A equipe pode visualizar progresso, identificar atraso, solicitar revisão, registrar aceite e comunicar a próxima etapa ao cliente. O Hub organiza execução humana e técnica; não executa por si só todo serviço contratado. Por exemplo, criação ou remodelagem integral de site depende da equipe e ferramentas de produção, enquanto a landing page do Action Engine é uma peça específica de aquisição.

**Suporte.** Tickets e mensagens vinculados à organização permitem registrar solicitação, histórico, estado e resposta. Uma conversa omnichannel pode originar atendimento humano ou fluxo de suporte, preservando contexto quando a integração estiver configurada. A experiência pós-venda não termina na assinatura: dúvidas de uso, ajustes de projeto, incidentes, renovações e oportunidades de expansão devem ter responsável e acompanhamento.

**Uso combinado.** Após o aceite, iniciar projeto e tarefas, informar marcos ao cliente, receber revisão, resolver pendências no suporte e observar satisfação e novas necessidades. Uma oportunidade de expansão deve voltar ao CRM com evidência e consentimento adequados, em vez de ser tratada como venda automaticamente autorizada.

### 3.11 Finanças, relatórios e mensuração

**Financeiro operacional.** O módulo reúne faturas e itens de cobrança, com estado de pagamento visível para equipe e, conforme permissão, portal do cliente. Essa informação pode ajudar a entender receita realizada ou pendências e a coordenar entrega/cobrança; o agente não deve supor que o Hub processa pagamentos de toda organização apenas porque há cadastro de fatura. Evite expor dados financeiros a um agente ou canal sem autorização específica.

**Relatórios e ROI.** Visões operacionais e do cliente acompanham funil, campanhas, origem, landing pages, propostas, atividades, gasto, CPL, conversão, clientes e receita/MROI quando há dados confiáveis. A visualização do cliente restringe dados internos. A missão registra observações, checkpoints, efeitos e economia. O relatório deve separar volume, qualidade, velocidade e resultado: mais leads não demonstram, sozinhos, mais vendas.

**Aprendizado de negócio.** Cruzar origem com etapa, motivo de perda, custo e receita observada ajuda a decidir se a correção está no público, oferta, criativo, página, atendimento ou capacidade de entrega. Atribuição incompleta e período curto devem ser declarados. Comparar coortes, pilotos e períodos pode orientar replanejamento, mas não autoriza apresentar causalidade ou receita presumida como comprovada.

### 3.12 Administração, blueprints e governança SaaS

**Por organização.** Pacotes, contratos, módulos e papéis delimitam direitos de uso. O Admin governa modelos e rotas de LLM, integrações/chaves, canais, limites, Strategy Packs, saúde e auditoria. Uma organização não herda o conhecimento privado, os contatos ou as conexões de outra. O agente de missões deve consultar o estado efetivo do workspace antes de sugerir uma ação imediata.

**Implantação orientada.** Blueprints setoriais ajudam a iniciar funil, campos, templates, automações e relatórios adequados ao setor. São ponto de partida revisável, não uma metodologia obrigatória nem substituto do diagnóstico do cliente. Uma implantação pode começar com perfil, conhecimento e CRM, adicionar canais e automações após testes e depois ativar campanhas e otimização conforme meta e orçamento.

**Controles transversais.** Fontes de conhecimento publicadas, versões de campanha/conteúdo, permissões de contato, supressão, aprovações e limites de gasto constituem parte da capacidade comercial: permitem escalar com rastreabilidade. Configuração de modelo de IA no Admin não substitui preparação de contexto, teste de qualidade e monitoramento de falhas. Nenhum agente deve prometer uma integração não conectada, um módulo fora do contrato ou execução irrestrita porque aparece neste catálogo.

## 4. Fluxos que combinam funcionalidades

Os fluxos abaixo são **modelos de raciocínio**, parametrizados por `{organização}`, `{segmento}`, `{região}`, `{oferta}`, `{meta}`, `{orçamento}`, `{canal}` e `{prazo}`. Não presumem um nicho, uma cidade, uma única jornada de compra ou que todo cliente tenha os mesmos módulos. Cada etapa precisa de fonte, responsável, condição de avanço e indicador.

### 4.1 Prospecção ativa por perfil e região

1. **Definir o alvo:** identificar cliente ideal, sinais de necessidade, região atendida, oferta, capacidade operacional e o que torna uma empresa elegível.
2. **Descobrir por caminhos complementares:** busca web assistida por nicho/localidade; leitura de URLs conhecidas; importação CSV/manual; CNPJa por abertura/CNAE quando a hipótese pede empresas recentes. Uma futura fonte de Maps/Places exigirá conector próprio.
3. **Investigar:** revisar candidatos/duplicados, ler sites quando necessário, registrar fatos verificáveis, levantar hipótese de dor, pontuação e mensagem sugerida. Não tratar ausência de site, telefone público ou data de abertura como consentimento para contato.
4. **Priorizar e converter:** aprovar oportunidade, enviar ao CRM com proveniência, separar segmento, responsável e próximo passo. O Radar opera hoje pela equipe interna YUX; acesso direto por cliente SaaS é uma lacuna identificada.
5. **Abordar com permissão:** quando política/canal permitem, a equipe aprova plano de prospecção e inicia sequência. Cadência pode executar passos autorizados, registrar entrega/resposta e levar o contato ao atendimento. Quando a abordagem direta não for elegível, oferecer outra estratégia, como campanha de atração ou ação humana.
6. **Qualificar e avançar:** agente SDR ou equipe conversa, descobre intenção e necessidade, atualiza CRM, encaminha proposta/agendamento ou humano conforme risco. Transição automática entre perfis de IA ainda depende de integração no worker nativo.
7. **Medir:** fonte→candidato→oportunidade aprovada→lead→resposta→reunião/proposta→venda, incluindo custo e opt-outs. Ajustar critérios, abordagem e canais a partir dos dados.

Esse padrão atende diferentes ofertas B2B; o conteúdo da mensagem, os critérios e os canais mudam conforme o cliente. **Não apresentar o encadeamento inteiro como um botão único ou uma missão que já executa Radar de ponta a ponta.**

### 4.2 Demanda recebida por campanha ou conteúdo

Registrar marca, público e oferta → criar conteúdo/ativos → preparar campanha, página e formulário → validar origem e tracking → aprovar e publicar no canal conectado → receber lead no CRM → iniciar atendimento e qualificação → nutrir ou encaminhar para proposta → medir conversão por fonte e custo. Pode ser combinado com prospecção ativa para alcançar quem ainda não procura a solução e captar quem já demonstra interesse.

### 4.3 Atendimento em escala com especialização comercial

Entrada em canal conectado → identificar organização, histórico e intenção → carregar conhecimento/brand rules → responder ou qualificar com perfil SDR → registrar o que foi aprendido no CRM → continuar automaticamente quando a política autorizar, solicitar aprovação quando exigida ou passar a humano → tratar proposta/objeção pelo papel adequado quando o roteamento estiver implementado → medir resolução, qualificação, velocidade e fechamento. Várias conversas podem estar em andamento simultaneamente; nenhuma deve cruzar dados de organizações diferentes. A passagem automática entre agentes especializados precisa de verificação/implementação no caminho nativo de WhatsApp.

### 4.4 Recuperação de oportunidades e carteira

Localizar leads/propostas/clientes elegíveis por estágio e inatividade → ler histórico e motivo conhecido → criar grupos e piloto → escolher oferta ou conversa relevante → preparar mensagem/tarefa → conferir autorização de canal e aprovação → executar cadência, atendimento e follow-up → observar resposta, reabertura, venda e receita comprovada. Sem fonte confiável de receita, informar “desconhecido”, não prometer ROI.

### 4.5 Conteúdo ligado à operação comercial

Observar perguntas, objeções, busca e desempenho → usar marca e conhecimento publicado → produzir artigo, post, peça visual, anúncio, FAQ ou material de nutrição adequado ao canal → revisar fatos/voz → aprovar/publicar nos conectores disponíveis → associar campanha, página, CRM ou sequência → comparar visitas, leads qualificados e conversões. O formato nasce do objetivo e do público, não de uma lista fixa de posts.

### 4.6 Da venda à entrega e expansão

Proposta aceita → converter lead em cliente/contrato → abrir projeto com responsáveis, etapas, prazos e entregáveis → comunicar progresso e recolher aprovações → registrar suporte, uso e satisfação → identificar renovação, venda complementar ou prevenção de perda → alimentar relatório e nova missão. O tipo de entrega depende do serviço contratado e pode envolver trabalho humano, integrações e ferramentas externas.

## 5. Registro completo de capacidades do Action Engine

As **46 capacidades abaixo estão registradas no código**. “Registrar” não significa que toda organização possa executá-las: o supervisor aplica direitos contratuais, modo de autonomia, permissão, conexão, estado do provedor e política de aprovação. `Leitura` não altera dados; `rascunho` prepara artefato sem ativação; `interno` altera estado no Hub; `externo` pode gerar contato, execução ou custo fora do Hub.

### 5.1 Controle da missão

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `system.readiness.check` | Verifica organização, CRM, módulos e conexões requeridos; retorna bloqueios antes do plano. | Leitura. |
| `system.approval.await` | Suspende a etapa e registra decisão de plano, população, piloto, efeito externo ou replanejamento. | Interno; aprovação obrigatória. |
| `system.signal.wait` | Calcula o próximo instante de observação sem manter processo aberto. | Leitura. |
| `system.evaluation.checkpoint` | Solicita avaliação de resultado e economia para objetivo monetário/checkpoint. | Leitura. |

### 5.2 CRM, funis e recuperação

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `crm.pipeline.snapshot` | Lê pipelines e etapas existentes para entender o funil atual. | Leitura; CRM. |
| `crm.pipeline.inspect` | Lê funis ativos, descrição e ordem das etapas. | Leitura; CRM. |
| `crm.pipeline.simulate` | Valida nome, etapas, critérios e resultados ganho/perdido; devolve prévia e hash. | Leitura; CRM. |
| `crm.pipeline.create_draft` | Salva versão imutável de um funil proposto, ainda inativa. | Rascunho; CRM. |
| `crm.pipeline.publish` | Publica a versão e hash aprovados, ativando o funil. | Interno; aprovação obrigatória. |
| `crm.recovery_candidates.search` | Encontra leads inativos por período, pipeline, etapa e exclusões, com limite. | Leitura; CRM. |
| `crm.lead.timeline.read` | Recupera interações recentes de um lead para contextualizar a próxima ação. | Leitura; CRM. |
| `crm.task.create` | Cria tarefa vinculada a lead, com prazo, prioridade e responsável. | Interno; aprovação conforme risco. |
| `crm.lead.assign_owner` | Define responsável por um lead. | Interno; aprovação conforme risco. |

### 5.3 Templates, sequências e automação de nutrição

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `email.templates.inspect` | Lista templates de e-mail e versões publicadas disponíveis. | Leitura; CRM + automações. |
| `email.template.create_draft` | Salva copy de e-mail com fontes como versão revisável. | Rascunho; CRM + automações. |
| `email.template.publish` | Publica a versão exata aprovada do template. | Interno; aprovação obrigatória. |
| `crm.sequence.create_draft` | Prepara sequência que referencia templates/versionamento e seus passos. | Rascunho; CRM + automações. |
| `crm.sequence.simulate` | Verifica estrutura e provedor sem inscrever pessoas. | Leitura; CRM + automações. |
| `crm.sequence.publish` | Publica sequência aprovada para futura inscrição. | Interno; aprovação obrigatória. |
| `automation.flow.create_draft` | Prepara fluxo de entrada em nutrição com consentimento e supressão. | Rascunho; CRM + automações. |
| `automation.flow.simulate` | Verifica provedor, consentimento e supressão sem ativar. | Leitura; CRM + automações. |
| `automation.flow.publish` | Publica versão e hash aprovados do fluxo. | Interno; aprovação obrigatória. |

### 5.4 Campanhas, aquisição e otimização

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `campaign.state.inspect` | Lê campanhas e versões locais para evitar duplicação e entender estado. | Leitura; campanhas. |
| `campaign.create_draft` | Salva campanha versionada com objetivo, oferta, público, orçamento, datas, criativos e tracking; sem veiculação. | Rascunho; campanhas + agente de lançamento. |
| `marketing.creative.generate_draft` | Salva copy/briefing de criativo citados para uma campanha. | Rascunho; campanhas + agente de lançamento. |
| `campaign.creative.attach_draft` | Associa versão exata de criativo ao rascunho da campanha. | Rascunho; campanhas + agente de lançamento. |
| `landing_page.create_draft` | Cria página de captação em prévia, com conteúdo e CTA definido. | Rascunho; campanhas + landing pages + agente de lançamento. |
| `lead_form.configure_draft` | Prepara campos, mapeamento CRM, consentimento e confirmação para formulário. | Rascunho; campanhas + landing pages + agente de lançamento. |
| `campaign.acquisition.attach_draft` | Vincula página, formulário ou tracking ao rascunho da campanha. | Rascunho; campanhas + landing pages + agente de lançamento. |
| `campaign.tracking.validate` | Confere UTM, URL de destino e evento de conversão. | Leitura; campanhas + landing pages. |
| `campaign.provider.create_paused` | Cria campanha no provedor já pausada, usando versão/hash aprovados e limite. | Externo; anúncios conectados e aprovação obrigatória. |
| `campaign.provider.activate` | Ativa campanha exata no provedor depois da decisão. | Externo; anúncios conectados e aprovação obrigatória. |
| `campaign.provider.pause` | Pausa campanha no provedor. | Externo; anúncios conectados, aprovação conforme risco. |
| `campaign.metrics.snapshot` | Lê gasto, impressões, cliques, leads, receita atribuída e suficiência do tracking. | Leitura; campanhas. |
| `campaign.optimization.evaluate` | Escolhe deterministicamente observar, pausar, ajustar orçamento ou criar nova variação sob guardrails. | Leitura; campanhas + agente de otimização. |
| `campaign.budget.decrease_bounded` | Reduz orçamento diário de campanha exata dentro de limite percentual. | Externo; anúncios conectados, aprovação conforme risco. |
| `campaign.budget.increase` | Aumenta orçamento diário de campanha exata dentro de limite percentual. | Externo; anúncios conectados e aprovação obrigatória. |
| `marketing.creative.optimization_draft` | Cria variação de criativo com fontes, sem publicar. | Rascunho; campanhas + agente de otimização. |

### 5.5 Segmentação, trabalho humano e receita

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `growth.segment.preview` | Divide candidatos de forma determinística entre grupo piloto e restante. | Leitura; CRM. |
| `human.task.create` | Registra intervenção humana com prazo, responsável e possível lead. | Interno; aprovação conforme risco. |
| `reports.recovered_revenue.snapshot` | Soma receita ganha dos leads indicados no período; preserva estado desconhecido quando não há população confiável. | Leitura; CRM. |

### 5.6 Comunicação e execução encadeada

| Chave | Finalidade, entradas e resultado esperado | Efeito / controle |
| --- | --- | --- |
| `omnichannel.message.draft` | Prepara mensagem revisável para e-mail ou WhatsApp, com objetivo e fontes, sem envio. | Interno; aprovação conforme risco. |
| `crm.sequence.enroll` | Inscreve lead em sequência publicada, com política para inscrição existente. | Externo; CRM + automações e aprovação obrigatória. |
| `email.message.queue` | Enfileira e-mail de template publicado com destinatário, variáveis, consentimento e supressão verificada. | Externo; CRM + e-mail conectado e aprovação obrigatória. |
| `whatsapp.template.queue` | Enfileira template WhatsApp aprovado para contato com permissão registrada. | Externo; omnichannel + WhatsApp conectado e aprovação obrigatória. |
| `automation.flow.execute` | Executa versão publicada de automação para entidades delimitadas como subprocesso da missão. | Externo; automações e aprovação obrigatória. |

**Exemplos de composição das capacidades:**

- Novo funil: `crm.pipeline.inspect` → `crm.pipeline.simulate` → `crm.pipeline.create_draft` → aprovação → `crm.pipeline.publish`.
- Reativação: `crm.recovery_candidates.search` → `crm.lead.timeline.read` → `growth.segment.preview` → `omnichannel.message.draft` → aprovação → `crm.sequence.enroll` ou envio autorizado → `reports.recovered_revenue.snapshot`.
- Campanha paga: `campaign.state.inspect` → `campaign.create_draft` → `marketing.creative.generate_draft` → `landing_page.create_draft` → `lead_form.configure_draft` → `campaign.tracking.validate` → aprovação → `campaign.provider.create_paused` → `campaign.provider.activate` → `campaign.metrics.snapshot` → `campaign.optimization.evaluate`.
- Nutrição por e-mail: `email.templates.inspect` → `email.template.create_draft` → aprovação/publicação → `crm.sequence.create_draft` → `crm.sequence.simulate` → aprovação/publicação → `automation.flow.create_draft` → `automation.flow.simulate` → aprovação/publicação → inscrição autorizada.

## 6. Regras de resposta para agentes

O leitor deste documento é o **agente de planejamento de missões**. Seu trabalho é traduzir o objetivo de uma organização em opções estratégicas, verificar quais estão disponíveis naquele workspace, obter decisões necessárias, construir plano com métricas e acompanhar resultado. Este arquivo fornece vocabulário de produto e possibilidades de composição; **não concede permissão para executar uma ação**. O catálogo vivo de capacidades, o contrato, as conexões, a política de autonomia e as decisões aprovadas continuam sendo a autoridade operacional.

1. **Comece pelo resultado desejado.** Identifique público, oferta, região atendida, ciclo comercial, meta, prazo e capacidade de atendimento. Não herde cidade, segmento, canal, preço ou promessa de um exemplo, outro cliente ou conversa anterior.
2. **Explique o leque relevante antes de perguntar.** Para captação, considere descoberta ativa (Radar), demanda criada/capturada (conteúdo, mídia, páginas, formulários), reativação (CRM), atendimento e conversão. Mostre quando faz sentido combiná-los. O cliente não precisa adivinhar quais canais e módulos a YUX Hub possui.
3. **Descreva ação e resultado, não só nomes de módulos.** “O CRM recebe o lead com origem, inicia tarefa/cadência, registra resposta e mostra o avanço no funil” informa mais que “o CRM ajuda a organizar leads”. “Um agente SDR pode atender simultaneamente conversas elegíveis, qualificar e encaminhar” informa mais que “WhatsApp com IA”.
4. **Separe três estados em cada proposta:** (a) o produto implementa e o workspace está pronto; (b) o produto implementa, mas falta contrato, credencial, dados, permissão ou aprovação; (c) falta integração/funcionalidade no código. Para o estado (c), ofereça etapa humana/assistida ou melhoria do produto explicitamente, sem simulá-la como pronta.
5. **Dê opções e trade-offs.** Busca ativa depende de fonte, revisão e permissão de contato; anúncios dependem de orçamento e conexão; conteúdo costuma maturar demanda; atendimento automático reduz tempo de resposta, mas depende de conhecimento e controles. Recomende uma combinação justificada pelo caso, não um funil universal.
6. **Mostre o encadeamento e as decisões.** Diga como a pessoa ou empresa passa de descoberta/entrada a lead, conversa, qualificação, proposta, venda e pós-venda. Indique condição de avanço, papel do agente/humano, aprovação, dado observado e métrica.
7. **Trate autonomia com precisão.** Resposta automática em conversa iniciada pelo contato, envio inicial de prospecção, ativação de campanha, alteração de orçamento e troca de agente têm pré-requisitos diferentes. Não conclua que uma política `automatic` para atendimento autoriza primeiro contato frio ou transferência automática SDR→closer.
8. **Cite a evidência útil e admita lacunas.** Diferencie o que veio do perfil/knowledge do cliente, do Strategy Pack, do estado operacional e deste catálogo. Se faltar contexto comercial, peça-o ou proponha cadastro/publicação; se faltar conector, informe o bloqueio específico. Não invente que leu o site de um candidato apenas porque recebeu sua URL.
9. **Faça poucas perguntas, em grupos, somente quando mudam o plano.** Priorize objetivo e público, oferta, área de atuação, investimento, capacidade de atender/entregar e autorização para cada tipo de contato. Reaproveite dados já presentes no workspace.
10. **Entregue uma proposta concreta.** Resuma objetivo, 2–3 caminhos possíveis, recomendação, etapas integradas, o que já pode começar, o que precisa ser habilitado, decisões do cliente e métricas. Depois aprofunde conforme a resposta, em vez de devolver uma enumeração rasa de módulos.

**Exemplo de resposta adaptável:** “Para `{objetivo}` com `{público}` em `{região atendida}`, posso combinar descoberta ativa de organizações compatíveis, captação por conteúdo/campanha, CRM para acompanhar cada oportunidade e atendimento por IA para qualificar entradas elegíveis. O Radar pesquisa por perfil e região e, quando necessário, por empresas recém-abertas; os achados passam por revisão antes de entrar no CRM. Para abordagem direta, verificarei fonte, permissão de canal e sequência aprovada. Para demanda que chega por anúncios ou conteúdo, posso ligar página/formulário ao CRM e ao atendimento. Vou conferir módulos e conexões ativos e propor metas, custos e checkpoints para cada caminho.”

## 7. Situação verificada e lacunas para evolução

| Jornada | O que existe no código | O que falta para a promessa completa |
| --- | --- | --- |
| Radar por nicho/localidade | Jina Search, candidatos, revisão, importação, análise por Harness, score e conversão para CRM | Conector dedicado Google Maps/Places, se aprovado orçamento/termos; leitura e análise mais completas do site de cada candidato da busca; critérios/UX de pesquisa mais ricos |
| Radar de empresas recentes | Pesquisa CNPJa por filtros, candidatos e revisão | Tornar a jornada independente de defaults da própria YUX, validar disponibilidade do provedor para cada operação e aprofundar site/evidência quando houver URL |
| Radar como SaaS para clientes | Dados separados por `organization_id`; campanha parametrizada por segmento/região/oferta | Navegação/API ainda restritas a usuários internos YUX; mensagens de análise e metadados de conversão ainda assumem oferta YUX; autorização por contrato e papel de cliente precisa de implementação e teste |
| Radar → prospecção → CRM | Conversão em lead com proveniência; plano interno, permissão por canal, sequência, aprovação e execução controlada | Orquestração integrada e parametrizável para cada cliente, sem etapas manuais não declaradas; instrumentação de ponta a ponta e canário real por canal |
| IA no atendimento | Worker nativo recebe WhatsApp, consulta Harness, classifica, qualifica, propõe/envia resposta conforme política e grava entrega; várias conversas podem coexistir | Roteamento dinâmico entre perfis especializados no worker nativo; uso efetivo do assistente configurado por conexão; validação de escala/qualidade em produção |
| Missão planeja o ecossistema inteiro | Action Engine registra 46 capacidades com controles de execução | Radar e grande parte das funções de tela não são capacidades da missão; documento de produto ainda precisa ser ligado ao contexto do agente e mantido sincronizado |

Até essas lacunas serem resolvidas, a formulação correta é: **a YUX Hub combina módulos capazes de apoiar e executar grande parte da jornada comercial, com níveis de autonomia diferentes por etapa e workspace**. Uma jornada comercial totalmente autônoma, disponível a qualquer cliente SaaS, da busca no Maps ao primeiro contato e transferência entre vários agentes, **ainda não foi demonstrada pelo caminho de código atual**.

## 8. Fontes de manutenção e limites de confiança

Este catálogo foi compilado a partir do código e das referências abaixo. O código registrado prevalece sobre um plano quando houver divergência; a configuração viva do workspace prevalece sobre a possibilidade teórica do código. Documentos de plano/desenho podem incluir evoluções ainda não publicadas e devem ser usados apenas como contexto histórico.

- Navegação e módulos: [`frontend/src/App.tsx`](../frontend/src/App.tsx), [`frontend/src/lib/platform/moduleRegistry.ts`](../frontend/src/lib/platform/moduleRegistry.ts), [`docs/mapa-paginas-e-funcionalidades.md`](mapa-paginas-e-funcionalidades.md).
- Registro de missão: [`backend/src/modules/action-engine/capabilities/index.ts`](../backend/src/modules/action-engine/capabilities/index.ts) e definições da mesma pasta.
- Radar e empresas recém-abertas: [`backend/src/modules/radar/routes.ts`](../backend/src/modules/radar/routes.ts), [`backend/src/modules/radar/types.ts`](../backend/src/modules/radar/types.ts), [`frontend/src/components/radar/RadarWorkspace.tsx`](../frontend/src/components/radar/RadarWorkspace.tsx).
- Busca, leitura e análise Radar: [`backend/src/modules/radar/repository.ts`](../backend/src/modules/radar/repository.ts), [`backend/src/modules/radar/jinaClient.ts`](../backend/src/modules/radar/jinaClient.ts), [`backend/src/modules/radar/analysis-service.ts`](../backend/src/modules/radar/analysis-service.ts), [`frontend/src/lib/radar/radarRules.ts`](../frontend/src/lib/radar/radarRules.ts).
- Prospecção governada: [`backend/src/modules/prospecting/service.ts`](../backend/src/modules/prospecting/service.ts), [`backend/src/modules/prospecting/repository.ts`](../backend/src/modules/prospecting/repository.ts).
- CRM e automações: [`backend/src/modules/crm/routes.ts`](../backend/src/modules/crm/routes.ts), [`backend/src/modules/automations/routes.ts`](../backend/src/modules/automations/routes.ts), [`backend/src/modules/automations/journey.ts`](../backend/src/modules/automations/journey.ts).
- Conteúdo, aquisição e comunicação: [`backend/src/modules/marketing-studio/routes.ts`](../backend/src/modules/marketing-studio/routes.ts), [`backend/src/modules/landing-pages/routes.ts`](../backend/src/modules/landing-pages/routes.ts), [`backend/src/modules/campaigns/routes.ts`](../backend/src/modules/campaigns/routes.ts), [`backend/src/modules/omnichannel/routes.ts`](../backend/src/modules/omnichannel/routes.ts).
- Seleção de assistente e resposta nativa: [`backend/src/modules/omnichannel/assistant-context.ts`](../backend/src/modules/omnichannel/assistant-context.ts), [`backend/src/jobs/handlers/omnichannel.ts`](../backend/src/jobs/handlers/omnichannel.ts), [`backend/src/lib/edge-compat/strategy.ts`](../backend/src/lib/edge-compat/strategy.ts).
- Conhecimento da empresa: [`backend/src/modules/company-intelligence/routes.ts`](../backend/src/modules/company-intelligence/routes.ts), [`docs/company-intelligence-operations.md`](company-intelligence-operations.md).
- Estado e ressalvas de implantação: [`docs/implementation-status.md`](implementation-status.md) e runbooks de implantação; essas notas precisam ser conferidas com o deploy atual.
- Viabilidade de futura busca por locais (não implementada no Hub): [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) e [uso/faturamento da Places API](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

**Manutenção:** sempre que uma capacidade for adicionada, removida ou mudar efeito/aprovação, atualizar a seção 5; sempre que uma área do produto mudar seu fluxo, atualizar as seções 2–4 e os exemplos. Uma futura ingestão deste arquivo para o agente deve manter versão, proveniência, revisão humana e restrição de visibilidade, além de um mecanismo para revogar versões desatualizadas.
