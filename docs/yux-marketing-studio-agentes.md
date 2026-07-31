# YUX Marketing Studio — Agentes de Marketing com IA

**Versão:** 1.0
**Data:** 2026-06-05
**Contexto:** Nova área do YUX Hub/YUX OS para operação multi-cliente de marketing assistido por agentes de IA, com foco em conteúdo orgânico, campanhas pagas, criativos, calendário editorial, aprovações, publicação controlada, análise de performance e aprendizado contínuo.

---

## 1. Visão Geral

O **YUX Marketing Studio** é uma nova área modular do YUX Hub voltada para planejar, criar, revisar, aprovar, publicar e analisar ações de marketing com o apoio de agentes de IA.

A área deve atender dois cenários comerciais principais:

1. **Serviço gerenciado pela YUX**
   A YUX configura e opera os agentes, fluxos, fontes, ferramentas e publicações. O cliente visualiza calendário, conteúdos, campanhas, relatórios e aprovações, mas não precisa controlar a parte técnica.

2. **Uso assistido pelo cliente**
   Clientes com maior maturidade podem controlar parcialmente tom de voz, preferências visuais, fontes, calendário, aprovações e, futuramente, configurações avançadas de agentes e fluxos.

A estratégia é construir uma solução **multi-cliente desde o início**, mas com níveis de permissão e exposição diferentes por contrato, pacote e maturidade do cliente.

O objetivo não é criar um construtor genérico de agentes como OpenCloud, Hermes ou CrewAI Studio. O objetivo é criar uma plataforma vertical, opinativa e comercialmente vendável para **marketing de PMEs**, integrada ao YUX Hub, CRM, Campanhas, Landing Pages, WhatsApp IA, Relatórios e Automações.

---

## 2. Objetivos do Módulo

### 2.1 Objetivos comerciais

- Tornar a oferta de marketing da YUX mais tangível, visual e vendável.
- Reduzir tempo de pesquisa, planejamento, criação e revisão de conteúdo.
- Aumentar a produtividade interna da YUX na própria divulgação.
- Criar uma vitrine poderosa dentro do YUX Hub para clientes acompanharem o trabalho.
- Transformar fluxos internos bem-sucedidos em blueprints vendáveis para clientes.
- Permitir pacotes mensais com créditos de IA, gerando nova fonte de receita recorrente.
- Diferenciar a YUX de agências tradicionais que operam com planilhas, grupos de WhatsApp e aprovações soltas.

### 2.2 Objetivos operacionais

- Centralizar ideias, pautas, posts, artigos, criativos, campanhas e calendário.
- Conectar conteúdo orgânico e campanhas pagas em um único ecossistema.
- Permitir pesquisa e curadoria assistida por IA com fontes controladas.
- Aplicar base de conhecimento da marca, tom de voz e regras setoriais.
- Exigir aprovação humana antes de ações sensíveis, como publicação ou criação de campanhas.
- Medir custo, qualidade, uso de ferramentas, tokens, créditos e resultados.
- Criar rastreabilidade completa das decisões dos agentes.

### 2.3 Objetivos técnicos

- Usar **LangGraph** como runtime principal dos fluxos agentic.
- Criar um **YUX Agent Harness** para controle de contexto, ferramentas, custos, qualidade, memória e segurança.
- Manter o frontend React/Vite como interface, sem executar lógica pesada de agentes no navegador.
- Usar Supabase como núcleo operacional de dados, permissões, logs e RLS.
- Usar backend/workers Python para execução dos fluxos LangGraph.
- Usar n8n apenas para integrações simples, webhooks e tarefas periféricas, quando fizer sentido.
- Usar Jina AI com prudência para leitura, grounding e reranking somente quando necessário.

---

## 3. Posicionamento do Produto

### 3.1 Nome sugerido

**YUX Marketing Studio**

### 3.2 Submódulo comercial

**Agentes de Marketing IA**

### 3.3 Promessa comercial

> Planeje, crie, aprove, publique e analise conteúdos e campanhas com agentes de IA conectados ao seu calendário, CRM, campanhas, landing pages e base de conhecimento — sempre com controle humano e transparência pelo YUX Hub.

### 3.4 O que não é

O YUX Marketing Studio não deve ser apresentado como:

- ferramenta genérica de automação sem foco;
- substituto total de uma equipe de marketing;
- agente autônomo sem supervisão;
- plataforma de publicação irrestrita em todas as redes;
- concorrente direto de RD Station, GoHighLevel, HubSpot ou OpenCloud;
- construtor universal de agentes para qualquer finalidade.

### 3.5 O que é

O YUX Marketing Studio deve ser apresentado como:

