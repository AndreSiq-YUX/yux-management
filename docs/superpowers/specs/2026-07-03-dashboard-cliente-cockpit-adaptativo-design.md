# Dashboard Cliente Cockpit Adaptativo Design

## Objetivo

Evoluir a dashboard do cliente, usada em `/portal` e
`/client-workspaces/:organizationId`, de uma lista de contrato, onboarding,
acoes e modulos para um cockpit executivo adaptativo.

A pagina deve responder rapidamente:

> Como esta minha operacao contratada, qual resultado merece atencao, o que
> pode travar esse resultado e o que a YUX fez ou recomenda agora?

O publico principal e o decisor do cliente. A tela deve ser clara para quem
quer entender resultado e andamento sem precisar navegar por todos os modulos.
Ela tambem deve ajudar a YUX a demonstrar valor recorrente e identificar
oportunidades de expansao sem parecer uma vitrine generica de venda.

## Decisao Aprovada

A dashboard sera um **Cockpit Executivo Adaptativo**.

A arquitetura visual sera fixa, seguindo o padrao refinado do dashboard interno:

- fundo neutro `#f4f4f4`;
- paineis sobrios com bordas finas;
- destaque azul YUX para acoes primarias;
- tipografia consistente com a escala Tailwind;
- densidade operacional, sem hero decorativo;
- sidebar como area de marca, sem logo dentro do conteudo da pagina.

O conteudo principal muda conforme uma **lente principal** definida pelo
contrato:

- `commercial`: foco comercial e CRM;
- `marketing`: foco marketing, midia e conteudo;
- `delivery`: foco entregas, projetos, aprovacoes e suporte;
- `executive`: foco executivo hibrido.

Inicialmente, a lente deve nascer automaticamente a partir do contrato e dos
modulos ativos. A YUX deve poder editar essa lente no Admin/contrato quando a
realidade do cliente exigir outro foco.

## Principios De Conteudo

1. A primeira dobra deve mostrar resultado, nao apenas pendencias.
2. Pendencias devem aparecer como pontos de atencao que podem travar resultado.
3. A pagina deve variar por contrato sem virar quatro dashboards diferentes.
4. Modulos nao contratados nao entram nos indicadores operacionais principais.
5. Expansao comercial deve ser consultiva e separada dos modulos ativos.
6. Toda recomendacao deve ter justificativa concreta.
7. Estados vazios devem explicar ausencia de dados sem parecer tela quebrada.
8. Dados internos da YUX nunca devem aparecer no portal do cliente.
9. A dashboard deve mostrar trabalho da YUX de forma objetiva e auditavel.
10. A experiencia deve ser consistente entre portal do cliente e workspace
    interno de cliente.

## Lente Principal Do Contrato

### Regra Inicial

O contrato deve possuir um campo governado pela YUX, por exemplo:

```ts
type PortalDashboardFocus = 'commercial' | 'marketing' | 'delivery' | 'executive'
```

Esse foco pode ser calculado automaticamente ao criar ou atualizar um contrato.

### Default Automatico

Sugestao de regra inicial:

- se o contrato tem CRM/comercial como modulo principal, usar `commercial`;
- se o contrato tem campanhas, landing pages ou marketing studio como modulos
  principais, usar `marketing`;
- se o contrato e majoritariamente projeto, suporte, aprovacao ou entrega, usar
  `delivery`;
- se o contrato mistura varias frentes relevantes, usar `executive`.

Quando houver conflito, o pacote contratado ou um campo `primaryFocus` do
contrato deve vencer a heuristica.

### Override Manual Pela YUX

A YUX deve poder editar a lente do contrato no Admin.

Requisitos:

- registrar quem alterou e quando;
- manter a lente visivel como contexto para o cliente;
- nao expor no portal que a lente foi configurada manualmente;
- permitir trocar foco sem mudar o contrato juridico ou os modulos ativos.

## Estrutura Da Pagina

### 1. Cabecalho Executivo

Objetivo:

Contextualizar o cliente, o contrato e a lente ativa.

Conteudo:

- nome da empresa;
- status do contrato;
- lente principal:
  - `Foco comercial`;
  - `Foco marketing`;
  - `Foco entregas`;
  - `Foco executivo`;
- janela: `Hoje`, `7 dias`, `30 dias`;
- ultima atualizacao;
- estado dos dados: `Completo`, `Parcial`, `Com falha`;
- acao primaria: `Atualizar visao`;
- microcopy curta explicando o que a YUX esta monitorando naquele contrato.

