# Radar: campanhas, refinamento e CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Radar compreensível e operacional desde a criação de uma campanha até o refinamento de empresas e envio ao CRM, corrigindo primeiro o bloqueio de disponibilidade.

**Architecture:** Preservar os serviços de descoberta, pesquisa, evidências e governança existentes; separar a navegação por campanha e explicitar as operações de descoberta, retomada, atualização e reanálise. Conectar os resultados regionais ao CRM nativo com destino escolhido, revisão e idempotência, sem depender da geração de uma mensagem comercial.

**Tech Stack:** React 18, React Router, componentes visuais existentes, TypeScript, Fastify, PostgreSQL, Vitest e testes de jornada.

**Spec:** Seção “Especificação de experiência” deste documento, derivada da solicitação do usuário de 12/10/2026. Proposta pendente de revisão do usuário; execução nesta sessão, sem delegação não autorizada.

## Global Constraints

- Não executar modelos, buscas ou ferramentas pagos sem autorização específica. Testes automatizados usam provedores simulados.
- Não remover funcionalidades, campanhas, dados, fontes, evidências, configurações, limites ou direitos de uso existentes.
- Fornecedores, credenciais, licenças e roteamento de modelos permanecem configuráveis pelo Admin; ocultar detalhes técnicos da experiência do cliente não remove controles no servidor.
- Preservar isolamento entre organizações, contratação do módulo Radar, permissões de escrita e acesso ao CRM.
- Não habilitar automaticamente permissões de pesquisa paga para novos papéis; autorização operacional de clientes é uma decisão separada, visível no plano de acesso.
- Não iniciar contato, mensagens, sequências ou automações de atendimento ao enviar uma empresa ao CRM; qualquer acionamento posterior deve ser explícito e seguir a governança existente.
- Não fixar cidade, segmento, produto, oferta ou tamanho ideal. Campanhas continuam configuráveis por cidades, estados e múltiplos estados.
- Reutilizar o padrão visual da YUX; não contratar geração de imagens nem outra ferramenta paga para o redesenho sem autorização.
- Trabalhar no worktree do Radar, preservando o worktree principal com alterações de WhatsApp. Publicar somente alterações verificadas em main, conforme orientação anterior do usuário.

## Review Focus

1. Falha da consulta de disponibilidade: mostrar erro recuperável, nunca carregamento infinito ou conclusão de licença ausente sem diagnóstico.
2. Campanha editada durante processamento: manter o histórico e impedir que resultados de uma revisão anterior sejam aprovados como atuais.
3. Duplo clique, retomada e pesquisa repetida: não duplicar execução, cobrança ou lead; uma nova pesquisa é uma operação explícita.
4. Cliente sem permissão operacional ou CRM não contratado: explicar a limitação sem revelar infraestrutura ou permitir acesso indevido.
5. Empresa sem e-mail, site ou identidade confirmada: preservar desconhecidos e evidências; não inventar contatos nem associar automaticamente outra empresa.

---

## Diagnóstico confirmado

- Produção: ao consultar o resultado da empresa CML, a API retorna HTTP 500. O log do backend informa `column rule.version does not exist`, código PostgreSQL `42703`, em `getRadarResearchAvailability`.
- Código: `backend/src/modules/radar/research-availability.ts` ordena regras de modelos por `rule.version`, coluna ausente do esquema de `model_routing_rules`.
- Interface: `RadarWorkspace.tsx` transforma o erro em `researchAvailability = null`; o painel interpreta esse estado como “Conferindo disponibilidade”. Abrir ou atualizar o resultado repete a consulta defeituosa; não é uma solução para o usuário.
- Navegação: a campanha selecionada é estado local; “Abrir” não navega para uma página dedicada. O formulário de criação aparece antes da lista, e edição reutiliza esse formulário distante.
- Regional B2B: a lista de empresas e sua revisão/exportação são separadas das oportunidades antigas. O botão de importação é ocultado para campanhas regionais. A conversão antiga escolhe o primeiro funil ativo/default, sem destino explícito e sem preencher a instância de CRM.
- Pesquisa: uma execução concluída e ainda recente é reutilizada. A ação atual não representa claramente “nova pesquisa”, “retomar” e “reanalisar os dados salvos”.
- Validação anterior: a jornada real com PostgreSQL estava condicionada a banco isolado e foi pulada; testes com consultas simuladas não detectaram a coluna inexistente. Não repetir esse gate como se tivesse sido validado.

