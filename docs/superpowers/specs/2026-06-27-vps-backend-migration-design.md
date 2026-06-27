# VPS Backend Migration Design

## Goal

Migrate Portal YUX from Supabase-hosted backend services to a self-hosted VPS architecture managed by Dokploy, without reducing product scope. The official frontend remains `hub.yux.com.br`; the operational stack moves to backend services, Postgres, Redis, workers, and the existing Agent Harness runtime on the VPS.

## Decision

Use the modular backend approach.

```text
hub.yux.com.br
  -> yux-frontend
  -> yux-backend-api
  -> yux-postgres
  -> yux-redis
  -> yux-worker
  -> yux-agent-harness-runtime
```

The frontend must stop calling Supabase directly. It will call a first-party API at `/api/*`. The backend owns authentication, authorization, data access, provider secrets, jobs, and integration calls. Postgres becomes a private database available only to backend, workers, and approved internal services.

## Current Constraints

- The current frontend uses `@supabase/supabase-js` directly from many services and components.
- The current database shape is encoded in `supabase/migrations`.
- Supabase Edge Functions currently implement automation dispatch, omnichannel processing, proposal flows, provider OAuth/publishing, email, webchat, and Strategy Engine chat.
- The Agent Harness runtime already exists under `workers/marketing-studio-agent-runtime` and should remain a separate Python/FastAPI service.
- The current Supabase project `portal-yux` is inactive, so remote migration truth cannot be trusted as the system of record.
- Local migration files are the canonical schema source for the self-hosted move.

## Backend Boundaries

Create a new `backend/` package. Its responsibilities are:

- HTTP API for all frontend operations.
- Session-based authentication with HTTP-only cookies.
- Password hashing with Argon2.
- Multi-tenant authorization based on user, organization membership, contract, module, and role.
- Database access through a typed repository layer.
- Job enqueueing for slow work.
- Provider OAuth callbacks and webhook endpoints.
- Calls to the Agent Harness runtime.
- Operational health endpoints.

The backend must not import frontend code. The frontend may import shared generated TypeScript API types only after the backend package exposes them.

## Data Model

Use self-hosted Postgres 17. Convert Supabase migrations into plain Postgres migrations where needed:

- remove Supabase Auth dependencies from application authorization paths;
- keep table constraints, indexes, triggers, private helper functions, and data normalization;
- replace `auth.uid()` and Supabase JWT helper usage with backend-controlled user context;
- keep RLS disabled initially for application traffic and enforce authorization in backend policies;
- preserve RLS-oriented SQL probes as backend policy tests where possible.

Create first-party auth tables:

- `app_users`
- `app_sessions`
- `organization_memberships`
- `password_reset_tokens`
- `audit_events`

## Auth And Authorization

Use cookie sessions:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Cookies are HTTP-only, `SameSite=Lax`, `Secure` in production, and scoped to `hub.yux.com.br`.

Authorization policy inputs:

- user id;
- role: `yux_admin`, `yux_operator`, `client_admin`, `client_member`;
- active organization id;
- active contract id;
- enabled module keys;
- resource organization id;
- operation name.

Every route must call a policy before reading or mutating tenant-owned records.

## API Shape

Use versioned route groups:

- `/api/auth`
- `/api/platform`
- `/api/clients`
- `/api/projects`
- `/api/crm`
- `/api/proposals`
- `/api/automations`
- `/api/omnichannel`
- `/api/marketing-studio`
- `/api/strategy-engine`
- `/api/reports`
- `/api/support`
- `/api/finance`
- `/api/webhooks`
- `/api/public`

The migration should be incremental. The frontend should receive an `apiClient` wrapper first, then services move from Supabase calls to API calls one module at a time.

## Jobs And Workers

Use Redis and BullMQ for:

- automation dispatch;
- outbound omnichannel messages;
- provider metric sync;
- email send;
- Strategy Engine background work;
- webchat event post-processing;
- retryable provider operations.

The API enqueues jobs. `backend-worker` consumes them. Jobs must be idempotent and store run records in Postgres.

## Edge Function Replacement

Replace Supabase Edge Functions with backend routes or worker jobs:

- `dispatch-crm-automation` -> `/api/automations/dispatch` and `automation.dispatch` job.
- `process-ai-message` -> `/api/omnichannel/process-ai-message` and `omnichannel.processMessage` job.
- `receive-channel-event` -> `/api/webhooks/meta/channel-event`.
- `submit-webchat-event` -> `/api/public/webchat/events`.
- `run-strategy-admin-chat` -> `/api/strategy-engine/admin-chat`.
- provider OAuth functions -> `/api/integrations/*`.
- proposal public decision functions -> `/api/public/proposals/*`.

## Storage

Use a storage abstraction instead of direct Supabase Storage calls:

- local volume path for first production release;
- optional S3-compatible backend in a separate storage migration without changing frontend code.

The initial storage routes:

- `POST /api/materials`
- `GET /api/materials/:id/download`
- `DELETE /api/materials/:id`

## Deploy

Extend `docker-compose.dokploy.yml` with:

- `yux-backend-api`;
- `yux-backend-worker`;
- `yux-postgres`;
- `yux-redis`;
- persistent volumes for Postgres, Redis, and materials;
- private internal network;
- public exposure only for frontend, backend API, and agent runtime health domain.

The frontend uses `VITE_API_BASE_URL=/api` in production.

## Testing Strategy

- Backend unit tests for policies, repositories, and services.
- Backend integration tests against disposable Postgres.
- Contract tests for API responses consumed by frontend services.
- Frontend service tests updated per migrated module.
- Worker tests for idempotency and retry behavior.
- Migration smoke: apply all converted migrations to empty Postgres.
- Release gate: backend tests, frontend tests, type checks, build, worker tests, Docker compose config.

## Migration Order

1. Create backend skeleton and deployable compose wiring.
2. Convert database bootstrap and auth.
3. Add policy layer and core platform routes.
4. Migrate frontend auth and platform shell.
5. Migrate core CRUD modules.
6. Migrate public/proposal/webchat endpoints.
7. Migrate automation and omnichannel jobs.
8. Migrate Marketing Studio and provider integrations.
9. Migrate Strategy Engine and Agent Harness calls.
10. Remove Supabase client dependency from frontend runtime.

## Success Criteria

- `hub.yux.com.br` runs without Supabase environment variables.
- No browser bundle contains Supabase URL, publishable key, service role key, or provider secrets.
- All production data access goes through the backend API.
- Local release checks pass.
- Dokploy deploy has healthy frontend, backend, Postgres, Redis, worker, and Agent Harness services.
- A seeded admin can log in, see client workspaces, operate CRM, use automations, use omnichannel, run Strategy Engine admin chat, and access portal routes.
