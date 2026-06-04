# YUX Hub - Administracao Central da Plataforma

## Objetivo

Criar a camada administrativa central do YUX Hub para que a YUX controle a
plataforma como um produto SaaS consultivo: clientes, contratos, pacotes,
modulos, limites, integracoes, provedores, saude operacional, uso e governanca.

O Admin YUX Hub deve deixar claro:

- quais clientes existem e qual e o status comercial/operacional de cada um;
- quais modulos cada cliente contratou;
- quais limites e recursos estao liberados por contrato;
- quais integracoes globais da plataforma estao configuradas;
- quais integracoes estao ativas por cliente;
- quais provedores de IA, email, WhatsApp, Ads e webhooks estao disponiveis;
- quais clientes usam CRM, Automacoes, Financeiro, Suporte e demais modulos;
- quais falhas, custos e consumos precisam de acao administrativa.

## Contexto Atual

O repositorio ja possui uma base importante:

- contratos em `/contracts`;
- pacotes em `/packages`;
- modulos em `/modules`;
- governanca CRM em `/crm-governance`;
- clientes em `/clients`;
- modulo CRM em `/leads`;
- modulo Automacoes em `/automations`;
- Financeiro em `/finance`;
- Suporte em `/support`;
- Blueprints em `/blueprints`;
- registro de modulos em `frontend/src/lib/platform/moduleRegistry.ts`;
- navegacao em `frontend/src/lib/platform/navigation.ts`;
- sidebar em `frontend/src/components/navigation/Sidebar.tsx`.

O problema e que essas areas ainda aparecem como paginas separadas. Falta uma
camada administrativa que responda, de forma operacional:

- o que cada cliente contratou;
- quais limites estao aplicados;
- onde configurar provedores e credenciais;
- como controlar IA e email;
- onde ver clientes impactados por falhas;
- como auditar mudancas administrativas;
- como visualizar a plataforma por categorias claras.

## Decisoes Aprovadas

### Nome comercial

O nome comercial da plataforma e **YUX Hub**.

Novas telas, documentos e textos administrativos devem usar YUX Hub. Referencias
antigas como "YUX OS" podem permanecer apenas quando forem nomes historicos de
arquivos, planos ou entidades ainda nao renomeadas.

### Modelo de navegacao

O modelo aprovado e hibrido:

- sidebar agrupada por categorias;
- pagina central **Admin YUX Hub** como painel administrativo;
- links profundos para configuracoes especificas.

Esse modelo evita uma sidebar plana e tambem evita esconder tudo em um unico
painel dificil de operar.

### Escopo das tres frentes

A implantacao deve planejar as tres frentes juntas, mas executar em fases:

1. navegacao e painel central Admin YUX Hub;
2. clientes, contratos, pacotes, modulos e limites;
3. integracoes, provedores, IA, SMTP2GO, saude e auditoria.

## Principios de Produto

### A YUX administra a plataforma

O Admin YUX Hub e uma area interna da YUX. Clientes nao devem acessar essa area.
Clientes acessam apenas o portal e os modulos contratados.

### Contrato manda na disponibilidade

Um modulo nao deve estar disponivel apenas porque existe no codigo. Ele deve ser
liberado por contrato, pacote ou override administrativo.

### Limites sao parte do produto

Seats, envios de email, execucoes de automacao, uso de IA, funis, campos,
usuarios e recursos avancados devem ser limites configuraveis. Limite nao e so
informativo: o sistema precisa conseguir bloquear, alertar ou exigir upgrade.

### Integracoes sao infraestrutura compartilhada

SMTP2GO, IA/LLM, WhatsApp/Meta, Ads e webhooks devem ser administrados por uma
camada comum. Modulos como CRM, Automacoes, Suporte e Financeiro consomem essa
camada, em vez de criarem configuracoes isoladas.

### Credenciais nunca ficam expostas no frontend

O frontend mostra apenas status, metadados mascarados, provedor, ambiente,
ultima validacao, erros e referencia segura. Chaves de API e segredos ficam em
camada server-side, edge functions, variaveis seguras ou vault.

