# YUX Action Engine MVP — Product and Technical Specification

**Status:** especificação implementada localmente; aguardando migration/deploy/canary  
**Data:** 2026-08-14  
**Revisão:** 2026-08-21 — Revenue Recovery Pack v0, ownership e economia da missão  
**Produto piloto:** Crescimento YUX  
**Fatia:** Revenue Recovery Pack v0 + Mission Control + execução assistida + economia por missão

## 1. Objetivo

Construir a primeira fatia funcional do YUX Action Engine: uma camada outcome-first que transforma um objetivo mensurável em missão, diagnóstico, plano versionado, aprovações, ações rastreáveis e avaliação de resultado, utilizando as capacidades já existentes do YUX Hub.

O MVP deve provar três hipóteses:

1. **Hipótese de produto:** um usuário consegue operar por resultado sem precisar escolher previamente todos os módulos envolvidos.
2. **Hipótese de negócio:** o sistema reduz trabalho operacional e ajuda a recuperar receita real no workspace Crescimento YUX.
3. **Hipótese de productização:** o resultado pode ser repetido a partir de um Action Pack com custo total e intervenção humana compatíveis com a margem da YUX.

## 2. Decisão central

O Action Engine é uma camada adicional. Ele não substitui CRM, Campanhas, Automação, Omnichannel, Strategy Engine, Agent Harness ou relatórios.

O backend TypeScript é a autoridade de execução e efeitos. O Agent Harness é usado para qualificação, diagnóstico, planejamento e explicação. Postgres é a fonte de verdade. BullMQ agenda o trabalho. O outbox publica mudanças de domínio.

O MVP nasce sobre um `Revenue Recovery Pack v0` versionado. O planner adapta parâmetros e extension points do pack; não inventa um DAG irrestrito a cada missão.

Quando uma automação participa de uma Mission, ela é um subprocesso/capability mission-bound. O Action Engine é o único proprietário da intenção, do outcome e da decisão de continuar, pausar, parar ou replanejar. Automações independentes passam por ownership preflight antes de atuar sobre entidades sob missão.

Economia é parte do estado da missão. Cada action registra custos estimados e reais; tarefas humanas registram tempo e taxa de custo; cada checkpoint calcula valor produzido, custo total, valor líquido, razão valor/custo e intensidade de intervenção humana.

### 2.1 Hierarquia Action Engine × Automations

Regras formais:

1. A Mission possui a intenção, o target, o budget, os guardrails e a lifecycle decision.
2. Um flow chamado pela Mission é invocado por `automation.flow.execute` — ou por capability de subprocesso específica, como `crm.sequence.enroll` — com versão publicada congelada, input, prazo, limites e correlation de missão.
3. O flow pode executar seus nodes e emitir eventos; não pode alterar a Mission, escolher novo target, ampliar population/budget ou declarar outcome atingido.
4. Pause/cancel/kill switch da Mission impede novos efeitos de subprocessos ainda não confirmados.
5. Todo evento do flow mission-bound preserva `missionId`, `actionId`, `correlationId` e `causationId`.
6. Automações independentes continuam operando, mas o dispatcher consulta ownership antes de criar uma execução potencialmente conflitante.
7. Ownership `exclusive` dá precedência à Mission; `shared` permite somente action keys disjuntas; `observe` não bloqueia automações.
8. Conflitos não resolvidos viram `mission.action_blocked` e registro auditável; não são decididos por ordem de chegada.

### 2.2 Economia canônica da missão

```text
valorProduzido       = receita confirmada atribuída conforme o modelo da Mission
custoAutomação       = IA + providers/APIs + infraestrutura variável
custoHumano          = soma(minutos reais / 60 × taxa horária congelada)
custoTotalExecução   = custoAutomação + custoHumano + mídia + serviços externos
valorLíquido         = valorProduzido - custoTotalExecução
razãoValorCusto      = valorProduzido / custoTotalExecução
valorPorHoraHumana   = valorProduzido / horasHumanas
taxaExecuçãoSemHumano = actions concluídas sem intervenção / actions concluídas
```

Quando o denominador for zero, ratios ficam `unknown/not_applicable`; não se usa infinito. Valores de receita estimada e confirmada permanecem separados.

## 3. Evidência no repositório e lacunas

| Área | Base existente | Lacuna do Action Engine |
| --- | --- | --- |
| Plataforma | organizações, contratos, módulos, workspaces e portal | missão como entidade acima dos módulos |
| Growth Workspace | Campanha 360, smart segments e checklists | plano transversal entre módulos e ligado a outcome |
| Strategy Engine | perfis, packs, RAG, recomendações, outcomes e learning signals | output de plano executável validado contra capabilities |
| Agent Harness | workflows, planner, verifier, traces e autonomy policies | contrato específico de mission planning e revision |
| CRM/Automação | commands, sequences, tasks e action handlers | registro estável de capabilities de domínio |
| Blueprints/Strategy Packs | configuração setorial e conhecimento publicado | Action Pack operacional com topology, parâmetros, métricas e economia |
| Infraestrutura | Postgres, BullMQ, outbox, ledger, retries e idempotência | state machine de missão/ação e scheduler próprio |
| Relatórios | métricas de campanhas, MROI e snapshots | métricas canônicas por missão e atribuição |
| Custos | créditos/custos em componentes específicos | ledger econômico unificado e horas humanas por missão |
| UI | dashboard, portal e client workspace | lista/detalhe de objetivos e aprovações por missão |

Essa especificação não considera uma funcionalidade “pronta em produção” apenas porque há código no repositório. Integrações externas continuam sujeitas a deploy, configuração, health e canary.

## 4. Escopo do MVP

### 4.1 Caso de uso piloto

> Recuperar R$ 10.000 em oportunidades existentes e sem interação recente no workspace Crescimento YUX em 30 dias.

O valor, período e critérios podem ser alterados pelo operador ao criar a missão. O fluxo pré-configurado é apenas um default de dogfooding.

