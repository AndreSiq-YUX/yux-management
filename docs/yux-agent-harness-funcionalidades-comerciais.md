# YUX Hub - Documento Comercial E Funcional Da Plataforma

Este documento descreve a plataforma YUX Hub em linguagem comercial e
funcional. O objetivo e explicar o que a plataforma entrega, como as areas se
conectam, quais problemas resolve, quais ofertas permite criar e quais limites
devem ser comunicados ao cliente.

Este documento nao entra em detalhes tecnicos de implementacao, banco de dados,
rotas internas de codigo, migrations, endpoints ou arquitetura de software.

## Proposta Central

O YUX Hub e uma plataforma de operacao comercial, marketing, atendimento,
automacao, projetos, relatorios e inteligencia artificial para empresas que
querem crescer com mais previsibilidade.

A plataforma nao deve ser posicionada como um conjunto solto de modulos. O valor
esta em operar um sistema integrado:

- marketing atrai, aquece e gera oportunidades;
- CRM organiza leads, tarefas, follow-ups e propostas;
- atendimento conversa, qualifica, resolve e transfere quando necessario;
- automacoes reduzem trabalho manual e mantem disciplina operacional;
- projetos e aprovacoes organizam a entrega;
- relatorios mostram resultado, gargalos, MROI e proximas decisoes;
- IA apoia diagnostico, execucao, controle, recomendacao e melhoria continua.

Mensagem comercial recomendada:

> A YUX implanta uma operacao inteligente de crescimento que conecta marketing,
> vendas, atendimento, automacao, projetos, indicadores e IA para gerar caixa,
> reduzir perdas comerciais e aumentar previsibilidade.

## Diferencial Comercial

O diferencial da plataforma esta em unir consultoria, operacao e tecnologia no
mesmo ambiente.

Em vez de vender apenas site, CRM, chatbot, campanha ou automacao, a YUX pode
vender uma estrutura completa de crescimento:

- diagnostico comercial;
- implantacao de processo;
- CRM e funil;
- WhatsApp e atendimento com IA;
- campanhas e landing pages;
- conteudo e Marketing Studio;
- automacoes por objetivo;
- relatorios executivos;
- melhoria continua com base em dados;
- acompanhamento consultivo.

Isso permite posicionar a YUX como parceira de crescimento, nao como fornecedora
de ferramenta.

## Publicos Da Plataforma

### Administracao Interna YUX

Area usada pela equipe YUX para administrar a plataforma, clientes, contratos,
modulos, integracoes, modelos setoriais, agentes de IA, saude operacional e
financeiro.

Serve para:

- configurar a operacao dos clientes;
- controlar o que cada cliente contratou;
- aplicar modelos setoriais;
- acompanhar saude da plataforma;
- configurar provedores e canais;
- operar clientes de maneira assistida;
- preparar diagnosticos, propostas e projetos;
- acompanhar custos, riscos e qualidade.

### Workspaces Dos Clientes

Area usada pela equipe YUX para operar em nome de um cliente, com contexto,
modulos e permissoes daquele cliente.

Serve para:

- entrar no cliente certo antes de operar;
- evitar mistura de dados entre clientes;
- executar CRM, marketing, atendimento, projetos e relatorios como operacao
  assistida;
- gerenciar a propria YUX como cliente, quando a YUX quiser operar seu
  crescimento interno usando a mesma experiencia, pelo workspace fixado
  `Crescimento YUX`.

### Portal Do Cliente

Area usada pelo cliente para acompanhar sua operacao, aprovar entregas, ver
resultados, abrir suporte, consultar financeiro e interagir com as areas
contratadas.

Serve para:

- dar transparencia;
- reduzir comunicacao dispersa;
- centralizar aprovacoes;
- mostrar resultado;
- manter o cliente dentro de uma jornada clara;
- separar o que e visivel para o cliente do que e operacional interno da YUX.

### Paginas Publicas

Areas acessiveis fora do ambiente autenticado, como login, revisao publica de
proposta e sessoes de webchat.