- esteira de marketing assistida por IA;
- cockpit de produção e aprovação de conteúdo;
- central de ideias, pautas, campanhas e criativos;
- camada inteligente conectada ao CRM, WhatsApp, landing pages e campanhas;
- ferramenta operacional da YUX para entregar marketing com mais escala e controle;
- produto/serviço futuro para clientes que desejam operar marketing com IA.

---

## 4. Princípios de Design

### 4.1 Multi-cliente desde o início

Toda entidade deve estar vinculada a:

- organização;
- cliente;
- contrato;
- módulo ativo;
- usuário/responsável;
- permissões.

Mesmo que a YUX seja o primeiro usuário real, a estrutura deve nascer preparada para operar vários clientes sem retrabalho.

### 4.2 Serviço gerenciado como padrão

Para a maioria das PMEs, o modo padrão deve ser **Managed by YUX**:

- YUX configura agentes;
- YUX define fluxos;
- YUX escolhe modelos;
- YUX controla ferramentas;
- cliente acompanha e aprova;
- cliente solicita ajustes;
- cliente não precisa entender tokens, APIs, embeddings ou LangGraph.

### 4.3 Controle parcial para clientes maduros

Clientes podem ter controle progressivo sobre:

- tom de voz;
- persona;
- preferências visuais;
- canais permitidos;
- frequência de publicação;
- temas proibidos;
- temas prioritários;
- aprovações;
- fontes monitoradas;
- objetivos do mês;
- estilo de imagem;
- limites de uso.

### 4.4 Controle avançado restrito

Configurações avançadas devem ficar visíveis apenas para:

- equipe interna YUX;
- operadores autorizados;
- agências parceiras em plano avançado;
- clientes técnicos com permissão específica.

Configurações avançadas incluem:

- edição de nós do fluxo;
- ferramentas permitidas por agente;
- prompts base;
- modelo LLM por agente;
- limites de custo;
- políticas de fallback;
- uso de BYOK;
- regras de publicação.

### 4.5 Human-in-the-loop obrigatório

Nenhum conteúdo deve ser publicado automaticamente sem configuração explícita de aprovação.

Aprovação humana deve ser obrigatória para:

- publicação em redes sociais;
- publicação em WordPress;
- criação ou alteração de campanha paga;
- geração de imagem premium;
- mensagens sensíveis;
- afirmações com dados, estatísticas ou promessas comerciais;
- conteúdos de saúde, finanças, jurídico ou setores regulados.

### 4.6 Agentes focados, não livres

Agentes devem ter papéis claros e ferramentas limitadas. Não deve existir no MVP um agente genérico com liberdade para navegar, publicar, alterar campanhas e editar banco sem limites.

### 4.7 Custos sempre rastreáveis

Toda execução deve registrar:

- agente;
- workflow;
- cliente;
- modelo usado;
- tokens;
- ferramenta usada;
- custo estimado;
- créditos consumidos;
- status;
- output;
- logs;
- erros.

---

## 5. Estrutura de Interface

A área deve ser organizada para não confundir o cliente. Conteúdo orgânico e campanhas pagas devem ser separados visualmente, mas conectados operacionalmente.

### 5.1 Menu sugerido

**Marketing Studio**

- Visão Geral
- Conteúdo Orgânico
- Campanhas & Criativos
- Calendário Editorial
- Aprovações
- Ideias & Radar
- Agentes & Fluxos
- Base de Conhecimento
- Fontes Monitoradas
- Performance
- Créditos & Uso
- Configurações

### 5.2 Visão interna YUX

A visão interna deve ser mais densa e operacional:

- todos os clientes;
- status dos fluxos;
- execuções recentes;
- fila de aprovação;
- calendário por cliente;
- agentes ativos;
- falhas;
- consumo de créditos;
- custos por cliente;
- oportunidades de conteúdo;
- pendências de publicação.

### 5.3 Portal do cliente

A visão do cliente deve ser mais simples:

- calendário;
- conteúdos em produção;
- conteúdos aguardando aprovação;
- campanhas e criativos;
- relatórios;
- solicitações de alteração;
- créditos restantes, se aplicável;
- preferências de tom e marca;
- histórico de aprovações.

### 5.4 Separação entre orgânico e pago

A interface deve separar:

- **Conteúdo Orgânico:** posts, blog, newsletter, roteiros, calendário.
- **Campanhas & Criativos:** anúncios, copies, imagens, públicos, landing pages, orçamento, métricas.

Mas os fluxos devem conversar:

- post orgânico com boa performance pode gerar sugestão de campanha;
- campanha com bom resultado pode gerar novos conteúdos orgânicos;
- dúvidas do WhatsApp podem gerar posts e anúncios;
- landing pages podem gerar artigos de apoio e campanhas;
- relatórios podem alimentar o Radar e o Estrategista.

