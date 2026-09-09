# Backend VPS Runbook

> Para backups/restauração use `docs/runbooks/yux-backup-restore.md`. Para TLS,
> fechamento de portas e acesso de manutenção use
> `docs/runbooks/yux-admin-access.md`. O Compose atual usa `expose`; não publique
> API, PostgreSQL ou Redis diretamente no host.

## Production Domains

- Frontend e API: `https://hub.yux.com.br`
- Backend API: `https://hub.yux.com.br/api`
- Agent Runtime: `https://agents.yux.com.br`
- Site institucional: `https://yux.com.br`

## Dokploy Variables

- `MIGRATOR_DATABASE_URL` (uso exclusivo do serviço one-shot de migrations)
- `YUX_API_DATABASE_URL` (login `yux_api`, sem superuser e sem bypass de RLS)
- `YUX_WORKER_DATABASE_URL` (login `yux_worker`, sem superuser e sem bypass de RLS)
- `YUX_RUNTIME_DATABASE_URL` (login `yux_runtime`, sem superuser e sem bypass de RLS)
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
2. Confirme no secret store do Dokploy as quatro URLs de banco acima. Nenhum serviço normal possui fallback para `DATABASE_URL`.
3. Em ambiente com Docker, rode `docker compose -f docker-compose.dokploy.yml config`.
4. Faça deploy no Dokploy. `yux-backend-migrate` aplica migrations antes da API/workers e `yux-volume-permissions` prepara os volumes para UID/GID `1000:1000`.
5. Confirme que os dois serviços one-shot terminaram com código zero. Não execute migrations dentro de `yux-backend-api`.
6. Crie o admin inicial, quando necessário, dentro da API com `ADMIN_EMAIL=admin@yux.com.br ADMIN_PASSWORD='<senha>' npm run create-admin:prod`.
7. Valide `/health`, `/api/health`, `/api/ready`, `/api/health/operational` e `/health` do runtime.
8. Confira `current_user`, `rolsuper=false` e `rolbypassrls=false` separadamente na API, worker e runtime.

## Backup

> A configuração e o teste de restauração estão adiados no lote de correções de 2026-09-09 por decisão do proprietário. Este adiamento não altera o requisito antes do aceite final.

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