Serve para:

- entrada segura na plataforma;
- revisao de propostas por token;
- atendimento publico quando configurado.

## Estrutura Comercial Da Plataforma

### 1. Admin YUX Hub

Funcao:

- governar a operacao da plataforma;
- administrar clientes, contratos, pacotes, modulos, limites, provedores e
  integracoes;
- acompanhar saude operacional;
- separar configuracoes internas da experiencia do cliente.

Valor comercial:

- permite escalar a operacao da YUX com mais controle;
- reduz configuracao manual dispersa;
- melhora padronizacao de implantacao;
- permite vender pacotes e modulos com governanca.

Principais capacidades:

- visao geral administrativa;
- Clientes & Contratos;
- Catalogo de Modulos;
- Modelos Setoriais;
- Integracoes Globais;
- IA / Modelos / Custos;
- Strategy Engine;
- Canais;
- Email;
- Saude da Plataforma;
- Faturas, cobrancas e receita.

### 2. Clientes, Contratos, Pacotes E Modulos

Funcao:

- transformar clientes em contas organizadas;
- vincular contratos ativos;
- controlar pacotes vendidos;
- habilitar modulos contratados;
- organizar limites e permissoes;
- conectar escopo comercial com acesso real no portal.

Valor comercial:

- evita vender algo que depois nao aparece no portal;
- cria clareza entre proposta, contrato, entrega e acesso;
- facilita upsell e expansao;
- ajuda a controlar clientes ativos, pausados e encerrados.

Principais capacidades:

- cadastro e gestao de clientes;
- contratos por cliente;
- pacotes comerciais;
- modulos contratados;
- limites e regras por cliente;
- aplicacao de modelos setoriais;
- conversao de lead fechado em cliente oficial.

### 3. Conversao De Lead Em Cliente

Funcao:

- pegar um lead fechado no workspace comercial e transforma-lo em cliente real
  da plataforma.

Valor comercial:

- fecha o ciclo entre venda e implantacao;
- reduz retrabalho administrativo;
- preserva origem comercial, pacote vendido e contexto do lead;
- permite iniciar contrato e onboarding com mais velocidade.

Principais capacidades:

- selecionar lead ganho;
- preencher dados do cliente;
- criar cliente e organizacao;
- criar contrato ativo;
- habilitar modulos do pacote;
- aplicar modelo setorial quando necessario;
- marcar lead como convertido.

### 4. Workspaces Dos Clientes

Funcao:

- permitir que a YUX opere cada cliente com contexto isolado.

Valor comercial:

- transforma a YUX em operadora assistida da jornada do cliente;
- reduz erro de operar no cliente errado;
- permite prestacao de servico recorrente dentro da mesma ferramenta;
- aproxima consultoria, execucao e acompanhamento.

Principais capacidades:

- selecao obrigatoria do cliente antes da operacao;
- workspace interno fixado para `Crescimento YUX`;
- menu espelhado ao Portal do Cliente;
- operacao de CRM, atendimento, marketing, automacoes, projetos, relatorios,
  suporte e financeiro;
- contexto de contrato e modulos ativos;
- troca segura entre clientes.

Uso pela propria YUX:

- a YUX nao deve operar CRM, marketing e atendimento dentro do Admin geral;
- o Admin governa plataforma, agentes, packs, modelos, custos e permissoes;
- o workspace `Crescimento YUX` executa a operacao diaria da propria YUX;
- nesse workspace, CRM, Omnichannel IA, Marketing Studio e Relatorios podem
  acessar a inteligencia aprovada no Strategy Engine;
- isso evita misturar configuracao da plataforma com rotina comercial interna.

### 5. Portal Do Cliente Por Jornada

Funcao:

- organizar a experiencia do cliente por areas de trabalho reais, nao por nomes
  tecnicos de modulos.

Valor comercial:

- aumenta percepcao de valor;
- reduz confusao para o cliente;
- torna a entrega mais tangivel;
- facilita aprovacao, acompanhamento e colaboracao.

