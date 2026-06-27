# Organizacao do Projeto YUX Client Management

Este arquivo resume a estrutura operacional atual do projeto. Ele substitui a
organizacao antiga baseada em Vercel.

## Estrutura Atual

```text
yux-client-management/
├── frontend/                         # React/Vite, Dockerfile e Nginx para Dokploy
├── supabase/                         # Migrations, probes, config local e Edge Functions
├── workers/marketing-studio-agent-runtime/
│   ├── Dockerfile                    # Runtime Python/FastAPI dos agentes
│   ├── docker-compose.yml            # Compose isolado do runtime
│   └── yux_agent_runtime/            # Harness, fila, workflows e API
├── scripts/                          # Release checks, probes e ingestion de conhecimento
├── docs/                             # Documentacao de produto, status e operacao
├── docker-compose.dokploy.yml        # Deploy principal para VPS/Dokploy
├── DEPLOY-DOKPLOY-SUPABASE.md        # Guia passo a passo de producao
└── QUICK-START.md                    # Desenvolvimento local
```

## Arquitetura Atual

```text
Dokploy/VPS
  ├─ yux-frontend (React/Vite servido por Nginx)
  └─ yux-agent-harness-runtime (Python/FastAPI)

Supabase Cloud
  ├─ Auth
  ├─ Postgres + RLS + pgvector
  ├─ Storage/Realtime
  └─ Edge Functions
```

## Arquivos Removidos ou Substituidos

- `vercel.json`: removido.
- `frontend/vercel.json`: removido.
- `deploy-to-vercel.md`: removido.
- `VERCEL-SUPABASE-DEPLOY.md`: removido.
- `docs/phase-8-deploy-hardening.md`: substituido por gates de Dokploy/VPS.

## Arquivos de Deploy Atuais

- `docker-compose.dokploy.yml`: compose principal para o Dokploy.
- `frontend/Dockerfile`: build do frontend e imagem Nginx.
- `frontend/nginx.conf`: fallback SPA, headers e healthcheck.
- `workers/marketing-studio-agent-runtime/Dockerfile`: runtime Python.
- `DEPLOY-DOKPLOY-SUPABASE.md`: checklist operacional completo.

## Responsabilidades

- Frontend: renderizar a aplicacao, consumir Supabase com chave publica e nao
  carregar segredos privados.
- Supabase: manter Auth, dados, RLS, Edge Functions e secrets das functions.
- Runtime Python: executar orquestracao de agentes, workflows, retrieval e
  processamento server-side com service role.
- Dokploy: build/deploy dos containers, dominios, HTTPS e logs da VPS.

## Validacao Recomendada

```powershell
.\scripts\run-release-checks.ps1
docker compose -f docker-compose.dokploy.yml config
```

Quando Docker estiver disponivel, tambem valide build e healthchecks:

```powershell
docker compose -f docker-compose.dokploy.yml up --build
```