### 4.2 Entregas incluídas

- criação e qualificação de missão;
- readiness check de dados, módulos e integrações;
- snapshot de baseline;
- instanciação do `Revenue Recovery Pack v0` com parâmetros aprováveis;
- proposta de plano gerada pelo Agent Harness;
- validação de conformidade do plano contra nós protegidos e extension points do pack;
- compilação/validação do plano no backend;
- revisão e aprovação humana do plano;
- capabilities iniciais de leitura, preparação e comandos internos de baixo risco;
- ações humanas como parte do plano;
- execução persistente e idempotente;
- automações mission-bound executadas somente como capabilities/subprocessos;
- ownership e resolução de conflito com automações independentes;
- aprovações específicas antes de efeitos externos;
- coleta de eventos e snapshots de métricas;
- ledger de custos de IA, providers, mídia/serviços externos e trabalho humano;
- avaliação determinística de progresso, budget, prazo, guardrails e economia;
- proposta de replan, sempre sujeita a revisão no MVP;
- lista e detalhe de missões no portal/client workspace;
- deep links para CRM, tarefas, sequências, mensagens e propostas;
- trilha de auditoria;
- kill switch por missão;
- relatório final com outcome, custo total, valor líquido, valor/custo e horas humanas.

### 4.3 Fora do escopo do MVP

- autonomia contínua nível 3 ou 4;
- alteração automática de orçamento de Ads;
- criação e publicação autônoma de campanhas pagas;
- negociação autônoma, descontos ou compromissos contratuais;
- otimização automática de prompts, policies ou Action Packs;
- criação livre de novos DAGs fora dos extension points do pack piloto;
- portfólio com otimização de recursos entre várias missões;
- marketplace de Action Packs;
- Action Packs adicionais além de `Revenue Recovery Pack v0`;
- atribuição causal/incremental estatisticamente comprovada;
- execução de código ou capabilities definidas dinamicamente no banco;
- substituição das páginas atuais do Hub;
- promessa de execução externa quando providers não estiverem configurados.

## 5. Usuários e permissões

### 5.1 YUX owner/admin

Pode criar, editar, aprovar, iniciar, pausar, retomar e cancelar missões em workspaces autorizados. Pode definir policy, revisar traces e usar kill switch.

### 5.2 YUX operator/manager

Pode operar missões atribuídas, concluir tarefas humanas, revisar artefatos e aprovar ações quando possuir a permission correspondente. Não pode ampliar budget ou autonomy profile sem permission específica.

### 5.3 Client admin

No primeiro piloto, pode visualizar missões da própria organização/contrato e acompanhar outcome, execução e aprovações expostas. Criação de drafts e decisões de lifecycle permanecem restritas à operação YUX até a validação do modelo de governança do portal.

Vê outcome, budget do cliente e gastos externos autorizados. Taxa interna de hora, custo interno de IA/infraestrutura, margem e breakdown operacional da YUX permanecem `internal_only`, salvo permission comercial explícita.

### 5.4 Client user

Pode visualizar missões permitidas. Execução de tarefas, comentários, aprovação de gasto, alteração de policies e efeitos externos não são expostos ao portal no primeiro piloto.

### 5.5 Permissions novas

```text
action_engine.read
action_engine.write
action_engine.economics.read
```

O backend valida permission e escopo da organização em toda mutation. A UI não é fronteira de segurança.

## 6. Modelo funcional

### 6.1 Missão

Campos obrigatórios para sair de `draft`:

- título;
- `outcomeType` suportado;
- organização/workspace;
- owner;
- deadline futura;
- pelo menos uma métrica de sucesso;
- baseline ou regra computável para obtê-lo;
- target;
- definição de população/escopo;
- budget explícito, inclusive quando zero;
- limites separados de custo total, IA/providers, mídia, horas humanas e taxa de custo humano;
- Action Pack e versão aplicáveis;
- modelo de atribuição;
- autonomy profile;
- timezone;
- critério de término.

Estados:

```text
draft
qualifying
planning
pending_plan_approval
ready
active
paused
blocked
evaluating
pending_replan_approval
succeeded
failed
expired
cancelled
```

Transições são commands do backend. Updates genéricos não alteram estado.

### 6.2 Plano

Cada plano possui:

- `missionId`;
- revisão incremental;
- origem (`agent`, `action_pack`, `human` ou composição);
- `actionPackKey`, versão semântica e hash do template;
- parâmetros resolvidos e deviations aprovadas em relação ao pack;
- contexto/snapshot usado;
- rationale;
- budget estimado e máximo;
- risks e assumptions;
- lista de passos;
- validação;
- estado de aprovação;
- hash do documento compilado;
- autor/modelo/workflow version;
- timestamps.

Uma revisão aprovada é imutável. Uma missão tem no máximo uma revisão ativa.

Estados:

```text
proposed -> validating -> invalid | pending_approval -> approved -> active
active -> superseded | completed | cancelled
```

### 6.3 Passo/ação

Tipos:

- `capability`: chama uma capability;
- `human_task`: cria e aguarda tarefa humana;
- `approval`: aguarda decisão;
- `wait_event`: aguarda evento correlacionado;
- `wait_until`: aguarda horário;
- `evaluation`: coleta métricas e avalia checkpoint.

Cada passo declara:

- `stepKey` único na revisão;
- `type`;
- `dependsOn`;
- `condition` determinística;
- `capabilityKey` e `capabilityVersion`, quando aplicável;
- input template validável;
- output bindings explícitos;
- retry, timeout e deadline;
- approval rule;
- success evidence;
- failure policy;
- estimated cost;
- risk;
- deep-link target esperado.

Estados da instância:

```text
pending
ready
waiting_approval
queued
running
retry_scheduled
succeeded
failed
blocked
skipped
cancelled
```

### 6.4 Tentativa