## Especificação de experiência

### 1. Entrada do Radar

Abrir em “Campanhas”, com busca, situação, região, empresas encontradas e última atividade. Botão “Nova campanha”. Não mostrar formulário vazio, contexto do harness ou catálogo de provedores na entrada.

Rotas relativas ao workspace, usando `usePortalWorkspacePath`:

- `comercial/radar`: campanhas.
- `comercial/radar/nova`: criação.
- `comercial/radar/:campaignId`: página dedicada, aba Resultados como padrão.
- `comercial/radar/:campaignId/configuracoes`: edição da campanha.

### 2. Configuração

Organizar os campos existentes em Público e regiões, Objetivo comercial, Dados desejados, Pesquisa e limites e Destino no CRM. Manter opções avançadas disponíveis em seção recolhida, não apagá-las. Descrever o que será pesquisado e o que pode consumir saldo antes de confirmar a operação. Salvar não inicia busca automaticamente. Mostrar revisão salva e aviso caso resultados anteriores precisem de atualização.

“Fontes” para o cliente são capacidades, por exemplo Cadastro empresarial, Presença na internet e Contatos públicos. Somente Admin vê nomes de fornecedores, custos de integração, contratos, códigos e roteamento de modelos. Os bloqueios aparecem com motivo comercial e ação adequada; não como botão cinza sem explicação.

### 3. Operação da campanha

Abas Resultados, Configurações e Histórico. Uma tabela com seleção, empresa, localização, site, contatos, situação da pesquisa, adequação e envio ao CRM. Detalhes e evidências abrem em painel da empresa; não renderizar dezenas de dossiês completos na lista.

Ações distintas:

| Ação | Efeito |
| --- | --- |
| Buscar mais empresas | Descobrir outro lote conforme público, regiões e limites, sem duplicar empresas já encontradas. |
| Completar dados | Pesquisar as empresas selecionadas ainda não pesquisadas ou cuja configuração mudou; sem URLs manuais obrigatórias. |
| Retomar pesquisa | Continuar execução parcial/interrompida aproveitando chamadas já registradas. |
| Atualizar pesquisa | Nova coleta explícita, mesmo com cache recente, com confirmação de custo e preservação do histórico. |
| Reavaliar com os dados salvos | Reexecutar somente a análise comercial com fatos existentes; não refazer busca web. Informar consumo de IA antes de confirmar. |
| Enviar ao CRM | Revisar e criar/vincular lead no destino escolhido, sem contato automático. |

Botões individuais e ações em lote usam o mesmo contrato. “Atualizar tela” só recarrega resultados e nunca equivale a “Atualizar pesquisa”. Mostrar total encontrado, pesquisado na revisão atual, pendente, aprovado e enviado; revisão diferente não faz o total encontrado voltar a zero. “Resultados por unidade” deve virar um filtro explicado de matriz/filiais, mantendo a opção atual sem ação ambígua.

### 4. CRM

Permitir configurar o CRM/funil/etapa padrão da campanha e revisar o destino antes do envio. Empresas regionais não precisam passar pela lista antiga de oportunidades nem aprovar uma mensagem para se tornarem leads. Exigir revisão da identidade e dos contatos associados, licenças aplicáveis e acesso de escrita ao destino.

Transferir nome, identificadores, site, contatos reais disponíveis, análise, adequação, estimativa de porte quando habilitada, fontes e datas. Desconhecido continua desconhecido. Usar objetivo/oferta da campanha, não a oferta fixa “Diagnóstico YUX 48h”. Não criar e-mail fictício para representar contato real. Se o CRM exigir um campo indisponível, tratar a restrição explicitamente antes da criação.

Mostrar “Enviado ao CRM” e link para o lead. Repetir envio deve retornar o vínculo existente ou apresentar uma revisão de duplicidade; nunca criar outro lead silenciosamente. O fluxo é campanha → empresas → pesquisa/revisão → CRM, sem uma segunda fila obrigatória chamada Oportunidades.

## Mapa de arquivos

