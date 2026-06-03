# YUX OS Functional Implementation Design

## Objetivo

Implantar o YUX OS como uma plataforma operacional completa para a YUX e, ao
mesmo tempo, entregar um Portal YUX completo para clientes. A implementacao deve
seguir a ordem tecnica que reduz retrabalho: primeiro o nucleo compartilhado,
depois fatias verticais que sempre tenham visao interna e visao de cliente
quando aplicavel.

## Direcao Aprovada

A abordagem escolhida e **nucleo compartilhado primeiro, depois fatias
verticais**.

Isso significa que a prioridade nao sera "interno primeiro" nem "portal
primeiro". A prioridade sera construir as entidades, regras e servicos que os
dois lados usam:

- contratos;
- pacotes;
- modulos contratados;
- organizacoes;
- membros;
- permissoes;
- projetos;
- entregaveis;
- aprovacoes;
- documentos;
- suporte;
- relatorios;
- notificacoes.

Cada modulo funcional deve nascer com uma fronteira clara entre:

- dados e regras compartilhadas;
- tela interna da YUX;
- tela filtrada do cliente;
- pontos futuros de automacao/integracao.

## Estado Atual

O projeto ja possui:

- React, TypeScript e Vite no frontend;
- Supabase novo ativo como Auth e banco;
- migration baseline limpa aplicada;
- usuarios reais de teste no Supabase Auth;
- fundacao de organizacoes, roles, permissoes, pacotes, modulos, contratos e
  blueprints;
- registry TypeScript de modulos;
- regras puras de permissao e ativacao;
- navegacao modular interna/portal;
- store e service iniciais da plataforma;
- paginas base de modulos, blueprints e portal;
- Git inicializado na raiz.

Ainda faltam as funcionalidades operacionais completas e as integracoes reais.

## Principios de Implementacao

### Uma Plataforma, Duas Experiencias

A YUX usa o sistema como central operacional. O cliente usa o portal como uma
visao filtrada do mesmo sistema. O portal nao deve duplicar dados nem criar uma
arquitetura separada.

### Contrato Como Fonte de Verdade

O contrato define quais modulos, servicos e superficies o cliente acessa. Menus,
rotas, cards, relatorios e permissoes do portal devem derivar do contrato ativo.

### Fatias Verticais

Cada etapa deve entregar software utilizavel. Por exemplo, "projetos e
aprovacoes" deve incluir:

- schema;
- service;
- regras de permissao;
- UI interna;
- UI do portal;
- estados vazios;
- testes de regras puras;
- verificacao de build.

### Integracoes Atraves de Fronteiras

n8n, WhatsApp IA, Ads, BI e agentes nao devem ser acoplados ao frontend. O
frontend e o Supabase devem expor dados, configuracoes, webhooks e logs para que
as integracoes operem por tras.

## Sequencia de Implantacao

### Fase 1: Contratos, Pacotes e Modulos Ativos

Objetivo: transformar a fundacao modular em controle real de acesso e
contratacao.

Inclui:

- CRUD interno de pacotes;
- CRUD interno de contratos;
- ativacao/desativacao de modulos por contrato;
- vinculacao de contrato a cliente;
- status de contrato;
- tela interna para revisar modulos ativos;
- service tipado para carregar contrato ativo do cliente;
- portal derivando navegacao e cards do contrato ativo.

Resultado esperado: a YUX consegue dizer o que cada cliente contratou, e o
portal muda conforme isso.

### Fase 2: Portal Filtrado por Contrato

Objetivo: fazer o cliente acessar uma area completa, mesmo que alguns modulos
ainda estejam em estado inicial.

Inclui:

- dashboard do portal por contrato;
- resumo de projeto;
- pendencias do cliente;
- documentos recentes;
- aprovacoes pendentes;
- chamados de suporte;
- relatarios disponiveis;
- financeiro basico do contrato;
- estados vazios profissionais para modulos nao configurados;
- bloqueio visual e logico de areas nao contratadas.

Resultado esperado: o portal deixa de ser uma pagina demonstrativa e passa a ser a
porta de entrada real do relacionamento.

### Fase 3: Projetos, Tarefas, Entregaveis e Aprovacoes

Objetivo: cobrir o fluxo central de entrega da YUX.

Inclui:

- projetos com fases, tarefas, responsaveis e prazos;
- entregaveis vinculados a fases/projetos;
- aprovacoes de entregaveis;
- feedback do cliente;
- linha do tempo do projeto;
- visibilidade interna completa;
- visibilidade filtrada no portal;
- status e progresso derivados de tarefas/aprovacoes.

Resultado esperado: a YUX gerencia execucao e o cliente acompanha o andamento
sem depender de mensagens soltas.

### Fase 4: CRM, Leads, Diagnostico e Propostas

Objetivo: estruturar o funil comercial da YUX ate a conversao em contrato.

Inclui:

- pipeline de leads;
- etapas configuraveis;
- origem, score, responsavel e follow-up;
- diagnostico comercial;
- proposta com escopo, pacote recomendado e valor;
- conversao de proposta aprovada em contrato/projeto;
- templates de mensagem e follow-up.

Resultado esperado: o sistema ajuda a vender melhor e reaproveita os pacotes e
contratos ja criados.

### Fase 5: Financeiro Basico

Objetivo: controlar valores contratados, cobranças e status financeiro sem
implementar billing automatizado completo.

Inclui:

- valores de contrato;
- recorrencia;
- faturas ou itens de cobranca;
- status de pagamento;
- vencimentos;
- resumo interno;
- visao do cliente no portal.

Resultado esperado: a YUX sabe o que deve cobrar e o cliente consegue consultar
o financeiro basico.

