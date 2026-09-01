# YUX Agent Harness Runtime

Este documento descreve a primeira versao operacional da harness de agentes IA da YUX.

## Objetivo

Centralizar a execucao dos agentes de marketing e vendas em um runtime Python/LangGraph, com fila, execution trace, autonomia configuravel, RAG operacional, workflows estrategicos, subagentes sob demanda e Active Learning controlado.

## Fluxo

```text
Evento
  -> Python Harness API
  -> normalizacao e fila
  -> worker
  -> classificador
  -> RAG operacional
  -> planner/workflow
  -> subagentes
  -> verifier
  -> synthesizer
  -> policy engine
  -> trace + learning signal
```

O mesmo Harness também atende o intake conversacional de Missões. Isso é um novo workflow do runtime existente, não um segundo agente nem uma segunda base de conhecimento:

```text
Conversa de Missão
  -> contexto operacional e de empresa preparado pelo backend
  -> retrieval e políticas existentes do Harness
  -> Strategy Packs YUX + conhecimento publicado do cliente
  -> resposta estruturada: entendimento, até 3 perguntas, readiness, briefing e fontes
  -> revalidação determinística das fontes no backend
  -> confirmação humana
  -> planner existente + compilador e executor do Action Engine
```

O Harness propõe interpretação, fontes e plano. Ele não ganha capabilities de mutação por causa da conversa. O Action Engine continua sendo o proprietário da intenção, do orçamento, das aprovações, da execução, da pausa e do replanejamento.

## Operacao Na Plataforma

- `/admin/strategy-engine`: governa Strategy Packs, perfis, modelos, workflows,
  execution trace, learning e aprovacao de melhorias.
- `/client-workspaces`: lista workspaces operacionais. O workspace interno
  `Crescimento YUX` permite que a propria YUX use CRM, Atendimento & IA,
  Marketing Studio e Relatorios com a doutrina interna aprovada.
- CRM, Omnichannel, Marketing Studio e Relatorios exibem paineis contextuais do
  Strategy Harness para encaminhar diagnosticos e proximas acoes ao agente
  correto.

## Strategy Packs

Strategy Packs sao a unidade de governanca do conhecimento operacional.

```text
Fonte privada ou playbook
  -> ingestion job
  -> itens propostos
  -> revisao humana
  -> item aprovado
  -> pack publicado
  -> binding por workspace/agente/modulo/canal/workflow
  -> uso pelo runtime
```

Itens suportados na primeira versao:

- concept cards;
- playbooks;
- rubricas;
- chunks;
- prompt rules.

O runtime deve priorizar itens aprovados de packs publicados. Documentos e
chunks brutos ficam como apoio de auditoria e recuperacao, nao como substituto
da metodologia operacional curada.

Conteúdo futuro, incluindo livros e playbooks como *The Black Book*, entra pelo fluxo normal de ingestão, curadoria, publicação e binding do Harness. Depois de publicado para o perfil/workflow correto, esse conhecimento pode fundamentar conversas de Missão sem ingestão, índice ou seleção paralela no Action Engine. Conteúdo específico do cliente segue o mesmo princípio, sempre limitado à organização, contrato, visibilidade e perfil do agente.

## Endpoints

- `GET /health`: healthcheck.
- `POST /events/ingest`: recebe evento normalizado de WhatsApp/omnichannel e cria job.
- `POST /jobs/process-next`: processa o proximo job da fila local.
- `POST /workflows/execute`: executa workflow estrategico diretamente.
- `POST /missions/conversations/respond`: responde um turno de intake com contrato estruturado, fontes e readiness.
- `POST /missions/plan`: propõe o plano para compilação determinística no Action Engine.

Os endpoints mutaveis exigem `Authorization: Bearer <token>`. O processo nao
inicia sem `YUX_AGENT_RUNTIME_TOKEN`, nem sem `DATABASE_URL`: o Postgres da
plataforma e a unica persistencia de producao da runtime.

Cada chamada mutavel exige `organization_id`; quando `client_id` ou
`contract_id` forem informados, a runtime confirma que pertencem a essa
organizacao antes de ler ou gravar dados. Jobs concorrentes sao reivindicados
com `FOR UPDATE SKIP LOCKED`. Consumo de credito usa update condicional da
wallet e ledger na mesma transacao.

## Variaveis

- `YUX_AGENT_RUNTIME_TOKEN`: token interno para chamadas do Portal/Edge.
- `DATABASE_URL`: conexao interna com o Postgres do Portal YUX.
- `OPENROUTER_API_KEY`: modelos LLM via OpenRouter.
- `JINA_API_KEY`: leitura, busca e grounding.

O contrato de conversa é gerado de uma fonte única e validado nos dois runtimes. O corpus congelado em `golden-missions/conversations/corpus.json` bloqueia promoção quando há drift de contrato, fonte de outro tenant, sugestão de capability não autorizada, mais de três perguntas, pergunta repetida ou regressão de custo/latência acima de 20% sem exceção aprovada.

## Deploy Dokploy

Use `workers/marketing-studio-agent-runtime/docker-compose.yml` como base do servico.

```bash
cd workers/marketing-studio-agent-runtime
docker compose up --build
```

## Governanca

O Active Learning entra desde a primeira versao, mas nao altera producao sozinho.

```text
learning_signal
  -> recommendation_queue
  -> shadow experiment
  -> aprovacao admin
  -> promocao versionada
  -> rollout
  -> rollback
```

Mudancas proibidas sem aprovacao:

- prompts produtivos;
- guardrails;
- autonomia de envio;
- cards/playbooks publicados;
- modelo padrao de agente;
- ofertas, descontos ou termos comerciais.

O runtime nunca envia mensagens ou altera providers diretamente. Ele apenas
produz uma decisao rastreada; efeitos externos passam pelo worker TypeScript e
so sao despachados quando a politica de autonomia permitir ou houver aprovacao.
