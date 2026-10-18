# Portal do Cliente: identidade visual única e usabilidade — plano de implementação

> **Para agentes:** execute as tarefas nesta ordem, uma fase por vez, preservando mudanças não relacionadas na árvore de trabalho. Decisões D1–D4 respondidas em 17/10/2026. Respeitar também o `AGENTS.md` da raiz (confidencialidade do Radar e proibição de chamadas pagas externas).

**Objetivo:** fazer todas as telas do Portal do Cliente seguirem a mesma linguagem visual aprovada na prévia da Visão Geral, corrigir os problemas de confiança e de usabilidade apontados nas avaliações de 17/10/2026 e garantir boa experiência no celular.

**Referências**
- Prévia aprovada da Visão Geral: https://claude.ai/artifact/GLSKpQEejEidHZpHCHEyYh (aprovada pelo usuário em 17/10/2026, incluindo cores, menu lateral escuro e barra em gradiente do item ativo).
- Site comercial (fonte da identidade): https://yux.com.br
- Especificação vigente do dashboard: `docs/superpowers/specs/2026-07-03-dashboard-cliente-cockpit-adaptativo-design.md` (o foco adaptativo continua valendo).
- Mapa de páginas: `docs/mapa-paginas-e-funcionalidades.md`.

**Stack:** React 18, TypeScript, Tailwind 3 + componentes shadcn (`frontend/src/components/ui`), Recharts (já instalado), Fastify/Postgres no backend, Vitest e Playwright.

---

## Regras globais (valem para todas as tarefas)

1. **Não unificar telas de módulos diferentes.** O acesso do portal é liberado por módulo contratado (`moduleKey` em `lib/platform/moduleRegistry.ts`). Telas parecidas em módulos distintos (calendários, tarefas, aprovações, canais) continuam separadas; a correção é deixar nome e objetivo claros. Consolidar só quando as duas telas estão no **mesmo** módulo e servem ao **mesmo** objetivo, ou quando são literalmente a mesma rota duplicada.
2. **Nada fictício em produção.** Sem dados de demonstração, números fixos, "Atualizado agora" fixo ou mensagens de sucesso para ações que não aconteceram. Sem dados reais, a tela mostra um estado vazio honesto que diz o que vai aparecer e como começar.
3. **Nada é ocultado; o que não funciona ainda fica marcado como "Pendente".** Se uma ação ou um bloco depende de backend que ainda não existe, ele continua visível, com o selo "Pendente" e sem simular sucesso: ao clicar, explica que a função está em implantação. Toda marcação vem do registro central da Tarefa 2.6 (código `B1`…`B8`), para que nenhuma pendência seja esquecida antes da liberação total.
4. **Celular é requisito, não ajuste.** Cada tarefa de tela só termina depois de conferida em 390px, 768px, 1280px e 1440px de largura (ver "Padrões de celular").
5. **Texto para o cliente.** Português com acentos, segunda pessoa, verbos de ação ("Aprove", "Veja"), sem jargão interno. Glossário na tarefa 2.5.
6. **Preservar o modo workspace interno.** As mesmas páginas são abertas pela equipe YUX em `/client-workspaces/:id`. Todo link interno usa `usePortalWorkspacePath()`.
7. **Componentes compartilhados com o Hub interno** (`CrmWorkspace`, `AutomationsPage`, `ReportsWorkspace`, `EmailTemplateWorkspace`, `MissionsWorkspace`, `ConnectedChannelsWorkspace`) mudam por *props* de variante (`profile="portal"`). Cada tarefa que mexer neles confere que a tela interna equivalente continua funcionando.
8. **Testes acompanham o texto.** Ao trocar textos, atualizar os testes Vitest das páginas (`frontend/src/pages/client-portal/**/*.test.tsx`) na mesma tarefa.

## Decisões (respondidas em 17/10/2026)

| # | Decisão | Resposta |
|---|---|---|
| D1 | Os novos tokens (cores, fontes, raio) valem para todo o app, inclusive o Hub interno, ou só para o portal? | **Todo o app.** O redesenho de **layout** fica restrito ao portal neste plano; o Hub interno herda cores, fontes e o novo menu. |
| D2 | O modo escuro entra no lançamento? | Tokens escuros desde a Fase 2; **botão de tema exposto só na Fase 12**. |
| D3 | O que fazer com funções que dependem de backend novo? | **Nada é ocultado.** Ficam visíveis com o selo "Pendente" (regra 3 e Tarefa 2.6). O backend é uma trilha própria e todas as pendências serão resolvidas antes da liberação total. |
| D4 | Concorrentes e inspirações em Criativos sem fonte real | Remover os dados fixos; estado vazio orientado até haver integração. |

## Pré-requisitos

- [x] Branch `feat/portal-identidade-visual` criada a partir de `origin/main` (f85be39, que já inclui a entrega de Projetos), na worktree `.worktrees/portal-identidade`. O trabalho do WhatsApp SaaS (branch `codex/whatsapp-saas-task2`, com alterações sem commit) segue separado; a **Fase 8 só começa depois que ele for integrado**, pois altera `PortalConnectedChannelsPage.tsx`, `ConnectedChannelCard.tsx`, `ConnectedChannelsWorkspace.tsx` e `metaChannelService.ts`.
- [x] O branch `codex/portal-accents-main` (25/09) nunca foi integrado; os acentos do portal são tratados pelas Tarefas 2.5 e de cada tela.
- [x] Rodar `npm run type-check`, `npm run test` e `npm run build` em `frontend/` para registrar a linha de base.

## Ordem das fases

| Fase | Conteúdo | Depende de |
|---|---|---|
| 1 | Confiança: remover o falso e o quebrado | — |
| 2 | Fundação visual: tokens, fontes, componentes base, glossário | — (pode correr junto da 1) |
| 3 | Moldura: menu lateral, cabeçalho, navegação, gaveta no celular | 2 |
| 4 | Visão Geral (implementar a prévia) | 2, 3 |
| 5 | Modelo de página + área Empresa | 2, 3 |
| 6 | Projetos, Aprovações, Propostas, Documentos | 5 |
| 7 | Comercial | 5 |
| 8 | Atendimento | 5 e pré-requisito do WhatsApp |
| 9 | Marketing | 5 |
| 10 | Automações e Missões | 5 |
| 11 | Relatórios, Financeiro, Suporte, Minha conta, Modelos de e-mail | 5 |
| 12 | Verificação final, acessibilidade, modo escuro | todas |

As fases 6 a 11 mexem em arquivos diferentes e podem ser feitas em paralelo, em sessões separadas, depois que a Fase 5 estiver integrada.

---

## Padrões de celular (aplicar em todas as fases)