- Corrigir `backend/src/modules/radar/research-availability.ts`; testes `backend/tests/radar-research-availability.test.ts` e `backend/tests/integration/radar-research-journey.test.ts`.
- Evoluir `backend/src/modules/radar/research-service.ts`, `routes.ts`, `schemas.ts`, `search-configuration.ts` e `repository.ts` somente nos contratos necessários.
- Criar `backend/src/modules/radar/crm-delivery.ts` para validação de destino, revisão e entrega idempotente; testes `backend/tests/radar-crm-delivery.test.ts` e `backend/tests/integration/radar-crm-delivery.test.ts`.
- Usar próxima migração livre em `backend/src/db/migrations/` apenas para campos/vínculos novos; não modificar migrações publicadas. A correção de disponibilidade não precisa inventar uma coluna version.
- Modificar `frontend/src/App.tsx`, `frontend/src/pages/client-portal/commercial/PortalCommercialRadarPage.tsx`, `frontend/src/types/radar.ts` e `frontend/src/services/radarService.ts`.
- Decompor `frontend/src/components/radar/RadarWorkspace.tsx` em `RadarCampaignList.tsx`, `RadarCampaignPage.tsx`, `RadarResultsTable.tsx` e `RadarCrmDeliveryDialog.tsx`, mantendo componentes existentes de configuração e dossiê.
- Atualizar `RadarCandidateResearchPanel.tsx`, testes correspondentes e `frontend/src/lib/radar/radarRules.ts` para ações e estados comerciais.

## Task 1: Corrigir disponibilidade e seu estado de erro

**Interfaces:** Manter o retorno atual de `getRadarResearchAvailability(pool, user, organizationId, campaignId)`. A interface deve distinguir `{status:'loading'}`, `{status:'ready', availability}` e `{status:'error', message}`, não usar null para todos os estados.

- [ ] Escrever regressão: com perfil/porte habilitados e regra válida, disponibilidade responde sem referenciar coluna inexistente; ausência de regra retorna diagnóstico e não erro SQL. Acrescentar teste de interface em que GET falha e aparece “Não foi possível verificar a disponibilidade” com “Tentar novamente”, sem texto de carregamento.
- [ ] Executar `npm test -- tests/radar-research-availability.test.ts` em backend e o teste do painel em frontend; confirmar falha anterior à correção.
- [ ] Remover referência inválida e alinhar seleção/prioridade com o roteamento efetivo existente; distinguir falha técnica de bloqueio de configuração. Nunca usar disponibilidade desconhecida para autorizar cobrança.
- [ ] Executar teste com PostgreSQL isolado migrado, perfil/porte ligados e rota real simulada apenas na chamada externa. A jornada deve executar, não ficar SKIPPED. Se banco não estiver disponível, reportar o gate pendente explicitamente.
- [ ] Executar regressões do painel e registrar commit `fix(radar): restore research availability and expose recoverable errors`.

## Task 2: Página dedicada e configuração no lugar correto

**Interfaces:** `PortalCommercialRadarPage` deriva modo e campaignId das rotas; `RadarCampaignList` recebe campanhas e callbacks de navegação; `RadarCampaignPage` recebe campaignId e aba ativa. O identificador da organização sempre vem do contexto autenticado.

- [ ] Criar testes de navegação: entrada mostra campanhas sem formulário vazio; Abrir muda URL; recarregar mantém campanha; Editar abre somente configuração dessa campanha; voltar restaura lista; ID de outra organização não exibe dados.
- [ ] Executar `npm test -- src/components/radar/RadarWorkspace.test.tsx` no frontend e confirmar falhas dos novos cenários.
- [ ] Implementar rotas e componentes, mantendo carregamento, salvamento, duplicação, campos avançados e histórico. Impedir perda silenciosa de formulário alterado ao navegar.
- [ ] Executar testes e build do frontend; verificar rota direta, retorno e layout responsivo no navegador. Registrar commit `feat(radar): add dedicated campaign navigation and configuration`.

## Task 3: Ações inequívocas e refinamento em lote

**Interfaces:** Adicionar `operation: 'complete' | 'resume' | 'refresh' | 'reanalyze'` ao início de pesquisa, preservando clientes antigos com padrão compatível. `requestId` identifica operação intencional; repetir a mesma requisição não cria nova execução. Atualização cria nova geração; reanálise herda fatos/evidências e não executa descoberta. Revisão da campanha continua obrigatória.