---

## 6. Modos de Operação Comercial

### 6.1 Managed by YUX

Modo padrão para PMEs.

Cliente pode:

- visualizar calendário;
- aprovar ou reprovar conteúdos;
- solicitar ajustes;
- ver relatórios;
- revisar campanhas;
- definir preferências simples;
- solicitar novas pautas ou campanhas.

Cliente não pode:

- editar agentes;
- trocar modelos;
- alterar ferramentas;
- alterar fluxos;
- publicar sem aprovação;
- conectar chaves sensíveis sem acompanhamento.

### 6.2 Assisted Client

Modo intermediário.

Cliente pode:

- editar tom de voz;
- editar briefing;
- cadastrar fontes;
- criar ideias;
- solicitar geração de conteúdo;
- aprovar calendário;
- escolher canais;
- usar créditos mensais;
- acionar fluxos pré-aprovados.

Cliente não pode:

- editar lógica profunda dos agentes;
- usar ferramentas sensíveis sem permissão;
- publicar automaticamente sem política ativa.

### 6.3 Advanced / Agency Partner

Modo avançado para agências parceiras ou clientes técnicos.

Cliente/agência pode:

- configurar fluxos a partir de templates;
- ajustar nós;
- escolher modelos permitidos;
- usar BYOK;
- criar fontes;
- conectar WordPress;
- criar campanhas rascunho;
- usar webhooks;
- ver custos técnicos detalhados.

Deve haver limites e logs obrigatórios.

---

## 7. Agentes Principais

### 7.1 Radar de Conteúdo

**Objetivo:** encontrar oportunidades de conteúdo a partir de fontes externas e internas.

**Fontes possíveis:**

- RSS;
- blogs;
- notícias;
- canais YouTube;
- páginas de concorrentes;
- campanhas ativas;
- dúvidas do WhatsApp;
- temas do CRM;
- relatórios de performance;
- Google Trends ou APIs equivalentes futuramente.

**Saídas:**

- ideias de conteúdo;
- tema;
- justificativa;
- canal sugerido;
- prioridade;
- relação com campanha;
- fonte;
- score de oportunidade.

**Ferramentas:**

- Jina Reader;
- Jina Search;
- Tavily/Serper como fallback;
- Firecrawl para crawl quando necessário;
- YouTube Data API;
- fontes internas do YUX Hub.

**Modelo:** barato/intermediário.

---

### 7.2 Curador Estratégico

**Objetivo:** filtrar e priorizar ideias.

**Responsabilidades:**

- remover duplicidades;
- comparar com calendário editorial;
- evitar repetição de temas;
- avaliar potencial comercial;
- verificar adequação ao setor;
- classificar por esforço/impacto;
- sugerir formato.

**Saídas:**

- lista aprovada de ideias;
- ideias rejeitadas com motivo;
- prioridade;
- recomendação de canal;
- sugestão de próxima ação.

**Modelo:** intermediário.

---

### 7.3 Estrategista de Conteúdo

**Objetivo:** transformar uma ideia aprovada em briefing de conteúdo.

**Responsabilidades:**

- definir objetivo;
- público;
- estágio do funil;
- ângulo;
- CTA;
- formato;
- estrutura;
- referências;
- canal;
- relação com serviço, campanha ou landing page.

**Saídas:**

- briefing completo;
- estrutura do conteúdo;
- canal sugerido;
- CTA;
- critérios de qualidade.

**Modelo:** intermediário/forte.

---

### 7.4 Redator Multicanal

**Objetivo:** gerar textos para diferentes canais.

**Canais iniciais:**

- LinkedIn;
- Instagram;
- blog WordPress;
- newsletter;
- e-mail;
- anúncio;
- roteiro de vídeo;
- carrossel textual;
- WhatsApp broadcast, com cuidado.

**Responsabilidades:**

- seguir tom de voz;
- usar base de conhecimento;
- adaptar por canal;
- criar variações;
- evitar promessas exageradas;
- preservar clareza comercial.

**Saídas:**

- post;
- legenda;
- artigo;
- roteiro;
- copy de anúncio;
- variações;
- título;
- CTA;
- hashtags quando aplicável.

**Modelo:** bom em escrita, com fallback premium para conteúdos importantes.

---

### 7.5 Revisor de Marca e Qualidade

**Objetivo:** revisar consistência, segurança e qualidade.

**Checklists:**

- tom de voz;
- clareza;
- gramática;
- adequação ao setor;
- promessa comercial;
- LGPD;
- risco regulatório;
- repetição;
- coerência com base de conhecimento;
- necessidade de grounding;
- presença de CTA.