- **Larguras de teste:** 390px (celular), 768px (tablet), 1280px e 1440px (desktop). Nenhuma pode ter rolagem horizontal da página.
- **Menu:** abaixo de 1024px, o menu lateral vira gaveta (Tarefa 3.2).
- **Grades:** usar quantidades de colunas que a lista preenche (6 indicadores → 6/3/2 colunas; 8 módulos → 4/2/1). Nada de cartão sozinho numa linha.
- **Tabelas:** em até 720px, viram lista de cartões ou ficam dentro de um contêiner com rolagem horizontal própria.
- **Lista + detalhe** (conversas, chamados, conteúdo, campanhas): no celular, o detalhe abre em tela cheia com botão "Voltar", ou como painel inferior (bottom sheet).
- **Formulários longos:** barra de salvar fixa no rodapé da tela, com aviso de alterações não salvas.
- **Alvos de toque:** mínimo de 40×40px; espaço de 8px entre botões vizinhos.
- **Tipografia:** texto mínimo de 12px; rótulos em caixa alta, mínimo de 11px.
- **Sem informação só no hover:** tooltips não podem carregar a única explicação (motivo de botão desabilitado aparece como texto).
- **Áreas seguras:** cabeçalho fixo e gaveta respeitam `env(safe-area-inset-*)`.
- **Kanban e quadros:** no celular, a visualização padrão é lista; o kanban rola horizontalmente com encaixe por coluna.

---

## Fase 1 — Confiança: remover o falso e o quebrado

Objetivo: nenhuma tela mostra dado inventado, botão sem ação ou link quebrado. É a fase mais rápida e a de maior impacto.

### Tarefa 1.1 — Remover dados fictícios e textos fixos

**Arquivos:** `components/campaigns/PortalCampaignsWorkspace.tsx`, `pages/client-portal/marketing/PortalOrganicContentPage.tsx`, `pages/client-portal/marketing/PortalCreativeAssetsPage.tsx`, `components/action-engine/MissionDashboard.tsx`, `components/omnichannel/PortalOmnichannelWorkspace.tsx`, `lib/client-portal/portalDashboardRules.ts`, `components/navigation/Header.tsx`.

- [x] Campanhas: remover `demoRows` (usado quando não há campanhas), "+14% vs período anterior", "Meta e Google conectados", "Atualizado agora", o histórico fixo ("Orçamento atualizado", "Criativo aprovado") e as recomendações fixas por linha. Estado vazio: "Nenhuma campanha ainda" com o botão "Nova campanha".
- [x] Campanhas: parar de dividir o gasto da campanha igualmente entre criativos; mostrar métricas por criativo só se vierem da fonte.
- [x] Central de Conteúdo: remover `fallbackAssets` (completava a lista até 12 itens com exemplos).
- [x] Criativos: remover `competitors` (inclui o nome real "V4 Company"), `collections` com contagens fixas e `fallbackInspirations`. Os indicadores do topo passam a usar só dados reais.
- [x] Missões: remover "Pack operacional v0 / Revenue Recovery" fixo do indicador e de cada linha.
- [x] Conversas: remover o SLA padrão de 98% (`slaOnTimeRate || 0.98`). O indicador continua visível com o selo "Pendente" e sem número até existir cálculo real (B5).
- [x] Visão Geral: trocar `generatedAtLabel: 'Atualizado agora'` pelo horário real do último carregamento ("há 12 min").
- [x] Cabeçalho: remover o número "3" fixo do sino (ver Tarefa 3.3).
- [x] Teste de proteção: um teste Vitest que procura nos arquivos do portal os identificadores removidos (`demoRows`, `fallbackAssets`, `fallbackInspirations`, `0.98`, `'Atualizado agora'`) e falha se voltarem.

### Tarefa 1.2 — Botões e ações que não fazem nada

**Arquivos:** `PortalCampaignsWorkspace.tsx`, `pages/client-portal/PortalCampaignsPage.tsx`, `components/crm/CrmWorkspace.tsx`, `pages/automations/AutomationsPage.tsx`, `components/navigation/Sidebar.tsx`, `pages/auth/LoginPage.tsx`, `components/navigation/Header.tsx`.

- [x] Campanhas: "Atualizar dados" passa a recarregar de verdade; "Criar variação" e "Ver detalhes" ficam marcados como Pendente (B13); pedir revisão de campanha deixa de mostrar só "Campanha selecionada para revisão".
- [x] Leads (variante portal): "Importar CSV" (o envio hoje só mostra "Preview de importação validado") fica marcado como Pendente (B2); as ações de segmento (criar tarefa, automação, campanha, exportar, salvar segmento), que só mostram mensagem, ficam marcadas como Pendente (B9) e deixam de mostrar sucesso.
- [x] Automações: "Reprocessar execução" hoje só faz `console.log` com mensagem de sucesso; fica marcado como Pendente (B8).
- [x] Menu lateral: remover o botão "Configurações" sem ação (Minha conta entra pelo menu do usuário, Tarefa 3.3).
- [x] Login: ligar "Lembrar de mim" à duração da sessão ou remover a opção.
- [x] Cabeçalho: remover a busca do celular que não busca nada (Tarefa 3.3 decide a busca).

### Tarefa 1.3 — Aprovações que não são salvas

**Arquivos:** `PortalOrganicContentPage.tsx`, `PortalCreativeAssetsPage.tsx`, `services/marketingStudio*`.

- [x] Central de Conteúdo: "Aprovar" e "Pedir ajustes" passam a usar o endpoint existente `POST /marketing-studio/journey/contents/:contentId/review`, com comentário obrigatório para ajustes, trava contra duplo envio e recarga depois da decisão (mesmo padrão de `PortalProjectsPage`).
- [x] Criativos: "Aprovar"/"Pedir ajustes" (hoje só mudam o estado local) ficam marcados como Pendente (B3) e deixam de simular a mudança.

### Tarefa 1.4 — Links e rotas quebrados

**Arquivos:** `PortalOmnichannelWorkspace.tsx`, `components/client-portal/PortalEmptyState.tsx`, `App.tsx`, `lib/platform/navigation.ts`, `pages/client-portal/projects/PortalDocumentsPage.tsx`.

- [x] "Conectar canais" em Conversas aponta para `/canais` (rota inexistente). Trocar por `portalPath('/portal/atendimento/canais')`.
- [x] `PortalEmptyState`: usar `usePortalWorkspacePath()` no link de ação.
- [x] Criar a rota `portal/projetos/propostas` com `PortalProposalsPage` (backend `GET /proposals/portal` e decisão já existem). O item "Propostas" do menu passa a apontar para ela. Redirecionar `portal/proposals` para a nova rota.
- [x] Documentos: cada proposta da lista abre a página de Propostas.

### Tarefa 1.5 — Filtros de período que não filtram

**Arquivos:** `lib/client-portal/portalDashboardRules.ts` (+ teste), `PortalDashboardPage.tsx`, `PortalCampaignsWorkspace.tsx`.