Areas do portal:

- Visao Geral;
- Empresa;
- Comercial;
- Atendimento & IA;
- Marketing;
- Automacoes;
- Projetos;
- Relatorios;
- Suporte;
- Financeiro;
- Configuracoes da Conta.

## Modulos Funcionais

### Empresa

Funcao:

- centralizar informacoes da empresa, equipe, marca, conhecimento e integracoes.

Valor comercial:

- melhora a qualidade da IA, do atendimento, do conteudo e das campanhas;
- reduz perda de contexto;
- cria uma fonte compartilhada de informacoes do cliente.

Principais capacidades:

- perfil da empresa;
- usuarios e equipe;
- base de conhecimento;
- marca e tom de voz;
- promessas permitidas e proibidas;
- restricoes legais e comerciais;
- integracoes da empresa.

### CRM E Growth Workspace

Funcao:

- organizar leads, contatos, funis, tarefas, follow-ups, propostas, fontes,
  atividades e inteligencia comercial.

Valor comercial:

- reduz leads esquecidos;
- melhora disciplina de vendas;
- aumenta velocidade de resposta;
- cria previsibilidade de funil;
- conecta marketing, atendimento e propostas.

Principais capacidades:

- Registro 360 do lead;
- kanban e lista;
- tarefas e follow-ups;
- calendario comercial;
- funis e etapas;
- fontes e atribuicao;
- Lead 360 com historico, associacoes, conversas e propostas;
- importacao CSV;
- segmentos inteligentes;
- proximas acoes;
- insights comerciais;
- indicadores por etapa e origem.

### Campanha 360

Funcao:

- planejar campanhas por objetivo, conectando publico, oferta, landing page,
  criativos, anuncios, mensagens, automacoes, aprovacoes e relatorios.

Valor comercial:

- evita campanha solta sem funil;
- conecta marketing ao CRM;
- melhora clareza de objetivo;
- facilita medicao de retorno.

Principais capacidades:

- objetivo de campanha;
- checklist de ativos;
- segmento alvo;
- landing page associada;
- formulario;
- criativos;
- anuncio;
- post organico;
- mensagem de follow-up;
- automacao;
- aprovacao;
- relatorio.

### Atendimento & IA

Funcao:

- centralizar conversas, canais, agentes de IA, filas, handoff e atendimento
  humano.

Valor comercial:

- reduz tempo de resposta;
- melhora organizacao de conversas;
- conecta atendimento ao CRM;
- permite IA com supervisao;
- ajuda a transformar conversas em oportunidades.

Principais capacidades:

- inbox de conversas;
- WhatsApp, Instagram, Messenger, webchat e canais futuros;
- historico de mensagens;
- status e filas;
- handoff humano;
- respostas sugeridas;
- AI run e custo;
- vinculo com lead ou contato;
- assistente configuravel;
- canais conectados e status de reautenticacao;
- simulador e operacao controlada.

### Agentes Conversacionais

Funcao:

- permitir que cada cliente tenha uma ou mais IAs no atendimento, conforme o
  projeto.

Valor comercial:

- permite vender atendimento com IA de forma mais sofisticada;
- separa SDR, closer, suporte e retencao;
- evita um bot generico que tenta fazer tudo;
- permite autonomia progressiva com aprovacao humana quando necessario.

Exemplos de agentes:

- IA SDR para captar, qualificar e agendar;
- IA Closer para acompanhar propostas e objecoes;
- IA Suporte para atendimento receptivo;
- IA Retencao para relacionamento e renovacao;
- IA Recuperacao para ex-clientes e oportunidades perdidas.

### Marketing Studio

Funcao:

- organizar ideias, conteudo, calendario, aprovacoes, agentes, criativos,
  publicacao, pesquisa, grounding e campanhas.

Valor comercial:

- transforma producao de conteudo em processo comercial;
- reduz conteudo solto sem objetivo;
- conecta conteudo com campanha, CRM, marca e base de conhecimento;
- permite controle de qualidade e aprovacao.

