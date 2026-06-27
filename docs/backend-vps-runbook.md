# Backend VPS Runbook

## Production Domains

- Frontend e API: `https://hub.yux.com.br`
- Backend API: `https://hub.yux.com.br/api`
- Agent Runtime: `https://agents.yux.com.br`
- Site institucional: `https://yux.com.br`

## Dokploy Variables

- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `REDIS_URL=redis://yux-redis:6379`
- `SESSION_SECRET`
- `CORS_ORIGIN=https://hub.yux.com.br`
- `VITE_API_BASE_URL=/api`
- `MATERIALS_STORAGE_DIR=/app/storage/materials`
- `YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080`
- `YUX_AGENT_RUNTIME_TOKEN`
- `OPENROUTER_API_KEY`
- `JINA_API_KEY`

## Deploy

1. Rode `.\scripts\run-release-checks.ps1 -SkipInstall`.
2. Em ambiente com Docker, rode `docker compose -f docker-compose.dokploy.yml config`.
3. Faça deploy no Dokploy.
4. Rode `npm run migrate` dentro de `yux-backend-api`.
5. Crie o admin inicial com `ADMIN_EMAIL=admin@yux.com.br` e `ADMIN_PASSWORD` temporario.
6. Valide `/health`, `/api/health`, `/api/ready` e `/health` do runtime.

## Backup

Configure backup diario do Postgres antes de trafego real.

Retencao minima:

- 7 diarios.
- 4 semanais.
- 3 mensais.

Teste restore em banco separado antes de depender do backup em producao.

Inclua o volume `yux_materials_data` no backup. Ele guarda os uploads da
biblioteca de materiais usados pelos fluxos de automacao e CRM.

## Logs

Verifique em todo deploy:

- `yux-backend-api`
- `yux-backend-worker`
- `yux-postgres`
- `yux-redis`
- `yux-agent-harness-runtime`

Falhas de auth, migrations, Redis, provider tokens e agent runtime devem bloquear cutover.