- [x] Visão Geral: Hoje / 7 dias / 30 dias filtram de fato. Cada indicador declara se é **do período** (novos leads, conversão, tempo de resposta) ou **posição atual** (oportunidades abertas, valor em negociação); a posição atual mostra a variação desde o início do período. Calcular no front a partir de `createdAt`/`updatedAt`/`closedAt` dos registros já carregados, e calcular o período anterior equivalente para a comparação.
- [x] Indicador sem dado suficiente para comparar mostra só o valor, sem variação.
- [x] Campanhas: o seletor de período filtra pelos dados com data; se a fonte não tiver granularidade diária, o seletor fica marcado como Pendente (B10).
- [x] Testes de regra para os três períodos e para o período anterior.

### Tarefa 1.6 — Estados de erro sem saída

- [x] Relatórios: se o carregamento falhar, mostrar erro com "Tentar novamente" em vez de "Carregando relatórios..." para sempre (`PortalReportsPage.tsx:38`).
- [x] Missões: trocar a mensagem técnica de erro (`cause.message`) por texto amigável com "Tentar novamente".
- [x] Revisar os demais carregamentos do portal: todo `catch` que hoje só mostra uma notificação deve deixar um estado de erro visível na tela.

### Tarefa 1.7 — Textos internos expostos ao cliente

- [x] Remover as notas internas do `PortalJourneyPage` ("Nesta fase, esta página define a responsabilidade de produto…", "A regra de produto é evitar bases duplicadas…").
- [x] Agente IA: remover "Ainda não há um contrato dedicado de perguntas sem resposta nesta tela"; trocar o título técnico `workflowId` por um nome legível.
- [x] Canais: a mensagem "Configuração Meta incompleta: META_GRAPH_VERSION" vira "A conexão com a Meta ainda não está disponível. Fale com a YUX." (o detalhe técnico vai só para o log).
- [x] Perfil da Empresa: remover "Agent Harness" e "OpenRouter" da mensagem de erro do "Preencher com o site".
- [x] Formulários externos: remover `form.submitted` do texto.
- [x] Automações: "e-mails do YUX Hub" → "e-mails da sua empresa".
- [x] Conversas: "Simular evento" visível só para papéis internos da YUX.

**Critério de pronto da Fase 1:** nenhum número, texto de status ou item de lista do portal é inventado; todo botão visível faz o que diz; testes atualizados passando.

---

## Fase 2 — Fundação visual

### Tarefa 2.1 — Tokens de design

**Arquivos:** `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/index.html`.

- [x] Paleta da marca (do site): `blue` 400 `#5c8bff` / 500 `#2e6bff` / 600 `#1f57e8`; `violet` 400 `#9a83ff` / 500 `#7b5cff`; `magenta` 400 `#dc6ad6` / 500 `#c93cc0`; `signal` 500 `#2ee6a8`; `alert` 500 `#ff9f45`; escala `ink` 600 `#232a45` a 950 `#04050a`.
- [x] Gradiente da marca: `linear-gradient(100deg, #2e6bff 0%, #7b5cff 52%, #c93cc0 100%)` como token (`--grad-brand`) e utilitário Tailwind.
- [x] Tokens semânticos em variáveis CSS (claro e escuro, valores da prévia): `--bg`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--fg`, `--fg-2`, `--fg-3`, `--ok`/`--ok-soft`/`--ok-line`, `--warn…`, `--crit…`, `--side-*` (menu escuro nos dois temas).
- [x] Mapear as variáveis do shadcn para a marca: `--primary` = azul `#2e6bff` (hoje é quase preto), `--ring` azul, `--radius` 8px. Assim `Button`, `Badge`, `Tabs` e `Progress` adotam a marca sem editar cada tela.
- [x] Redefinir a escala `yux-*` como apelido do novo azul, para que os 59 arquivos que usam `yux-*` mudem de cor sem edição imediata. Migrar para os nomes novos aos poucos, nas fases de tela.
- [x] Fontes: Space Grotesk (títulos e números), Inter (texto), JetBrains Mono (rótulos e etiquetas), Instrument Serif itálica (só um destaque por tela, opcional). Preferir hospedar localmente com `@fontsource/*` (sem dependência do Google em produção); conferir `npm run bundle:budget`.
- [x] Números com `font-variant-numeric: tabular-nums` em indicadores, tabelas e valores.
- [x] Remover do código os hex soltos do estilo antigo (`#2563EB`, `#141821`, `#050816`, `#f4f4f4`, `#635BFF`) à medida que cada tela for migrada; um teste de proteção na Fase 12 impede que voltem.

### Tarefa 2.2 — Componentes base do portal

**Pasta nova:** `frontend/src/components/portal-ui/` (cada componente com teste).

- [x] `PageHeader` — rótulo mono (eyebrow) com status "dados atualizados há X", título, frase de apoio, etiquetas de contexto e área de ações. Uma única ação principal por página.
- [x] `SectionCard` — cartão de seção com título, subtítulo e link "ver mais" à direita.
- [x] `StatusChip` — variantes `ok`, `warn`, `crit`, `neutral` e `yux` (borda em gradiente = feito pela YUX).
- [x] `KpiGrid` + `KpiCard` — rótulo, valor, variação com cor de significado (cada indicador declara se subir é bom ou ruim), texto de comparação, mini-gráfico e seta quando clicável. Grade 6/3/2.
- [x] `Sparkline` e `BarList`/`FunnelBars` em SVG com tokens de cor; gráficos maiores com Recharts usando os mesmos tokens.
- [x] `DecisionCard` — faixa de urgência, módulo, tempo de espera, título, descrição e até duas ações. Botão em gradiente só quando quem pede é a YUX ou um agente.
- [x] `AttentionItem` — prioridade escrita, responsável, tempo de espera e ação.
- [x] `Timeline` — marcadores em gradiente para trabalho da YUX, data em cada item.
- [x] `ProgressRow` — barra de progresso com previsão e etiqueta de status.
- [x] `EmptyState`, `ErrorState` (com "Tentar novamente") e `Skeleton` no formato final de cada bloco.
- [x] `PeriodSelector` — Hoje / 7 dias / 30 dias com a frase de comparação.
- [x] `ConfirmDialog` — confirmação para ações destrutivas ou irreversíveis (Radix Dialog).
- [x] `StickySaveBar` — barra fixa com "Salvar" e aviso de alterações não salvas (inclui bloqueio de navegação com alterações pendentes).
- [x] `ResponsiveTable` — tabela no desktop, cartões no celular.
- [x] `MasterDetail` — lista + detalhe; no celular, detalhe em tela cheia com "Voltar".

### Tarefa 2.3 — Rótulos e formatação centralizados

**Arquivos:** `lib/client-portal/portalDisplay.ts` (+ teste).

- [x] Ampliar `statusLabel` para cobrir todos os status que aparecem crus hoje (chamados, faturas, landing pages, canais, campanhas, conteúdos) e criar dicionários para canal (`whatsapp` → "WhatsApp", `webchat` → "Chat do site"), ciclo de cobrança (`monthly` → "Mensal"), categoria e prioridade de chamado, papel do usuário (`client` → nome do papel).
- [x] Formatadores: data curta ("20 out"), data e hora, tempo relativo ("há 2 dias", "vence em 3 dias"), moeda e moeda compacta ("R$ 186,4 mil").
- [x] Nenhuma tela do portal mostra data no formato ISO.