### Cliente pode ter configuracao propria

A plataforma deve suportar padroes globais e overrides por cliente:

- provedor global de IA;
- modelo padrao por modulo;
- modelo especifico por cliente;
- conta master SMTP2GO;
- subconta SMTP2GO por cliente;
- limites globais por pacote;
- limites customizados por contrato.

## Perfis Administrativos

### Admin YUX

Pode configurar plataforma, clientes, contratos, pacotes, modulos, limites,
provedores, integracoes, auditoria e overrides.

### Operador YUX

Pode consultar clientes, modulos, status e saude operacional. Pode executar
acoes de suporte autorizadas, mas nao altera credenciais ou limites criticos.

### Comercial YUX

Pode consultar uso, limites, oportunidades de upgrade, pacotes e status de
contrato. Nao gerencia credenciais.

### Admin Cliente

Nao acessa Admin YUX Hub. Pode administrar seu proprio modulo dentro dos limites
contratados, por exemplo CRM, automacoes ou usuarios do cliente.

## Sidebar Proposta

### Operacao

- Dashboard;
- Clientes;
- Projetos;
- Suporte.

### Comercial

- CRM;
- Automacoes;
- Propostas;
- Campanhas;
- Landing Pages;
- Relatorios.

### Gestao YUX Hub

- Admin YUX Hub;
- Contratos;
- Pacotes;
- Modulos;
- Blueprints;
- Governanca CRM.

### Infraestrutura

- Integracoes;
- IA/LLM;
- Email/SMTP2GO;
- Webhooks;
- Saude do Sistema.

### Financeiro

- Financeiro.

## Admin YUX Hub: Painel Central

O painel central deve ser a primeira tela administrativa da YUX. Ele nao substitui
as paginas profundas; ele organiza e resume a operacao.

### Blocos do painel

- clientes ativos, suspensos e em onboarding;
- contratos ativos, vencendo e com pendencia;
- modulos mais contratados;
- clientes com CRM ativo;
- clientes com Automacoes ativo;
- clientes com limites proximos do teto;
- integracoes globais com falha;
- falhas por cliente;
- consumo recente de IA;
- consumo recente de email;
- atalhos para ajustes administrativos.

### Acoes rapidas

- abrir ficha do cliente;
- abrir contrato;
- editar limites;
- revisar integracoes do cliente;
- ver logs recentes;
- abrir governanca CRM;
- abrir configuracoes de automacao;
- abrir provedores globais.

## Clientes, Contratos, Pacotes e Limites

### Ficha administrativa do cliente

Cada cliente deve ter uma visao consolidada:

- dados da organizacao;
- status comercial;
- status operacional;
- contratos;
- pacotes;
- modulos ativos;
- limites aplicados;
- integracoes ativas;
- usuarios/assentos por modulo;
- uso recente;
- pendencias administrativas.

### Contratos

Contratos devem controlar:

- pacote contratado;
- modulos contratados;
- recursos liberados por modulo;
- limites;
- datas de inicio, renovacao, suspensao e encerramento;
- status;
- overrides manuais;
- observacoes internas;
- historico de alteracoes.

### Pacotes

Pacotes devem servir como base comercial reutilizavel:

- conjunto padrao de modulos;
- limites padrao;
- recursos incluidos;
- add-ons permitidos;
- restricoes;
- preco ou referencia comercial, quando aplicavel.

### Modulos

Modulos devem ter configuracao administrativa:

- disponibilidade global;
- disponibilidade por pacote;
- limites suportados;
- recursos opcionais;
- dependencias;
- integracoes exigidas;
- status operacional.

### Limites por modulo

Exemplos de limites:

CRM:

- vendedores;
- gerentes;
- admins cliente;
- funis;
- campos personalizados;
- leads mensais;
- automacoes ligadas ao CRM;
- uso de IA no CRM.

Automacoes:

- fluxos ativos;
- sequencias ativas;
- execucoes mensais;
- acoes de IA;
- acoes de email;
- webhooks externos;
- templates setoriais.

Email:

- envios mensais;
- remetentes;
- dominios;
- subconta SMTP2GO;
- limite por dia;
- bloqueio por bounce/spam.