Cada execução cria uma tentativa, mesmo quando falha antes do side effect. A tentativa registra input resolvido sanitizado, policy decision, idempotency key, timestamps, output sanitizado, custo, error code e provider reference.

### 6.5 Aprovação

Tipos:

- `plan`;
- `action`;
- `budget_increase`;
- `scope_change`;
- `replan`;
- `exception`.

Decisões:

- `approved`;
- `rejected`;
- `changes_requested`;
- `expired`;
- `cancelled`.

Uma aprovação registra quem decidiu, a versão exata do subject, comentário, timestamp e payload/hash aprovado. Aprovar uma versão não aprova revisões futuras.

### 6.6 Observação e avaliação

Observações podem vir de:

- eventos de domínio;
- queries de capability;
- métricas agregadas;
- conclusão humana;
- health/readiness;
- input manual com fonte e autor.

A avaliação produz:

- progress atual;
- budget consumido;
- status de cada metric/guardrail;
- trajectory (`ahead`, `on_track`, `at_risk`, `off_track`, `unknown`);
- conclusão (`continue`, `pause`, `block`, `propose_replan`, `succeed`, `fail`);
- reasons determinísticos;
- análise explicativa opcional do agente, separada da decisão computada.

### 6.7 Revenue Recovery Pack v0

Identidade canônica:

```text
packKey: revenue_recovery
version: 0.1.0
schemaVersion: 1
outcomeType: recovered_revenue
status: published_for_internal_pilot
```

O pack contém:

- parameter schema;
- readiness spec;
- topology template;
- protected step keys;
- optional branches e extension points;
- capabilities obrigatórias/opcionais e versões aceitas;
- metric/attribution spec;
- economics spec;
- policy defaults;
- rubrica usada pelo planner/verifier;
- owner, changelog e hash.

Topology protegida:

```text
pack.readiness
-> pack.baseline
-> pack.find_candidates
-> pack.apply_exclusions
-> pack.segment
-> pack.approve_population
-> pack.prepare_outreach
-> pack.approve_canary
-> pack.execute_outreach
-> pack.wait_signals
-> pack.collect_metrics_and_costs
-> pack.evaluate
```

O planner pode:

- preencher parâmetros dentro dos limites;
- selecionar canais efetivamente disponíveis;
- escolher ramos opcionais previamente declarados;
- propor conteúdo, priorização e tarefas humanas;
- reduzir population, budget ou volume;
- inserir approval adicional.

O planner não pode:

- remover/reordenar nós protegidos de forma que altere a segurança;
- adicionar capability fora da allowlist do pack/registry;
- ampliar target, population, budget ou autonomia;
- remover consentimento, aprovação externa, coleta de custos ou avaliação;
- alterar metric/economics formulas;
- substituir o pack por DAG livre.

### 6.8 Ledger econômico

Cada custo é um lançamento imutável com:

- `missionId`, `planId`, `actionRunId`/`humanTaskId` quando aplicável;
- categoria (`ai`, `provider`, `media`, `human`, `external_service`, `infrastructure_variable`);
- natureza (`estimated`, `reserved`, `actual`, `reversal`);
- quantidade, unidade e unit cost;
- moeda original, valor original e valor normalizado BRL;
- taxa/fonte de conversão quando a moeda não for BRL;
- source reference e timestamp;
- idempotency key.

Concluir uma tentativa e registrar seus custos conhecidos/reservados acontece na mesma transação. Quando o provider só confirma custo depois, a reconciliação adiciona `actual` e reversal da reserva, sem editar lançamentos. Concluir tarefa humana exige `actualMinutes`; a taxa horária utilizada é o snapshot aprovado na Mission/Pack, não a configuração corrente.

### 6.9 Ownership de execução

Cada vínculo em `action_mission_entities` pode assumir:

```text
ownershipMode: observe | shared | exclusive
conflictPolicy: allow_disjoint | mission_wins | block_new
status: active | released
```

`exclusive` ativo é único por organização + entity type + entity ID. O ownership é adquirido antes do primeiro efeito, renovado/validado no preflight e liberado no encerramento/cancelamento após reconciliar subprocessos em andamento.

## 7. Capability Registry

### 7.1 Contrato TypeScript

```ts
export type CapabilityKind = 'query' | 'prepare' | 'command' | 'wait' | 'human'
export type CapabilityRisk = 'low' | 'medium' | 'high' | 'critical'

export type CapabilityContext = {
  organizationId: string
  contractId?: string
  missionId: string
  planId: string
  actionId: string
  correlationId: string
  causationId?: string
  idempotencyKey: string
  actor: { type: 'user' | 'system'; id?: string }
  dryRun: boolean
}

export type CapabilityResult<TOutput> = {
  output: TOutput
  evidence: Array<{
    type: string
    entityType?: string
    entityId?: string
    value?: string | number | boolean
  }>
  emittedEventIds: string[]
  deepLinks: string[]
  costEntries: Array<{
    nature: 'reserved' | 'actual'
    category: 'ai' | 'provider' | 'media' | 'human' | 'external_service' | 'infrastructure_variable'
    amountBrl: string
    quantity: string
    unit: 'call' | 'token' | 'message' | 'minute' | 'hour' | 'fixed'
    sourceReference: string
  }>
}

export type CapabilityDefinition<TInput, TOutput> = {
  key: string
  version: 1
  name: string
  description: string
  kind: CapabilityKind
  moduleKey: string
  requiredPermissions: string[]
  requiredConnections: string[]
  risk: CapabilityRisk
  approval: 'never' | 'policy' | 'always'
  idempotency: 'required' | 'not_applicable'
  reversibility: 'reversible' | 'compensatable' | 'irreversible'
  supportsDryRun: boolean
  inputSchema: ZodType<TInput>
  outputSchema: ZodType<TOutput>
  execute(context: CapabilityContext, input: TInput): Promise<CapabilityResult<TOutput>>
}
```