Principais capacidades:

- ideias e pautas;
- conteudo organico;
- calendario editorial;
- agentes de pesquisa, redacao, revisao e campanha;
- revisao de marca;
- grounding e fontes;
- criativos de campanha;
- rascunhos para Meta/Google;
- publicacao WordPress;
- publicacao social quando conectada;
- aprovacoes do cliente;
- creditos e uso de IA.

### Landing Pages

Funcao:

- criar e acompanhar paginas de captura, oferta e conversao.

Valor comercial:

- cria ativos de funil;
- permite aprovar paginas antes de publicar;
- conecta visitas, leads e conversao;
- ajuda a testar oferta e copy.

Principais capacidades:

- paginas e versoes;
- status e aprovacoes;
- formularios;
- visitas, leads e conversao;
- preview;
- vinculo com campanhas.

### Campanhas, Ads E MROI

Funcao:

- acompanhar campanhas, criativos, midia paga, gasto, leads, CPL, clientes,
  receita e retorno.

Valor comercial:

- muda a conversa de "quantos leads gerou" para "quanto resultado gerou";
- ajuda a reduzir desperdicio de verba;
- mostra onde investir, pausar ou ajustar;
- diferencia a YUX de operacoes que medem apenas clique e lead.

Principais capacidades:

- campanhas Meta, Google ou manuais;
- criativos e variacoes;
- status de provedor;
- sincronizacao de metricas;
- gasto, impressoes, cliques, leads e CPL;
- oportunidades, propostas, clientes e receita;
- MROI;
- alertas de performance;
- recomendacoes executivas.

### Automacoes

Funcao:

- automatizar rotinas comerciais, atendimento, marketing, aprovacoes e tarefas.

Valor comercial:

- reduz trabalho manual;
- aumenta disciplina operacional;
- padroniza follow-up;
- permite escalar atendimento e vendas sem depender so de memoria humana.

Principais capacidades:

- construtor visual;
- logica Quando/Se/Entao;
- templates por setor;
- automacoes guiadas por objetivo;
- simulacao antes de publicar;
- versoes e rollback;
- execucoes e logs;
- operacoes em massa;
- integracao com CRM, WhatsApp, email e IA;
- biblioteca de materiais;
- limites de upload.

Objetivos de automacao:

- responder lead novo;
- follow-up de proposta;
- reativar cliente;
- confirmar agendamento;
- lembrar atendimento;
- criar tarefa para vendedor;
- avisar CPL alto;
- pedir aprovacao de criativo.

### Projetos E Aprovacoes

Funcao:

- organizar entregas, tarefas, documentos, aprovacoes e comunicacao de projeto.

Valor comercial:

- reduz desalinhamento com o cliente;
- centraliza pendencias;
- melhora percepcao de entrega;
- cria rastreabilidade de aprovacao.

Principais capacidades:

- projetos;
- fases;
- tarefas;
- entregaveis;
- timeline;
- documentos;
- aprovacoes;
- fila consolidada de pendencias;
- aprovacao, rejeicao ou pedido de ajuste.

### Relatorios

Funcao:

- consolidar indicadores comerciais, marketing, atendimento, propostas,
  campanhas, landing pages, automacoes e projetos.

Valor comercial:

- transforma dados em decisao;
- mostra resultado para o cliente;
- ajuda a justificar investimento;
- identifica gargalos operacionais.

Principais capacidades:

- presets de relatorio;
- funil comercial;
- performance de campanhas;
- ROI por origem;
- conversao de landing pages;
- follow-up WhatsApp;
- impacto de automacoes;
- onboarding por setor;
- prontidao de marca e conhecimento;
- resumo de IA;
- ressalvas quando atribuicao estiver incompleta.

### Suporte

Funcao:

- permitir que clientes abram e acompanhem chamados.

Valor comercial:

- tira suporte de conversas soltas;
- melhora SLA e historico;
- organiza prioridade e status;
- separa suporte de projeto e de atendimento comercial.

Principais capacidades:

- abertura de chamado;
- mensagens;
- status;
- prioridade;
- categoria;
- SLA simples;
- historico;
- visao interna e visao do cliente.

### Financeiro

Funcao:

- dar visibilidade a faturas, valores, vencimentos e pagamentos.

Valor comercial:

- reduz duvidas financeiras;
- facilita acompanhamento de recebiveis;
- separa relacao financeira da operacao de marketing/vendas.

Principais capacidades:

- faturas;
- itens de cobranca;
- aberto, pago, vencido e proximo vencimento;
- visao interna de contas a receber;
- visao do cliente para consulta.

## Strategy Engine E Agent Harness

Funcao:

- ser a camada de inteligencia estrategica e operacional da plataforma.

Valor comercial:

- eleva a YUX de ferramenta para consultoria com IA aplicada;
- ajuda a padronizar raciocinio comercial;
- permite agentes especializados por funcao;
- cria rastreabilidade de decisoes;
- coleta resultado para melhorar playbooks, prompts e recomendacoes.

Principais capacidades:

- Growth Strategist interno;
- Strategy Packs;
- ingestao guiada de conhecimento;
- revisao e publicacao de itens curados;
- bindings entre pack, agente, modulo, canal, workflow e workspace;
- CRM Controller;
- AI SDR / Comercial 1;
- AI Closer;
- Customer Growth / Comercial 2;
- Revenue Recovery;
- Offer & Conversion;
- Marketing Studio Agent;
- Metrics & Cash;
- suporte a subagentes especializados;
- workflows estrategicos;
- execution trace;
- autonomy policies;
- learning signals;
- recommendation queue;
- shadow experiments.

### Strategy Packs

Funcao:

- transformar conhecimento estrategico privado, playbooks internos, materiais
  de cliente e aprendizados da operacao em pacotes governados de inteligencia.

Valor comercial:

- impede que a IA dependa apenas de prompts longos ou busca textual;
- cria uma metodologia YUX versionada, revisavel e reutilizavel;
- permite separar conhecimento interno da YUX de conhecimento especifico de
  clientes;
- torna possivel usar o mesmo raciocinio em CRM, atendimento, marketing,
  propostas e relatorios;
- prepara a plataforma para vender consultoria high ticket com um diferencial
  proprietario de IA.

Principais capacidades:

- cadastrar um pack de estrategia;
- registrar fontes privadas ou playbooks internos;
- criar jobs de ingestao guiada;
- transformar fonte em concept cards, playbooks, rubricas, chunks e regras;
- revisar itens antes de publicar;
- aprovar ou arquivar itens;
- publicar pack;
- vincular pack a workspace, agente, modulo, canal ou workflow;
- manter o conhecimento interno sem expor fonte sensivel ao cliente.

Exemplos de packs:

- doutrina comercial interna YUX;
- playbook de diagnostico 48h;
- playbook de AI SDR;
- playbook de recuperacao de caixa;
- playbook de CRM Controller;
- pack de um nicho especifico;
- pack especifico de um cliente.

### Crescimento YUX

Funcao:

- permitir que a propria YUX use a plataforma como cliente operacional, mas com
  acesso aos Strategy Packs internos e ao harness estrategico.

Valor comercial:

- a YUX pratica internamente a mesma metodologia que vende;
- a equipe consegue usar CRM, atendimento, marketing e relatorios com a
  inteligencia estrategica propria;
- o Admin continua limpo como area de governanca;
- a operacao diaria fica no mesmo padrao que sera oferecido a clientes;
- facilita demonstracao comercial e melhoria continua da metodologia.

Principais capacidades:

- aparece como workspace fixado em Workspaces dos Clientes;
- possui contrato tecnico interno e modulos habilitados;
- usa CRM para leads e oportunidades da propria YUX;
- usa Omnichannel IA para conversas e qualificacao;
- usa Marketing Studio para conteudo e campanhas da YUX;
- usa Relatorios para diagnostico, caixa, MROI e gargalos;
- exibe paineis contextuais do Strategy Harness dentro dos modulos;
- aponta para o chat estrategico do Admin quando a decisao exigir analise mais
  ampla.