### Tarefa 2.4 — Moldura de página

**Arquivos:** `components/layouts/DashboardLayout.tsx`, `PortalDashboardPage.tsx`, `PortalCampaignsWorkspace.tsx`, `PortalOrganicContentPage.tsx`, `PortalCreativeAssetsPage.tsx`.

- [x] O layout define o fundo da área de trabalho (`--bg`), a largura máxima (1440px) e as margens laterais com áreas seguras. Remover das telas os truques de margem negativa que pintavam o próprio fundo.

### Tarefa 2.5 — Glossário do portal

**Arquivo novo:** `frontend/src/lib/client-portal/glossary.ts` + seção neste documento.

| Evitar | Usar |
|---|---|
| Pipeline | Funil |
| Handoff | Transferência para atendente |
| SLA | Prazo de resposta |
| Trigger | Gatilho |
| Endpoint / token | Endereço de envio / chave (só em "Avançado") |
| Score | Pontuação |
| Fit / intenção | Perfil / interesse (com explicação) |
| Guardrails | O que usar e o que evitar |
| Cockpit, Pulso Executivo | Resumo, Pulso do período |
| Action Engine, execução governada, pack | (remover) |
| Persistido(s) | Salvo(s) |
| "… do contrato" no título | nome da área (o contexto do contrato fica nas etiquetas) |
| CPL, MROI | Custo por lead (CPL), Retorno sobre marketing (MROI), com explicação ao passar o mouse e em texto no celular |

- [x] Teste de proteção que procura termos proibidos nos textos visíveis do portal ("YUX Hub", "Action Engine", "persistidos", "endpoint" fora de "Avançado", "Doutrina").

### Tarefa 2.6 — Registro de pendências e selo "Pendente"

**Arquivos novos:** `frontend/src/lib/client-portal/pendingFeatures.ts` (+ teste), `frontend/src/components/portal-ui/PendingBadge.tsx`, `PendingAction.tsx`, `PendingSection.tsx`.

- [x] Registro central tipado: cada pendência tem código (`B1`…`B14`, igual à tabela de dependências de backend), título, explicação para o cliente e lista de telas onde aparece.
- [x] `PendingBadge`: selo "Pendente" em fonte mono, cor âmbar suave, com `aria-label` que explica a pendência.
- [x] `PendingAction`: envolve um botão ou link que ainda não funciona. O botão continua visível e focável, com o selo; ao clicar, mostra uma explicação curta ("Esta função está em implantação e será liberada em breve.") e **nunca** simula sucesso.
- [x] `PendingSection`: para blocos inteiros (ex.: indicador de prazo de resposta), com o selo no título e conteúdo vazio explicativo.
- [x] Teste do registro: todo código usado nas telas existe no registro e todo código do registro é usado em ao menos uma tela; o teste imprime a lista atual de pendências (serve de checklist antes da liberação total).
- [x] Fase 12 confere a lista e a deixa registrada no PR.

---

## Fase 3 — Moldura: menu lateral, cabeçalho e navegação

### Tarefa 3.1 — Menu lateral no padrão aprovado

**Arquivos:** `components/navigation/Sidebar.tsx`, `lib/platform/navigation.ts` (+ `navigation.test.ts`).

- [x] Fundo escuro (`--side-bg`), logo em gradiente, rótulos de grupo em mono, item ativo com fundo violeta suave e **barra em gradiente** à esquerda (como na prévia).
- [x] Cartão da empresa no topo: avatar com iniciais em gradiente, nome do cliente e nome do plano. No modo workspace interno, o mesmo cartão mostra o cliente aberto e permite trocar.
- [x] Contadores reais (ex.: Aprovações com o número de itens pendentes, vindo de `usePortalActionSummary`).
- [x] Corrigir item ativo: `end` no link da Visão Geral; nenhum par de itens com o mesmo endereço (hoje "Propostas" e "Aprovações", e "Execuções" e "Logs", acendem juntos).
- [x] Grupos recolhíveis, lembrando a escolha no navegador.
- [x] Rodapé: Financeiro, Ajuda e suporte, Minha conta.
- [x] Nova organização do menu (sempre filtrada pelos módulos contratados; nenhuma tela de módulos diferentes é fundida):

| Grupo | Itens (módulo) |
|---|---|
| Início | Visão geral; Aprovações (sem módulo; agrega o que cada módulo contratado envia) |
| Comercial | Leads; Funis; Tarefas e follow-ups; Empresas e contas; Pontuação de leads (crm) |
| Atendimento | Conversas; Agente IA; Canais conectados; Filas e transferência (whatsapp_ai) |
| Marketing | Campanhas (campaigns); Landing pages; Formulários externos (landing_pages); Marketing Studio; Central de conteúdo; Calendário editorial; Criativos e inspirações (marketing_studio) |
| Automações | Fluxos; Modelos de fluxo; Execuções (automations) — "Logs" deixa de ser item próprio, pois abria a mesma tela; a rota antiga redireciona |
| Execução YUX | Missões (action_engine) |
| Projetos | Projetos e entregas; Documentos (projects); Propostas (proposals) |
| Resultados | Relatórios (bi_reports) |
| Empresa | Perfil da empresa; Marca e tom de voz; Base de conhecimento; Equipe; Conexões; Modelos de e-mail |
| Rodapé | Financeiro (finance); Ajuda e suporte (support); Minha conta |

- [x] O rótulo do menu e o título da página passam a ser idênticos (hoje: "Marca e Tom de Voz" × "Central da Marca", "Conversas" × "Central Omnichannel IA", "Campanhas" × "Campanhas e Anúncios", "Suporte" × "Suporte do contrato" etc.).
- [x] Atualizar `navigation.test.ts` com: grupos por módulo contratado, nenhum `href` duplicado, item ativo único.

### Tarefa 3.2 — Menu no celular

- [x] Abaixo de 1024px, botão de menu no cabeçalho abre o menu como gaveta (Radix Dialog): foco preso dentro, fecha com Esc, toque fora e ao navegar; respeita áreas seguras.
- [x] Teste de componente: abrir, navegar, fechar.

### Tarefa 3.3 — Cabeçalho

**Arquivo:** `components/navigation/Header.tsx`.

- [x] Trilha (breadcrumb) sem repetição ("Relatórios › Relatórios" vira "Resultados › Relatórios").
- [x] Sino: mostra os itens pendentes reais do cliente (aprovações, faturas a vencer, perguntas de missões, a partir de `usePortalActionSummary` e das notificações de decisão já existentes no Action Engine). Sem itens, sino sem número.
- [x] Busca: campo visível no cabeçalho (desktop e celular) com o selo "Pendente" (B11) até existir a busca global (leads, projetos, faturas, conversas, atalho Ctrl K).
- [x] Menu do usuário (avatar): nome, papel em português, "Minha conta", "Sair".
- [x] Linha de 2px em gradiente sob o cabeçalho, como na prévia.