O registry expõe metadados serializáveis ao planner; função, schemas executáveis e secrets nunca são enviados.

### 7.2 Capabilities do MVP

| Key | Tipo | Efeito | Aprovação padrão |
| --- | --- | --- | --- |
| `system.readiness.check` | query | nenhum | nunca |
| `crm.pipeline.snapshot` | query | nenhum | nunca |
| `crm.recovery_candidates.search` | query | nenhum | nunca |
| `crm.lead.timeline.read` | query | nenhum | nunca |
| `growth.segment.preview` | query | nenhum | nunca |
| `omnichannel.message.draft` | prepare | cria artefato interno | policy |
| `human.task.create` | human | cria tarefa interna | nunca para nível 1 |
| `crm.lead.assign_owner` | command | altera owner | policy |
| `crm.task.create` | command | cria tarefa | nunca para nível 1 |
| `automation.flow.execute` | command | inicia versão congelada como subprocesso mission-bound | policy; sempre se houver efeito externo |
| `crm.sequence.enroll` | command | agenda cadência | sempre no MVP |
| `email.message.queue` | command | efeito externo | sempre no MVP |
| `whatsapp.template.queue` | command | efeito externo | sempre no MVP |
| `reports.recovered_revenue.snapshot` | query | nenhum | nunca |

Se uma capability não puder ser implementada sobre um command confiável existente, ela fica fora do registry. O planner não recebe capacidades aspiracionais.

### 7.3 Disponibilidade

Uma capability está disponível somente quando todas as condições forem verdadeiras:

- registrada e ativa na versão solicitada;
- módulo habilitado pelo contrato;
- permission do executor;
- conexões obrigatórias configuradas e saudáveis;
- policy não bloqueia;
- workspace possui dados mínimos;
- capability não está desligada pelo kill switch global/organizacional;
- limites operacionais não foram excedidos.

## 8. Planner e contrato de saída

### 8.1 Entrada

O Agent Harness recebe:

- mission draft normalizada;
- `Revenue Recovery Pack v0` publicado, seus protected nodes, parameter schema e extension points;
- readiness report;
- baseline snapshot;
- catálogo serializado apenas com capabilities disponíveis;
- limites de budget/autonomia;
- Strategy Pack/contexto publicado;
- dados minimizados necessários ao diagnóstico;
- revision anterior em caso de replan;
- observações que motivaram a revisão.

### 8.2 Saída

```ts
export type ProposedMissionPlan = {
  schemaVersion: 1
  missionId: string
  actionPack: { key: 'revenue_recovery'; version: '0.1.0'; templateHash: string }
  resolvedParameters: Record<string, unknown>
  deviations: Array<{ path: string; reason: string; approvalRequired: boolean }>
  rationale: string
  assumptions: Array<{ key: string; statement: string; evidenceIds: string[] }>
  risks: Array<{ key: string; severity: 'low' | 'medium' | 'high'; mitigation: string }>
  estimatedEconomics: {
    currency: 'BRL'
    aiAndProviderCost: string
    mediaCost: string
    humanHours: string
    humanCost: string
    totalExecutionCost: string
  }
  steps: Array<{
    stepKey: string
    type: 'capability' | 'human_task' | 'approval' | 'wait_event' | 'wait_until' | 'evaluation'
    name: string
    dependsOn: string[]
    condition?: { fact: string; operator: string; value: unknown }
    capability?: { key: string; version: 1; input: Record<string, unknown> }
    timeoutSeconds: number
    maxAttempts: number
    approval: 'none' | 'policy' | 'required'
    successEvidence: Array<{ type: string; key: string }>
    outputBindings?: Array<{ outputPath: string; factKey: string }>
    onFailure: 'retry' | 'block' | 'skip' | 'request_replan'
  }>
  checkpoints: Array<{
    afterStepKey: string
    metricKeys: string[]
    decisionThresholds: Array<{ metricKey: string; operator: string; value: number }>
  }>
}
```

### 8.3 Validação do compilador

O backend rejeita o plano com errors estruturados quando:

- `schemaVersion` não é suportada;
- `missionId` diverge;
- capability ou versão não existe;
- capability não está disponível;
- input falha no Zod schema;
- dependência aponta para step inexistente;
- grafo possui ciclo;
- step key é duplicada;
- não existe caminho para avaliação final;
- budget máximo estimado supera a missão;
- capability requer approval e o plano não inclui checkpoint;
- ação externa não possui lote/escopo resolvível;
- wait não tem timeout/deadline;
- output binding referencia dado inexistente;
- condição usa operador não permitido;
- risco crítico não está bloqueado;
- plano tenta alterar escopo ou target da missão.
- pack key/version/hash não corresponde ao pack publicado;
- nó protegido foi removido ou tornou-se contornável;
- deviation ultrapassa um extension point permitido;
- plano omite coleta de custos ou checkpoint econômico;
- automação mission-bound não declara flow version congelada e ownership mode.

O compilador pode enriquecer o plano com approval steps e metadados de policy, mas não pode trocar intenção operacional sem registrar warning visível.

## 9. Policy e autonomia

### 9.1 Perfis do MVP

```text
recommend      -> somente query e recomendação
assisted       -> query/prepare + commands após aprovação aplicável
guardrailed    -> reservado; apenas capabilities explicitamente liberadas
```

O default é `assisted` para admin YUX e `recommend` para novos clientes.

### 9.2 Ordem de decisão

Da restrição mais forte para a mais fraca:

1. kill switch global;
2. capability desabilitada;
3. restrição legal/consentimento;
4. policy específica da organização/contrato/capability;
5. budget/volume/rate limit da missão;
6. risk e reversibility da capability;
7. autonomy profile da missão;
8. default do registry.

`deny` vence qualquer `allow`. `always approve` não pode ser rebaixado pela missão.

### 9.3 Ações sempre bloqueadas no MVP