Exemplo:

```text
Visao executiva da operacao comercial, campanhas e entregas priorizadas
conforme o contrato ativo.
```

Comportamento:

- o seletor de janela deve ter estado real;
- se ainda nao houver suporte backend para filtro por janela, a UI nao deve
  fingir dados filtrados;
- se uma fonte falhar, manter a pagina em estado parcial;
- se todas as fontes falharem, mostrar erro recuperavel.

### 2. Pulso Executivo Adaptativo

Objetivo:

Dar uma leitura compacta de saude e resultado antes das secoes detalhadas.

Formato:

- uma faixa horizontal com 4 ou 5 metricas;
- divisorias finas;
- labels uppercase em tamanho legivel;
- icones discretos;
- sem cards soltos ou graficos decorativos.

Metricas por lente:

#### Foco Comercial

- oportunidades abertas;
- follow-ups vencidos;
- propostas em andamento;
- receita potencial;
- conversao do periodo.

#### Foco Marketing

- leads gerados;
- CPL/CPA;
- ROAS ou CTR;
- campanhas ativas;
- criativos pendentes.

#### Foco Entregas

- projetos ativos;
- entregaveis em revisao;
- aprovacoes pendentes;
- marcos proximos;
- SLA de suporte.

#### Foco Executivo

- saude geral;
- resultado principal;
- pendencias criticas;
- proxima entrega;
- valor gerado ou estimado.

Regras:

- modulos nao contratados nao devem aparecer como metrica principal;
- se nao houver dados suficientes, mostrar `Sem dados` com detalhe util;
- evitar zeros enganosos quando o dado nao foi carregado;
- usar comparativo/tendencia apenas quando houver base confiavel.

### 3. Resultado Principal

Objetivo:

Mostrar o principal resultado do contrato no periodo. Esta e a area mais
importante da dashboard do cliente.

Formato:

- painel largo;
- lado esquerdo com leitura executiva e principal numero;
- lado direito com 3 sinais compactos;
- rodape com CTA azul YUX ou link textual;
- sem grade generica.

#### Foco Comercial

Titulo:

`Resultado comercial`

Conteudo:

- leads novos;
- oportunidades;
- propostas;
- receita potencial;
- gargalo principal.

CTA:

`Ver comercial`

#### Foco Marketing

Titulo:

`Performance de marketing`

Conteudo:

- campanhas;
- investimento;
- leads;
- CPL/CPA;
- ROAS/CTR;
- principal oportunidade ou desperdicio.

CTA:

`Ver marketing`

#### Foco Entregas

Titulo:

`Andamento das entregas`

Conteudo:

- projetos ativos;
- entregaveis;
- aprovacoes;
- proximos marcos;
- risco de prazo.

CTA:

`Ver projetos`

#### Foco Executivo

Titulo:

`Resumo executivo`

Conteudo:

- melhor sinal de crescimento;
- principal entrega;
- pendencia relevante;
- recomendacao da YUX;
- indicador consolidado de saude.

CTA:

`Ver relatorios` ou rota da area prioritária.

### 4. Pontos De Atencao

Objetivo:

Mostrar itens que podem travar resultado, entregas ou atendimento.

Tipos:

- aprovacoes pendentes;
- follow-ups atrasados;
- faturas proximas ou vencidas;
- criativos aguardando revisao;
- projetos em revisao;
- integracoes ou canais que exigem acao do cliente;
- briefings ou documentos faltantes.

Campos de cada item:

- tipo;
- prioridade: `critical`, `high`, `normal`;
- titulo;
- descricao;
- impacto;
- responsavel esperado: `Cliente`, `YUX`, `Equipe comercial`, `Financeiro`,
  `Operacao`;
- CTA direto;
- origem/rota.

Regras:

- ordenar por severidade, impacto e prazo;
- limitar a primeira visao a 4 ou 6 itens;
- cada item deve explicar por que importa;
- pendencias da YUX nao devem ser mascaradas como pendencia do cliente;
- se a acao for do cliente, isso deve estar explicito.

Empty state:

```text
Nenhum ponto de atencao critico
A operacao contratada nao indica bloqueios imediatos nesta janela.
```

### 5. Trabalho Da YUX E Recomendacoes

Objetivo:

Responder:

> O que a YUX fez por mim e o que recomenda agora?

Formato:

duas colunas:

- `Executado pela YUX`;
- `Recomendado agora`.

Conteudo possivel:

- campanha ajustada;
- criativo enviado;
- automacao criada;
- lead revisado;
- entrega publicada;
- suporte respondido;
- relatorio atualizado;
- recomendacao de verba;
- recomendacao de follow-up;
- recomendacao de aprovacao;
- recomendacao de base de conhecimento;
- recomendacao de canal ou integracao;
- recomendacao de proposta.

Campos de cada item:

- titulo;
- origem;
- data ou periodo;
- impacto esperado ou observado;
- link para area relacionada.

Regras:

- nao exibir custo interno;
- nao exibir fornecedor, modelo de IA, margem ou dado administrativo da YUX;
- nao inflar a lista com atividade irrelevante;
- priorizar itens com impacto no contrato;
- mostrar empty state honesto quando nao houver atividade.

Empty state:

```text
Nenhuma atividade recente registrada nesta janela.
```

### 6. Modulos Contratados E Expansao Recomendada

Objetivo:

Mostrar o que esta ativo no contrato e sugerir expansao quando houver aderencia
real.

#### Bloco A: Modulos Contratados

Mostrar apenas modulos ativos.

Campos:

- area/modulo;
- status operacional:
  - `Ativo`;
  - `Precisa de atencao`;
  - `Sem dados`;
  - `Em implantacao`;
- principal sinal;
- proximo caminho recomendado.

Exemplos:

```text
Comercial | 12 leads ativos | 3 follow-ups pendentes
Marketing | 4 campanhas ativas | CPL em queda
Projetos | 2 entregaveis aguardando aprovacao
Financeiro | proxima fatura em 12 dias
```

#### Bloco B: Oportunidades De Expansao

Mostrar modulos ainda nao contratados apenas quando houver justificativa real.

Campos:

- modulo sugerido;
- por que faz sentido;
- ganho esperado;
- CTA consultivo:
  - `Conversar com a YUX`;
  - `Solicitar proposta`;
  - `Entender modulo`.

Exemplos:

```text
Automacao comercial
Ha follow-ups recorrentes e tarefas manuais no CRM.
Ganho esperado: reduzir tarefas repetitivas da equipe comercial.
```

```text
Marketing Studio
O cliente possui campanhas ativas, mas ainda nao centraliza conteudo e
aprovacoes.
Ganho esperado: reduzir retrabalho e acelerar publicacao.
```

```text
Relatorios BI
Ha dados em multiplos modulos, mas sem visao consolidada.
Ganho esperado: leitura executiva recorrente de resultado.
```

Regras:

- nao mostrar vitrine com todos os modulos ausentes;
- limitar a 2 ou 3 recomendacoes;
- ranquear por aderencia aos sinais operacionais e ao contrato atual;
- separar visualmente de modulos contratados;
- manter tom consultivo, nao promocional.

## Estados De Dados

### Completo

Todas as fontes relevantes responderam.

### Parcial

Algumas fontes falharam, mas a dashboard ainda possui sinais confiaveis.

Exibir:

- estado `Parcial`;
- fontes indisponiveis quando possivel;
- dados carregados normalmente;
- ausencia de metricas apenas onde a fonte faltou.

### Com Falha

Nao foi possivel carregar a visao executiva.

Exibir:

- mensagem clara;
- botao `Tentar novamente`;
- opcionalmente link para suporte ou contato YUX.

### Sem Dados

Fonte respondeu, mas nao ha dados.

Exibir:

- `Sem dados`;
- detalhe explicando o motivo provavel;
- CTA de configuracao quando aplicavel.

## Dados Necessarios

### Ja Proximos Do Produto Atual

A pagina atual ja usa ou tem acesso proximo a:

- contrato ativo;
- organizacao;
- modulos ativos;
- status do contrato;
- onboarding setorial;
- proximas acoes via `usePortalActionSummary`;
- aprovacoes;
- projetos;
- faturas;
- contexto CRM;
- contexto marketing;
- navegacao filtrada por contrato.

### Agregado Recomendado

Criar um agregado especifico para a dashboard do cliente, evitando espalhar
regras apenas no componente de pagina.

Endpoint recomendado:

`GET /portal/executive-dashboard`

Resposta sugerida:

```ts
interface PortalExecutiveDashboard {
  generatedAt: string
  window: 'today' | '7d' | '30d'
  dataStatus: 'complete' | 'partial' | 'failed'
  unavailableSources: string[]
  contract: {
    id: string
    name: string
    status: string
    startsAt: string
    packageName?: string
    focus: PortalDashboardFocus
  }
  pulse: PortalPulseMetric[]
  mainResult: PortalMainResult
  attentionItems: PortalAttentionItem[]
  yuxActivity: PortalYuxActivityItem[]
  recommendations: PortalRecommendationItem[]
  activeModules: PortalModuleSummary[]
  expansionSuggestions: PortalExpansionSuggestion[]
}
```

