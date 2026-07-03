# Dashboard Interno Mesa De Comando Design

## Objetivo

Evoluir a rota interna `/dashboard` de uma visao geral fraca para uma mesa de
comando do gestor YUX.

A pagina deve responder rapidamente:

> O que precisa ser resolvido, qual oportunidade vale perseguir, quem deve
> cuidar disso e qual impacto esta em jogo?

O publico principal e o gestor interno da YUX, nao um usuario generico da
equipe. A tela deve ajudar a priorizar, distribuir trabalho, escalar riscos,
capturar oportunidades e abrir os modulos corretos para execucao.

## Decisao Aprovada

O dashboard sera um cockpit unico com dois trilhos:

- **Resolver agora**: riscos, incidentes, bloqueios e contas que podem
  prejudicar plataforma, cliente, entrega ou receita.
- **Aproveitar oportunidade**: oportunidades de expansao, performance, growth e
  eficiencia operacional, ranqueadas por impacto financeiro estimado.

O dashboard deve mostrar valores explicitos sempre que houver base suficiente:

- `+R$ 18k potencial`;
- `R$ 4.2k em risco`;
- `14h/semana poupadas`;
- `R$ 8k-12k potencial`, quando for faixa estimada.

Quando o dado for inferido, a UI deve mostrar confianca. Quando nao houver base
quantitativa minima, o sinal nao deve ocupar destaque principal.

## Principios De Conteudo

1. A primeira dobra deve mostrar decisoes, nao metricas decorativas.
2. Cada card deve ter proxima acao clara.
3. Todo risco ou oportunidade deve ter dono sugerido.
4. Impacto deve ser explicito, financeiro ou operacional.
5. A tela deve admitir incerteza com confianca e evidencias.
6. Atalhos devem ser contextuais, derivados do estado da operacao.
7. A pagina deve favorecer gestao diaria e distribuicao de trabalho.

## Estrutura Da Pagina

### 1. Header Operacional

Conteudo:

- titulo: `Visao Geral YUX`;
- subtitulo: `Mesa de comando para riscos, oportunidades e operacao interna.`;
- usuario logado;
- ultima atualizacao;
- seletor de janela: `Hoje`, `7 dias`, `30 dias`;
- estado dos dados: `Completo`, `Parcial`, `Com falha`;
- acao secundaria: `Atualizar indicadores`.

Comportamento:

- se uma fonte falhar, manter a pagina carregada com estado `Parcial`;
- se tudo falhar, mostrar estado de erro com chamada para tentar novamente;
- indicar quais fontes estao incompletas quando possivel.

### 2. Pulso Executivo

Linha curta de indicadores para dar contexto ao gestor antes da fila.

Indicadores recomendados:

- `Riscos abertos`: quantidade de itens no trilho Resolver agora;
- `Oportunidades estimadas`: quantidade e valor total estimado;
- `Clientes em atencao`: clientes com risco, bloqueio ou oportunidade ativa;
- `Impacto financeiro potencial`: soma das oportunidades e riscos com valor;
- `Entregas bloqueadas`: projetos, aprovacoes ou tarefas paradas;
- `Custo/capacidade em alerta`: uso de IA, automacoes, canais ou midia acima do
  esperado.

Cada indicador deve ter:

- valor principal;
- detalhe curto;
- tendencia quando houver comparativo;
- link para a origem quando aplicavel.

Exemplos:

- `8 riscos` / `3 criticos`;
- `R$ 42k` / `potencial estimado`;
- `12 clientes` / `com sinal ativo`;
- `7 aprovacoes` / `vencidas ha mais de 72h`;
- `+31%` / `custo IA em 24h`.

### 3. Trilho Resolver Agora

Objetivo:

Mostrar o que o gestor precisa resolver, atribuir ou escalar antes que a
operacao degrade.

Tipos de item:

- incidente de plataforma;
- provedor degradado ou com falha;
- canal desconectado;
- limite perto de estourar ou bloqueado;
- cliente sem contrato ativo;
- contrato a vencer;
- projeto atrasado;
- aprovacao pendente ha tempo demais;
- tarefa critica vencida;
- custo de IA, midia ou automacao fora do padrao;
- performance negativa relevante.