- alterar budget de Ads;
- publicar campanha paga;
- prometer desconto;
- alterar proposta/contrato aprovado;
- enviar primeiro contato outbound via WhatsApp automaticamente;
- usar contato sem permission evidence aplicável;
- exceder frequência ou horário permitido;
- publicar conteúdo externo sem aprovação;
- executar capability não versionada.

## 10. Persistência

### 10.1 Tabelas novas

#### `action_packs`

Identidade estável do playbook: key, nome, outcome type, setor, owner e lifecycle status.

#### `action_pack_versions`

Versões imutáveis com parameter/readiness/topology/metric/economics/policy specs, protected nodes, extension points, changelog e hash. O MVP publica `revenue_recovery@0.1.0`.

#### `action_missions`

Fonte de verdade da missão: escopo, target, budget, attribution, autonomy, owner e estado.

#### `action_mission_metrics`

Definições de success, leading e guardrail metrics. Fórmulas são keys conhecidas pelo evaluator; SQL arbitrário não é armazenado.

#### `action_plans`

Revisões imutáveis, proposta original, documento compilado, hash, validation e approval status.

#### `action_plan_steps`

Definição congelada de cada passo da revisão.

#### `action_runs`

Instância operacional de um step, separada da definição. Permite re-execução controlada e preserva estado.

#### `action_run_attempts`

Tentativas idempotentes, policy decision, input/output sanitizado, custo e erros.

#### `action_cost_entries`

Ledger imutável de custos estimados, reservados, reais e estornos, normalizados para BRL e vinculados à missão/action/tarefa.

#### `action_approvals`

Decisões versionadas sobre plano, ação, replan, budget e exceção.

#### `action_observations`

Fatos e snapshots coletados, com source, source record, timestamp observado, correlation e confidence quando aplicável.

#### `action_mission_entities`

Vínculos auditáveis entre a missão e leads, propostas, conversas, campanhas ou contratos. Registram papel (`candidate`, `target`, `touched`, `outcome`), action de origem, janela de atribuição, ownership mode, conflict policy e status; o observer não associa eventos apenas por semelhança temporal.

#### `action_evaluations`

Resultado determinístico, trajetória, decisão e análise opcional.

#### `action_capability_policies`

Overrides persistidos por escopo. O código do registry não vive no banco.

### 10.2 Constraints

- UUIDs como primary keys;
- toda linha operacional possui `organization_id` direta ou derivável por FK obrigatória;
- `contract_id` pertence à mesma organização;
- uma versão única por `(pack_id, semantic_version)` e hash único por conteúdo publicado;
- versão de pack publicada é imutável;
- uma revisão única por `(mission_id, revision)`;
- um plano ativo por missão;
- uma action run canônica por `(plan_id, step_key)`;
- tentativa única por `(run_id, attempt_number)`;
- idempotency key única por capability invocation;
- idempotency key única por cost entry;
- vínculo único por `(mission_id, entity_type, entity_id, role)`;
- partial unique index para ownership `exclusive` ativo por `(organization_id, entity_type, entity_id)`;
- JSONB limitado a objetos/arrays conforme campo;
- check constraints para estados;
- FKs com `ON DELETE` conservador; histórico não é apagado em cascata por entidade externa;
- RLS forçada e acesso de portal limitado à organização/contrato;
- timestamps em `TIMESTAMPTZ`;
- valores financeiros em `NUMERIC`, nunca float.

### 10.3 Retenção

- pack/version, missão, plano, cost ledger, aprovação e avaliação: retenção de negócio sem purge automático no MVP;
- payload de tentativa: sanitizado e sujeito à política de PII;
- traces detalhados do Agent Harness: política de retenção já existente;
- secrets e tokens nunca persistidos em payloads.

## 11. APIs

Prefixo: `/api/action-engine`.

### 11.1 Catálogo e readiness

```text
GET  /capabilities?organizationId=&contractId=
GET  /action-packs
GET  /action-packs/:packKey/versions/:semanticVersion
POST /readiness
```

`/capabilities` retorna somente metadados serializáveis e disponibilidade. Action Pack endpoints retornam specs publicadas sanitizadas, sem prompts internos não autorizados. `/readiness` aceita draft de missão e retorna checks com `pass`, `warn` ou `block`.

### 11.2 Missões

```text
GET  /missions
POST /missions
GET  /missions/:missionId
PATCH /missions/:missionId
POST /missions/:missionId/qualify
POST /missions/:missionId/plan
POST /missions/:missionId/start
POST /missions/:missionId/pause
POST /missions/:missionId/resume
POST /missions/:missionId/cancel
POST /missions/:missionId/evaluate
```

`PATCH` só edita campos permitidos em estados editáveis. Commands de estado usam endpoints próprios.

### 11.3 Planos e aprovações

```text
GET  /missions/:missionId/plans
GET  /plans/:planId
POST /plans/:planId/submit
POST /approvals/:approvalId/decide
```

### 11.4 Ações

```text
GET  /missions/:missionId/actions
GET  /actions/:actionId
POST /actions/:actionId/retry
POST /actions/:actionId/skip
POST /actions/:actionId/resolve-human-task
```

### 11.5 Mutations

- exigem auth e permission;
- aceitam `Idempotency-Key` nas operações que criam efeito;
- retornam `409` para transição/versão concorrente;
- retornam error codes estáveis;
- registram actor e correlation;
- não aguardam job longo; retornam estado persistido e job reference;
- usam optimistic concurrency via `version` da missão.

## 12. Jobs e eventos

### 12.1 Jobs BullMQ

```text
action-engine.planMission
action-engine.scheduleReadyActions
action-engine.executeAction
action-engine.collectMetrics
action-engine.evaluateMission
action-engine.expireWaits
events.consume.missionObserver
```

Todos usam IDs BullMQ seguros e idempotentes. O scheduler reconsulta o estado no Postgres antes de executar.

### 12.2 Eventos de domínio

