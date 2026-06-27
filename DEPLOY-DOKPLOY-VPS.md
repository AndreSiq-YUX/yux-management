# Deploy VPS com Dokploy e Postgres proprio - Portal YUX

Atualizado em 2026-06-27.

Este guia substitui o fluxo antigo com Vercel e Supabase como backend de producao. O alvo atual e operar o Portal YUX integralmente na VPS propria, mantendo somente integracoes externas de negocio quando necessario.

## Arquitetura

```text
Usuario
  -> https://hub.yux.com.br
  -> yux-frontend (Nginx + React/Vite)
  -> /api/*
  -> yux-backend-api (Fastify/TypeScript)
  -> yux-postgres (Postgres 17)
  -> yux-redis (filas BullMQ)
  -> yux-backend-worker
  -> yux-agent-harness-runtime (Python/FastAPI)
```

Dominios oficiais:

- `yux.com.br`: site institucional.
- `hub.yux.com.br`: frontend do sistema e proxy `/api`.
- `agents.yux.com.br`: runtime Python de agentes, quando exposto separadamente.
- `deploy.yux.com.br`: painel Dokploy, se usado nessa VPS.

## Servicos No Compose

O arquivo `docker-compose.dokploy.yml` define:

- `yux-frontend`: builda `frontend/` e serve o app via Nginx.
- `yux-backend-api`: API Fastify em Node.js 22.
- `yux-backend-worker`: worker BullMQ para jobs assicronos.
- `yux-postgres`: Postgres 17 com volume persistente.
- `yux-redis`: Redis 7 com AOF ligado.
- `yux-agent-harness-runtime`: runtime de agentes em Python/FastAPI.

Arquivos enviados para a biblioteca de materiais ficam no volume persistente
`yux_materials_data`, montado em `/app/storage/materials` no container da API.

## Variaveis Dokploy

Configure no painel do Dokploy, nunca no Git:

```bash
YUX_FRONTEND_PORT=3000
YUX_BACKEND_PORT=4000
YUX_AGENT_RUNTIME_PORT=8080

POSTGRES_DB=yux_hub
POSTGRES_USER=yux_app
POSTGRES_PASSWORD=<senha-forte>
DATABASE_URL=postgresql://yux_app:<senha-forte>@yux-postgres:5432/yux_hub
REDIS_URL=redis://yux-redis:6379

SESSION_COOKIE_NAME=yux_session
SESSION_SECRET=<64+ caracteres aleatorios>
CORS_ORIGIN=https://hub.yux.com.br

VITE_API_BASE_URL=/api
MATERIALS_STORAGE_DIR=/app/storage/materials

YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080
YUX_AGENT_RUNTIME_TOKEN=<token-longo-aleatorio>
OPENROUTER_API_KEY=<valor>
JINA_API_KEY=<valor>
```

Nao use `VITE_*` para segredos. O frontend deve conhecer apenas `/api`.

## Primeiro Deploy

1. Aponte o repositorio no Dokploy.
2. Selecione `docker-compose.dokploy.yml`.
3. Configure as variaveis acima.
4. Configure `hub.yux.com.br` no servico `yux-frontend`, porta interna `80`.
5. Configure `agents.yux.com.br` no servico `yux-agent-harness-runtime`, porta interna `8080`, se for expor o runtime.
6. Ative HTTPS/Let's Encrypt.
7. Execute o deploy.

## Migracoes E Usuario Admin

Depois que `yux-postgres` e `yux-backend-api` estiverem no ar:

```bash
npm run migrate
```

Dentro do container da API, crie o admin inicial com senha temporaria segura:

```bash
ADMIN_EMAIL=admin@yux.com.br ADMIN_PASSWORD='<senha-temporaria>' npx tsx scripts/create-admin-user.ts
```

Nao registre `ADMIN_PASSWORD` em arquivo versionado. Troque a senha apos o primeiro acesso quando a tela de gestao de usuarios estiver disponivel.

## Validacao Local

```powershell
.\scripts\run-release-checks.ps1 -SkipInstall
```

Se Docker estiver disponivel:

```powershell
docker compose -f docker-compose.dokploy.yml config
docker compose -f docker-compose.dokploy.yml build
```

## Health Checks

Frontend:

```bash
curl -I https://hub.yux.com.br/health
```

Backend API:

```bash
curl https://hub.yux.com.br/api/health
curl https://hub.yux.com.br/api/ready
```

Agent runtime:

```bash
curl https://agents.yux.com.br/health
```

## Backup

Configure backup diario do volume Postgres ou dump logico:

```bash
pg_dump "$DATABASE_URL" > yux_hub_$(date +%Y%m%d_%H%M%S).sql
```

Inclua tambem o volume `yux_materials_data` na rotina de backup, pois ele
armazena os arquivos da biblioteca de materiais das organizacoes.

Retencao minima recomendada:

- 7 backups diarios.
- 4 backups semanais.
- 3 backups mensais antes de trafego real de clientes.

## Cutover

1. `.\scripts\run-release-checks.ps1 -SkipInstall` passa.
2. `docker compose -f docker-compose.dokploy.yml config` passa em ambiente com Docker.
3. Migrations aplicadas no Postgres da VPS.
4. Login em `https://hub.yux.com.br` com `admin@yux.com.br`.
5. Smoke test de dashboard, CRM, automacoes, omnichannel, Marketing Studio e Strategy Engine.
6. Logs de `yux-backend-api`, `yux-backend-worker`, `yux-postgres`, `yux-redis` e runtime revisados.

## Observacao De Migracao

O codigo Supabase remanescente no repositorio e referencia de migracao ate que todos os modulos sejam movidos para rotas `/api/*`. Nao configure Supabase como dependencia de producao nova.
