# Phase 8 Deploy And Hardening

## Current Live State

- Vercel team: `team_Z2vpHyQAvpRSH1kZLEYw8oEk`
- Vercel project: `yux-management` (`prj_AOx6WhGVO2BSJle7SKmfoiC1WjQ4`)
- Connected GitHub repository on Vercel: `AndreSiq-YUX/yux-management`
- Local git remote: `origin` points to `https://github.com/AndreSiq-YUX/yux-management.git`
- Release branch: `codex/phase-8-hardening`
- Preview deployment: `https://yux-management-hprxrlat5-andresiq-yuxs-projects.vercel.app`
- Preview deployment ID: `dpl_8skTM4UoHkR6Cc5b7Ysvt9hd8pYK`
- Preview deployment state on 2026-06-03: `READY`
- Latest inspected production deployment on 2026-06-03: `ERROR`
- Latest Vercel error source: old GitHub commit `3263ad6`, failing in `src/pages/clients/ClientsPage.tsx`
- Current local verification: frontend tests, type-check, build, shared Deno tests, and Edge Function checks pass

The Vercel production failure is not evidence that the current local tree is broken. It reflects an older remote commit. The current branch builds successfully on Vercel as a preview. Production should be promoted only after the branch is reviewed, GitHub Actions passes, and the external readiness gates below are checked.

The local and remote `main` histories have no merge base. Do not force-push `main`. Integrate through the review branch or consciously replace the remote repository after confirming that the old `main` history is no longer needed.

## Required GitHub Secrets

Configure these in GitHub Actions before adding deployment automation:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The Vite variables are public browser configuration, but they still belong in environment management so preview and production can differ cleanly. Never commit Supabase service-role keys, database passwords, n8n webhook URLs, or provider credentials.

## Required Vercel Environment Variables

Production and preview should both define:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional omnichannel n8n URLs remain Supabase Edge Function secrets, not frontend variables:

- `N8N_OMNICHANNEL_AI_WEBHOOK_URL`
- `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`
- `N8N_OMNICHANNEL_SCHEDULING_WEBHOOK_URL`

## CI Gate

`.github/workflows/ci.yml` runs:

- `npm ci`
- `npm test`
- `npm run type-check`
- `npm run build`
- `deno test supabase/functions/_shared`
- `deno check` for all active omnichannel Edge Function entrypoints
- structural checks that the omnichannel probe and function folders exist

The workflow runs on pull requests and on pushes to `main` or `codex/**`. It is intentionally a verification gate, not an automatic production deploy. Production deploy should be added only after remote history reconciliation is confirmed.

Local equivalent:

```powershell
.\scripts\run-release-checks.ps1
```

## Deployment Sequence

1. Keep local `origin` pointed to the official GitHub repository.
2. Push a review branch, not `main`, until the unrelated remote history decision is resolved.
3. Open a draft PR from `codex/phase-8-hardening` to `main`.
4. Confirm GitHub Actions passes.
5. Confirm Vercel creates a fresh preview deployment from the branch commit.
6. Inspect Vercel build logs for the new deployment, not the old `3263ad6` failure.
7. Run Supabase remote probes from a trusted machine with `psql` available.
8. Confirm backup, monitoring, and security gates below.
9. Promote or redeploy to production only after the preview and gates are clean.

The GitHub connector used by Codex could push the branch, but returned `403 Resource not accessible by integration` when creating a pull request. Open the draft PR manually at:

`https://github.com/AndreSiq-YUX/yux-management/pull/new/codex/phase-8-hardening`

## Supabase Probe Procedure

Run probes only from a trusted machine. Never commit database URLs or passwords.

```powershell
$env:SUPABASE_DB_URL = 'postgresql://...'
.\scripts\run-supabase-probes.ps1
```

The probe runner executes every SQL file in `supabase/probes` with `ON_ERROR_STOP=1`. Required coverage:

- RLS enabled on public omnichannel and CRM tables;
- organization, contract, and membership isolation;
- no direct widget or raw channel-token exposure;
- immutable audit/publication records;
- protected error and cost metadata hidden from portal users.

## Preview Smoke

Verified on 2026-06-03 against `dpl_8skTM4UoHkR6Cc5b7Ysvt9hd8pYK`:

- Vercel deployment state: `READY`;
- GitHub commit status `Vercel`: `success`;
- `/dashboard`: `200` and SPA HTML returned;
- `/omnichannel`: `200` and SPA HTML returned;
- `/portal/omnichannel`: `200` and SPA HTML returned;
- `/yux-webchat.js`: `200`, `application/javascript`, `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.

The root preview URL may require Vercel Authentication depending on deployment protection. A temporary share link was generated for manual browser access and expires on 2026-06-04.

## Backup And Restore

Before production usage:

1. Confirm Supabase daily point-in-time recovery or scheduled backups are enabled for the production project.
2. Record the retention window and restore owner in the operations runbook.
3. Before applying new migrations, export a schema/data snapshot or confirm a recent successful platform backup.
4. Test restore into a non-production Supabase branch or project before relying on the process.
5. Keep backup verification separate from the frontend deploy checklist.

Minimum restore drill:

```powershell
supabase db dump --linked --file backup-pre-release.sql
```

Then restore to a disposable project or branch and run the SQL probes there before client usage.

## Monitoring

Required before real client traffic:

- Vercel deployment notifications enabled for failed production builds;
- Vercel runtime/build logs reviewed after every production deploy;
- Supabase Edge Function logs reviewed for `receive-channel-event`, `process-ai-message`, `dispatch-outbound-message`, `request-scheduling`, and `submit-webchat-event`;
- n8n workflow failure notifications enabled for AI, outbound message, and scheduling webhooks;
- an incident owner and escalation channel defined for omnichannel outages;
- log drains or an error monitoring tool configured when the production plan supports it.

## Security Review

Review before promoting to production:

- no service-role keys, database passwords, n8n URLs, provider credentials, or channel secrets in Git;
- Vercel frontend variables limited to public `VITE_*` values;
- Supabase Edge secrets hold private n8n/provider configuration;
- RLS probe results attached to the release notes;
- webchat iframe behavior preserved and not blocked by global `X-Frame-Options`;
- origin allow-list behavior validated for widgets;
- portal users cannot read protected errors, token hashes, or AI cost internals;
- client users are constrained by active contract module and organization membership;
- retention settings and anonymization defaults reviewed with business owners.

## Production Gate

Production is ready only when all are true:

- branch reviewed and reconciled with the official `main` history;
- GitHub Actions green;
- Vercel preview green from the reviewed commit;
- Supabase migrations and probes green on the target project;
- backup/restore owner and procedure confirmed;
- monitoring and n8n failure notifications configured;
- security review signed off.