**Ferramentas:**

- Jina Grounding quando houver fatos, dados, estatísticas ou notícias;
- RAG da marca;
- guideline de compliance;
- histórico de conteúdos aprovados.

**Saídas:**

- aprovado;
- aprovado com ajustes;
- reprovado;
- comentários;
- score de qualidade;
- sugestões.

**Modelo:** intermediário/forte, saída curta.

---

### 7.6 Estrategista de Campanhas

**Objetivo:** transformar ideias, posts ou ofertas em campanhas pagas e criativos.

**Responsabilidades:**

- sugerir ângulos de campanha;
- gerar headlines;
- gerar copies;
- sugerir públicos;
- sugerir CTA;
- vincular landing page;
- gerar UTM;
- propor testes A/B;
- reaproveitar conteúdo orgânico de boa performance.

**Saídas:**

- campanha rascunho;
- conjunto de criativos;
- copies;
- hipóteses de teste;
- públicos;
- orçamento sugerido;
- landing page indicada.

**Modelo:** forte, pois impacta diretamente investimento de mídia.

---

### 7.7 Gerador de Criativos Visuais

**Objetivo:** criar ou orientar criação de imagens para posts e anúncios.

**Responsabilidades:**

- gerar prompts de imagem;
- gerar conceitos visuais;
- respeitar identidade visual;
- criar variações;
- sugerir formato por canal;
- evitar uso indevido de marcas, pessoas e imagens sensíveis;
- encaminhar para aprovação humana.

**Observação:** geração de imagem deve ter limite separado de créditos.

**Modelo:** modelo de imagem barato por padrão; premium apenas com aprovação ou consumo maior de créditos.

---

### 7.8 Gestor de Calendário Editorial

**Objetivo:** organizar conteúdos aprovados em um calendário.

**Responsabilidades:**

- distribuir posts por data;
- evitar excesso de temas repetidos;
- equilibrar canais;
- respeitar campanhas;
- criar tarefas;
- criar lembretes;
- sincronizar com Google Calendar, se ativado.

**Saídas:**

- calendário mensal;
- tarefas;
- status;
- alertas de atraso;
- sugestões de redistribuição.

**Modelo:** barato/intermediário.

---

### 7.9 Publicador Controlado

**Objetivo:** executar publicações somente após aprovação.

**Destinos iniciais:**

- WordPress via REST API;
- Google Calendar;
- Google Sheets;
- tarefas internas no YUX Hub;
- webhooks.

**Destinos futuros:**

- LinkedIn;
- Instagram/Facebook via APIs oficiais Meta;
- YouTube;
- newsletters;
- WordPress MCP.

**Responsabilidades:**

- criar rascunho;
- atualizar rascunho;
- publicar com aprovação;
- registrar status;
- salvar URL publicada;
- tratar erro de integração.

**Modelo:** geralmente sem LLM, apenas automação/tooling.

---

### 7.10 Analista de Performance

**Objetivo:** analisar resultados e alimentar novos ciclos.

**Fontes:**

- campanhas;
- landing pages;
- CRM;
- conversas;
- WordPress;
- redes sociais;
- calendário;
- relatórios internos.

**Saídas:**

- conteúdos que performaram melhor;
- campanhas com melhor CPL/MROI;
- hipóteses;
- recomendações;
- novos temas;
- alertas;
- relatório mensal.

**Modelo:** forte em raciocínio e análise de dados.

---

## 8. Fluxos Iniciais

### 8.1 Radar Semanal de Conteúdo

**Frequência:** semanal.

**Fluxo:**

1. Coletar fontes curadas.
2. Buscar temas adicionais, se necessário.
3. Ler URLs selecionadas com Jina Reader.
4. Resumir fontes.
5. Identificar padrões.
6. Gerar ideias.
7. Curador prioriza.
8. Enviar ideias para aprovação interna.

**Saída:** 10 a 20 ideias priorizadas.

---

### 8.2 Criação de Post Orgânico

**Entrada:** ideia aprovada.

**Fluxo:**

1. Estrategista cria briefing.
2. Redator gera post.
3. Revisor valida.
4. Se necessário, grounding.
5. Envia para aprovação.
6. Entra no calendário.

**Saída:** post pronto para aprovação/publicação.

---

### 8.3 Artigo de Blog WordPress

**Entrada:** tema ou briefing.

**Fluxo:**

1. Pesquisa controlada.
2. Outline.
3. Escrita.
4. Revisão.
5. Checagem factual.
6. SEO básico.
7. Criação de rascunho WordPress via REST API.
8. Aprovação.
9. Publicação.

**Saída:** rascunho WordPress ou artigo publicado.

---

### 8.4 Criativos de Campanha