```text
mission.created
mission.qualified
mission.readiness_blocked
mission.plan_proposed
mission.plan_approved
mission.started
mission.paused
mission.resumed
mission.blocked
mission.cancelled
mission.succeeded
mission.failed
mission.expired
mission.replan_proposed
mission.action_ready
mission.action_waiting_approval
mission.action_started
mission.action_succeeded
mission.action_failed
mission.action_blocked
mission.approval_requested
mission.approval_decided
mission.observation_recorded
mission.evaluated
mission.cost_recorded
mission.ownership_acquired
mission.ownership_conflict
mission.ownership_released
mission.automation_subprocess_started
mission.automation_subprocess_completed
```

O envelope existente é ampliado para aggregate types `mission`, `mission_action` e `approval`. Payloads contêm IDs e fatos mínimos; detalhes ficam nas tabelas próprias.

Flows de automação mission-bound emitem os eventos existentes com contexto de missão e os dois eventos de subprocesso. O Action Engine observa o resultado; o flow não emite `mission.succeeded`, `mission.failed` ou `mission.replan_proposed`.

### 12.3 Integração com eventos existentes

Um consumer `mission_observer` transforma eventos relevantes em observations, sem apropriar-se do domínio original. Exemplos:

- `lead.stage_changed`;
- `lead.interaction_recorded`;
- `lead.sequence_completed`;
- `email.delivered/opened/clicked/bounced/complained`;
- `proposal.viewed/approved` quando disponível;
- contrato/receita confirmada conforme fonte canônica.

O consumer resolve missões por `action_mission_entities` e correlation, e é idempotente por `(mission_id, source_event_id, metric_key)`. Ele nunca atribui um evento a uma missão apenas porque o mesmo lead esteve ativo dentro da janela.

## 13. Evaluator

### 13.1 Metric definitions do piloto

| Key | Tipo | Fonte | Agregação |
| --- | --- | --- | --- |
| `eligible_recovery_value` | baseline | CRM/propostas | soma |
| `contacted_opportunities` | leading | mission touches | contagem distinta |
| `positive_responses` | leading | omnichannel/email + classificação revisável | contagem distinta |
| `meetings_booked` | leading | CRM task/event ou agenda | contagem distinta |
| `proposals_sent` | leading | propostas | contagem distinta |
| `signed_revenue` | success | contrato/proposta aceita confirmada | soma BRL |
| `unsubscribe_rate` | guardrail | email lifecycle | razão |
| `complaint_count` | guardrail | provider lifecycle | soma |
| `external_messages_sent` | budget/volume | delivery | soma |
| `human_hours` | budget | tarefas resolvidas com duração | soma |
| `ai_provider_cost` | economics | cost ledger | soma BRL |
| `human_cost` | economics | minutos × taxa congelada | soma BRL |
| `total_execution_cost` | economics | cost ledger | soma BRL |
| `net_value` | economics | signed revenue − total cost | BRL |
| `value_cost_ratio` | economics | signed revenue / total cost | razão/unknown |
| `value_per_human_hour` | economics | signed revenue / human hours | BRL/unknown |
| `human_free_execution_rate` | productization | action runs | razão |

### 13.2 Regras

- `succeeded` quando success metric atinge target e nenhum guardrail crítico está violado;
- `expired` quando deadline passa sem sucesso, após coleta final;
- `blocked` quando readiness crítico falha ou não há caminho executável;
- `pause` quando kill switch é acionado ou guardrail crítico viola;
- `propose_replan` quando trajectory está `off_track` após amostra/checkpoint mínimo;
- `pause` ou approval econômico quando custo projetado/real cruza o budget aprovado;
- `unknown` quando a fonte de métrica está indisponível; ausência não equivale a zero;
- ratios com denominador zero ficam `not_applicable`, não infinito;
- cálculos usam timestamp observado e timezone da missão;
- valores atrasados podem corrigir snapshots, preservando histórico.

## 14. UX do MVP

### 14.1 Navegação

Adicionar `Missões` à navegação do portal e de client workspace quando `action_engine` estiver ativo. A navegação interna global mantém Dashboard e adiciona acesso às missões autorizadas.

Rotas:

```text
/missions
/missions/:missionId
/portal/missoes
/portal/missoes/:missionId
/client-workspaces/:organizationId/missoes
/client-workspaces/:organizationId/missoes/:missionId
```

### 14.2 Create flow

1. selecionar `Revenue Recovery Pack v0` — default único do piloto;
2. informar target, prazo e population;
3. revisar baseline/readiness;
4. definir budgets de API/provider, mídia, horas e taxa de custo humano;
5. definir autonomia e ownership;
6. criar draft;
7. solicitar instanciação adaptada do pack;
8. revisar parâmetros, deviations, plano e economia estimada antes de aprovar.

Campos bloqueantes são mostrados antes da geração. Warnings não são ocultados.

### 14.3 Dashboard

Filtros por estado, owner, outcome type e prazo. Cards exibem:

- título e target;
- progresso com numerador/denominador reais;
- trajectory;
- prazo restante;
- budget;
- custo realizado, valor líquido e razão valor/custo;
- horas humanas realizadas versus limite;
- próxima ação;
- approvals pendentes;
- health.

### 14.4 Detalhe

Seções:

- resumo;
- plano;
- execução;
- resultados e economia;
- aprovações;
- auditoria.

Cada ação vinculada possui deep link para a tela tradicional. O plano mostra pack/version/hash, parâmetros e deviations. A execução mostra automações subordinadas como subprocessos da action, não como missões paralelas. A UI mostra separadamente “decisão computada” e “análise da IA”.

### 14.5 Estados seguros

- provider ausente: mostrar bloqueio e link de configuração;
- métrica indisponível: `Desconhecido`, não zero;
- runtime de agente indisponível: missão permanece consistente e planning pode ser repetido;
- Redis indisponível: mutation aceita somente se estado/evento foram persistidos; dispatcher retoma depois;
- plano inválido: mostrar errors por step e impedir aprovação;
- approval expirada: ação volta a `waiting_approval` com nova versão quando necessário.