Campos de cada item:

- categoria: `Incidente`, `Bloqueio`, `Risco`, `Anomalia`;
- severidade: `Critico`, `Alto`, `Medio`;
- titulo;
- entidade afetada: cliente, modulo, provedor, projeto ou contrato;
- impacto explicito;
- urgencia: `Agora`, `Hoje`, `Esta semana`;
- dono sugerido;
- evidencia resumida;
- ultima deteccao;
- acao primaria;
- acoes secundarias.

Exemplos:

```text
Critico · Incidente
SMTP2GO falhando em 2 contas
Impacto: R$ 4.2k em comunicacoes e automacoes em risco
Dono sugerido: Admin
Evidencia: falha nos testes globais de email nos ultimos 18 min
Acao: Testar conexao
```

```text
Alto · Bloqueio
7 aprovacoes aguardando cliente ha mais de 72h
Impacto: 4 projetos parados
Dono sugerido: Operacao / CS
Evidencia: aprovacoes vencidas em Marketing e Projetos
Acao: Abrir aprovacoes vencidas
```

```text
Alto · Risco financeiro
Contrato Cliente Beta vence em 12 dias
Impacto: R$ 9.8k MRR em risco
Dono sugerido: Financeiro / CS
Evidencia: contrato ativo sem renovacao iniciada
Acao: Abrir contrato
```

### 4. Trilho Aproveitar Oportunidade

Objetivo:

Mostrar oportunidades acionaveis de expansao, growth, eficiencia e reducao de
custo, ranqueadas por impacto financeiro estimado.

Tipos de item:

- upsell ou expansao de modulo;
- renovacao com oportunidade de aumento;
- campanha com potencial de escala;
- fonte comercial com performance acima da media;
- cliente com ROAS/MROI forte;
- automacao que reduz esforco operacional;
- uso de IA que pode substituir tarefa repetitiva;
- reducao de custo de modelo, ferramenta ou processo;
- ativacao de modulo contratado mas pouco usado.

Campos de cada item:

- categoria: `Expansao`, `Growth`, `Eficiencia`, `Reducao de custo`;
- impacto explicito;
- confianca: `Alta`, `Media`, `Baixa`;
- esforco: `Baixo`, `Medio`, `Alto`;
- janela: `Agora`, `Esta semana`, `Este mes`;
- cliente ou area afetada;
- dono sugerido;
- evidencia resumida;
- acao primaria;
- link para origem.

Exemplos:

```text
Expansao
Cliente Alpha com ROAS 4.8x e verba 62% consumida
Impacto: +R$ 18k potencial
Confianca: Alta
Esforco: Medio
Dono sugerido: Growth / CS
Evidencia: performance 2.1x acima da media da carteira
Acao: Propor aumento de orcamento
```

```text
Eficiencia
23 tarefas repetitivas podem virar automacao
Impacto: 14h/semana poupadas
Confianca: Media
Esforco: Medio
Dono sugerido: Operacao / IA
Evidencia: tarefas similares em 6 projetos ativos
Acao: Revisar automacoes sugeridas
```

```text
Reducao de custo
Marketing Studio usando modelo acima do necessario
Impacto: R$ 1.7k/mes economizaveis
Confianca: Media
Esforco: Baixo
Dono sugerido: IA / Admin
Evidencia: 64% das execucoes classificadas como baixa complexidade
Acao: Revisar roteamento de modelos
```

## Ranking Dos Trilhos

### Resolver Agora

Ordenar por:

1. severidade;
2. urgencia;
3. impacto financeiro ou operacional;
4. tempo aberto;
5. quantidade de clientes afetados.

Itens criticos devem aparecer no topo mesmo quando o valor financeiro for
menor.

### Aproveitar Oportunidade

Ordenar por:

1. impacto financeiro estimado;
2. confianca;
3. janela de captura;
4. esforco;
5. alinhamento com contrato ou estrategia ativa.

Uma oportunidade de alto impacto com baixa confianca pode aparecer abaixo de
uma oportunidade menor, mas mais confiavel e facil de executar.

## Acoes De Gestao