IA:

- provedor permitido;
- modelos permitidos;
- tokens ou creditos mensais;
- acoes permitidas;
- fallback;
- limite por modulo.

Suporte:

- usuarios;
- tickets mensais;
- SLA;
- categorias;
- canais.

Financeiro:

- entidades financeiras;
- automacoes financeiras;
- relatorios;
- notificacoes por email.

## Integracoes Globais

### Registro de provedores

A plataforma deve ter um registro administrativo de provedores:

- tipo de provedor;
- nome;
- ambiente;
- status;
- configuracao publica;
- referencia segura para credencial;
- ultima validacao;
- ultimo erro;
- modulos consumidores;
- fallback configurado;
- responsavel pela ultima alteracao.

Tipos iniciais:

- `llm`;
- `email`;
- `whatsapp`;
- `ads`;
- `webhook`;
- `automation`;
- `storage`;
- `database`;
- `internal_service`.

### Status de conexao

Status recomendados:

- `not_configured`;
- `active`;
- `degraded`;
- `failed`;
- `disabled`;
- `needs_reauth`;
- `stale`.

Esses status devem ser operacionais, nao apenas cosmeticos. Um provedor
`failed` ou `needs_reauth` deve aparecer no Admin YUX Hub e na saude do sistema.

### Testes de conexao

Cada provedor deve suportar uma acao administrativa de teste quando viavel:

- validar credencial;
- executar chamada simples;
- registrar resultado;
- atualizar status;
- gravar auditoria.

## IA/LLM

### O que a area deve controlar

- provedores de IA disponiveis;
- chaves e referencias seguras;
- modelos por provedor;
- modelo padrao global;
- modelo padrao por modulo;
- modelo especifico por cliente;
- limites de uso;
- logs de chamadas;
- custo estimado;
- falhas;
- fallback;
- bloqueios por contrato.

### Uso por modulo

CRM:

- resumo de lead;
- classificacao;
- sugestao de proxima acao;
- scoring assistido;
- geracao de mensagem;
- analise de perda.

Automacoes:

- condicoes inteligentes;
- roteamento;
- geracao de texto;
- classificacao de eventos;
- analise de risco;
- recomendacao de fluxo.

Omnichannel:

- assistente de resposta;
- resumo de conversa;
- intencao;
- transferencia para humano.

Suporte:

- triagem;
- sugestao de resposta;
- resumo de ticket;
- prioridade.

Relatorios:

- insights;
- resumo executivo;
- analise de anomalia.

### Regras

- cliente so usa IA se contrato permitir;
- modulo so usa IA se limite permitir;
- acao de IA pode ser liberada por tipo;
- uso deve ser medido por cliente, modulo e acao;
- falha de IA deve ter fallback sem quebrar o fluxo principal;
- a YUX pode desativar IA globalmente, por cliente ou por modulo.

## Email e SMTP2GO

### Papel do SMTP2GO

SMTP2GO deve ser a infraestrutura compartilhada de email do YUX Hub.

Modulos consumidores:

- Automacoes;
- CRM;
- Suporte;
- Financeiro;
- notificacoes do portal;
- propostas;
- campanhas quando aplicavel.

### Conta master e subcontas

A YUX deve configurar a conta master. Clientes devem operar por subcontas ou
configuracoes isoladas quando necessario.

Por cliente, a YUX deve controlar:

- subconta SMTP2GO;
- dominios;
- remetentes;
- limites;
- reputacao;
- suppressions;
- webhooks;
- status de entrega;
- bloqueios.

### Limites de envio

Limites devem existir por:

- cliente;
- contrato;
- modulo;
- tipo de email;
- periodo mensal;
- periodo diario quando necessario.

Tipos de email:

- transacional;
- notificacao;
- automacao;
- comercial;
- suporte;
- financeiro.

### Eventos e logs

Eventos esperados:

- enviado;
- entregue;
- aberto, se disponivel;
- clique, se disponivel;
- bounce;
- spam;
- suppression;
- falha;
- limite excedido.