## 15. Segurança e privacidade

- escopo de organização aplicado em queries e mutations;
- planner recebe o mínimo necessário e contexto sanitizado;
- capability input não aceita `organizationId` arbitrário do plano; o backend injeta contexto;
- secrets são resolvidos server-side por connection reference;
- logs removem token, secret, password, authorization e conteúdo sensível configurado;
- economic entries distinguem `internal_only` de `client_visible`; portal nunca recebe taxa humana interna ou margem da YUX por inferência do frontend;
- ações externas validam consentimento/base legal e suppression no momento da execução;
- plano não consegue selecionar tabela/SQL/URL arbitrária;
- webhook/eventos externos são autenticados na fronteira existente;
- capability registry usa allowlist em código;
- payload aprovado é hashado para prevenir execução de versão diferente;
- pack version e template hash são validados novamente no start/replan;
- automações consultam ownership antes de iniciar execução independente conflitante;
- cancelamento e kill switch são checados imediatamente antes do efeito;
- cost entries não aceitam update/delete operacional; correções usam lançamento de reversão;
- tentativas e decisões de policy são auditáveis.

## 16. Observabilidade

Cada mission/action expõe:

- correlation ID;
- estado atual e última transição;
- job/attempt atual;
- erro estável e mensagem sanitizada;
- policy decision;
- capability/version;
- latency e retries;
- custo estimado/real;
- breakdown de custo, horas humanas, valor líquido e ratios econômicos;
- pack key/version/hash e conformidade/deviations;
- ownership mode e conflitos de automação;
- links para Agent Harness run/trace quando houve IA;
- eventos e observations correlacionados.

Métricas operacionais:

```text
mission_count_by_status
mission_time_to_plan_seconds
mission_time_to_first_action_seconds
mission_success_rate
action_count_by_status_capability
action_retry_rate
action_approval_wait_seconds
capability_failure_rate
guardrail_violation_count
mission_budget_utilization
planner_invalid_plan_rate
planner_pack_conformance_failure_rate
mission_total_execution_cost_brl
mission_value_cost_ratio
mission_value_per_human_hour_brl
mission_human_free_execution_rate
mission_automation_conflict_count
```

## 17. Requisitos não funcionais

### Consistência

- mutation de estado e evento de domínio são atômicos;
- conclusão de attempt/tarefa e cost entries reais são atômicas;
- execução é at-least-once com efeitos idempotentes;
- uma revisão aprovada não muda;
- pack version publicada não muda;
- ownership exclusive impede duas intenções ativas sobre a mesma entidade;
- state transition usa row lock ou compare-and-swap.

### Performance

- listagem paginada retorna em até 500 ms p95 em ambiente saudável para 10 mil missões/organização;
- detalhe inicial retorna em até 800 ms p95 sem traces pesados;
- mutations síncronas retornam em até 1 s, excluindo jobs;
- scheduler torna action `ready` em até 10 s p95 após dependência/evento.

### Escala inicial

- 10 mil missões por organização;
- 500 steps por missão como limite absoluto, 100 recomendado;
- 20 missões ativas simultâneas por organização no MVP;
- lote externo limitado pela policy, com default canário de 20 contatos.

### Resiliência

- reinício de worker não perde estado;
- Redis fora do ar não apaga missão/plano;
- retry respeita idempotência e deadline;
- poison action termina em blocked/dead-letter operacional, sem loop infinito;
- limite de 12 níveis de causação automática é preservado.

### Compatibilidade

- frontend React 18/TypeScript/Vite;
- backend Fastify/TypeScript/Node 22;
- Postgres 17;
- Redis/BullMQ existente;
- Agent Harness Python existente;
- nenhuma dependência de Supabase como runtime ativo.

## 18. Critérios de aceite do MVP

### Cenário A — draft e readiness

1. Admin cria objetivo de R$ 10 mil/30 dias no Crescimento YUX.
2. Sistema calcula baseline e lista integrações/dados.
3. Sem fonte de receita, readiness bloqueia planning e explica a correção.
4. Após configuração válida, missão avança para `planning`.

### Cenário B — planejamento seguro

1. Planner recebe `revenue_recovery@0.1.0` e apenas capabilities disponíveis.
2. Proposta contém pack/hash, parâmetros, deviations, diagnóstico, plano e checkpoints.
3. Capability inexistente é rejeitada pelo compilador.
4. Remoção de consentimento, aprovação, custos ou avaliação é rejeitada como violação de nó protegido.
5. Plano válido registra revisão 1 e approval pendente.
6. Aprovação referencia hash da revisão e do pack.

### Cenário C — execução assistida

1. Missão aprovada inicia.
2. Queries identificam candidatos sem efeito externo.
3. Sistema cria tarefas internas idempotentes.
4. Mensagens ficam preparadas e aguardam aprovação.
5. Operador aprova lote canário.
6. E-mail/WhatsApp usa command existente e não duplica no retry.
7. Cada ação possui evidência e deep link.

### Cenário D — observação e avaliação

1. Eventos de entrega/resposta/proposta geram observations idempotentes.
2. Evaluator calcula leading, success e guardrail metrics.
3. Métrica indisponível aparece como `unknown`.
4. Resultado abaixo do threshold gera replan proposto, não executado.
5. Receita confirmada que atinge target conclui missão como `succeeded`.

### Cenário E — controle e auditoria

1. Pause impede novos efeitos.
2. Cancel preserva histórico.
3. Kill switch é respeitado mesmo com job já enfileirado.
4. Usuário de outra organização recebe 404/403 sem vazamento.
5. Toda mudança de plano, aprovação, policy e tentativa é auditável.

### Cenário F — degradação