**Critério de pronto da Fase 3:** navegação completa no celular; um único item ativo por página; menu e títulos com os mesmos nomes; Hub interno funcionando com o novo menu (D1).

---

## Fase 4 — Visão Geral (implementar a prévia)

**Arquivos:** `pages/client-portal/PortalDashboardPage.tsx`, `lib/client-portal/portalDashboardRules.ts`, `hooks/usePortalActionSummary.ts`, testes de ambos.

Mantém o foco adaptativo da especificação de 03/07 (comercial, marketing, entregas, executivo); muda a ordem e a apresentação.

- [x] Cabeçalho: "Bom dia, {nome}." + frase-resumo com a contagem de decisões; etiquetas de contrato, foco e status dos dados; `PeriodSelector`.
- [x] **Sua vez:** até 3 `DecisionCard` com o que depende do cliente, ordenados por urgência: aprovações de entrega, faturas a vencer ou vencidas, perguntas de missões aguardando resposta, landing pages e conteúdos aguardando aprovação (só dos módulos contratados). Link "Ver todas as aprovações". Sem itens: mensagem positiva curta.
- [x] **Pulso do período:** 6 indicadores por foco, com variação e mini-gráfico:
  - Comercial: novos leads, oportunidades abertas, valor em negociação, taxa de conversão, tempo da 1ª resposta, atendidos pela IA.
  - Marketing: leads gerados, custo por lead, investimento, MROI, campanhas ativas, conteúdos publicados.
  - Entregas: projetos ativos, entregas no prazo, aprovações pendentes, entregas concluídas no período, próximos marcos, chamados abertos.
  - Executivo: combinação dos mais relevantes de cada área contratada.
  - Indicador sem fonte de dado não aparece; a grade se ajusta (6/3/2 ou 4/2).
- [x] **Resultado principal** com gráfico em escala: comercial = barras do funil por etapa com taxa de passagem e o gargalo destacado; marketing = leads por canal; entregas = progresso dos projetos. Botão leva ao ponto do gargalo (ex.: "Ver leads sem proposta").
- [x] **Pontos de atenção:** prioridade escrita (Alta/Média), responsável, tempo de espera; etiqueta "YUX cuidando" quando o responsável é a YUX; ordenados por prioridade e depois por tempo.
- [x] **Executado pela YUX:** linha do tempo com data em cada item, montada a partir de execuções de fluxo, histórico de projetos e eventos de campanha que tenham data. "Ver histórico completo" leva a uma página que de fato lista o histórico (hoje leva a Projetos).
- [x] **Próximas entregas:** etapas em andamento com progresso, previsão e "Aguardando você" quando houver aprovação pendente.
- [x] **Seus módulos:** situação e um número real por módulo; nomes escritos corretamente (acaba o "Abrir crm & funis").
- [x] **Sugestão para o seu momento:** uma só, discreta, no fim, ligada a um problema real do período; o link leva a uma conversa com a YUX (missão ou chamado com assunto preenchido), e não para Suporte genérico.
- [x] Carregamento com esqueletos; erro por bloco sem derrubar a página inteira.
- [x] Celular: Sua vez em coluna única; Pulso em 2 colunas; Resultado e Atenção empilhados; linha do tempo com data acima do texto (como na prévia).
- [x] Testes: regras por foco, por período, ordenação de atenção e de decisões, ausência de dado.

---

## Fase 5 — Modelo de página e área Empresa

### Tarefa 5.1 — Novo modelo `PortalPage`

**Arquivo:** substituir `components/client-portal/PortalJourneyPage.tsx` por um modelo baseado nos componentes da Fase 2.

- [x] A ação principal do cabeçalho faz o trabalho da própria página (ex.: "Nova tarefa"); links para outras páginas vão para "Relacionados", no fim.
- [x] Indicadores só com números reais e quantidade que preenche a grade (corrige o quarto cartão sozinho em Marca).
- [x] A lista "Como esta área funciona" sai da tela principal e vira ajuda opcional (ícone de ajuda com painel lateral).
- [x] A nota em âmbar (cor de alerta) deixa de ser usada para textos de produto.
- [x] Todas as páginas que usam o modelo antigo migram nesta fase ou na fase da sua área.

### Tarefa 5.2 — Perfil da empresa

**Arquivos:** `pages/client-portal/company/PortalCompanyProfilePage.tsx`, `components/company-intelligence/CompanyProfileForm.tsx`, `WebsiteOnboardingCard.tsx`.

- [x] Medidor "Perfil X% completo" com os campos que faltam, cada um com link para o campo.
- [x] Formulário em seções (Identificação, Contato, Presença online, Posicionamento, Atendimento), com `StickySaveBar` e aviso de alterações não salvas.
- [x] Incluir horário de atendimento e endereço completo (o modelo já tem `businessHours`; hoje não há campo).
- [x] "Observações internas" vira "Observações para a equipe YUX", com explicação de quem vê.
- [x] "Preencher com o site": aberto quando o perfil está vazio, recolhido depois do primeiro uso; o limite de páginas ganha rótulo visível; nenhuma edição em JSON (usar editores estruturados ou ocultar o campo).
- [x] Valor e vigência do contrato saem desta página (vão para Financeiro e Minha conta).
- [x] Logo da empresa com pré-visualização (usa o logo da Marca).

### Tarefa 5.3 — Marca e tom de voz

**Arquivos:** `pages/client-portal/company/PortalBrandVoicePage.tsx`, `components/company-intelligence/BrandVoiceForm.tsx`.

- [x] Título igual ao menu: "Marca e tom de voz".
- [x] **Cartão da marca** no topo: logo, paleta com amostras de cor, exemplo das fontes e uma mensagem de exemplo escrita no tom de voz definido.
- [x] Cores com amostra e seletor de cor (hoje são texto, como `#5519ff`); logo com envio de arquivo ou URL e pré-visualização.
- [x] "Guardrails" vira "O que usar e o que evitar".
- [x] Remover o bloco "Diretrizes carregadas", que repete o formulário.
- [x] `StickySaveBar`.

### Tarefa 5.4 — Base de conhecimento

**Arquivos:** `pages/client-portal/company/PortalKnowledgeBasePage.tsx`, `components/company-intelligence/KnowledgeLibrary.tsx`.

- [x] A biblioteca vem primeiro; o passo a passo Enviar → Publicar vira uma barra de progresso compacta acima dela.
- [x] Remover o cartão "Metodologia estratégica / Doutrina YUX governada" (levava para Missões).
- [x] Remover o indicador "Busca IA: N trechos".
- [x] Linguagem simples para permissões ("Pode ser usado pelo atendimento com clientes" / "Só uso interno"); "rastreio" e "fontes retornadas" ficam em "Detalhes técnicos".
- [x] Celular: itens da biblioteca como cartões; revisão em tela cheia.

### Tarefa 5.5 — Equipe