## Integracoes por Cliente

Cada cliente pode herdar configuracoes globais ou ter overrides.

Exemplos:

- cliente usa subconta propria SMTP2GO;
- cliente tem dominio de envio proprio;
- cliente usa modelo de IA mais barato;
- cliente tem WhatsApp proprio;
- cliente tem webhook externo;
- cliente tem automacoes bloqueadas temporariamente;
- cliente tem limite customizado por contrato.

O Admin YUX Hub deve deixar visivel se a configuracao e herdada ou especifica.

## Governanca por Modulo

### CRM

O Admin YUX Hub deve apontar para a governanca CRM existente e evoluir para uma
visao consolidada:

- clientes com CRM ativo;
- contrato vinculado;
- blueprint aplicado;
- limites de vendedores e gerentes;
- funis;
- campos;
- uso de IA;
- uso de automacoes;
- pendencias.

### Automacoes

Deve haver visao administrativa:

- clientes com automacoes ativas;
- fluxos ativos;
- sequencias ativas;
- execucoes mensais;
- acoes de IA;
- acoes de email;
- erros recentes;
- limites proximos do teto.

### Financeiro

Deve haver visao administrativa:

- clientes com financeiro ativo;
- notificacoes financeiras por email;
- automacoes financeiras;
- limites contratados;
- pendencias.

### Suporte

Deve haver visao administrativa:

- clientes com suporte ativo;
- usuarios;
- tickets;
- SLA;
- canais;
- falhas de notificacao.

## Auditoria e Saude

### Auditoria

Mudancas administrativas devem gerar eventos:

- alteracao de contrato;
- alteracao de limite;
- ativacao/desativacao de modulo;
- alteracao de provedor;
- troca de credencial;
- teste de conexao;
- override por cliente;
- suspensao operacional;
- desbloqueio manual.

Cada evento deve guardar:

- ator;
- data;
- entidade afetada;
- antes/depois quando seguro;
- motivo ou nota;
- origem da acao.

### Saude do sistema

A saude deve consolidar:

- provedores com falha;
- edge functions ou APIs com erro;
- falhas de email;
- falhas de IA;
- webhooks com retry;
- clientes impactados;
- ultimos eventos criticos.

## Modelo Conceitual de Dados

As entidades abaixo orientam a implantacao. Nomes finais podem seguir padroes ja
existentes no banco, mas o contrato funcional deve permanecer.

### `platform_admin_sections`

Representa secoes administrativas e permite evoluir a navegacao e permissoes.

Campos conceituais:

- `id`;
- `key`;
- `label`;
- `category`;
- `href`;
- `required_role`;
- `is_enabled`.

### `client_module_limits`

Guarda limites efetivos por cliente, contrato e modulo.

Campos conceituais:

- `id`;
- `organization_id`;
- `contract_id`;
- `module_key`;
- `limit_key`;
- `limit_value`;
- `source`;
- `effective_from`;
- `effective_until`.

### `platform_provider_connections`

Guarda configuracao administrativa e status de provedores globais.

Campos conceituais:

- `id`;
- `provider_type`;
- `provider_key`;
- `display_name`;
- `environment`;
- `status`;
- `public_config`;
- `secret_reference`;
- `last_checked_at`;
- `last_error`;
- `is_default`;
- `fallback_provider_id`.

### `client_provider_settings`

Guarda overrides por cliente.

Campos conceituais:

- `id`;
- `organization_id`;
- `provider_connection_id`;
- `module_key`;
- `status`;
- `public_config`;
- `secret_reference`;
- `limits`;
- `inherits_global`;
- `last_checked_at`;
- `last_error`.

### `platform_usage_counters`

Guarda consumo por cliente, modulo e recurso.

Campos conceituais:

- `id`;
- `organization_id`;
- `contract_id`;
- `module_key`;
- `resource_key`;
- `period_start`;
- `period_end`;
- `used_value`;
- `limit_value`;
- `status`.

### `platform_admin_audit_events`

Guarda eventos administrativos.

Campos conceituais:

- `id`;
- `actor_user_id`;
- `actor_role`;
- `event_type`;
- `entity_type`;
- `entity_id`;
- `organization_id`;
- `contract_id`;
- `safe_before`;
- `safe_after`;
- `note`;
- `created_at`.

## Fluxo de Dados

1. Admin YUX cria ou atualiza pacote.
2. Admin YUX cria contrato de cliente com modulos e limites.
3. Sistema calcula limites efetivos por modulo.
4. Cliente acessa apenas modulos liberados.
5. Modulos consultam limites antes de executar recursos controlados.
6. Provedores globais oferecem infraestrutura comum.
7. Overrides por cliente ajustam integracoes quando necessario.
8. Uso e falhas alimentam Admin YUX Hub.
9. Auditoria registra mudancas administrativas.

## Tratamento de Erros

### Modulo nao contratado

Cliente recebe bloqueio claro no portal. Admin YUX enxerga o motivo no painel
do cliente.

### Limite excedido

Sistema bloqueia ou alerta conforme tipo de recurso:

- recursos criticos podem bloquear imediatamente;
- recursos comerciais podem mostrar alerta de upgrade;
- recursos operacionais podem entrar em fila ou modo degradado.

### Provedor global com falha

Admin YUX Hub mostra falha, clientes impactados e ultima tentativa. Quando
existir fallback, o sistema tenta fallback e registra evento.

### Integracao do cliente com falha

O painel do cliente no Admin YUX Hub mostra falha especifica e recomenda acao.
O portal do cliente nao deve expor detalhes sensiveis.

### Credencial ausente

Status `not_configured`. O modulo consumidor deve impedir a acao que exige a
credencial e explicar a pendencia para o admin correto.

## Fases de Desenvolvimento

### Fase 1: Navegacao e Admin YUX Hub

Entrega:

- sidebar agrupada por categorias;
- rota interna `/admin`;
- pagina central Admin YUX Hub;
- cards de resumo administrativo;
- atalhos para paginas existentes;
- troca de textos visiveis para YUX Hub onde fizer sentido;
- estado vazio para secoes ainda sem dados profundos.

Valor:

- clareza imediata para operacao;
- menor confusao de menu;
- base visual para fases seguintes.

### Fase 2: Clientes, Contratos, Pacotes e Limites

Entrega:

- modelo de limites por modulo;
- resumo de limites efetivos por cliente;
- painel administrativo do cliente;
- edicao de limites por contrato;
- visao de modulos ativos/inativos;
- uso versus limite quando dados existirem;
- auditoria de alteracoes de limites.

Valor:

- transforma contrato em regra operacional;
- permite controlar CRM, automacoes, email e IA por cliente.

### Fase 3: Integracoes Globais

Entrega:

- catalogo de provedores;
- pagina de integracoes globais;
- status de conexao;
- configuracao publica;
- referencia segura de credencial;
- teste de conexao;
- logs de falha;
- auditoria.

Valor:

- cria local unico para configurar tecnologias da plataforma;
- remove ambiguidade sobre onde entram chaves e provedores.

### Fase 4: Email e SMTP2GO

Entrega:

- pagina Email/SMTP2GO;
- configuracao master;
- subcontas por cliente;
- limites de envio;
- dominios e remetentes;
- suppressions;
- eventos e logs;
- consumo por cliente.

Valor:

- email vira infraestrutura transversal;
- CRM, Automacoes, Suporte e Financeiro usam a mesma governanca.

### Fase 5: IA/LLM

Entrega:

- pagina IA/LLM;
- provedores e modelos;
- modelo padrao global;
- modelo por modulo;
- override por cliente;
- limites de uso;
- logs;
- custos estimados;
- fallback.

Valor:

- IA fica governada comercial e tecnicamente;
- automacoes e CRM passam a ter controle claro de uso.

### Fase 6: Governanca por Modulo

Entrega:

- visao "clientes com CRM";
- visao "clientes com Automacoes";
- visao "clientes com Financeiro";
- visao "clientes com Suporte";
- status, limites, uso e erros por modulo;
- links para configuracoes profundas.

Valor:

- Admin YUX Hub responde "quem tem direito ao que";
- facilita suporte, implantacao e upgrades.