Nota de implementacao 2026-06-03: esta fase foi materializada como financeiro
basico de contas a receber, com faturas, itens de cobranca, status de pagamento,
visao interna e visao do portal vinculadas a contratos. Billing automatizado,
gateway de pagamento, emissao fiscal e conciliacao bancaria permanecem fora
deste escopo.

### Fase 6: Blueprints Aplicaveis

Objetivo: transformar blueprints de registros estaticos em modelos aplicaveis.

Inclui:

- blueprint define modulos sugeridos;
- funil padrao;
- campos personalizados;
- tarefas de onboarding;
- templates de proposta;
- templates de mensagens;
- checklists por setor;
- aplicacao de blueprint em cliente/contrato/projeto.

Resultado esperado: nichos como clinicas, imobiliarias e e-commerce deixam de
ser apenas etiquetas e viram configuracoes reutilizaveis.

### Fase 7: Integracoes e Automacoes

Objetivo: conectar automacoes reais sem transformar o frontend em motor de
integracao.

Inclui:

- tabela de conexoes externas;
- tabela de execucoes de automacao;
- webhooks para n8n;
- logs de sincronizacao;
- WhatsApp IA com conversa, resumo, status e handoff;
- Google Ads e Meta Ads com metricas sincronizadas;
- relatorios automaticos;
- alertas de performance;
- jobs/backend ou edge functions quando n8n nao for suficiente.

Resultado esperado: as integracoes passam a operar por tras da plataforma com
rastreabilidade e sem acoplamento indevido ao React.

### Fase 8: Infraestrutura, Deploy e Hardening

Objetivo: preparar operacao continua.

Inclui:

- GitHub como repositorio remoto oficial;
- Vercel conectada ao GitHub;
- variaveis de ambiente por ambiente;
- deploy de preview e producao;
- RLS mais rigoroso por organizacao, contrato e membership;
- politicas de backup;
- monitoramento de erros;
- documentacao de operacao;
- revisao de seguranca antes de uso real por clientes.

Resultado esperado: o sistema passa de ambiente de desenvolvimento para base
operacional confiavel.

## Modelo de Dados a Evoluir

A baseline atual deve ser expandida com tabelas e campos para:

- `contract_module_settings`;
- `deliverables`;
- `approvals`;
- `documents`;
- `support_tickets`;
- `support_messages`;
- `notifications`;
- `proposal_templates`;
- `proposals`;
- `proposal_items`;
- `pipeline_stages`;
- `lead_activities`;
- `billing_items`;
- `invoices`;
- `blueprint_fields`;
- `blueprint_checklists`;
- `blueprint_templates`;
- `integration_connections`;
- `automation_runs`;
- `report_snapshots`.

As tabelas existentes devem ser reaproveitadas sempre que possivel.

## UI e Experiencia

### Interno YUX

O interno deve ser denso, operacional e orientado a acao:

- tabelas com filtros;
- kanbans onde fizer sentido;
- modais ou drawers para edicao;
- status claros;
- historico de atividades;
- acoes rapidas por cliente/projeto/lead.

### Portal YUX

O portal deve ser simples, confiavel e completo:

- dashboard de contrato;
- progresso de projetos;
- pendencias;
- aprovacoes;
- documentos;
- suporte;
- relatorios;
- financeiro;
- modulos contratados.

O cliente nao deve ver areas internas, configuracoes complexas nem modulos nao
contratados.

## Integracoes

### n8n

n8n sera motor invisivel de automacoes:

- webhooks;
- sincronizacoes;
- notificacoes;
- fluxos de onboarding;
- execucoes recorrentes;
- integracoes rapidas.

O sistema deve registrar cada execucao relevante em `automation_runs`.

### WhatsApp IA

O modulo deve armazenar:

- conversas;
- contatos;
- status de atendimento;
- handoff humano;
- resumo;
- classificacao;
- vinculo com lead/cliente/projeto;
- metricas.

Processamento de IA e envio de mensagens devem ficar em backend/n8n.

### Ads e ROI

O modulo deve armazenar:

- conexoes externas;
- contas;
- campanhas;
- metricas por periodo;
- investimento;
- leads;
- CPL;
- ROAS;
- recomendacoes;
- alertas.

Sincronizacao deve ser job externo, nao frontend.

## Testes e Verificacao

Cada fase deve preservar:

- `npm run test`;
- `npm run type-check`;
- `npm run build`;
- testes unitarios para regras puras;
- verificacao manual do fluxo principal no navegador;
- consultas Supabase de contagem/consistencia depois de migrations.

Funcionalidades com permissao, contrato ou portal devem ter testes focados em:

- modulo contratado aparece;
- modulo nao contratado nao aparece;
- usuario interno ve area interna;
- cliente ve apenas portal filtrado;
- estados vazios nao quebram a UI.

## Fora do Escopo Inicial

Mesmo com portal e interno completos, estes pontos nao devem entrar nas primeiras
fases funcionais:

- produtos independentes;
- marketplace de apps;
- white-label completo;
- billing automatizado com gateway;
- IA agente autonomo completo;
- OAuth Ads completo antes da base de campanhas/ROI;
- seguranca final de producao antes de validar os fluxos.

## Criterios de Sucesso

A implantacao funcional sera considerada bem-sucedida quando:

- a YUX conseguir cadastrar cliente, contrato, pacote e modulos ativos;
- o portal do cliente refletir o contrato;
- projetos, tarefas, entregaveis e aprovacoes funcionarem dos dois lados;
- leads e propostas conseguirem virar contrato/projeto;
- financeiro basico estiver consultavel;
- blueprints puderem configurar novos clientes;
- integracoes tiverem pontos claros de entrada, logs e status;
- o app continuar passando testes, type-check e build.