1. Redis indisponível não perde mutation/evento aceito.
2. Agent Harness indisponível deixa planning repetível, sem plano parcial ativo.
3. Provider indisponível bloqueia ação e não marca sucesso.
4. Worker reiniciado retoma actions pendentes sem repetir efeito.

### Cenário G — ownership de automações

1. Mission adquire ownership `exclusive` sobre os leads do canário.
2. `automation.flow.execute` inicia uma versão congelada com mission/action correlation.
3. Flow conclui nodes e emite eventos, mas não consegue mudar target/status da Mission.
4. Automação independente com action conflitante é bloqueada antes da execução e gera conflito auditável.
5. Automação disjunta é permitida somente quando a conflict policy for `allow_disjoint`.
6. Pause/kill switch impede o próximo efeito do subprocesso mission-bound.

### Cenário H — economia da missão

1. Plano apresenta custo estimado por categoria e horas humanas antes da aprovação.
2. Cada chamada de IA/provider gera um cost entry real idempotente.
3. Tarefa humana só conclui com minutos reais e usa a taxa congelada da Mission.
4. Estorno cria lançamento inverso; não edita o lançamento original.
5. Evaluator calcula custo total, valor líquido, valor/custo, valor/hora humana e taxa de execução sem humano.
6. Ultrapassar budget econômico pausa ou solicita approval conforme policy.
7. Relatório permite comparar outcome positivo com economia positiva ou negativa.

### Cenário I — evolução do Action Pack

1. Pack v0 permanece imutável durante as missões piloto.
2. Learning/review pode propor `0.2.0`, mas não altera `0.1.0` nem missões em curso.
3. Comparação entre versões usa métricas de outcome, custo, horas humanas, invalid plan rate e incidentes.

## 19. Gates de release

- migration `0128` aplicada em banco descartável e target controlado;
- backend type-check/build/test verdes;
- frontend type-check/build/test verdes;
- Agent Harness tests do novo contrato verdes;
- teste de isolamento entre organizações;
- teste de idempotência com retry após efeito persistido;
- teste de kill switch imediatamente antes do dispatch;
- teste de approval hash/version;
- teste de pack conformance, protected nodes e imutabilidade da versão publicada;
- teste de ownership contra automação independente conflitante;
- teste de cost ledger idempotente e atomicidade com attempt/tarefa;
- teste dos cálculos econômicos com denominador zero;
- teste ponta a ponta sem provider real;
- canary interno com no máximo 20 contatos;
- confirmação manual de métricas e atribuição;
- confirmação manual de custos e horas humanas do canário;
- zero violações de guardrail;
- runbook de pause/cancel/replay disponível.

## 20. Rollout

### Gate 0 — Shadow

Mission e planner instanciam `Revenue Recovery Pack v0` sobre dados reais, mas nenhuma ação é criada fora do engine. Comparar plano, deviations e economia estimada com a decisão humana.

### Gate 1 — Prepare

Engine cria segment preview, drafts e tarefas internas, registra tempo/custos e testa ownership. Toda comunicação externa é manual.

### Gate 2 — Approved canary

Lote máximo de 20 contatos, aprovação explícita, monitoring diário de outcome/economia/ownership e kill switch ativo.

### Gate 3 — Assisted production

Ampliar volume dentro de policies somente após métricas do canary e revisão operacional.

### Gate 4 — Primeiro cliente

Somente após dogfooding concluir pelo menos três missões, uma com outcome atingido, sem incidente e com atribuição revisada.

## 21. Métricas de decisão pós-piloto

O MVP é considerado promissor quando:

- ao menos uma missão atinge outcome ou produz evidência clara de inviabilidade;
- o plano é aceito com edição operacional limitada;
- o tempo humano de coordenação cai em comparação ao processo manual;
- custo total, valor líquido, valor/custo e valor/hora humana são auditáveis;
- o `Revenue Recovery Pack v0` reduz variabilidade sem impedir adaptação necessária;
- nenhuma ação externa duplica;
- nenhum guardrail é violado;
- toda receita atribuída pode ser auditada até registros fonte;
- o usuário entende estado, próximo passo e bloqueios sem abrir logs técnicos;
- o custo de IA/operação é compatível com a margem do serviço.

O MVP não é validado apenas porque o fluxo técnico conclui. Precisa demonstrar valor econômico ou aprendizado falsificável.

## 22. Evolução após o MVP

1. promover `Revenue Recovery Pack v0` para v1 somente após evidência de outcome, economia e segurança;
2. comparar versões do pack em shadow antes de publicar;
3. adicionar Action Packs de prospecção ativa, agendamento e no-show;
4. permitir execution level 2 para capabilities reversíveis comprovadas;
5. adicionar trajectory e replanning dentro de envelopes aprovados;
6. conectar campanhas pagas somente após provider health, budget policies e rollback operacional;
7. criar portfólio de missões e resolução de conflitos;
8. oferecer o produto a clientes com limites conservadores por setor.

## 23. Decisões fechadas por esta spec

- entidade técnica: `Mission`; termo de interface: `Objetivo`;
- primeira fatia: recuperação de receita no Crescimento YUX;
- primeiro playbook: `revenue_recovery@0.1.0` dentro do MVP;
- planner adapta extension points do pack; DAG livre não é aceito no piloto;
- source of truth: Postgres;
- efeitos: backend TypeScript;
- planejamento/análise: Agent Harness;
- registry: código versionado;
- plans: imutáveis por revisão;
- Action Engine possui intenção/decisão; automações mission-bound são subprocessos versionados;
- ownership preflight resolve conflito com automações independentes;
- métricas: determinísticas;
- economia: cost ledger imutável e KPIs econômicos em cada checkpoint;
- autonomy default: `assisted` interno, `recommend` cliente;
- side effects externos: aprovação obrigatória no MVP;
- UI: camada adicional com deep links;
- rollout: shadow -> prepare -> canary -> assisted production.