**Entrada:** oferta, landing page, campanha ou conteúdo orgânico aprovado.

**Fluxo:**

1. Estratégia de campanha.
2. Geração de ângulos.
3. Geração de copies.
4. Sugestão de imagem/criativo.
5. Revisão.
6. Aprovação.
7. Criação de campanha rascunho ou tarefa.

**Saída:** pacote de criativos e copies.

---

### 8.5 Reciclagem de Conteúdo

**Entrada:** artigo, post ou campanha.

**Fluxo:**

1. Identificar conteúdo base.
2. Gerar variações por canal.
3. Adaptar tom.
4. Revisar.
5. Agendar.

**Saída:** múltiplas peças derivadas.

---

### 8.6 Análise Mensal de Performance

**Entrada:** métricas do período.

**Fluxo:**

1. Coletar métricas.
2. Comparar com período anterior.
3. Identificar padrões.
4. Gerar insights.
5. Sugerir próximos conteúdos e campanhas.
6. Criar relatório.

**Saída:** relatório e novas ideias para o ciclo seguinte.

---

## 9. YUX Agent Harness

O **YUX Agent Harness** é a camada de controle entre o YUX Hub, LangGraph, LLMs e ferramentas externas.

### 9.1 Responsabilidades

- montar contexto;
- aplicar permissões;
- selecionar modelo;
- limitar custo;
- escolher ferramentas;
- aplicar cache;
- registrar logs;
- controlar retries;
- validar output;
- aplicar checklists;
- exigir aprovação;
- bloquear ações sensíveis;
- registrar uso de créditos.

### 9.2 Controle de contexto

Cada execução deve receber contexto relevante e limitado:

- cliente;
- setor;
- contrato;
- módulos ativos;
- tom de voz;
- persona;
- produtos/serviços;
- diferenciais;
- campanhas ativas;
- conteúdos anteriores;
- calendário;
- landing pages;
- conversas frequentes;
- dados de CRM;
- restrições legais;
- objetivos do mês.

### 9.3 Seleção de modelo por agente

Cada agente deve ter:

- modelo padrão;
- modelo barato;
- modelo premium;
- fallback;
- limite de tokens;
- temperatura;
- custo máximo por execução;
- política de retry.

### 9.4 Tool permissions

Ferramentas devem ser liberadas por agente e por contrato.

Exemplo:

- Radar pode pesquisar e ler URLs.
- Redator pode consultar RAG e gerar texto.
- Revisor pode usar grounding.
- Publicador pode criar rascunho, mas só publica após aprovação.
- Estrategista de Campanha pode criar campanha rascunho, mas não ativar campanha sem autorização.

### 9.5 Quality gates

Antes de finalizar um conteúdo, o harness deve aplicar gates:

- qualidade mínima;
- aderência ao tom;
- ausência de promessas exageradas;
- checagem factual quando necessário;
- conformidade setorial;
- ausência de dados pessoais indevidos;
- CTA presente;
- formato correto para canal;
- aprovação humana quando exigida.

### 9.6 Custo e créditos

Cada execução deve atualizar:

- custo bruto estimado;
- créditos consumidos;
- saldo restante;
- limite mensal;
- alerta de consumo;
- bloqueio se passar do limite.

---

## 10. Estratégia de Pesquisa e Ferramentas

### 10.1 Princípio

Não permitir navegação irrestrita. Agentes devem usar ferramentas específicas, com limites e logs.

### 10.2 Jina AI

Usar Jina com prudência para:

- leitura limpa de páginas com Jina Reader;
- busca simples com Jina Search;
- grounding/fact-checking em conteúdos importantes;
- embeddings e reranking quando fizer sentido.

Não usar Jina Grounding ou reranker em toda execução. Usar apenas quando houver:

- dados;
- estatísticas;
- notícias;
- afirmações factuais;
- conteúdo de alta importância;
- revisão final de artigo;
- necessidade de aumentar precisão.

### 10.3 Tavily / Serper

Usar como fallback ou complemento:

- Tavily para pesquisa agentic;
- Serper para SERP, notícias, imagens e resultados estilo Google.

### 10.4 Firecrawl

Usar apenas para:

- crawl de sites;
- monitoramento de páginas;
- extração em lote;
- casos em que Jina Reader não resolva bem.

### 10.5 Fontes curadas

Priorizar fontes curadas para reduzir custo:

- RSS;
- blogs cadastrados;
- canais YouTube;
- newsletters;
- concorrentes definidos;
- documentos internos;
- base de conhecimento.

### 10.6 WordPress

MVP:

- WordPress REST API para criar rascunhos, atualizar e publicar após aprovação.

Evolução:

- WordPress MCP como conector avançado para sites compatíveis.

### 10.7 YouTube

Usar YouTube Data API com parcimônia:

- monitorar canais cadastrados;
- buscar vídeos novos;
- resumir título/descrição;
- usar transcript apenas quando necessário;
- limitar análises completas.

### 10.8 Redes sociais

MVP:

- não depender de scraping social amplo;
- permitir criação de conteúdo e tarefa de publicação;
- priorizar publicação em WordPress e tarefas.

V2:

- LinkedIn;
- Instagram/Facebook via APIs oficiais;
- agendamento controlado;
- sempre com aprovação.

---

## 11. Modelo Comercial e Créditos

### 11.1 Estratégia recomendada

Usar modelo híbrido:

1. mensalidade/pacote com franquia de créditos;
2. créditos extras para excedente;
3. BYOK opcional para clientes avançados;
4. imagem com limites específicos;
5. custo técnico sempre rastreado internamente.

### 11.2 Não expor tokens como métrica principal

Cliente deve entender:

- conteúdos gerados;
- pesquisas feitas;
- imagens geradas;
- criativos criados;
- artigos produzidos;
- relatórios gerados;
- créditos restantes.

Tokens devem ser métrica interna.

### 11.3 Créditos sugeridos por ação

| Ação | Créditos sugeridos |
|---|---:|
| Classificar ideia | 1 |
| Resumir fonte curta | 2 |
| Ler URL com Jina Reader | 1–3 |
| Busca simples | 5–10 |
| Gerar legenda curta | 3 |
| Gerar post LinkedIn | 5 |
| Gerar post Instagram | 5 |
| Gerar carrossel textual | 8–12 |
| Gerar pacote de variações | 12–20 |
| Gerar artigo de blog | 20–40 |
| Pesquisa profunda | 20–50 |
| Grounding curto | 5–15 |
| Grounding de artigo | 20–40 |
| Gerar imagem simples | 15–30 |
| Gerar imagem premium | 40–80 |
| Análise mensal de performance | 30–80 |

### 11.4 Planos possíveis

#### Starter

- poucos conteúdos mensais;
- baixo volume de pesquisa;
- sem publicação automática;
- cliente aprova tudo;
- ideal para PME pequena.

#### Growth

- calendário mensal completo;
- campanhas e criativos;
- relatórios;
- mais créditos;
- publicação WordPress;
- ideal para PME com marketing ativo.

#### Pro

- mais canais;
- mais campanhas;
- análise de performance;
- imagens;
- integrações avançadas;
- possibilidade de BYOK.

#### Managed by YUX

- pacote fechado de serviço;
- YUX opera tudo;
- cliente aprova e acompanha;
- créditos incluídos no contrato;
- excedente cobrado à parte.

### 11.5 BYOK

Permitir BYOK apenas em planos avançados.

Clientes podem inserir:

- OpenAI;
- OpenRouter;
- Anthropic;
- Google;
- outros provedores permitidos.

Mesmo com BYOK, a YUX deve cobrar:

- plataforma;
- orquestração;
- suporte;
- armazenamento;
- logs;
- conectores;
- execução de workers;
- manutenção.

---

## 12. Modelo de Dados Sugerido

### 12.1 Tabelas principais

- `marketing_studio_settings`
- `marketing_agents`
- `marketing_agent_templates`
- `marketing_workflows`
- `marketing_workflow_nodes`
- `marketing_workflow_edges`
- `marketing_workflow_runs`
- `marketing_agent_runs`
- `marketing_tool_runs`
- `marketing_sources`
- `marketing_source_items`
- `marketing_ideas`
- `content_items`
- `content_versions`
- `content_reviews`
- `editorial_calendar_items`
- `creative_assets`
- `campaign_creative_suggestions`
- `knowledge_bases`
- `knowledge_documents`
- `knowledge_chunks`
- `ai_usage_ledger`
- `ai_credit_wallets`
- `agent_budget_policies`
- `model_routing_rules`
- `publishing_connections`
- `publishing_runs`

### 12.2 Campos importantes em `marketing_agents`

- `id`
- `organization_id`
- `client_id`
- `contract_id`
- `name`
- `agent_type`
- `description`
- `status`
- `base_prompt`
- `model_provider`
- `model_name`
- `fallback_model_name`
- `allowed_tools`
- `requires_human_approval`
- `max_cost_per_run`
- `max_runs_per_day`
- `created_by`
- `updated_at`

### 12.3 Campos importantes em `content_items`

- `id`
- `client_id`
- `contract_id`
- `title`
- `content_type`
- `channel`
- `status`
- `brief`
- `body`
- `cta`
- `campaign_id`
- `landing_page_id`
- `source_idea_id`
- `created_by_agent_id`
- `approved_by`
- `scheduled_at`
- `published_at`
- `published_url`