### Paineis Contextuais Do Harness

Funcao:

- levar a inteligencia dos agentes para o lugar onde a operacao acontece.

Valor comercial:

- reduz a distancia entre estrategia e execucao;
- evita que o usuario precise lembrar qual agente chamar;
- ajuda cada modulo a sugerir a decisao certa;
- torna o sistema mais parecido com uma operacao assistida por IA estrategica.

Exemplos:

- no CRM, o painel chama o CRM Controller para leads parados, objecoes e
  proximas acoes;
- no Omnichannel, chama AI SDR ou agente de conversa para qualificar,
  revisar resposta e detectar handoff;
- no Marketing Studio, chama Marketing Strategist para pauta, funil, conteudo
  e criativos;
- nos Relatorios, chama Metrics & Cash para diagnostico, prioridades de caixa e
  plano de acao.

Workflows estrategicos:

- diagnostico 48h;
- analise inicial de prospect;
- plano ideal de servicos;
- proposta consultiva;
- roadmap 30/60/90;
- auditoria de CRM e follow-up;
- recuperacao de caixa;
- revisao de oferta e copy;
- analise de carteira e Comercial 2.

## Base De Conhecimento E Marca

Funcao:

- transformar conhecimento do cliente e metodologia da YUX em contexto
  operacional para atendimento, marketing, IA, campanhas e relatorios.

Valor comercial:

- melhora qualidade das respostas;
- reduz erro de tom e promessa;
- acelera criacao de conteudo;
- ajuda a manter consistencia entre campanha, WhatsApp, proposta e entrega.

Principais fontes:

- perfil da empresa;
- produtos e servicos;
- diferenciais;
- perguntas frequentes;
- objecoes comerciais;
- tom de voz;
- palavras proibidas;
- promessas permitidas;
- restricoes legais;
- documentos internos;
- materiais aprovados;
- playbooks YUX.

## Modelos Setoriais

Funcao:

- acelerar implantacao com modelos por nicho, como clinicas, imobiliarias,
  revendas, oficinas, agencias e outros segmentos.

Valor comercial:

- reduz tempo de setup;
- torna a entrega mais especifica por mercado;
- ajuda a vender pacotes verticalizados;
- cria padrao de funil, automacao, relatorio e mensagem por setor.

Principais capacidades:

- funil recomendado;
- etapas comerciais;
- campos importantes;
- templates de mensagem;
- automacoes sugeridas;
- relatorios padrao;
- modulos recomendados;
- checklist de onboarding.

## Integracoes E Canais

Funcao:

- conectar a plataforma a canais e provedores usados na operacao real do
  cliente.

Valor comercial:

- reduz trabalho manual;
- aproxima dados de marketing, vendas e atendimento;
- permite operacao real com canais do cliente;
- aumenta capacidade de mensurar resultado.

Integracoes e canais previstos ou implementados por area:

- WhatsApp;
- Instagram;
- Facebook Messenger;
- webchat;
- email;
- SMTP2GO;
- WordPress;
- Meta/Facebook/Instagram publishing;
- Meta Ads;
- Google Ads;
- Google Business Profile;
- provedores de IA;
- webhooks e automacoes externas.

## Governanca De IA

Funcao:

- controlar como IA atua, quando pode responder, quando deve sugerir e quando
  precisa de aprovacao humana.

Valor comercial:

- permite vender IA com seguranca;
- evita promessas indevidas;
- reduz risco comercial e reputacional;
- torna o uso de IA auditavel.

Regras importantes:

- IA nao concede desconto sem permissao;
- IA nao altera contrato;
- IA nao promete prazos, resultados ou condicoes sensiveis sem aprovacao;
- IA deve transferir para humano quando ultrapassar escopo;
- agentes podem atuar com niveis diferentes de autonomia;
- acoes sensiveis devem ser aprovadas;
- toda decisao relevante deve deixar historico.

