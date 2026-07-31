# Phase 8 Deploy And Hardening

## Current Target State

O alvo de producao do Portal YUX nao e mais Vercel nem Supabase Pro. A stack de producao passa a rodar em VPS propria com Dokploy:

- frontend React/Vite servido por Nginx em `hub.yux.com.br`;
- backend Fastify/TypeScript em `yux-backend-api`;
- Postgres 17 proprio em `yux-postgres`;
- Redis 7 em `yux-redis`;
- worker BullMQ em `yux-backend-worker`;
- Agent Harness Runtime em `yux-agent-harness-runtime`.

Guia principal: `DEPLOY-DOKPLOY-VPS.md`.

## Runtime Surfaces

| Surface | Runtime | Notes |
| --- | --- | --- |
| Frontend React/Vite | `yux-frontend` | Nginx serve SPA e proxy `/api/*`. |
| Backend API | `yux-backend-api` | Fastify, auth, policies e acesso ao Postgres. |
| Worker | `yux-backend-worker` | BullMQ para jobs assicronos. |
| Database | `yux-postgres` | Postgres 17 com volume persistente. |
| Queue/cache | `yux-redis` | Redis 7 com append-only file. |
| Agent Harness Runtime | `yux-agent-harness-runtime` | FastAPI/Python para orquestracao de agentes. |

## Required Dokploy Variables

- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `REDIS_URL`
- `SESSION_SECRET`
- `CORS_ORIGIN=https://hub.yux.com.br`
- `VITE_API_BASE_URL=/api`
- `YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080`
- `YUX_AGENT_RUNTIME_TOKEN`
- `OPENROUTER_API_KEY`
- `JINA_API_KEY`

Segredos nao podem usar prefixo `VITE_`.

## CI Gate

Local:

```powershell
.\scripts\run-release-checks.ps1 -SkipInstall
```

Com Docker disponivel:

```powershell
docker compose -f docker-compose.dokploy.yml config
docker compose -f docker-compose.dokploy.yml build
```

## Database Gate

Antes do primeiro deploy real:

1. Aplicar `backend/src/db/migrations` no Postgres da VPS.
2. Criar usuario admin inicial por script operacional, sem versionar senha.
3. Confirmar backup diario do Postgres.
4. Validar restore em banco separado antes de trafego real.

## Dokploy Deployment Sequence

1. Configurar DNS de `hub.yux.com.br` para a VPS.
2. Configurar `agents.yux.com.br` se o runtime for exposto.
3. Criar app/compose no Dokploy apontando para `docker-compose.dokploy.yml`.
4. Configurar variaveis obrigatorias.
5. Deployar stack.
6. Rodar migrations no container da API.
7. Criar admin inicial.
8. Ativar HTTPS.
9. Validar health checks.
10. Rodar QA autenticado admin e cliente.

## Health Checks

Frontend:

```bash
curl -I https://hub.yux.com.br/health
```

Backend:

```bash
curl https://hub.yux.com.br/api/health
curl https://hub.yux.com.br/api/ready
```

Agent runtime:

```bash
curl https://agents.yux.com.br/health
```

## Backup And Restore

Minimo antes de producao:

- backup diario automatizado;
- retencao de 7 diarios, 4 semanais e 3 mensais;
- restore testado fora de producao;
- responsavel definido para incidentes e restauracao.

## Security Review

Review antes de producao:

- sem service-role keys, DB passwords, runtime tokens ou provider credentials em Git;
- frontend limitado a `VITE_API_BASE_URL`;
- cookies de auth `httpOnly`, `sameSite=lax` e `secure` em producao;
- policies de backend cobrindo org, modulo e role;
- endpoints mutaveis exigem usuario autenticado ou webhook secret;
- runtime de agentes rejeita requests sem token;
- logs nao expõem tokens, prompts sensiveis, hashes de sessao ou credenciais.

## Production Gate

Producao fica liberada somente quando:

- release checks passam;
- compose valida em ambiente com Docker;
- migrations aplicam no Postgres da VPS;
- `hub.yux.com.br/api/health` responde;
- login admin funciona;
- smoke test de CRM, automacoes, omnichannel, Marketing Studio e Strategy Engine passa;
- backup/restore esta confirmado;
- monitoramento e alertas estao configurados.