### Fase 7: Auditoria e Saude

Entrega:

- trilha de auditoria administrativa;
- saude consolidada;
- falhas por provedor;
- clientes impactados;
- eventos criticos;
- historico de testes de conexao.

Valor:

- controle operacional real;
- diagnostico mais rapido;
- seguranca para mudancas administrativas.

### Fase 8: Refinamento Comercial

Entrega:

- visao executiva por cliente;
- uso versus contratado;
- clientes proximos do limite;
- oportunidades de upgrade;
- modulos subutilizados;
- recomendacoes internas;
- indicadores de expansao.

Valor:

- Admin YUX Hub tambem vira ferramenta comercial;
- ajuda a YUX vender expansoes com base em uso real.

## Relacoes com Areas Existentes

### CRM

Depende de contrato, limites, blueprint e usuarios. Admin YUX Hub deve exibir
CRM como modulo governado e apontar para `/crm-governance` e `/leads`.

### Automacoes

Depende de contrato, limites, IA, email, webhooks e eventos de outros modulos.
Admin YUX Hub deve mostrar clientes com automacoes e consumo de execucoes.

### Campanhas

Pode consumir email, Ads, CRM, landing pages e relatorios. Admin YUX Hub deve
controlar integracoes de Ads e limites comerciais quando forem implantados.

### Landing Pages

Geram leads para CRM, disparam automacoes e podem depender de dominios e
integracoes de tracking.

### Suporte

Consome email, notificacoes, IA e limites de SLA. Deve aparecer na governanca
por modulo.

### Financeiro

Consome notificacoes por email, automacoes e relatorios de contrato/uso.

### Relatorios

Consolida uso, limite, performance comercial, custos de IA, consumo de email e
saude operacional.

## Regras de Seguranca

- somente admins internos YUX acessam Admin YUX Hub;
- operadores internos podem ter acesso limitado;
- clientes nao acessam a area administrativa;
- credenciais ficam fora do bundle frontend;
- logs nao exibem segredo;
- alteracoes sensiveis geram auditoria;
- RLS deve separar dados de clientes;
- funcoes administrativas devem validar papel interno;
- overrides por cliente devem ser explicitos e auditados.

## Testes Esperados

### Frontend

- sidebar renderiza grupos corretos;
- Admin YUX Hub renderiza cards e atalhos;
- areas administrativas respeitam permissoes;
- estados vazios sao compreensiveis;
- status de provedores aparecem corretamente;
- limites aparecem por cliente/modulo.

### Servicos

- calculo de limite efetivo;
- heranca de pacote para contrato;
- override de contrato;
- override por cliente;
- status de provedor;
- mascaramento de credenciais;
- registro de auditoria.

### Banco/RLS

- admin YUX acessa dados administrativos;
- cliente nao acessa Admin YUX Hub;
- usuario sem permissao nao altera limites;
- credenciais nao sao expostas em consultas publicas;
- auditoria e gravada em alteracoes sensiveis.

## Fora de Escopo Inicial

Estas funcionalidades nao entram neste ciclo de implantacao, mas ficam
preparadas pela arquitetura:

- billing automatico completo;
- checkout self-service;
- marketplace publico de modulos;
- provisioning automatico completo de subcontas em todos os provedores;
- precificacao dinamica;
- rate limiting em tempo real por todos os recursos;
- BI financeiro avancado.

## Criterios de Aceite

O Admin YUX Hub sera considerado implantado quando:

- a sidebar estiver agrupada por categorias;
- existir uma pagina central Admin YUX Hub;
- clientes, contratos, pacotes e modulos tiverem relacao operacional clara;
- limites por modulo forem configuraveis e visiveis;
- integracoes globais tiverem area propria;
- SMTP2GO tiver governanca compartilhada;
- IA/LLM tiver governanca propria;
- seja possivel ver quais clientes possuem CRM e Automacoes;
- falhas e status criticos estejam visiveis;
- mudancas administrativas sensiveis sejam auditadas;
- clientes nao tenham acesso a configuracoes internas da YUX.
