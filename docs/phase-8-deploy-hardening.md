# Phase 8 Deploy And Hardening

## Current Live State

- Vercel team: `team_Z2vpHyQAvpRSH1kZLEYw8oEk`
- Vercel project: `yux-management` (`prj_AOx6WhGVO2BSJle7SKmfoiC1WjQ4`)
- Connected GitHub repository on Vercel: `AndreSiq-YUX/yux-management`
- Local git remote: not configured in this checkout
- Latest Vercel production deployment inspected on 2026-06-03: `ERROR`
- Latest Vercel error source: old GitHub commit `3263ad6`, failing in `src/pages/clients/ClientsPage.tsx`
- Current local verification: frontend tests, type-check, build, shared Deno tests, and Edge Function checks pass

The Vercel failure is not evidence that the current local tree is broken. It reflects an older remote commit. The next production deploy should happen only after this local branch is pushed to the official GitHub repository and CI passes there.

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

This is intentionally a verification gate, not an automatic production deployment. Production deploy should be added only after GitHub remote synchronization is confirmed.

## Deployment Sequence

1. Configure local `origin` to the official GitHub repository.
2. Push the current `main` branch or a review branch.
3. Confirm GitHub Actions passes.
4. Confirm Vercel creates a fresh preview or production deployment from the new commit.
5. Inspect Vercel build logs for the new deployment, not the old `3263ad6` failure.
6. Run Supabase remote probes from a trusted machine with `psql` available.
7. Verify core routes:
   - `/dashboard`
   - `/omnichannel`
   - `/portal/omnichannel`
   - `/webchat/session/:sessionToken`
8. Promote or redeploy to production only after the preview is clean.

## Remaining Hardening Work

- Add direct SQL probe execution in CI or a trusted release script with `psql`.
- Add browser E2E smoke tests once Playwright or the Browser plugin is available in the release environment.
- Review RLS policies with real internal and client users.
- Configure Vercel domain `app.yux.com.br` when DNS ownership is ready.
- Configure monitoring or log drains before client production usage.
- Define backup and restore procedure for Supabase data.