**Arquivo:** `pages/client-portal/company/PortalCompanyUsersPage.tsx`.

- [x] Hoje a página é só uma vitrine. Com o módulo CRM contratado, reutilizar `CrmMembersPanel` e `CrmTeamsPanel` (convites, papéis, limite de assentos, já existentes).
- [x] Sem CRM: a página continua no menu e mostra a gestão de equipe marcada como Pendente (B4, gestão de usuários do portal independente de módulo).

### Tarefa 5.6 — Conexões (antigo "Integrações")

**Arquivo:** `pages/client-portal/company/PortalCompanyIntegrationsPage.tsx`.

- [x] Renomear para "Conexões" e explicar o objetivo: visão geral de todas as conexões da empresa.
- [x] Um cartão por serviço conectado (logo, status, última verificação) com link para a tela do módulo onde ele é gerenciado. **Canais conectados continua em Atendimento** (regra 1); aqui só aparece o resumo e o atalho.
- [x] Remover a lista de promessas ("Google Calendar, Google Sheets e webhooks…") e o "não contratado" em tom de venda.

**Critério de pronto da Fase 5:** nenhuma página usa o modelo antigo; nenhuma página da área Empresa é só vitrine.

---

## Fase 6 — Projetos, Aprovações, Propostas e Documentos

### Tarefa 6.1 — Projetos e entregas

**Arquivo:** `pages/client-portal/PortalProjectsPage.tsx` (a melhor tela atual; manter a lógica).

- [x] Migrar para os tokens e componentes da Fase 2; botões na cor da marca.
- [x] Etapas como linha do tempo horizontal (vertical no celular).
- [x] Aprovações pendentes primeiro.
- [x] Miniatura da entrega quando houver imagem.
- [x] Corrigir o `<main>` dentro de outro `<main>`.
- [x] Celular: seletor de projeto vira lista suspensa no topo; abas com rolagem horizontal.

### Tarefa 6.2 — Aprovações

**Arquivo:** `pages/client-portal/PortalApprovalsPage.tsx`.

- [x] A fila vem primeiro (hoje fica abaixo de três cartões de navegação).
- [x] Cada item com ícone do tipo, módulo de origem, tempo de espera e ação. A página agrega itens dos módulos contratados, mas a decisão continua na tela de cada módulo (regra 1).
- [x] Filtros por tipo em etiquetas (Entregas, Landing pages, Conteúdos, Propostas), mostrando só os tipos dos módulos contratados.
- [x] Remover o botão "Voltar para Visão Geral".

### Tarefa 6.3 — Propostas

**Arquivo:** `pages/client-portal/PortalProposalsPage.tsx` (rota criada na Tarefa 1.4).

- [x] Lista com status traduzido e valor; detalhe com escopo, valor, condições e versões.
- [x] Decisão com o mesmo padrão de Projetos: comentário obrigatório para ajustes e recusa, trava contra duplo envio, `ConfirmDialog` para aprovar e recusar, mensagem clara depois da decisão.
- [x] Estados de carregamento, vazio e erro (hoje há só uma notificação de erro).
- [x] Celular: lista → detalhe em tela cheia.

### Tarefa 6.4 — Documentos

**Arquivo:** `pages/client-portal/projects/PortalDocumentsPage.tsx`.

- [x] Definir o objetivo com clareza: "Propostas, faturas e arquivos das entregas". "Enviar arquivo" fica visível e marcado como Pendente (B14); contratos e manuais só aparecem quando houver dado.
- [x] Itens clicáveis (proposta abre Propostas; fatura abre Financeiro; entrega abre o link da entrega).
- [x] Ciclo de cobrança e status traduzidos.

---

## Fase 7 — Comercial

### Tarefa 7.1 — Leads (variante portal de `CrmWorkspace`)

**Arquivos:** `components/crm/CrmWorkspace.tsx`, `LeadAdvancedFilters.tsx`, `LeadKanbanBoard.tsx`.

- [x] Título "Leads" e seletor rotulado "Funil" (não "Pipeline").
- [x] Painel de estratégia: "CRM Controller" vira "Pedir análise à YUX", recolhido por padrão.
- [x] Filtros avançados recolhidos; no celular, abrem em painel inferior.
- [x] Abas com rolagem horizontal no celular; visualização padrão no celular = lista.
- [x] Formulário "Novo lead" com rótulos visíveis (hoje só há placeholders); e-mail obrigatório só quando não há telefone (confirmar a validação no backend); campo "Score" sai da criação.
- [x] Conferir que `/leads` interno continua igual (regra 7).

### Tarefa 7.2 — Funis

- [x] Migrar para tokens; manter o estado vazio com 3 passos (é um bom modelo).
- [x] "Precisa ser publicada por um administrador" passa a dizer quem é (administrador da sua empresa ou equipe YUX).
- [x] Celular: etapas em acordeão, com contagem e valor por etapa.

### Tarefa 7.3 — Tarefas e follow-ups

- [x] Uma só fila na página, com filtros rápidos "Hoje", "Atrasadas" e "Todas" (hoje há `WorkItemsDailyQueue` e "Central de tarefas"; mesma página e mesmo módulo, então a junção é segura).
- [x] Ação principal do cabeçalho: "Nova tarefa". Quando desabilitada, o motivo aparece em texto.

### Tarefa 7.4 — Empresas e contas

- [x] Remover as promessas ("Cadastrar empresas… CNPJ").
- [x] Lista completa com busca e ordenação; cada conta abre os leads daquela empresa.
- [x] Descrição em segunda pessoa.

### Tarefa 7.5 — Pontuação de leads

- [x] Visível só para perfis que podem editar; para os demais, só a explicação e a pontuação dos leads.
- [x] Explicação em linguagem simples com um exemplo ("Lead do setor certo que abriu 3 e-mails = 72 pontos").
- [x] Trocar a leitura do `select` por consulta ao DOM por estado controlado.

---

## Fase 8 — Atendimento (depois do pré-requisito do WhatsApp)

### Tarefa 8.1 — Conversas

**Arquivo:** `components/omnichannel/PortalOmnichannelWorkspace.tsx` e componentes de conversa.

- [x] Título "Conversas".
- [x] Indicadores reais: aguardando atendente, em atendimento pela IA, resolvidas no período, por canal com nome legível. Corrigir o rótulo repetido ("Volume Volume 12").
- [x] Celular: lista → conversa em tela cheia com "Voltar"; campo de resposta fixo no rodapé.
- [x] As abas de configuração (`OmnichannelAdminTabs`) saem de baixo do chat e vão para Agente IA e Filas (mesmo módulo, `whatsapp_ai`).
- [x] Remover os botões ocultos "de compatibilidade de teste" e ajustar os testes para os botões reais.

### Tarefa 8.2 — Agente IA

- [x] Recebe a configuração do assistente que hoje está em Conversas: objetivo, tom (vindo da Marca), regras e campos a coletar.
- [x] Testar o agente antes de publicar, se a API do assistente permitir; senão, a área de teste fica marcada como Pendente (B12).
- [x] Execuções recentes com nome legível e mensagens de erro em português.

