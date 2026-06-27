# Phase 8 Deploy And Hardening

## Current Target State

O alvo de producao do Portal YUX nao e mais Vercel. A arquitetura atual usa:

- VPS propria gerenciada por Dokploy para frontend e runtime de agentes;
- Supabase Cloud para Auth, Postgres, RLS, Storage, Realtime e Edge Functions;
- `docker-compose.dokploy.yml` como definicao operacional do deploy na VPS;
- `DEPLOY-DOKPLOY-SUPABASE.md` como guia principal de setup.

## Runtime Surfaces

| Surface | Runtime | Notes |
| --- | --- | --- |
| Frontend React/Vite | `yux-frontend` em Dokploy | Build em `frontend/Dockerfile`, servido por Nginx com fallback SPA. |
| Agent Harness Runtime | `yux-agent-harness-runtime` em Dokploy | FastAPI/Python em `workers/marketing-studio-agent-runtime`. |
| Auth/DB/RLS/Storage/Realtime | Supabase Cloud | Migrations e probes continuam em `supabase/`. |
| Edge Functions | Supabase Cloud | Podem chamar `YUX_AGENT_RUNTIME_URL` quando configurado. |

## Required Environment Variables

Dokploy:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `YUX_FRONTEND_PORT`
- `YUX_AGENT_RUNTIME_PORT`
- `YUX_AGENT_RUNTIME_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `JINA_API_KEY`

Supabase Edge Function secrets:

- `YUX_AGENT_RUNTIME_URL`
- `YUX_AGENT_RUNTIME_TOKEN`
- provider secrets for Meta, Google, WordPress, SMTP2GO, n8n and AI providers as enabled.

Only `VITE_*` values can be public browser configuration. Service role keys and provider credentials must stay in Dokploy or Supabase server-side secrets.

## CI Gate

`.github/workflows/ci.yml` and the local release script should verify code, not deploy production automatically.

Local equivalent:

```powershell
.\scripts\run-release-checks.ps1
```

When Docker is available, also run:

```powershell
docker compose -f docker-compose.dokploy.yml config
docker compose -f docker-compose.dokploy.yml build
```

## Supabase Gate

Run probes only from a trusted machine. Never commit database URLs or passwords.

```powershell
$env:SUPABASE_DB_URL = 'postgresql://...'
.\scripts\run-supabase-probes.ps1
```

Required coverage:

- RLS enabled on public tables;
- organization, contract and membership isolation;
- Data API grants for tables intentionally exposed to authenticated users;
- no widget, provider token or service credential leakage;
- agent runtime tables and Strategy Engine tables protected by internal/service-role policies.

## Dokploy Deployment Sequence

1. Confirm Supabase project is active.
2. Apply or confirm all required migrations.
3. Run probes against the target Supabase project.
4. Deploy or redeploy active Edge Functions.
5. Configure Supabase Edge secrets.
6. Configure Dokploy environment variables.
7. Deploy `docker-compose.dokploy.yml`.
8. Attach production domains and HTTPS in Dokploy.
9. Update Supabase Auth Site URL and Redirect URLs to the production domain.
10. Validate `/health` for frontend and runtime.
11. Run authenticated browser QA.
12. Review Dokploy container logs and Supabase Edge Function logs.

## Health Checks

Frontend:

```bash
curl -I https://hub.yux.com.br/health
```

Expected: HTTP `204`.

Agent runtime:

```bash
curl https://agents.yux.com.br/health
```

Expected JSON:

```json
{"status":"ok","service":"yux-agent-harness-runtime"}
```

## Backup And Restore

Before production usage:

1. Confirm Supabase point-in-time recovery or scheduled backups.
2. Record the retention window and restore owner.
3. Before applying new migrations, export a schema/data snapshot or confirm a successful platform backup.
4. Test restore into a non-production Supabase branch/project before relying on the process.

Minimum dump:

```powershell
supabase db dump --linked --file backup-pre-release.sql
```

## Monitoring

Required before real client traffic:

- Dokploy deployment/container failure notifications;
- container logs reviewed after every deploy;
- Supabase Edge Function logs reviewed for message, strategy and provider paths;
- n8n/provider workflow failure notifications where used;
- an incident owner and escalation channel;
- backup restore owner and process;
- periodic runtime health check for `agents` domain.

## Security Review

Review before production:

- no service-role keys, DB passwords, runtime tokens or provider credentials in Git;
- frontend variables limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`;
- Supabase Edge secrets hold private provider and runtime configuration;
- RLS probe results attached to release notes;
- webchat script remains cacheable and embeddable where required;
- portal users cannot read protected errors, token hashes or AI cost internals;
- client users remain constrained by active contract module and organization membership;
- runtime endpoints requiring mutation reject requests without `Authorization: Bearer <token>`.

## Production Gate

Production is ready only when all are true:

- release checks pass locally or in CI;
- Supabase migrations/probes are green on target project;
- Dokploy deploy is healthy for frontend and runtime;
- Supabase Auth URLs match the production domain;
- authenticated admin/client QA passes;
- backup/restore process is confirmed;
- monitoring and provider failure notifications are configured;
- security review is signed off.