- [ ] Escrever testes: seleção de empresas, custos antes da confirmação, nenhuma chamada ao abrir página, refresh de execução concluída recente, resume sem chamadas duplicadas, reanálise sem busca web, duplo clique, conflito de revisão, aprovado exigindo reabertura explícita de revisão e ausência de permissão.
- [ ] Executar `npm test -- tests/radar-research-service.test.ts tests/radar-routes.test.ts` em backend e testes do painel em frontend; confirmar falhas específicas.
- [ ] Implementar contratos nas rotas/serviço/tipos e operações explícitas; manter locks, registro de chamadas, orçamento e aprovação. Caso o esquema imponha unicidade por revisão, evoluir geração em migração nova e garantir uma só execução ativa por empresa.
- [ ] Implementar tabela paginada, seleção por IDs e painel único de detalhes. Resultados antigos permanecem acessíveis com rótulo da revisão; contadores distinguem total de empresas e análises atuais. Limitar polling a trabalhos ativos.
- [ ] Restringir fornecedor/modelo/licença/logs ao Admin, traduzindo os estados do cliente sem ocultar o motivo operacional. Preservar filtros de matriz/filiais com explicação e acessibilidade.
- [ ] Executar testes backend/frontend e jornada PostgreSQL de concorrência e nova geração. Registrar commit `feat(radar): clarify research actions and selected-company refinement`.

## Task 4: Entrega regional ao CRM configurado

**Interfaces:** `RadarCrmDestination = { crmInstanceId: string; pipelineId: string; stageId: string }`; destino opcional da campanha. Novo POST `/campaigns/:id/deliver-to-crm` recebe `{organizationId, configurationRevision, candidateIds, destination, requestId}` e devolve `{items: Array<{candidateId, status:'created'|'already_linked'|'blocked', leadId?:string, reason?:string}>}`. IDs recebidos não substituem verificação de escopo.

- [ ] Escrever testes: regional aprovado sem mensagem pode virar lead; destino de outra organização/instância é rejeitado; etapa fora do funil é rejeitada; módulo ou permissão ausentes não escrevem; identidade pendente bloqueia; reenvio concorrente não duplica lead; dados sem e-mail não geram endereço falso; nenhuma mensagem ou automação é disparada.
- [ ] Executar `npm test -- tests/radar-crm-delivery.test.ts tests/radar-client-access.test.ts` e confirmar as falhas de contrato novo.
- [ ] Implementar entrega transacional em `crm-delivery.ts` usando as verificações do CRM nativo, preenchendo `crm_instance_id`, funil e etapa, preservando atribuição e evidências. Vínculo empresa/campanha→lead possui unicidade no banco; bloqueios são por empresa, não descartam o restante do lote.
- [ ] Implementar destino padrão na configuração e diálogo de revisão de envio, com resultado por empresa e link para lead. Não converter empresa pendente silenciosamente nem usar a oferta fixa da conversão antiga.
- [ ] Validar ida até CRM no banco isolado, acesso por instância e concorrência; verificar dados salvos através da API normal do CRM. Registrar commit `feat(radar): deliver reviewed regional companies to configured crm`.

## Task 5: Verificação completa e publicação

**Interfaces:** Fluxo existente e novo continuam suportados; nenhum caminho antigo é apagado antes de ter equivalente testado.

- [ ] Executar suites backend/frontend, type-check e build de ambos. Executar integrações com banco isolado e registrar contagens reais, incluindo qualquer skip ou limitação.
- [ ] No navegador de teste com provedores simulados: criar campanha genérica, buscar lote, abrir página dedicada, selecionar empresas, completar dados, editar critérios, reanalisar, retomar falha, atualizar pesquisa e enviar ao CRM. Verificar persistência após reload e link do lead.
- [ ] Repetir como Admin e cliente com/sem permissões. Confirmar ausência de termos de infraestrutura na experiência do cliente e preservação dos controles de Admin.
- [ ] Inspecionar screenshots desktop/mobile, console e requisições. Registrar evidências; não chamar modelos ou busca pagos nessa validação.
- [ ] Revisar diff, publicar commits em main conforme autorização anterior e informar SHA. Não afirmar que produção foi corrigida só porque houve push; validar após deploy, primeiro apenas com GETs. Qualquer busca real paga depende de autorização e lote definido.

## Revisão do plano

Cobertura: bloqueio (T1), página/edição (T2), seleção e refinamento (T3), termos Admin/cliente (T3), resultados regionais e CRM (T4), regressões e publicação (T5). Os cinco riscos de Review Focus têm cenários nas respectivas tarefas. Não inclui nova fonte, troca de modelo, WhatsApp ou envio automático. Antes da execução, revisar esta proposta com o usuário; não houve alteração funcional nesta etapa de diagnóstico.
