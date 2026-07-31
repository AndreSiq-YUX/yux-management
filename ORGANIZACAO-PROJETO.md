# Organizacao do Projeto YUX Client Management

Este arquivo resume a estrutura operacional atual do projeto. Ele substitui a
organizacao antiga baseada em Vercel e Supabase como runtime principal.

## Estrutura Atual

```text
yux-client-management/
|-- frontend/                         # React/Vite, Dockerfile e Nginx para Dokploy
|-- backend/                          # API Fastify, auth, Postgres, Redis jobs e worker
|-- workers/marketing-studio-agent-runtime/
|   |-- Dockerfile                    # Runtime Python/FastAPI dos agentes
|   |-- docker-compose.yml            # Compose isolado do runtime
|   `-- yux_agent_runtime/            # Harness, fila, workflows e API
|-- scripts/                          # Release checks e ingestion de conhecimento
|-- docs/                             # Documentacao de produto, status e operacao
|-- docker-compose.dokploy.yml        # Deploy principal para VPS/Dokploy
|-- DEPLOY-DOKPLOY-VPS.md             # Guia passo a passo de producao
`-- QUICK-START.md                    # Desenvolvimento local
```

## Arquitetura Atual

```text
Dokploy/VPS
|-- yux-frontend (React/Vite servido por Nginx)
|-- yux-backend-api (Fastify/Node)
|-- yux-backend-worker (BullMQ/Redis)
|-- yux-postgres (Postgres proprio)
|-- yux-redis
`-- yux-agent-harness-runtime (Python/FastAPI)
```

## Arquivos Removidos ou Substituidos

- `vercel.json`: removido.
- `frontend/vercel.json`: removido.
- `deploy-to-vercel.md`: removido.
- `VERCEL-SUPABASE-DEPLOY.md`: removido.
- `DEPLOY-DOKPLOY-SUPABASE.md`: removido.
- `frontend/src/lib/supabase.ts`: removido.
- `frontend/src/services/supabaseService.ts`: substituido por `frontend/src/services/backendDataService.ts`.
- `supabase/functions/`: removido; helpers testados foram portados para `backend/src/lib/edge-compat`.
- `supabase/config.toml` e `supabase/seed.sql`: removidos da configuracao ativa.
- `supabase/migrations/`, `supabase/probes/` e `supabase/legacy-migrations/`: removidos do caminho ativo depois da conversao para `backend/src/db/migrations/0100_portal_schema.sql`.
- `scripts/convert-supabase-migrations.ps1` e `scripts/run-supabase-probes.ps1`: removidos; validacao atual roda pelos testes/backend migrations da VPS.
- `docs/phase-8-deploy-hardening.md`: substituido por gates de Dokploy/VPS.

## Arquivos de Deploy Atuais

- `docker-compose.dokploy.yml`: compose principal para o Dokploy.
- `backend/Dockerfile`: build do backend Node.
- `frontend/Dockerfile`: build do frontend e imagem Nginx.
- `frontend/nginx.conf`: fallback SPA, proxy `/api`, headers e healthcheck.
- `workers/marketing-studio-agent-runtime/Dockerfile`: runtime Python.
- `DEPLOY-DOKPLOY-VPS.md`: checklist operacional completo para VPS propria.

## Responsabilidades

- Frontend: renderizar a aplicacao e consumir somente `/api/*`, sem segredos privados ou cliente Supabase no bundle.
- Backend Node: manter auth, sessoes, autorizacao, acesso ao Postgres, armazenamento local, jobs e adaptadores de integracao.
- Postgres/Redis na VPS: persistencia transacional, filas e caches operacionais.
- Runtime Python: executar orquestracao de agentes, workflows, retrieval e processamento server-side.
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
