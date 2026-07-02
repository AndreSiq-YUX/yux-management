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

## Endpoints

- `GET /health`: healthcheck.
- `POST /events/ingest`: recebe evento normalizado de WhatsApp/omnichannel e cria job.
- `POST /jobs/process-next`: processa o proximo job da fila local.
- `POST /workflows/execute`: executa workflow estrategico diretamente.

Quando `YUX_AGENT_RUNTIME_TOKEN` estiver configurado, os endpoints mutaveis exigem `Authorization: Bearer <token>`.

## Variaveis

- `YUX_AGENT_RUNTIME_TOKEN`: token interno para chamadas do Portal/Edge.
- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: chave server-side para persistencia operacional.
- `OPENROUTER_API_KEY`: modelos LLM via OpenRouter.
- `JINA_API_KEY`: leitura, busca e grounding.

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