### Tarefa 8.3 — Filas e transferência para atendente

- [x] Recebe a configuração de equipes e filas que hoje está em Conversas. Sem permissão de configurar: lista somente leitura.
- [x] Deixa de ser vitrine.

### Tarefa 8.4 — Canais conectados

- [ ] Migrar para tokens; logos dos serviços; `ConfirmDialog` em "Desconectar" (explicando que o atendimento por aquele número para). _pendente: aguarda integração do WhatsApp (Fase 8.4); `PortalConnectedChannelsPage.tsx`, `ConnectedChannelCard.tsx`, `ConnectedChannelsWorkspace.tsx` e `metaChannelService.ts` seguem reservados e ficam fora dos testes de proteção por lista explícita._
- [ ] Mensagens de erro sem nomes de configuração técnica. _pendente: Fase 8.4, mesma dependência do WhatsApp._

---

## Fase 9 — Marketing

### Tarefa 9.1 — Campanhas

- [x] Manter o visual de painel (lista + detalhe) com os novos tokens.
- [x] Estado vazio orientado; período real (Tarefa 1.5); etiqueta de conexões com o estado real das contas de anúncio.
- [x] Celular: tabela vira cartões; detalhe em painel inferior.

### Tarefa 9.2 — Landing pages

**Arquivos:** `pages/client-portal/PortalLandingPagesPage.tsx`, `components/landing-pages/PortalLandingPagesWorkspace.tsx`.

- [x] Estado vazio (hoje, sem páginas, aparece só o título).
- [x] Status traduzido; "Aprovar" só quando a página está aguardando aprovação.
- [x] "Solicitar ajuste" abre um diálogo com mensagem obrigatória (hoje envia texto fixo); "Aprovar publicação" com `ConfirmDialog`.
- [x] O bloco técnico de captura de leads sai do cartão e vira "Captura de leads", recolhido, com link para Formulários externos.

### Tarefa 9.3 — Formulários externos

**Arquivo:** `components/landing-pages/ExternalLeadFormsWorkspace.tsx`.

- [x] Fluxo em passos: 1. Criar o formulário · 2. Instalar no seu site · 3. Testar o envio.
- [x] "Instalar no seu site": código pronto para copiar e colar, com abas por plataforma (HTML, WordPress/Elementor, Webflow, webhook avançado).
- [x] Endereço de envio, chave e origens permitidas ficam em "Avançado".
- [x] Botão "Enviar teste" e confirmação visível do lead de teste recebido.

### Tarefa 9.4 — Marketing Studio, Central de conteúdo, Calendário editorial e Criativos

Todos no módulo `marketing_studio`; nenhuma tela é removida.

- [x] Marketing Studio: remover "persistidos", "Builder avançado", "Contexto autorizado"; deixar claro que é onde se **planeja e produz**.
- [x] Central de conteúdo: onde se **revisa e aprova** o que foi produzido. Somente dados reais (Tarefa 1.1) e aprovação salva (1.3). Celular: galeria em 1 coluna e detalhe em painel inferior. O texto do estado vazio aponta para o Marketing Studio (hoje cita um "Estúdio de Automações").
- [x] Calendário editorial: onde se vê **quando** cada coisa sai. Vira calendário de verdade (mês e semana; no celular, agenda em lista), com filtros de canal e status. A agenda do Studio e a visão de calendário da Central passam a mostrar só os próximos itens com link para cá.
- [x] Criativos e inspirações: estado vazio orientado até D4/B3.

---

## Fase 10 — Automações e Missões

### Tarefa 10.1 — Automações (variante portal de `AutomationsPage`)

- [x] A porta de entrada é "O que você quer automatizar?" com modelos por setor; o construtor técnico fica em "Modo avançado".
- [x] Glossário aplicado (gatilho, condição, ação, modo de teste).
- [x] Celular: lista de fluxos, detalhe e ativar/pausar; edição do construtor com aviso de que funciona melhor no computador.
- [x] Conferir que `/automations` interno continua igual.

### Tarefa 10.2 — Missões

**Arquivos:** `components/action-engine/MissionDashboard.tsx` e páginas de missão.

- [x] Remover "Action Engine" e "execução governada"; "Target" vira "Meta".
- [x] Barra de progresso de cada missão em relação à meta.
- [x] As conversas em andamento ficam no topo, com status ("Aguardando sua resposta") e ação.
- [x] Janela de nova missão com foco preso e fechamento por Esc.

---

## Fase 11 — Resultados, Financeiro, Suporte, Minha conta e Modelos de e-mail

### Tarefa 11.1 — Relatórios

**Arquivos:** `components/reports/PortalReportsWorkspace.tsx`, `ReportsWorkspace.tsx`.

- [x] Gráficos (Recharts com tokens): leads por origem (barras), conversão por etapa (funil), campanhas (investimento × leads), landing pages (taxa de conversão).
- [x] Trocar o texto separado por barras ("R$ x | 12 leads | CPL…") por tabela com colunas no desktop e cartões no celular.
- [x] "Cockpit executivo Ads/MROI" vira "Resultado de mídia"; "Sync: …" vira "Dados atualizados em…".
- [x] Modelos de relatório (presets): clicáveis, ou removidos. Nunca mostrar o nome técnico do módulo.
- [x] Explicação de CPL e MROI.
- [x] Seletor de período visível, marcado como Pendente (B6) até o backend aceitar datas.
- [x] Exportar: folha de impressão (CSS de impressão) para "Salvar como PDF" pelo navegador.

### Tarefa 11.2 — Financeiro

**Arquivo:** `components/finance/PortalFinanceWorkspace.tsx`.

- [x] Destaque da próxima fatura (valor, vencimento, dias restantes).
- [x] Status com cores de significado; status mostrado uma vez só (hoje aparece duas vezes, às vezes divergente).
- [x] Datas formatadas (hoje aparecem em ISO).
- [x] "Pagar" e "Baixar boleto" visíveis e marcados como Pendente (B1). Enquanto isso, "Solicitar segunda via" abre um chamado de Suporte com a categoria Financeiro já preenchida (ação real com endpoint existente).
- [x] Vigência e valor do contrato vêm para cá (saem do Perfil da empresa).

### Tarefa 11.3 — Ajuda e suporte

**Arquivo:** `components/support/PortalSupportWorkspace.tsx`, `pages/client-portal/PortalSupportPage.tsx`.

- [x] Campos com placeholder, não com texto pré-preenchido.
- [x] Validação, botão desabilitado durante o envio, campos limpos depois do envio.
- [x] Categoria e prioridade escolhidas pelo cliente, com nomes em português; status traduzidos.
- [x] Conversa do chamado em formato de chat, com nome do autor e data em cada mensagem.
- [x] Prazo de resposta exibido só se for real (o módulo de suporte já tem SLA).
- [x] Celular: lista → chamado em tela cheia; "Abrir chamado" como botão principal que abre um formulário.