Niveis de autonomia:

- rascunho;
- sugestao;
- envio automatico;
- aprovacao obrigatoria;
- handoff humano;
- bloqueado.

## Active Learning Controlado

Funcao:

- aprender com resultados reais sem permitir que a plataforma altere producao
  sozinha.

Valor comercial:

- acumula inteligencia proprietaria da YUX;
- identifica playbooks, prompts e abordagens melhores;
- melhora recomendacoes por nicho, etapa, canal e objecao;
- permite evoluir sem transformar a operacao em caixa-preta.

O sistema pode observar:

- resposta positiva, negativa ou neutra;
- agendamento;
- venda;
- perda;
- recuperacao;
- churn;
- silencio;
- aprovacao ou rejeicao humana;
- custo;
- qualidade percebida.

O sistema pode sugerir:

- novo playbook;
- ajuste de abordagem;
- melhoria de prompt;
- melhor modelo por tarefa;
- reranking de cards e conhecimentos;
- nova campanha;
- novo template;
- alerta de baixa performance.

Limite:

- a plataforma pode recomendar;
- a YUX aprova;
- mudancas produtivas devem ter versionamento, teste controlado, rollout e
  rollback.

## Ofertas Comerciais Que A Plataforma Permite

### Diagnostico Comercial 48h

Entrega:

- leitura do funil;
- gargalos comerciais;
- perdas de caixa;
- oportunidades rapidas;
- recomendacao de plano YUX.

### Implantacao De CRM Comercial

Entrega:

- funil;
- etapas;
- tarefas;
- follow-ups;
- Registro 360;
- importacao inicial;
- rotina comercial.

### WhatsApp IA E Atendimento Inteligente

Entrega:

- canais conectados;
- agente SDR, suporte, closer ou retencao;
- handoff humano;
- scripts;
- aprovacoes;
- relatorios de atendimento.

### Sprint De Recuperacao De Caixa

Entrega:

- ex-clientes;
- propostas perdidas;
- leads antigos;
- campanha de reativacao;
- follow-up assistido;
- relatorio de recuperacao.

### Growth Workspace Completo

Entrega:

- CRM;
- Campanha 360;
- segmentos;
- landing pages;
- automacoes;
- relatorios;
- cockpit Ads/MROI.

### Marketing Studio E Conteudo Comercial

Entrega:

- estrategia editorial;
- conteudo por etapa do funil;
- criativos;
- revisao de marca;
- calendario;
- publicacao e aprovacoes.

### Gestao De Campanhas E MROI

Entrega:

- campanhas Meta/Google;
- criativos;
- landing pages;
- relatorios;
- leitura de CPL, conversao, receita e MROI.

### Customer Growth / Comercial 2

Entrega:

- carteira de clientes;
- segunda venda;
- upsell;
- indicacoes;
- retencao;
- risco de churn.

### Portal Do Cliente E Operacao Assistida

Entrega:

- portal de acompanhamento;
- projetos;
- aprovacoes;
- relatorios;
- suporte;
- financeiro;
- workspace assistido pela YUX.

### Gestao Continua De Performance

Entrega:

- reunioes recorrentes;
- ajuste de playbooks;
- melhoria de funil;
- relatorios executivos;
- melhoria de agentes;
- novas campanhas;
- acompanhamento de indicadores.

## Indicadores De Sucesso

Indicadores comerciais:

- leads gerados;
- leads qualificados;
- tempo de primeira resposta;
- SLA de follow-up;
- leads sem proxima acao;
- reunioes agendadas;
- propostas enviadas;
- taxa de fechamento;
- ticket medio;
- receita atribuida;
- receita recuperada;
- LTV;
- churn;
- indicacoes.

Indicadores de marketing:

- visitas;
- conversao de landing pages;
- cliques;
- CPL;
- campanhas ativas;
- criativos aprovados;
- MROI;
- receita por origem;
- qualidade de lead.

Indicadores de atendimento:

- conversas abertas;
- conversas resolvidas;
- tempo de resposta;
- handoff correto;
- perguntas sem resposta;
- satisfacao;
- reautenticacoes pendentes.

Indicadores de IA:

- custo por execucao;
- custo por resultado;
- respostas aprovadas;
- respostas rejeitadas;
- recomendacoes uteis;
- falhas;
- bloqueios por politica;
- melhorias sugeridas.

Indicadores operacionais:

- aprovacoes pendentes;
- projetos em atraso;
- tarefas vencidas;
- automacoes ativas;
- execucoes com erro;
- chamados abertos;
- faturas vencidas.

## Nichos Com Melhor Aderencia

A plataforma tende a gerar mais valor onde existe volume de leads, atendimento,
propostas, recorrencia ou necessidade de acompanhamento consultivo.

Nichos prioritarios:

- clinicas e saude;
- imobiliarias;
- revendas e concessionarias;
- oficinas e servicos automotivos;
- cursos, escolas e infoprodutos premium;
- consultorias;
- servicos profissionais;
- franquias;
- negocios locais com recorrencia;
- B2B com ciclo de venda consultivo.

## Jornada Comercial Recomendada

### Entrada

- diagnostico 48h;
- auditoria de funil;
- auditoria de atendimento;
- revisao de oferta;
- recuperacao de caixa.

### Implantacao

- CRM;
- canais;
- base de conhecimento;
- marca e tom de voz;
- funil;
- automacoes essenciais;
- relatorios iniciais.

### Operacao

- WhatsApp IA;
- Marketing Studio;
- Campanha 360;
- landing pages;
- aprovacao de criativos;
- follow-up;
- suporte.

### Crescimento

- MROI;
- segmentos;
- recuperacao;
- customer growth;
- upsell;
- indicacoes;
- Active Learning controlado.

## Limites Comerciais E O Que Nao Prometer

A YUX nao deve vender a plataforma como:

- chatbot magico que vende sozinho;
- substituto total do time comercial;
- garantia absoluta de vendas;
- solucao que corrige oferta ruim sem trabalho estrategico;
- automacao 100% autonoma desde o primeiro dia;
- IA sem governanca;
- ERP financeiro completo;
- sistema fiscal;
- ferramenta de suporte enterprise completa;
- substituto de gestao humana.

A promessa correta:

> A YUX Hub organiza, automatiza e potencializa a operacao de crescimento,
> usando tecnologia e IA para aumentar disciplina, velocidade, qualidade e
> previsibilidade comercial.

## Roadmap Comercial De Uso

### Fase 1 - Fundacao

- cliente;
- contrato;
- modulos;
- portal;
- CRM;
- base de conhecimento;
- marca.

### Fase 2 - Operacao Comercial

- funil;
- tarefas;
- follow-up;
- propostas;
- WhatsApp;
- segmentos;
- automacoes essenciais.

### Fase 3 - Marketing E Campanhas

- Marketing Studio;
- landing pages;
- campanhas;
- criativos;
- calendario;
- aprovacoes;
- relatorios.

### Fase 4 - IA Operacional

- agentes de atendimento;
- CRM Controller;
- Strategy Engine;
- workflows estrategicos;
- execution trace;
- autonomia configuravel.

### Fase 5 - Crescimento E Inteligencia

- MROI;
- recuperacao de caixa;
- Comercial 2;
- customer growth;
- Active Learning;
- melhoria continua por resultado.

## Resumo Executivo

O YUX Hub e uma plataforma completa para operar crescimento comercial com
consultoria, tecnologia e IA. Ela conecta CRM, atendimento, marketing,
automacoes, projetos, relatorios, suporte, financeiro, portal do cliente,
administracao interna e inteligencia artificial em uma unica operacao.

Para a YUX, a plataforma permite vender projetos de maior ticket, prestar
servicos recorrentes com mais controle e construir uma metodologia proprietaria
de crescimento. Para o cliente, entrega mais organizacao, velocidade,
transparencia, previsibilidade e foco em resultado.