Tipos principais:

```ts
interface PortalPulseMetric {
  id: string
  label: string
  value: string
  detail: string
  tone: 'healthy' | 'attention' | 'critical' | 'neutral'
  href?: string
}

interface PortalMainResult {
  focus: PortalDashboardFocus
  title: string
  headlineMetric: string
  headlineDetail: string
  narrative: string
  signals: Array<{
    label: string
    value: string
    detail: string
    tone: 'positive' | 'attention' | 'critical' | 'neutral'
  }>
  ctaLabel: string
  ctaHref: string
}

interface PortalAttentionItem {
  id: string
  priority: 'critical' | 'high' | 'normal'
  kind: 'approval' | 'commercial' | 'finance' | 'project' | 'marketing' | 'integration' | 'support'
  title: string
  description: string
  impactLabel: string
  expectedOwner: string
  href: string
  actionLabel: string
}

interface PortalExpansionSuggestion {
  id: string
  moduleKey: string
  moduleName: string
  reason: string
  expectedGain: string
  ctaLabel: string
  href: string
  confidence: 'high' | 'medium' | 'low'
}
```

## Regras De Privacidade E Exposicao

Nunca exibir no portal do cliente:

- custo interno de IA;
- margem;
- fornecedor tecnico;
- provedores internos da YUX;
- erros de infraestrutura sem linguagem orientada ao cliente;
- dados de outros clientes;
- notas internas;
- configuracoes de roteamento de modelo;
- detalhes de Strategy Engine que sejam governanca interna.

Pode exibir:

- status operacional em linguagem de cliente;
- recomendacoes aprovadas para cliente;
- entregas e atividades visiveis;
- impactos observados ou estimados com confianca adequada;
- pendencias do cliente e da YUX quando forem relevantes para o contrato.

## Regras De Expansao Recomendada

Uma sugestao de modulo so pode aparecer quando pelo menos um destes sinais
existir:

- modulo atual gera demanda recorrente que outro modulo resolveria;
- gargalo repetido foi detectado;
- dados suficientes mostram oportunidade de ganho;
- cliente tem contrato/pacote que costuma evoluir para o modulo sugerido;
- YUX marcou manualmente a sugestao como apropriada.

Sugestoes devem ser ocultadas quando:

- cliente esta em risco financeiro critico;
- contrato esta suspenso;
- nao ha dado minimo para justificar;
- sugestao compete com pendencia urgente;
- modulo sugerido nao esta disponivel para aquele perfil.

## Fora Do Escopo Desta Especificacao

- implementar o design em codigo;
- criar prototipo visual final;
- alterar Admin para editar foco do contrato;
- criar novo endpoint backend completo;
- criar motor de recomendacao de upsell com IA;
- modificar modulos internos fora do necessario para alimentar a dashboard;
- expor dados internos da YUX no portal.

## Criterios De Aceite De Conteudo

A dashboard sera considerada forte quando:

- o cliente entender a saude do contrato em menos de 30 segundos;
- a primeira dobra mostrar resultado principal alinhado ao foco do contrato;
- pendencias aparecerem como pontos de atencao com impacto e CTA;
- a pagina demonstrar trabalho recente da YUX;
- recomendacoes forem especificas e justificadas;
- modulos contratados estiverem separados de expansao sugerida;
- modulos nao contratados nao poluirem a visao operacional;
- estados vazios forem informativos;
- falha parcial nao derrubar a tela inteira;
- a experiencia visual seguir o padrao premium refinado no dashboard interno.

## Implementacao Recomendada Depois Da Aprovacao

1. Criar tipos e regras de modelo para `PortalExecutiveDashboard`.
2. Derivar uma primeira versao do modelo com dados ja existentes:
   contrato, modulos, `usePortalActionSummary`, CRM, marketing, projetos,
   faturas e onboarding.
3. Criar regra de foco principal automatico por contrato/modulos.
4. Preparar ponto de extensao para override manual futuro.
5. Gerar prototipo visual da tela usando o padrao do dashboard interno.
6. Implementar UI em `PortalDashboardPage`.
7. Validar `/portal` e `/client-workspaces/:organizationId`.
8. Adicionar testes focados para regras de foco, exibicao de modulos,
   pontos de atencao e expansao recomendada.