Cada card deve permitir que o gestor comande a execucao.

Acoes principais:

- `Abrir origem`;
- `Atribuir para`;
- `Marcar em analise`;
- `Escalar`;
- `Ignorar por 7 dias`;
- `Resolver`;
- `Registrar nota`;
- `Abrir workspace do cliente`;
- `Ver evidencia`;
- `Criar tarefa`;
- `Abrir contrato`;
- `Abrir oportunidade`.

Regras:

- a acao primaria deve ser especifica ao tipo de item;
- acoes de atribuicao e status devem registrar auditoria;
- `Ignorar por 7 dias` nao apaga o sinal, apenas reduz prioridade;
- itens criticos ignorados devem voltar se piorarem ou atingirem novo limite.

## Mapa Da Carteira

Abaixo dos trilhos, a tela deve mostrar uma tabela curta para dar ao gestor
contexto por cliente.

Colunas:

- cliente;
- saude;
- contrato;
- projeto;
- performance;
- principal risco;
- principal oportunidade;
- dono atual;
- proxima acao.

Exemplo:

```text
Cliente Alpha | Saudavel | Ativo | Em dia | ROAS 4.8x | Sem risco critico | +R$ 18k midia | Growth | Propor aumento
Cliente Beta  | Atencao  | Vence 12d | Em risco | CTR -22% | R$ 9.8k MRR | Renovacao | CS | Abrir contrato
Cliente Gama  | Critico  | Sem contrato | Parado | Sem dados | Portal bloqueado | Nenhuma | Financeiro | Regularizar contrato
```

Estados:

- se nao houver clientes em atencao, mostrar os clientes com maior oportunidade;
- se nao houver dados suficientes, mostrar estado parcial com link para revisar
  integracoes e contratos;
- permitir filtro por risco, oportunidade, dono e contrato.

## Atalhos Contextuais

Substituir atalhos fixos por atalhos derivados do estado atual.

Exemplos:

- `3 provedores exigem revisao`;
- `7 aprovacoes vencidas`;
- `5 contratos vencem em 30 dias`;
- `R$ 42k em oportunidades detectadas`;
- `12 clientes sem playbook ativo`;
- `4 limites perto do bloqueio`;
- `R$ 1.7k/mes economizaveis em IA`.

Cada atalho deve apontar para a tela de resolucao ou exploracao correta.

Atalhos fixos podem existir como menu secundario, mas nao devem ocupar a area
principal do dashboard.

## Estados Vazios

### Sem Riscos

Titulo:

`Nenhum risco operacional relevante`

Descricao:

`Provedores, contratos, limites, projetos e aprovacoes nao indicam acao urgente nesta janela.`

Acao:

`Ver saude da plataforma`

### Sem Oportunidades

Titulo:

`Nenhuma oportunidade com impacto estimado suficiente`

Descricao:

`A YUX ainda nao tem sinais quantitativos confiaveis para destacar expansao, growth ou eficiencia nesta janela.`

Acoes:

- `Ver relatorios`;
- `Revisar dados de performance`;
- `Abrir carteira de clientes`.

### Dados Parciais

Titulo:

`Indicadores carregados parcialmente`

Descricao:

`Algumas fontes nao responderam. Os itens abaixo podem estar incompletos.`

Detalhe:

- listar fontes indisponiveis quando possivel;
- manter cards que tenham dados confiaveis.

### Falha Total

Titulo:

`Nao foi possivel carregar a mesa de comando`

Descricao:

`Tente novamente ou verifique a saude da plataforma.`

Acoes:

- `Tentar novamente`;
- `Ver saude da plataforma`.

## Dados Necessarios

### Ja Proximos Do Produto Atual

O dashboard atual ja consome:

- `backendDataService.getDashboardStats()`;
- `adminPlatformService.getAdminHubSummary()`;
- contagens de clientes;
- contagens de contratos ativos;
- projetos recentes;
- metricas de marketing basicas;
- provedores com falha;
- limites proximos.

### Novos Agregados Recomendados

Criar um agregado especifico para a mesa de comando, em vez de espalhar a
logica apenas no frontend.

Endpoint recomendado:

`GET /platform/internal-command-center`

Resposta sugerida:

```ts
interface InternalCommandCenterSummary {
  generatedAt: string
  window: 'today' | '7d' | '30d'
  dataStatus: 'complete' | 'partial' | 'failed'
  unavailableSources: string[]
  executivePulse: PulseMetric[]
  resolveNow: CommandCenterItem[]
  opportunities: CommandCenterItem[]
  portfolioMap: PortfolioMapRow[]
  contextualShortcuts: ContextualShortcut[]
}
```

Tipos principais:

```ts
interface CommandCenterItem {
  id: string
  lane: 'resolve_now' | 'opportunity'
  category: string
  severity?: 'critical' | 'high' | 'medium'
  title: string
  affectedEntityLabel: string
  affectedEntityType: 'client' | 'project' | 'contract' | 'provider' | 'module' | 'finance' | 'platform'
  impactLabel: string
  impactAmount?: number
  impactUnit?: 'brl' | 'hours_per_week' | 'percent' | 'count'
  confidence?: 'high' | 'medium' | 'low'
  effort?: 'low' | 'medium' | 'high'
  urgency: 'now' | 'today' | 'this_week' | 'this_month'
  suggestedOwnerRole: string
  evidence: string
  sourceHref: string
  primaryActionLabel: string
  primaryActionHref: string
  detectedAt: string
}
```

## Fontes De Sinal

Resolver agora:

- Admin Health;
- provedores globais;
- canais e integracoes;
- limites de modulos;
- contratos;
- projetos;
- aprovacoes;
- custos de IA;
- finance;
- marketing performance negativa.

Aproveitar oportunidade:

- CRM e funil;
- Marketing Studio;
- relatorios e MROI;
- contratos e modulos ativos;
- uso de portal e workspaces;
- tarefas/projetos recorrentes;
- automacoes;
- custos de IA e roteamento de modelos;
- Strategy Engine quando houver recomendacoes governadas.

## Regras De Exibicao

- mostrar no maximo 5 itens por trilho na primeira dobra;
- permitir `Ver todos` quando houver mais itens;
- sempre mostrar o motivo de ranking no card;
- nunca exibir oportunidade sem evidencia;
- separar valor observado de valor estimado;
- marcar estimativas como `estimado`;
- mostrar confianca quando o impacto nao for diretamente calculado;
- evitar graficos decorativos na primeira versao;
- preferir listas acionaveis e tabelas densas.

## Fora Do Escopo Desta Especificacao

- novo design visual final;
- alteracao de layout em codigo;
- automacao completa de atribuicao;
- criacao automatica de tarefas sem confirmacao;
- novo motor de IA separado;
- exposicao dessa tela no Portal do Cliente;
- mudanca em CRM, Financeiro, Admin ou Marketing Studio fora dos dados
  necessarios para alimentar o dashboard.

## Criterios De Aceite De Conteudo

A nova pagina sera considerada forte quando:

- a primeira dobra mostrar riscos e oportunidades acionaveis;
- cada item tiver impacto, evidencia, dono e acao;
- oportunidades mostrarem impacto financeiro ou operacional explicito;
- dados incertos forem marcados com confianca;
- o gestor puder entender quem deve agir sem abrir outra pagina;
- atalhos principais forem contextuais;
- estados vazios nao parecerem falta de produto;
- falha parcial de dados nao derrubar a pagina inteira;
- o mapa da carteira conectar clientes, risco, oportunidade e proxima acao;
- a tela deixar claro o que fazer nos proximos 15 minutos.

## Implementacao Recomendada Depois Da Aprovacao

1. Criar camada de tipos para `CommandCenterItem`, `PulseMetric`,
   `PortfolioMapRow` e `ContextualShortcut`.
2. Criar agregador backend para a mesa de comando.
3. Alimentar inicialmente com dados ja existentes: admin hub, dashboard stats,
   contratos, projetos, aprovacoes e provedores.
4. Implementar UI do dashboard com dois trilhos.
5. Adicionar mapa da carteira e atalhos contextuais.
6. Adicionar estados parciais, vazios e de erro.
7. Validar com dados reais ou fixtures representativas.