### Tarefa 11.4 — Minha conta

**Arquivo:** `pages/client-portal/PortalAccountSettingsPage.tsx`.

- [x] Hoje só lista nomes de seções. Passa a ter: nome e e-mail do usuário, papel, "Redefinir senha" (usa `requestPasswordReset`, já existente) e "Sair".
- [x] Preferências de notificação e sessões ativas visíveis e marcadas como Pendente (B7).

### Tarefa 11.5 — Modelos de e-mail

**Arquivo:** `components/email-templates/EmailTemplateWorkspace.tsx`.

- [x] Sai de "Configurações da conta" e vai para Empresa (Tarefa 3.1).
- [x] Variáveis inseridas por botões com nome amigável ("Nome do contato"), sem o cliente digitar `{{variavel}}`.
- [x] Mensagens de validação sem sintaxe técnica.

---

## Fase 12 — Verificação final

- [x] Teste de proteção: proibir hex soltos do estilo antigo e termos do glossário nos arquivos do portal.
- [x] Acessibilidade (parte feita): foco visível nos componentes do portal, rótulos nos campos das telas do portal e do Agente IA, nenhum `<main>` aninhado, ícones sem texto com `aria-label`, imagens com `alt`, janelas de missão (contexto, tarefa humana, compartilhar simulação) em Radix Dialog com foco preso, Esc e devolução do foco.
- [ ] Acessibilidade (restante): contraste AA medido nos dois temas e passada completa pelo teclado em todas as telas. _pendente: o tema escuro ainda não tem botão; a passada manual com leitor de tela não foi feita._
- [ ] Atualizar `frontend/tests/journeys/browser/yux-acceptance.pw.ts` com as jornadas do cliente: aprovar entrega, decidir proposta, abrir chamado, navegar pelo menu no celular. _pendente: jornadas Playwright de aceitação não escritas; a cobertura atual é Vitest por tela e o harness de capturas em `tests/visual`._
- [ ] Capturas de cada página em 390/768/1280/1440px, claro e escuro, revisadas e anexadas ao PR. _pendente: o harness `tests/visual` gera as capturas no tema claro (sem rolagem horizontal em todas); faltam o tema escuro e o anexo ao PR._
- [ ] Modo escuro: expor o botão de tema (D2), com a escolha lembrada no navegador. _pendente: tokens escuros existem desde a Fase 2, mas o botão de tema ainda não foi exposto._
- [x] `npm run type-check`, `npm run test`, `npm run lint:baseline`, `npm run build` (inclui orçamento de bundle).
- [x] Atualizar `docs/mapa-paginas-e-funcionalidades.md` com os nomes novos.

---

## Dependências de backend (trilha própria; cada uma remove um selo "Pendente")

| # | O que falta | Libera |
|---|---|---|
| B1 | Link de pagamento, boleto/PIX e PDF da fatura (campos na fatura e rota do portal) | Pagar e baixar boleto em Financeiro e em "Sua vez" |
| B2 | Importação de leads por CSV (validação, prévia e execução) | "Importar CSV" em Leads |
| B3 | Status e revisão de sugestões criativas (salvar aprovação e ajuste) | Aprovar/pedir ajuste em Criativos |
| B4 | Gestão de usuários do portal independente do CRM (listar, convidar, desativar, papel) | Equipe para clientes sem CRM |
| B5 | Cálculo do prazo de resposta (SLA) por período em Conversas | Indicador de prazo de resposta |
| B6 | Período no relatório do portal (`/reports/portal/operational/:organizationId` não recebe datas) | Seletor de período em Relatórios |
| B7 | Preferências de notificação e sessões do usuário | Seções correspondentes em Minha conta |
| B8 | Endpoint de reprocessar execução de automação | "Reprocessar" em Automações |
| B9 | Segmentos inteligentes de leads (salvar e agir sobre o segmento: tarefa, automação, campanha, exportar) | Ações de segmento em Leads |
| B10 | Métricas de campanha com granularidade diária | Seletor de período em Campanhas |
| B11 | Busca global do portal | Campo de busca do cabeçalho |
| B12 | Teste do agente de IA antes de publicar (sandbox sem custo, conforme `AGENTS.md`) | Área de teste em Agente IA |
| B13 | Variações e detalhes de criativos de campanha | "Criar variação" e "Ver detalhes" em Campanhas |
| B14 | Envio de arquivos em Documentos | "Enviar arquivo" em Documentos |
| B15 | Duração da sessão conforme "Lembrar de mim" | Opção "Lembrar de mim" no login |
| B16 | Perguntas que o agente de IA não soube responder | Bloco "Perguntas sem resposta" em Agente IA |
| B17 | Pedido de revisão de campanha pelo cliente | "Pedir revisão" em Campanhas |
| B18 | Duplicar, pausar e ativar campanha pelo portal (com permissão e confirmação) | Ícones "Duplicar" e "Pausar/Ativar" em Campanhas |
| B19 | Importar conteúdo, gerar variação e enviar conteúdo para campanha | Ações da Central de conteúdo |
| B21 | Campos de título, texto e chamada do anúncio no rascunho de campanha | Campos do anúncio no criador de campanha Meta |
| B22 | Rota de envio de teste do formulário externo | "Enviar teste" em Formulários externos |
| B23 | Listagem de formulários devolver o endereço de envio já gerado | Código pronto sem precisar gerar novo endereço |
| B24 | Convite por e-mail que cria ou encontra o usuário e o adiciona como membro do CRM (`crm_instance_members.user_id` é obrigatório) | "Convidar pessoa" em Equipe |
| B25 | Criação de equipes comerciais pelo portal | "Criar equipe" em Equipe |
| B26 | Envio de anexos nas conversas do atendimento | "Anexar" no campo de resposta de Conversas |
| B20 | Concorrentes monitorados, pesquisa de mercado e geração a partir de inspirações (briefing, similar, vínculo com campanha) | Ações de Criativos e inspirações |

Já existem e devem ser reaproveitados: decisão de propostas (`/proposals/portal`), revisão de conteúdo (`/marketing-studio/journey/contents/:id/review`), membros e convites do CRM, redefinição de senha, histórico de projetos (`/projects/:id/timeline`).

## Riscos e cuidados

- **Hub interno:** a troca de `--primary` e da escala `yux` muda cores no Hub interno inteiro (D1). Fazer uma revisão visual rápida das telas internas principais ao final da Fase 2.
- **Testes com texto:** há 9 arquivos de teste de páginas do portal e testes de componentes compartilhados que conferem textos; atualizar na mesma tarefa que muda o texto.
- **Conflito com o trabalho do WhatsApp:** a Fase 8 só começa depois do pré-requisito.
- **Fontes:** carregar quatro famílias pesa; usar só os pesos necessários e `font-display: swap`.
- **Foco adaptativo:** a Visão Geral precisa funcionar nos quatro focos e com qualquer combinação de módulos contratados (incluindo cliente com um módulo só).