### 12.4 Campos importantes em `ai_usage_ledger`

- `id`
- `client_id`
- `contract_id`
- `user_id`
- `agent_id`
- `workflow_run_id`
- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `tool_name`
- `raw_cost_estimate`
- `credits_charged`
- `status`
- `created_at`

---

## 13. Arquitetura Técnica

### 13.1 Visão geral

```text
YUX Hub Frontend
  ↓
Supabase Auth + Postgres + RLS
  ↓
Backend/Worker Python
  ↓
LangGraph Runtime
  ↓
YUX Agent Harness
  ↓
Tools controladas
  - Jina Reader/Search/Grounding
  - Tavily/Serper
  - Firecrawl
  - Google Sheets
  - Google Calendar
  - WordPress REST API
  - Supabase/YUX CRM
  - Campaigns
  - Landing Pages
  - WhatsApp/Conversas
  ↓
Outputs
  - ideias
  - posts
  - artigos
  - roteiros
  - criativos
  - tarefas
  - calendário
  - campanhas rascunho
  - relatórios
```

### 13.2 Frontend

- React 18;
- TypeScript;
- Vite;
- Tailwind;
- shadcn-style UI;
- React Flow ou similar para editor visual de nós;
- telas internas e portal filtradas por contrato.

### 13.3 Backend/Worker

- Python;
- LangGraph;
- LangChain tools, quando fizer sentido;
- filas de execução;
- scheduler;
- logs estruturados;
- conexão com Supabase;
- integração com provedores LLM;
- integração com ferramentas externas.

### 13.4 Supabase

- Auth;
- Postgres;
- RLS;
- Storage;
- pgvector para RAG inicial;
- Edge Functions para endpoints leves;
- tabelas de logs e créditos.

### 13.5 n8n

Usar para:

- webhooks simples;
- notificações;
- integrações rápidas;
- jobs periféricos.

Não usar n8n como runtime principal dos agentes.

---

## 14. Páginas e Funcionalidades

### 14.1 Visão Geral

Cards:

- conteúdos em produção;
- aprovações pendentes;
- ideias novas;
- campanhas conectadas;
- créditos usados;
- próximos posts;
- alertas de execução.

### 14.2 Conteúdo Orgânico

- lista de conteúdos;
- filtros por status/canal/campanha;
- editor de conteúdo;
- versões;
- comentários;
- aprovação;
- publicação.

### 14.3 Campanhas & Criativos

- campanhas;
- criativos;
- copies;
- variações;
- aprovação;
- ligação com landing pages;
- métricas;
- recomendações.

### 14.4 Calendário Editorial

- calendário mensal;
- visão Kanban;
- drag-and-drop;
- status;
- canal;
- responsável;
- publicação.

### 14.5 Aprovações

- fila de conteúdos;
- comparar versões;
- aprovar;
- pedir ajustes;
- reprovar;
- comentários;
- histórico.

### 14.6 Ideias & Radar

- ideias capturadas;
- fonte;
- score;
- prioridade;
- status;
- transformar em pauta;
- descartar;
- associar campanha.

### 14.7 Agentes & Fluxos

- lista de agentes;
- templates;
- status;
- logs;
- editor visual;
- ferramentas;
- modelo;
- limites;
- execuções.

### 14.8 Base de Conhecimento

- documentos;
- tom de voz;
- produtos;
- serviços;
- FAQs;
- posts aprovados;
- campanhas;
- restrições;
- embeddings;
- status de indexação.

### 14.9 Fontes Monitoradas

- RSS;
- blogs;
- concorrentes;
- YouTube;
- URLs;
- frequência;
- status;
- última leitura;
- custo.

### 14.10 Performance

- posts publicados;
- campanhas;
- leads gerados;
- conversões;
- CPL;
- MROI;
- melhores temas;
- recomendações.

### 14.11 Créditos & Uso

- saldo;
- uso por agente;
- uso por ferramenta;
- uso por cliente;
- excedente;
- histórico;
- previsão de consumo.

---

## 15. Roadmap de Implementação

### Fase 1 — Fundação do Marketing Studio

- módulo no registry;
- navegação interna/portal;
- tabelas principais;
- permissões;
- settings por contrato;
- content_items;
- calendar_items;
- approvals;
- ai_usage_ledger;
- credit_wallets.

### Fase 2 — Conteúdo Orgânico e Calendário

- tela de conteúdos;
- calendário editorial;
- criação manual e assistida;
- aprovação;
- comentários;
- versões;
- status.

### Fase 3 — Base de Conhecimento e Tom de Voz

- upload/documentos;
- tom de voz;
- persona;
- produtos/serviços;
- embeddings;
- RAG simples;
- busca semântica.

### Fase 4 — LangGraph Runtime e Harness

- worker Python;
- execução de workflow;
- agentes templates;
- logs;
- custos;
- model routing;
- tools controladas.

### Fase 5 — Radar e Pesquisa

- fontes curadas;
- Jina Reader;
- Jina Search;
- cache;
- deduplicação;
- ideias;
- curadoria.

### Fase 6 — Redação, Revisão e Grounding

- redator;
- revisor;
- checklist;
- Jina Grounding sob demanda;
- score de qualidade;
- aprovação.

### Fase 7 — WordPress e Publicação Controlada

- conectar WordPress;
- criar rascunho;
- atualizar rascunho;
- publicar após aprovação;
- salvar URL.

### Fase 8 — Campanhas & Criativos

- criar criativos;
- gerar copies;
- associar landing page;
- campanha rascunho;
- aprovação.

### Fase 9 — Performance e Aprendizado

- métricas;
- análise mensal;
- recomendação de próximos temas;
- retroalimentação orgânico/pago.

### Fase 10 — Publicação Social e Integrações Avançadas

- LinkedIn;
- Instagram/Facebook;
- WordPress MCP;
- BYOK avançado;
- templates customizados por cliente.

---

## 16. Critérios de Sucesso do MVP

O MVP do YUX Marketing Studio será considerado pronto quando:

- a YUX conseguir operar múltiplos clientes;
- cada cliente tiver configurações próprias de tom, fontes e calendário;
- a YUX conseguir rodar Radar semanal;
- ideias puderem virar pautas;
- pautas puderem virar conteúdos;
- conteúdos tiverem revisão e aprovação;
- conteúdos aprovados entrarem no calendário;
- artigos puderem virar rascunho no WordPress;
- créditos e custos forem registrados;
- logs de execução estiverem disponíveis;
- cliente conseguir visualizar e aprovar sem ver complexidade técnica;
- equipe YUX conseguir configurar agentes e fluxos internamente.

---

## 17. Riscos e Controles

### 17.1 Risco: custo imprevisível

**Controle:** créditos, limites por execução, cache, ferramentas controladas, grounding sob demanda.

### 17.2 Risco: agente publicar conteúdo errado

**Controle:** aprovação humana obrigatória, revisão, logs e status de rascunho.

### 17.3 Risco: conteúdo genérico

**Controle:** base de conhecimento, tom de voz, histórico de conteúdos e RAG.

### 17.4 Risco: complexidade para o cliente

**Controle:** modo Managed by YUX, portal simplificado e configuração avançada oculta.

### 17.5 Risco: dependência de uma única ferramenta

**Controle:** Jina + fallback Tavily/Serper + Firecrawl apenas quando necessário.

### 17.6 Risco: escopo virar um OpenCloud completo

**Controle:** foco exclusivo em marketing, agentes pré-definidos e fluxos opinativos.

---

## 18. Veredito Estratégico

O YUX Marketing Studio deve ser construído porque une três elementos muito fortes:

1. **valor comercial visível** — calendário, posts, criativos, campanhas e relatórios;
2. **diferenciação tecnológica** — agentes com LangGraph, harness, RAG, grounding e automação;
3. **aplicação imediata** — a própria YUX pode usar internamente para seu marketing e transformar o resultado em case.

A primeira versão deve ser poderosa, mas controlada:

- multi-cliente;
- LangGraph desde o início;
- agentes pré-definidos;
- ferramentas limitadas;
- aprovação humana;
- créditos;
- Jina com prudência;
- WordPress REST API no MVP;
- redes sociais em fase posterior;
- cliente comum visualiza/aprova;
- YUX configura/opera.

A direção recomendada é transformar o Marketing Studio em uma camada nativa do YUX Hub, conectada a CRM, WhatsApp IA, Landing Pages, Campanhas, Automations e Reports, fortalecendo a promessa central da YUX: entregar IA prática, integrada e mensurável para PMEs.
## Integracao com YUX Strategy Engine

O Strategy Engine nao substitui os agentes especializados do Marketing Studio. Os tipos atuais continuam existindo para pesquisa, curadoria, estrategia de conteudo, redacao, revisao, criativos, calendario, publicacao controlada e performance.

O perfil `marketing_strategist` atua como camada estrategica acima desses subagentes. Ele usa skills, cards conceituais, retrieval controlado, dados de CRM/metricas/objecoes e politicas de aprovacao para direcionar o trabalho. Publicacao, ativacao de campanha paga e qualquer mudanca sensivel continuam exigindo aprovacao humana conforme as policies do perfil.
