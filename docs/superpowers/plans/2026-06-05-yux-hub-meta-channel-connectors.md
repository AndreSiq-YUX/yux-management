# YUX Hub Meta Channel Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build official Meta channel connectors so each contracted client can connect WhatsApp numbers, Instagram Direct accounts and Facebook Messenger pages through the YUX Hub portal, while YUX admins govern health, reauth, fallback routing and audit globally.

**Architecture:** Keep `channel_connections` as the canonical multi-tenant channel record and extend it with Meta asset metadata, token references, lifecycle state and audit history. Use Supabase Edge Functions for all OAuth/code exchange, Graph API calls and webhook handling; the React frontend receives only safe public config and sanitized connection state. WhatsApp uses the official Meta Cloud API by default, and non-official/intermediated delivery remains available through `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Tailwind, Supabase Postgres, RLS, Supabase Edge Functions with Deno, Meta Graph API, Meta WhatsApp Embedded Signup, Meta Login, Instagram Messaging API, Messenger Platform.

---

## File Structure

- Create: `frontend/src/lib/meta/metaChannelRules.ts`
  - Pure functions for channel labels, lifecycle state, health state, safe metadata, channel capability and fallback routing.
- Create: `frontend/src/lib/meta/metaChannelRules.test.ts`
  - Focused unit tests for the pure rules.
- Modify: `frontend/src/types/omnichannel.ts`
  - Add `messenger`, connected-channel lifecycle types and Meta asset types.
- Create: `supabase/migrations/<generated>_meta_channel_connectors.sql`
  - Extend `channel_connections`, add OAuth sessions, audit events and health checks, RLS and grants.
- Create: `supabase/probes/<generated>_meta_channel_connectors.sql`
  - Verify RLS, no token exposure, lifecycle constraints and multi-tenant isolation.
- Create: `supabase/functions/_shared/metaChannel.ts`
  - Shared Graph API, OAuth state, token reference, webhook normalization and sanitization helpers.
- Create: `supabase/functions/_shared/metaChannel.test.ts`
  - Deno tests for helpers.
- Create: `supabase/functions/start-meta-channel-connect/index.ts`
- Create: `supabase/functions/start-meta-channel-connect/deno.json`
- Create: `supabase/functions/complete-meta-channel-connect/index.ts`
- Create: `supabase/functions/complete-meta-channel-connect/deno.json`
- Create: `supabase/functions/list-meta-channel-assets/index.ts`
- Create: `supabase/functions/list-meta-channel-assets/deno.json`
- Create: `supabase/functions/disconnect-meta-channel/index.ts`
- Create: `supabase/functions/disconnect-meta-channel/deno.json`
- Create: `supabase/functions/refresh-meta-channel-health/index.ts`
- Create: `supabase/functions/refresh-meta-channel-health/deno.json`
- Create: `supabase/functions/send-meta-channel-test/index.ts`
- Create: `supabase/functions/send-meta-channel-test/deno.json`
- Modify: `supabase/functions/receive-channel-event/index.ts`
  - Normalize WhatsApp, Instagram and Messenger webhooks.
- Modify: `supabase/functions/dispatch-outbound-message/index.ts`
  - Send via official adapters when configured; otherwise preserve n8n fallback.
- Create: `frontend/src/services/metaChannelService.ts`
  - Frontend service for connected channels and Edge Function calls.
- Create: `frontend/src/services/metaChannelService.test.ts`
  - Mapping and payload tests.
- Create: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.tsx`
- Create: `frontend/src/components/omnichannel/ConnectedChannelCard.tsx`
- Create: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx`
- Create: `frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx`
- Create: `frontend/src/pages/platform/AdminChannelsPage.tsx`
- Create: `frontend/src/components/platform/admin/AdminChannelsTable.tsx`
- Create: `frontend/src/components/platform/admin/AdminChannelsTable.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`
- Modify: `docs/omnichannel-ai-operations.md`
- Modify: `docs/admin-yux-hub.md`
- Modify: `docs/implementation-status.md`

## Global Runtime Secrets

These names are references. Values must be configured in Supabase/Vercel/server-side runtime, never in frontend code or public database rows.

- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WEBHOOK_APP_SECRET`
- `META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_OAUTH_REDIRECT_URI`
- `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`

Before implementation, verify the current Meta docs for Embedded Signup, Meta Login, Instagram Messaging API, Messenger Platform, App Review permissions and the Graph API version to use in production.

---

### Task 1: Domain Types And Channel Rules

**Files:**
- Modify: `frontend/src/types/omnichannel.ts`
- Create: `frontend/src/lib/meta/metaChannelRules.ts`
- Test: `frontend/src/lib/meta/metaChannelRules.test.ts`

- [x] **Step 1: Write failing tests for connected-channel states**

Create `frontend/src/lib/meta/metaChannelRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  deriveConnectedChannelState,
  getMetaChannelLabel,
  normalizeMetaScopes,
  shouldUseN8nFallback,
  sanitizeMetaPublicMetadata,
} from './metaChannelRules'

describe('metaChannelRules', () => {
  it('labels official Meta channels for portal cards', () => {
    expect(getMetaChannelLabel('whatsapp')).toBe('WhatsApp')
    expect(getMetaChannelLabel('instagram')).toBe('Instagram Direct')
    expect(getMetaChannelLabel('messenger')).toBe('Facebook Messenger')
    expect(getMetaChannelLabel('webchat')).toBe('Webchat')
  })

  it('derives connected state from verified token and webhook health', () => {
    expect(deriveConnectedChannelState({
      isActive: true,
      providerVerifyState: 'verified',
      tokenState: 'connected',
      healthStatus: 'connected',
    })).toBe('connected')
  })

  it('marks token failures as reauth required', () => {
    expect(deriveConnectedChannelState({
      isActive: true,
      providerVerifyState: 'verified',
      tokenState: 'needs_reauth',
      healthStatus: 'needs_reauth',
    })).toBe('needs_reauth')
  })

  it('sanitizes Meta metadata before portal display', () => {
    expect(sanitizeMetaPublicMetadata({
      pageId: 'page-1',
      accessToken: 'secret',
      appSecret: 'secret',
      username: 'clinica-yux',
    })).toEqual({ pageId: 'page-1', username: 'clinica-yux' })
  })

  it('sorts and deduplicates granted scopes', () => {
    expect(normalizeMetaScopes(['pages_messaging', 'whatsapp_business_messaging', 'pages_messaging'])).toEqual([
      'pages_messaging',
      'whatsapp_business_messaging',
    ])
  })

  it('uses n8n fallback only for explicit intermediary routes', () => {
    expect(shouldUseN8nFallback({ adapterKey: 'meta-whatsapp', fallbackMode: 'official' })).toBe(false)
    expect(shouldUseN8nFallback({ adapterKey: 'meta-whatsapp', fallbackMode: 'n8n' })).toBe(true)
    expect(shouldUseN8nFallback({ adapterKey: 'custom-provider', fallbackMode: 'official' })).toBe(true)
  })
})
```

- [x] **Step 2: Run tests and confirm failure**

Run:

```bash
cd frontend
npm test -- src/lib/meta/metaChannelRules.test.ts
```

Expected: FAIL because `frontend/src/lib/meta/metaChannelRules.ts` does not exist.

- [x] **Step 3: Extend omnichannel channel types**

Update `frontend/src/types/omnichannel.ts`:

```ts
export type OmnichannelChannel = 'whatsapp' | 'instagram' | 'messenger' | 'email' | 'webchat'
export type ConnectedChannelState =
  | 'not_configured'
  | 'pending'
  | 'connected'
  | 'stale'
  | 'needs_reauth'
  | 'failed'
  | 'disabled'
  | 'disconnected'

export type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'
export type MetaChannelFallbackMode = 'official' | 'n8n'

export interface MetaChannelPublicMetadata {
  businessId?: string
  wabaId?: string
  phoneNumberId?: string
  pageId?: string
  instagramAccountId?: string
  displayName?: string
  username?: string
  scopes?: string[]
}
```

- [x] **Step 4: Implement pure channel rules**

Create `frontend/src/lib/meta/metaChannelRules.ts`:

```ts
import type {
  ConnectedChannelState,
  OmnichannelChannel,
  ProviderTokenState,
  ProviderVerifyState,
} from '@/types/omnichannel'

type MetaMetadata = Record<string, unknown>

const secretKeys = new Set([
  'accessToken',
  'access_token',
  'appSecret',
  'app_secret',
  'clientSecret',
  'client_secret',
  'token',
])

export function getMetaChannelLabel(channel: OmnichannelChannel) {
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'instagram') return 'Instagram Direct'
  if (channel === 'messenger') return 'Facebook Messenger'
  if (channel === 'webchat') return 'Webchat'
  if (channel === 'email') return 'Email'
  return channel
}

export function normalizeMetaScopes(scopes: string[] = []) {
  return Array.from(new Set(scopes.map(scope => scope.trim()).filter(Boolean))).sort()
}

export function sanitizeMetaPublicMetadata(metadata: MetaMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !secretKeys.has(key)),
  )
}

export function deriveConnectedChannelState(input: {
  isActive: boolean
  providerVerifyState?: ProviderVerifyState
  tokenState?: ProviderTokenState
  healthStatus?: ConnectedChannelState
  disconnectedAt?: string | null
}): ConnectedChannelState {
  if (input.disconnectedAt) return 'disconnected'
  if (!input.isActive) return 'disabled'
  if (input.tokenState === 'needs_reauth' || input.healthStatus === 'needs_reauth') return 'needs_reauth'
  if (input.tokenState === 'failed' || input.providerVerifyState === 'failed' || input.healthStatus === 'failed') return 'failed'
  if (input.tokenState === 'stale' || input.healthStatus === 'stale') return 'stale'
  if (input.providerVerifyState === 'verified' && input.tokenState === 'connected') return 'connected'
  if (input.providerVerifyState === 'pending' || input.healthStatus === 'pending') return 'pending'
  return 'not_configured'
}

export function shouldUseN8nFallback(input: { adapterKey?: string | null; fallbackMode?: string | null }) {
  if (input.fallbackMode === 'n8n') return true
  return Boolean(input.adapterKey && !input.adapterKey.startsWith('meta-') && input.adapterKey !== 'webchat')
}
```

- [x] **Step 5: Run tests and commit**

Run:

```bash
cd frontend
npm test -- src/lib/meta/metaChannelRules.test.ts
npm run type-check
```

Expected: tests pass. If repo-wide type-check is still blocked by unrelated automations files, record the exact errors and keep the task commit scoped.

Commit:

```bash
git add frontend/src/types/omnichannel.ts frontend/src/lib/meta
git commit -m "feat: add meta channel rules"
```

---

### Task 2: Meta Channel Schema, RLS And Probes

**Files:**
- Create: `supabase/migrations/<generated>_meta_channel_connectors.sql`
- Create: `supabase/probes/<generated>_meta_channel_connectors.sql`

- [x] **Step 1: Create migration with Supabase CLI**

Run:

```bash
supabase migration new meta_channel_connectors
```

Use the generated path.

- [x] **Step 2: Add schema extensions and tables**

Add this SQL to the generated migration:

```sql
ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_channel_check;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat'));

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_business_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_display_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_username TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS health_summary TEXT,
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT NOT NULL DEFAULT 'official';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_health_status_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_health_status_check
      CHECK (health_status IN ('not_configured', 'pending', 'connected', 'stale', 'needs_reauth', 'failed', 'disabled', 'disconnected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_fallback_mode_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_fallback_mode_check
      CHECK (fallback_mode IN ('official', 'n8n'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_channel TEXT NOT NULL CHECK (requested_channel IN ('whatsapp', 'instagram', 'messenger')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'expired')),
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier_hash TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error_text TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_connection_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('connected', 'reconnected', 'disconnected', 'token_failed', 'webhook_failed', 'status_changed', 'test_sent', 'admin_action')),
  source TEXT NOT NULL CHECK (source IN ('portal', 'admin_yux', 'health_job', 'webhook', 'edge_function')),
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
  previous_status TEXT,
  next_status TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('manual', 'scheduled', 'webhook', 'outbound', 'reauth')),
  sanitized_response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_response) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_org_channel
  ON public.channel_connections(organization_id, channel, health_status, token_state);
CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_asset
  ON public.channel_connections(channel, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_org_status
  ON public.meta_oauth_sessions(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_connection_audit_connection
  ON public.channel_connection_audit_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_health_checks_connection
  ON public.channel_health_checks(connection_id, created_at DESC);
```

- [x] **Step 3: Add RLS policies and grants**

Append:

```sql
ALTER TABLE public.meta_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connection_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Omnichannel configurators manage meta oauth sessions" ON public.meta_oauth_sessions;
CREATE POLICY "Omnichannel configurators manage meta oauth sessions" ON public.meta_oauth_sessions
  FOR ALL TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

DROP POLICY IF EXISTS "Omnichannel users read channel audit" ON public.channel_connection_audit_events;
CREATE POLICY "Omnichannel users read channel audit" ON public.channel_connection_audit_events
  FOR SELECT TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'read'));

DROP POLICY IF EXISTS "Omnichannel configurators insert channel audit" ON public.channel_connection_audit_events;
CREATE POLICY "Omnichannel configurators insert channel audit" ON public.channel_connection_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

DROP POLICY IF EXISTS "Omnichannel users read channel health checks" ON public.channel_health_checks;
CREATE POLICY "Omnichannel users read channel health checks" ON public.channel_health_checks
  FOR SELECT TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'read'));

DROP POLICY IF EXISTS "Omnichannel configurators insert channel health checks" ON public.channel_health_checks;
CREATE POLICY "Omnichannel configurators insert channel health checks" ON public.channel_health_checks
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

REVOKE ALL ON public.meta_oauth_sessions FROM anon;
REVOKE ALL ON public.channel_connection_audit_events FROM anon;
REVOKE ALL ON public.channel_health_checks FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_oauth_sessions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.channel_connection_audit_events TO authenticated, service_role;
GRANT SELECT, INSERT ON public.channel_health_checks TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [x] **Step 4: Add SQL probe**

Create `supabase/probes/<same_timestamp>_meta_channel_connectors.sql`:

```sql
DO $$
BEGIN
  IF to_regclass('public.meta_oauth_sessions') IS NULL THEN
    RAISE EXCEPTION 'meta_oauth_sessions missing';
  END IF;

  IF to_regclass('public.channel_connection_audit_events') IS NULL THEN
    RAISE EXCEPTION 'channel_connection_audit_events missing';
  END IF;

  IF to_regclass('public.channel_health_checks') IS NULL THEN
    RAISE EXCEPTION 'channel_health_checks missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channel_connections'
      AND column_name = 'fallback_mode'
  ) THEN
    RAISE EXCEPTION 'channel_connections.fallback_mode missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('channel_connections', 'meta_oauth_sessions', 'channel_connection_audit_events', 'channel_health_checks')
      AND column_name IN ('access_token', 'app_secret', 'client_secret', 'raw_token')
  ) THEN
    RAISE EXCEPTION 'Meta connector tables must not expose raw secret columns';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
      AND table_name IN ('meta_oauth_sessions', 'channel_connection_audit_events', 'channel_health_checks')
  ) THEN
    RAISE EXCEPTION 'Meta connector tables must not grant direct anon access';
  END IF;
END
$$;
```

- [x] **Step 5: Run local validation and commit**

Run:

```bash
supabase migration list --local
```

Expected: the generated migration appears locally.

Execution note: `supabase migration list --local` was attempted on 2026-06-05, but the local Postgres instance was not running and Docker was not available in this environment. The migration remains scheduled for remote application and probe execution in Task 11.

Commit:

```bash
git add supabase/migrations supabase/probes
git commit -m "feat: add meta channel connector schema"
```

---

### Task 3: Shared Meta Edge Helpers

**Files:**
- Create: `supabase/functions/_shared/metaChannel.ts`
- Test: `supabase/functions/_shared/metaChannel.test.ts`

- [x] **Step 1: Write failing Deno tests**

Create `supabase/functions/_shared/metaChannel.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildGraphUrl,
  deriveTokenStateFromGraphStatus,
  normalizeMessengerInbound,
  sanitizeMetaGraphPayload,
  validateMetaChannel,
} from './metaChannel.ts'

Deno.test('buildGraphUrl joins graph version and path', () => {
  assertEquals(
    buildGraphUrl({ graphVersion: 'v20.0', path: '/me/accounts' }),
    'https://graph.facebook.com/v20.0/me/accounts',
  )
})

Deno.test('sanitizeMetaGraphPayload strips token-like fields', () => {
  assertEquals(sanitizeMetaGraphPayload({
    id: 'page-1',
    access_token: 'secret',
    app_secret: 'secret',
    name: 'Clinica',
  }), { id: 'page-1', name: 'Clinica' })
})

Deno.test('deriveTokenStateFromGraphStatus detects reauth states', () => {
  assertEquals(deriveTokenStateFromGraphStatus(401), 'needs_reauth')
  assertEquals(deriveTokenStateFromGraphStatus(403), 'needs_reauth')
  assertEquals(deriveTokenStateFromGraphStatus(500), 'failed')
  assertEquals(deriveTokenStateFromGraphStatus(200), 'connected')
})

Deno.test('validateMetaChannel accepts supported Meta channels', () => {
  assertEquals(validateMetaChannel('whatsapp'), 'whatsapp')
  assertEquals(validateMetaChannel('instagram'), 'instagram')
  assertEquals(validateMetaChannel('messenger'), 'messenger')
})

Deno.test('normalizeMessengerInbound maps page messaging event', () => {
  const event = normalizeMessengerInbound({
    object: 'page',
    entry: [{
      id: 'page-1',
      messaging: [{
        sender: { id: 'psid-1' },
        recipient: { id: 'page-1' },
        timestamp: 1710000000000,
        message: { mid: 'mid-1', text: 'Oi' },
      }],
    }],
  })
  assertEquals(event.channel, 'messenger')
  assertEquals(event.externalMessageId, 'mid-1')
  assertEquals(event.contact.externalId, 'psid-1')
})
```

- [x] **Step 2: Run tests and confirm failure**

Run:

```bash
deno test supabase/functions/_shared/metaChannel.test.ts
```

Expected: FAIL because `metaChannel.ts` does not exist.

- [x] **Step 3: Implement shared helpers**

Create `supabase/functions/_shared/metaChannel.ts`:

```ts
import { buildIdempotencyKey, sanitizeWebhookMetadata } from './omnichannel.ts'

type JsonRecord = Record<string, unknown>
type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function buildGraphUrl(input: { graphVersion?: string | null; path: string }) {
  const version = input.graphVersion || 'v20.0'
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`
  return `https://graph.facebook.com/${version}${path}`
}

export function validateMetaChannel(value: unknown): MetaChannel {
  if (value === 'whatsapp' || value === 'instagram' || value === 'messenger') return value
  throw new Error('Unsupported Meta channel')
}

export function sanitizeMetaGraphPayload(payload: unknown): JsonRecord {
  const stripped = sanitizeWebhookMetadata(payload) as JsonRecord
  for (const key of ['access_token', 'accessToken', 'app_secret', 'appSecret', 'client_secret', 'clientSecret', 'token']) {
    delete stripped[key]
  }
  return stripped
}

export function deriveTokenStateFromGraphStatus(status: number) {
  if (status === 401 || status === 403) return 'needs_reauth'
  if (status >= 400) return 'failed'
  return 'connected'
}

export function normalizeMessengerInbound(payload: unknown) {
  const root = record(payload)
  const entry = array(root.entry)[0]
  const messaging = array(entry?.messaging)[0]
  const message = record(messaging?.message)
  const sender = record(messaging?.sender)
  const recipient = record(messaging?.recipient)
  const externalMessageId = stringValue(message.mid) || `${Date.now()}`
  const connectionId = stringValue(recipient.id) || stringValue(entry?.id) || 'messenger'

  return {
    connectionId,
    channel: 'messenger' as const,
    externalMessageId,
    externalEventId: externalMessageId,
    eventType: 'message.created',
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId: externalMessageId, eventType: 'message.created' }),
    contact: {
      externalId: stringValue(sender.id) || 'unknown',
      displayName: undefined,
      metadata: sanitizeWebhookMetadata({ provider: 'meta', pageId: recipient.id }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body: stringValue(message.text) || '[messenger]',
      contentType: 'text',
      attachments: [],
      metadata: sanitizeWebhookMetadata({ provider: 'meta', pageId: recipient.id }) as JsonRecord,
    },
    occurredAt: new Date(Number(messaging?.timestamp || Date.now())).toISOString(),
    sanitizedPayload: sanitizeWebhookMetadata(payload) as JsonRecord,
  }
}
```

- [x] **Step 4: Run Deno tests and commit**

Run:

```bash
deno test supabase/functions/_shared/metaChannel.test.ts
```

Expected: pass.

Commit:

```bash
git add supabase/functions/_shared/metaChannel.ts supabase/functions/_shared/metaChannel.test.ts
git commit -m "feat: add shared meta channel helpers"
```

---

### Task 4: Meta OAuth And Connection Edge Functions

**Files:**
- Create: `supabase/functions/start-meta-channel-connect/index.ts`
- Create: `supabase/functions/start-meta-channel-connect/deno.json`
- Create: `supabase/functions/complete-meta-channel-connect/index.ts`
- Create: `supabase/functions/complete-meta-channel-connect/deno.json`
- Create: `supabase/functions/list-meta-channel-assets/index.ts`
- Create: `supabase/functions/list-meta-channel-assets/deno.json`

- [x] **Step 1: Implement start function**

Create `supabase/functions/start-meta-channel-connect/index.ts`:

```ts
import { corsHeaders, getUserClient, json } from '../_shared/edge.ts'
import { hashToken } from '../_shared/omnichannel.ts'
import { validateMetaChannel } from '../_shared/metaChannel.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    try {
      const body = await req.json()
      const organizationId = String(body.organizationId || '')
      const channel = validateMetaChannel(body.channel)
      const state = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      const userClient = getUserClient(authorization)
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Unauthorized' }, 401)

      const { error } = await userClient.from('meta_oauth_sessions').insert({
        organization_id: organizationId,
        user_id: user.id,
        requested_channel: channel,
        state_hash: await hashToken(state),
        expires_at: expiresAt,
      })
      if (error) throw error

      return json({
        channel,
        state,
        appId: Deno.env.get('META_APP_ID'),
        graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
        embeddedSignupConfigId: Deno.env.get('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'),
        redirectUri: Deno.env.get('META_OAUTH_REDIRECT_URI'),
        expiresAt,
      })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Failed to start Meta connection' }, 400)
    }
  })
}
```

Create `supabase/functions/start-meta-channel-connect/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [x] **Step 2: Implement complete function**

Create `supabase/functions/complete-meta-channel-connect/index.ts`:

```ts
import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { hashToken, sanitizeWebhookMetadata } from '../_shared/omnichannel.ts'
import { buildGraphUrl, sanitizeMetaGraphPayload, validateMetaChannel } from '../_shared/metaChannel.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    try {
      const body = await req.json()
      const organizationId = String(body.organizationId || '')
      const channel = validateMetaChannel(body.channel)
      const code = String(body.code || '')
      const state = String(body.state || '')
      const assets = Array.isArray(body.assets) ? body.assets : []
      if (!code || !state) return json({ error: 'code and state are required' }, 400)

      const userClient = getUserClient(authorization)
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Unauthorized' }, 401)

      const stateHash = await hashToken(state)
      const { data: session, error: sessionError } = await userClient
        .from('meta_oauth_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('requested_channel', channel)
        .eq('state_hash', stateHash)
        .eq('status', 'started')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (sessionError) throw sessionError
      if (!session) return json({ error: 'Invalid or expired state' }, 400)

      const graphVersion = Deno.env.get('META_GRAPH_VERSION') || 'v20.0'
      const tokenResponse = await fetch(buildGraphUrl({ graphVersion, path: '/oauth/access_token' }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('META_APP_ID'),
          client_secret: Deno.env.get('META_APP_SECRET'),
          redirect_uri: Deno.env.get('META_OAUTH_REDIRECT_URI'),
          code,
        }),
      })
      const tokenPayload = await tokenResponse.json().catch(() => ({}))
      if (!tokenResponse.ok) throw new Error(`Meta token exchange failed with ${tokenResponse.status}`)

      const admin = getServiceRoleClient()
      const tokenReference = `META_CHANNEL_TOKEN_${session.id.replaceAll('-', '_')}`
      const connectionRows = assets.map((asset: Record<string, unknown>) => ({
        organization_id: organizationId,
        channel,
        name: String(asset.displayName || asset.name || channel),
        is_active: true,
        adapter_key: channel === 'whatsapp' ? 'meta-whatsapp' : channel === 'instagram' ? 'meta-instagram' : 'meta-messenger',
        inbound_token_hash: stateHash,
        provider_account_id: String(asset.providerAccountId || asset.wabaId || asset.pageId || asset.instagramAccountId || ''),
        provider_asset_id: String(asset.providerAssetId || asset.phoneNumberId || asset.pageId || asset.instagramAccountId || ''),
        provider_business_id: typeof asset.businessId === 'string' ? asset.businessId : null,
        provider_display_name: String(asset.displayName || asset.name || channel),
        provider_username: typeof asset.username === 'string' ? asset.username : null,
        phone_number_id: channel === 'whatsapp' ? String(asset.phoneNumberId || '') : null,
        provider_verify_state: 'pending',
        token_state: 'connected',
        health_status: 'pending',
        connected_by_user_id: user.id,
        connected_at: new Date().toISOString(),
        protected_metadata_references: { accessTokenEnv: tokenReference },
        n8n_routing_metadata: {},
      }))

      const { data: connections, error: upsertError } = await admin
        .from('channel_connections')
        .upsert(connectionRows, { onConflict: 'organization_id,channel,name' })
        .select()
      if (upsertError) throw upsertError

      await admin.from('meta_oauth_sessions').update({
        status: 'completed',
        sanitized_result: sanitizeMetaGraphPayload({ token: tokenPayload, assets }),
        completed_at: new Date().toISOString(),
      }).eq('id', session.id)

      await admin.from('channel_connection_audit_events').insert((connections || []).map(connection => ({
        organization_id: organizationId,
        connection_id: connection.id,
        actor_user_id: user.id,
        event_type: 'connected',
        source: 'portal',
        safe_after: sanitizeWebhookMetadata(connection),
      })))

      return json({ success: true, connections })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Failed to complete Meta connection' }, 400)
    }
  })
}
```

Create `supabase/functions/complete-meta-channel-connect/deno.json` with the same imports as the start function.

- [x] **Step 3: Implement list assets function**

Create `supabase/functions/list-meta-channel-assets/index.ts`:

```ts
import { corsHeaders, getUserClient, json } from '../_shared/edge.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { organizationId } = await req.json()
    const { data, error } = await getUserClient(authorization)
      .from('channel_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .in('channel', ['whatsapp', 'instagram', 'messenger'])
      .is('disconnected_at', null)
      .order('channel')
    if (error) return json({ error: error.message }, 400)
    return json({ connections: data || [] })
  })
}
```

Create `supabase/functions/list-meta-channel-assets/deno.json` with the same imports.

- [x] **Step 4: Add function config**

Update `supabase/config.toml`:

```toml
[functions.start-meta-channel-connect]
verify_jwt = true

[functions.complete-meta-channel-connect]
verify_jwt = true

[functions.list-meta-channel-assets]
verify_jwt = true
```

- [x] **Step 5: Run checks and commit**

Run:

```bash
deno check supabase/functions/start-meta-channel-connect/index.ts
deno check supabase/functions/complete-meta-channel-connect/index.ts
deno check supabase/functions/list-meta-channel-assets/index.ts
```

Expected: all pass.

Commit:

```bash
git add supabase/functions/start-meta-channel-connect supabase/functions/complete-meta-channel-connect supabase/functions/list-meta-channel-assets supabase/config.toml
git commit -m "feat: add meta channel oauth functions"
```

---

### Task 5: Disconnect, Health And Test Edge Functions

**Files:**
- Create: `supabase/functions/disconnect-meta-channel/index.ts`
- Create: `supabase/functions/disconnect-meta-channel/deno.json`
- Create: `supabase/functions/refresh-meta-channel-health/index.ts`
- Create: `supabase/functions/refresh-meta-channel-health/deno.json`
- Create: `supabase/functions/send-meta-channel-test/index.ts`
- Create: `supabase/functions/send-meta-channel-test/deno.json`

- [x] **Step 1: Implement disconnect function**

Create `supabase/functions/disconnect-meta-channel/index.ts`:

```ts
import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    const { connectionId } = await req.json()
    const userClient = getUserClient(authorization)
    const { data: visible } = await userClient.from('channel_connections').select('*').eq('id', connectionId).single()
    if (!visible) return json({ error: 'Connection not found' }, 404)
    const { data: { user } } = await userClient.auth.getUser()

    const admin = getServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin.from('channel_connections').update({
      is_active: false,
      disconnected_at: now,
      health_status: 'disconnected',
      token_state: 'not_configured',
      updated_at: now,
    }).eq('id', connectionId).select().single()
    if (error) return json({ error: error.message }, 400)

    await admin.from('channel_connection_audit_events').insert({
      organization_id: data.organization_id,
      connection_id: data.id,
      actor_user_id: user?.id || null,
      event_type: 'disconnected',
      source: 'portal',
      safe_before: visible,
      safe_after: data,
    })

    return json({ success: true, connection: data })
  })
}
```

- [x] **Step 2: Implement health function**

Create `supabase/functions/refresh-meta-channel-health/index.ts`:

```ts
import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { deriveTokenStateFromGraphStatus, sanitizeMetaGraphPayload } from '../_shared/metaChannel.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { connectionId } = await req.json()

    const userClient = getUserClient(authorization)
    const { data: visible } = await userClient.from('channel_connections').select('*').eq('id', connectionId).single()
    if (!visible) return json({ error: 'Connection not found' }, 404)

    const nextStatus = visible.disconnected_at
      ? 'disconnected'
      : visible.token_state === 'needs_reauth'
        ? 'needs_reauth'
        : visible.token_state === 'failed'
          ? 'failed'
          : visible.provider_verify_state === 'verified'
            ? 'connected'
            : 'pending'

    const admin = getServiceRoleClient()
    const { data, error } = await admin.from('channel_connections').update({
      health_status: nextStatus,
      health_checked_at: new Date().toISOString(),
      health_summary: `Health checked locally with token state ${visible.token_state}`,
    }).eq('id', connectionId).select().single()
    if (error) return json({ error: error.message }, 400)

    await admin.from('channel_health_checks').insert({
      organization_id: data.organization_id,
      connection_id: data.id,
      channel: data.channel,
      previous_status: visible.health_status,
      next_status: nextStatus,
      check_type: 'manual',
      sanitized_response: sanitizeMetaGraphPayload({ status: deriveTokenStateFromGraphStatus(200), local: true }),
    })

    return json({ success: true, connection: data })
  })
}
```

- [x] **Step 3: Implement test function**

Create `supabase/functions/send-meta-channel-test/index.ts`:

```ts
import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    const { connectionId } = await req.json()
    const userClient = getUserClient(authorization)
    const { data: visible } = await userClient.from('channel_connections').select('*').eq('id', connectionId).single()
    if (!visible) return json({ error: 'Connection not found' }, 404)
    const { data: { user } } = await userClient.auth.getUser()

    const admin = getServiceRoleClient()
    await admin.from('channel_connection_audit_events').insert({
      organization_id: visible.organization_id,
      connection_id: visible.id,
      actor_user_id: user?.id || null,
      event_type: 'test_sent',
      source: 'portal',
      safe_after: { channel: visible.channel, adapterKey: visible.adapter_key, providerAssetId: visible.provider_asset_id },
    })

    return json({ success: true, message: 'Teste registrado. Envio real depende da janela/permissao do canal.' })
  })
}
```

- [x] **Step 4: Add deno.json and config**

For each function directory create:

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

Update `supabase/config.toml`:

```toml
[functions.disconnect-meta-channel]
verify_jwt = true

[functions.refresh-meta-channel-health]
verify_jwt = true

[functions.send-meta-channel-test]
verify_jwt = true
```

- [x] **Step 5: Run checks and commit**

Run:

```bash
deno check supabase/functions/disconnect-meta-channel/index.ts
deno check supabase/functions/refresh-meta-channel-health/index.ts
deno check supabase/functions/send-meta-channel-test/index.ts
```

Expected: all pass.

Commit:

```bash
git add supabase/functions/disconnect-meta-channel supabase/functions/refresh-meta-channel-health supabase/functions/send-meta-channel-test supabase/config.toml
git commit -m "feat: add meta channel lifecycle functions"
```

---

### Task 6: Extend Inbound And Outbound Meta Adapters

**Files:**
- Modify: `supabase/functions/receive-channel-event/index.ts`
- Modify: `supabase/functions/dispatch-outbound-message/index.ts`
- Test: `supabase/functions/_shared/metaChannel.test.ts`

- [x] **Step 1: Add Instagram inbound test**

Extend `supabase/functions/_shared/metaChannel.test.ts`:

```ts
import { normalizeInstagramInbound } from './metaChannel.ts'

Deno.test('normalizeInstagramInbound maps instagram messaging event', () => {
  const event = normalizeInstagramInbound({
    object: 'instagram',
    entry: [{
      id: 'ig-1',
      messaging: [{
        sender: { id: 'ig-user-1' },
        recipient: { id: 'ig-1' },
        timestamp: 1710000000000,
        message: { mid: 'ig-mid-1', text: 'Ola' },
      }],
    }],
  })
  assertEquals(event.channel, 'instagram')
  assertEquals(event.externalMessageId, 'ig-mid-1')
})
```

- [x] **Step 2: Implement Instagram normalizer**

Add to `supabase/functions/_shared/metaChannel.ts`:

```ts
export function normalizeInstagramInbound(payload: unknown) {
  const root = record(payload)
  const entry = array(root.entry)[0]
  const messaging = array(entry?.messaging)[0]
  const message = record(messaging?.message)
  const sender = record(messaging?.sender)
  const recipient = record(messaging?.recipient)
  const externalMessageId = stringValue(message.mid) || `${Date.now()}`
  const connectionId = stringValue(recipient.id) || stringValue(entry?.id) || 'instagram'

  return {
    connectionId,
    channel: 'instagram' as const,
    externalMessageId,
    externalEventId: externalMessageId,
    eventType: 'message.created',
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId: externalMessageId, eventType: 'message.created' }),
    contact: {
      externalId: stringValue(sender.id) || 'unknown',
      displayName: undefined,
      metadata: sanitizeWebhookMetadata({ provider: 'meta', instagramAccountId: recipient.id }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body: stringValue(message.text) || '[instagram]',
      contentType: 'text',
      attachments: [],
      metadata: sanitizeWebhookMetadata({ provider: 'meta', instagramAccountId: recipient.id }) as JsonRecord,
    },
    occurredAt: new Date(Number(messaging?.timestamp || Date.now())).toISOString(),
    sanitizedPayload: sanitizeWebhookMetadata(payload) as JsonRecord,
  }
}
```

- [x] **Step 3: Route Instagram and Messenger webhooks**

Modify `supabase/functions/receive-channel-event/index.ts` imports:

```ts
import {
  normalizeInstagramInbound,
  normalizeMessengerInbound,
} from '../_shared/metaChannel.ts'
```

Add before the provider-neutral fallback:

```ts
if (body.object === 'instagram') {
  const result = await processChannelEvent(getServiceRoleClient(), normalizeInstagramInbound(body))
  return json({ success: true, provider: 'meta-instagram', ...result })
}

if (body.object === 'page') {
  const result = await processChannelEvent(getServiceRoleClient(), normalizeMessengerInbound(body))
  return json({ success: true, provider: 'meta-messenger', ...result })
}
```

- [x] **Step 4: Preserve official adapter plus n8n fallback outbound**

Modify `supabase/functions/dispatch-outbound-message/index.ts` after the WhatsApp branch:

```ts
  if ((conversation.channel === 'instagram' || conversation.channel === 'messenger') && connection?.fallback_mode !== 'n8n') {
    await admin.from('messages').update({ delivery_status: 'queued' }).eq('id', message.id)
    await admin.from('outbound_message_runs').update({
      status: 'queued',
      sanitized_response: {
        provider: connection?.adapter_key,
        note: 'Official Meta outbound adapter will process this channel after App Review permissions are active.',
      },
    }).eq('id', run.id)
    return { runId: run.id, status: 'queued', provider: connection?.adapter_key }
  }
```

The existing n8n branch remains after this block and handles `fallback_mode = 'n8n'`.

- [x] **Step 5: Run Deno tests/checks and commit**

Run:

```bash
deno test supabase/functions/_shared/metaChannel.test.ts
deno check supabase/functions/receive-channel-event/index.ts
deno check supabase/functions/dispatch-outbound-message/index.ts
```

Expected: all pass.

Commit:

```bash
git add supabase/functions/_shared/metaChannel.ts supabase/functions/_shared/metaChannel.test.ts supabase/functions/receive-channel-event/index.ts supabase/functions/dispatch-outbound-message/index.ts
git commit -m "feat: extend meta inbound and outbound adapters"
```

---

### Task 7: Frontend Meta Channel Service

**Files:**
- Create: `frontend/src/services/metaChannelService.ts`
- Test: `frontend/src/services/metaChannelService.test.ts`

- [x] **Step 1: Write failing service tests**

Create `frontend/src/services/metaChannelService.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapMetaChannelConnection, buildStartMetaConnectPayload } from './metaChannelService'

describe('metaChannelService', () => {
  it('maps channel connection rows to connected channel view', () => {
    expect(mapMetaChannelConnection({
      id: 'conn-1',
      organization_id: 'org-1',
      channel: 'whatsapp',
      name: 'Comercial',
      is_active: true,
      adapter_key: 'meta-whatsapp',
      provider_account_id: 'waba-1',
      provider_asset_id: 'phone-1',
      provider_display_name: 'Comercial YUX',
      provider_username: null,
      phone_number_id: 'phone-1',
      provider_verify_state: 'verified',
      token_state: 'connected',
      health_status: 'connected',
      fallback_mode: 'official',
      last_event_at: '2026-06-05T12:00:00Z',
      health_checked_at: '2026-06-05T12:01:00Z',
      protected_metadata_references: { accessTokenEnv: 'META_CHANNEL_TOKEN_1' },
    })).toEqual(expect.objectContaining({
      id: 'conn-1',
      channel: 'whatsapp',
      label: 'WhatsApp',
      state: 'connected',
      displayName: 'Comercial YUX',
      tokenReferenceConfigured: true,
    }))
  })

  it('builds start connect payload', () => {
    expect(buildStartMetaConnectPayload({ organizationId: 'org-1', channel: 'instagram' })).toEqual({
      organizationId: 'org-1',
      channel: 'instagram',
    })
  })
})
```

- [x] **Step 2: Run tests and confirm failure**

Run:

```bash
cd frontend
npm test -- src/services/metaChannelService.test.ts
```

Expected: FAIL because `metaChannelService.ts` does not exist.

- [x] **Step 3: Implement service**

Create `frontend/src/services/metaChannelService.ts`:

```ts
import { supabase } from '@/lib/supabase'
import {
  deriveConnectedChannelState,
  getMetaChannelLabel,
  sanitizeMetaPublicMetadata,
} from '@/lib/meta/metaChannelRules'
import type { MetaChannel, OmnichannelChannel } from '@/types/omnichannel'

export interface ConnectedChannelView {
  id: string
  organizationId: string
  channel: OmnichannelChannel
  label: string
  name: string
  displayName?: string
  username?: string
  providerAccountId?: string
  providerAssetId?: string
  phoneNumberId?: string
  adapterKey?: string
  state: string
  fallbackMode: 'official' | 'n8n'
  tokenReferenceConfigured: boolean
  lastEventAt?: string
  healthCheckedAt?: string
  publicMetadata: Record<string, unknown>
}

const optional = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

export function mapMetaChannelConnection(row: any): ConnectedChannelView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    channel: row.channel,
    label: getMetaChannelLabel(row.channel),
    name: row.name,
    displayName: optional(row.provider_display_name),
    username: optional(row.provider_username),
    providerAccountId: optional(row.provider_account_id),
    providerAssetId: optional(row.provider_asset_id),
    phoneNumberId: optional(row.phone_number_id),
    adapterKey: optional(row.adapter_key),
    state: deriveConnectedChannelState({
      isActive: Boolean(row.is_active),
      providerVerifyState: row.provider_verify_state,
      tokenState: row.token_state,
      healthStatus: row.health_status,
      disconnectedAt: row.disconnected_at,
    }),
    fallbackMode: row.fallback_mode || 'official',
    tokenReferenceConfigured: Boolean(row.protected_metadata_references && Object.keys(row.protected_metadata_references).length),
    lastEventAt: optional(row.last_event_at),
    healthCheckedAt: optional(row.health_checked_at),
    publicMetadata: sanitizeMetaPublicMetadata(row.protected_metadata_references || {}),
  }
}

export function buildStartMetaConnectPayload(input: { organizationId: string; channel: MetaChannel }) {
  return { organizationId: input.organizationId, channel: input.channel }
}

export const metaChannelService = {
  async listConnectedChannels(organizationId: string) {
    const { data, error } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .in('channel', ['whatsapp', 'instagram', 'messenger', 'webchat'])
      .order('channel')
    if (error) throw error
    return (data || []).map(mapMetaChannelConnection)
  },

  async startConnect(input: { organizationId: string; channel: MetaChannel }) {
    const { data, error } = await supabase.functions.invoke('start-meta-channel-connect', {
      body: buildStartMetaConnectPayload(input),
    })
    if (error) throw error
    return data
  },

  async completeConnect(input: { organizationId: string; channel: MetaChannel; code: string; state: string; assets: Record<string, unknown>[] }) {
    const { data, error } = await supabase.functions.invoke('complete-meta-channel-connect', { body: input })
    if (error) throw error
    return data
  },

  async disconnect(connectionId: string) {
    const { data, error } = await supabase.functions.invoke('disconnect-meta-channel', { body: { connectionId } })
    if (error) throw error
    return data
  },

  async refreshHealth(connectionId: string) {
    const { data, error } = await supabase.functions.invoke('refresh-meta-channel-health', { body: { connectionId } })
    if (error) throw error
    return data
  },

  async sendTest(connectionId: string) {
    const { data, error } = await supabase.functions.invoke('send-meta-channel-test', { body: { connectionId } })
    if (error) throw error
    return data
  },
}
```

- [x] **Step 4: Run tests and commit**

Run:

```bash
cd frontend
npm test -- src/services/metaChannelService.test.ts src/lib/meta/metaChannelRules.test.ts
```

Expected: pass.

Commit:

```bash
git add frontend/src/services/metaChannelService.ts frontend/src/services/metaChannelService.test.ts
git commit -m "feat: add meta channel frontend service"
```

---

### Task 8: Portal Connected Channels Page

**Files:**
- Create: `frontend/src/components/omnichannel/ConnectedChannelCard.tsx`
- Create: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.tsx`
- Test: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx`
- Create: `frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`

- [x] **Step 1: Write failing UI test**

Create `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectedChannelsWorkspace } from './ConnectedChannelsWorkspace'

describe('ConnectedChannelsWorkspace', () => {
  it('renders Meta channel cards and connection actions', () => {
    render(
      <ConnectedChannelsWorkspace
        organizationId="org-1"
        channels={[{
          id: 'conn-1',
          organizationId: 'org-1',
          channel: 'whatsapp',
          label: 'WhatsApp',
          name: 'Comercial',
          displayName: 'Comercial YUX',
          state: 'connected',
          fallbackMode: 'official',
          tokenReferenceConfigured: true,
          publicMetadata: {},
        }]}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onRefreshHealth={vi.fn()}
        onSendTest={vi.fn()}
      />,
    )

    expect(screen.getByText('Canais conectados')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Comercial YUX')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Conectar Instagram/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Conectar Facebook Messenger/i })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run test and confirm failure**

Run:

```bash
cd frontend
npm test -- src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx
```

Expected: FAIL because the workspace does not exist.

- [x] **Step 3: Create card component**

Create `frontend/src/components/omnichannel/ConnectedChannelCard.tsx`:

```tsx
import { Cable, RefreshCw, Send, Unplug } from 'lucide-react'
import type { ConnectedChannelView } from '@/services/metaChannelService'

export function ConnectedChannelCard({
  channel,
  onConnect,
  onDisconnect,
  onRefreshHealth,
  onSendTest,
}: {
  channel?: ConnectedChannelView
  onConnect: () => void
  onDisconnect: () => void
  onRefreshHealth: () => void
  onSendTest: () => void
}) {
  const connected = Boolean(channel?.id && channel.state !== 'disconnected' && channel.state !== 'not_configured')
  const label = channel?.label || 'Canal'

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{label}</h2>
          <p className="mt-1 text-sm text-gray-600">{channel?.displayName || channel?.name || 'Nenhuma conta conectada'}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{channel?.state || 'not_configured'}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onConnect} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white">
          <Cable className="h-4 w-4" aria-hidden="true" />
          {connected ? `Reconectar ${label}` : `Conectar ${label}`}
        </button>
        <button type="button" onClick={onRefreshHealth} disabled={!connected} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Checar saude
        </button>
        <button type="button" onClick={onSendTest} disabled={!connected} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden="true" />
          Testar
        </button>
        <button type="button" onClick={onDisconnect} disabled={!connected} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">
          <Unplug className="h-4 w-4" aria-hidden="true" />
          Desconectar
        </button>
      </div>
    </section>
  )
}
```

- [x] **Step 4: Create workspace**

Create `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.tsx`:

```tsx
import { ConnectedChannelCard } from './ConnectedChannelCard'
import type { ConnectedChannelView } from '@/services/metaChannelService'
import type { MetaChannel } from '@/types/omnichannel'

const desiredChannels: Array<{ channel: MetaChannel; label: string }> = [
  { channel: 'whatsapp', label: 'WhatsApp' },
  { channel: 'instagram', label: 'Instagram' },
  { channel: 'messenger', label: 'Facebook Messenger' },
]

export function ConnectedChannelsWorkspace({
  organizationId,
  channels,
  onConnect,
  onDisconnect,
  onRefreshHealth,
  onSendTest,
}: {
  organizationId: string
  channels: ConnectedChannelView[]
  onConnect: (channel: MetaChannel) => void
  onDisconnect: (connectionId: string) => void
  onRefreshHealth: (connectionId: string) => void
  onSendTest: (connectionId: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Conecte e monitore os canais Meta autorizados para esta organizacao.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {desiredChannels.map(item => {
          const channel = channels.find(connection => connection.channel === item.channel)
          return (
            <ConnectedChannelCard
              key={item.channel}
              channel={channel || {
                id: '',
                organizationId,
                channel: item.channel,
                label: item.label,
                name: item.label,
                state: 'not_configured',
                fallbackMode: 'official',
                tokenReferenceConfigured: false,
                publicMetadata: {},
              }}
              onConnect={() => onConnect(item.channel)}
              onDisconnect={() => channel?.id && onDisconnect(channel.id)}
              onRefreshHealth={() => channel?.id && onRefreshHealth(channel.id)}
              onSendTest={() => channel?.id && onSendTest(channel.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [x] **Step 5: Add portal page and route**

Create `frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ConnectedChannelsWorkspace } from '@/components/omnichannel/ConnectedChannelsWorkspace'
import { metaChannelService, type ConnectedChannelView } from '@/services/metaChannelService'
import { usePlatformStore } from '@/stores/platformStore'
import type { MetaChannel } from '@/types/omnichannel'

export function PortalConnectedChannelsPage() {
  const { context } = usePlatformStore()
  const organizationId = context.organization?.id
  const [channels, setChannels] = useState<ConnectedChannelView[]>([])

  async function loadChannels() {
    if (!organizationId) return
    setChannels(await metaChannelService.listConnectedChannels(organizationId))
  }

  useEffect(() => { loadChannels() }, [organizationId])

  if (!organizationId) return <div className="p-6 text-sm text-gray-600">Organizacao nao encontrada.</div>

  async function handleConnect(channel: MetaChannel) {
    await metaChannelService.startConnect({ organizationId, channel })
    toast.success('Fluxo de conexao iniciado')
  }

  return (
    <ConnectedChannelsWorkspace
      organizationId={organizationId}
      channels={channels}
      onConnect={handleConnect}
      onDisconnect={async connectionId => { await metaChannelService.disconnect(connectionId); await loadChannels() }}
      onRefreshHealth={async connectionId => { await metaChannelService.refreshHealth(connectionId); await loadChannels() }}
      onSendTest={async connectionId => { await metaChannelService.sendTest(connectionId); toast.success('Teste registrado') }}
    />
  )
}
```

Modify `frontend/src/App.tsx`:

```tsx
import { PortalConnectedChannelsPage } from '@/pages/client-portal/PortalConnectedChannelsPage'
```

Add route:

```tsx
<Route path="portal/omnichannel/channels" element={<PortalConnectedChannelsPage />} />
```

Update navigation to include a portal child or visible link named `Canais conectados`.

- [x] **Step 6: Run tests and commit**

Run:

```bash
cd frontend
npm test -- src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx src/lib/platform/navigation.test.ts
```

Expected: pass.

Commit:

```bash
git add frontend/src/components/omnichannel frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: add portal connected channels"
```

---

### Task 9: Admin YUX Hub Channels Page

**Files:**
- Create: `frontend/src/pages/platform/AdminChannelsPage.tsx`
- Create: `frontend/src/components/platform/admin/AdminChannelsTable.tsx`
- Test: `frontend/src/components/platform/admin/AdminChannelsTable.test.tsx`
- Modify: `frontend/src/services/adminPlatformService.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`

- [x] **Step 1: Write failing admin table test**

Create `frontend/src/components/platform/admin/AdminChannelsTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminChannelsTable } from './AdminChannelsTable'

describe('AdminChannelsTable', () => {
  it('renders client channel health rows', () => {
    render(
      <AdminChannelsTable
        rows={[{
          id: 'conn-1',
          organizationName: 'Clinica YUX',
          channel: 'whatsapp',
          displayName: 'Comercial',
          providerAccountId: 'waba-1',
          healthStatus: 'connected',
          tokenState: 'connected',
          providerVerifyState: 'verified',
          lastEventAt: '2026-06-05T12:00:00Z',
        }]}
      />,
    )
    expect(screen.getByText('Clinica YUX')).toBeInTheDocument()
    expect(screen.getByText('whatsapp')).toBeInTheDocument()
    expect(screen.getByText('connected')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Add admin service method**

Modify `frontend/src/services/adminPlatformService.ts`:

```ts
export interface AdminChannelConnectionRow {
  id: string
  organizationName: string
  channel: string
  displayName: string
  providerAccountId?: string
  healthStatus: string
  tokenState?: string
  providerVerifyState?: string
  lastEventAt?: string
}

// Inside AdminPlatformService:
async getAdminChannelConnections(): Promise<AdminChannelConnectionRow[]> {
  const { data, error } = await supabase
    .from('channel_connections')
    .select('*, organizations(name)')
    .in('channel', ['whatsapp', 'instagram', 'messenger'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row: any) => ({
    id: row.id,
    organizationName: row.organizations?.name || row.organization_id,
    channel: row.channel,
    displayName: row.provider_display_name || row.name,
    providerAccountId: row.provider_account_id || undefined,
    healthStatus: row.health_status || 'not_configured',
    tokenState: row.token_state || undefined,
    providerVerifyState: row.provider_verify_state || undefined,
    lastEventAt: row.last_event_at || undefined,
  }))
}
```

- [x] **Step 3: Create admin table**

Create `frontend/src/components/platform/admin/AdminChannelsTable.tsx`:

```tsx
import type { AdminChannelConnectionRow } from '@/services/adminPlatformService'

export function AdminChannelsTable({ rows }: { rows: AdminChannelConnectionRow[] }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Canais Meta por cliente</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Conta</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Webhook</th>
              <th className="px-4 py-3">Ultimo evento</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(row => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{row.organizationName}</td>
                <td className="px-4 py-3">{row.channel}</td>
                <td className="px-4 py-3">{row.displayName}</td>
                <td className="px-4 py-3">{row.healthStatus}</td>
                <td className="px-4 py-3">{row.tokenState || '-'}</td>
                <td className="px-4 py-3">{row.providerVerifyState || '-'}</td>
                <td className="px-4 py-3">{row.lastEventAt ? new Date(row.lastEventAt).toLocaleString('pt-BR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [x] **Step 4: Create page and route**

Create `frontend/src/pages/platform/AdminChannelsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AdminChannelsTable } from '@/components/platform/admin/AdminChannelsTable'
import { adminPlatformService, type AdminChannelConnectionRow } from '@/services/adminPlatformService'

export function AdminChannelsPage() {
  const [rows, setRows] = useState<AdminChannelConnectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminPlatformService.getAdminChannelConnections()
      .then(setRows)
      .catch(error => {
        console.error('Erro ao carregar canais Meta:', error)
        setError('Nao foi possivel carregar canais conectados.')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Governanca global de WhatsApp, Instagram Direct e Facebook Messenger.</p>
      </div>
      {loading && <p className="text-sm text-gray-600">Carregando canais...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!loading && !error && <AdminChannelsTable rows={rows} />}
    </div>
  )
}
```

Add route in `frontend/src/App.tsx`:

```tsx
import { AdminChannelsPage } from '@/pages/platform/AdminChannelsPage'
```

```tsx
<Route path="admin/channels" element={<AdminChannelsPage />} />
```

Add sidebar item under Infraestrutura or Gestao YUX Hub: `Canais conectados` -> `/admin/channels`.

- [x] **Step 5: Run tests and commit**

Run:

```bash
cd frontend
npm test -- src/components/platform/admin/AdminChannelsTable.test.tsx src/services/adminPlatformService.test.ts src/lib/platform/navigation.test.ts
```

Expected: pass.

Commit:

```bash
git add frontend/src/pages/platform/AdminChannelsPage.tsx frontend/src/components/platform/admin/AdminChannelsTable.tsx frontend/src/components/platform/admin/AdminChannelsTable.test.tsx frontend/src/services/adminPlatformService.ts frontend/src/App.tsx frontend/src/lib/platform/navigation.ts
git commit -m "feat: add admin connected channels"
```

---

### Task 10: Documentation, Status And Deployment Notes

**Files:**
- Modify: `docs/omnichannel-ai-operations.md`
- Modify: `docs/admin-yux-hub.md`
- Modify: `docs/implementation-status.md`

- [ ] **Step 1: Update omnichannel operations**

Add a section to `docs/omnichannel-ai-operations.md`:

```md
## Meta Channel Connectors

YUX Hub uses the official Meta app owned by YUX for customer channel onboarding.
Customers connect their own assets through WhatsApp Embedded Signup and Meta
Login. The customer remains the owner of WABAs, WhatsApp numbers, Instagram
accounts and Facebook pages.

Operational channels:

- WhatsApp: official Cloud API adapter `meta-whatsapp`.
- Instagram Direct: official Meta messaging adapter `meta-instagram`.
- Facebook Messenger: official Meta messaging adapter `meta-messenger`.
- n8n fallback: `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL` for explicitly
  intermediated routes.

Secrets stay server-side. Portal and Admin screens show only safe references,
health states and sanitized audit events.
```

- [ ] **Step 2: Update Admin YUX Hub documentation**

Add to `docs/admin-yux-hub.md`:

```md
## Canais Conectados

`/admin/channels` centraliza a governanca de canais Meta por cliente. O Admin
YUX ve cliente, canal, ativo conectado, status, token state, webhook state,
ultimo evento, ultima checagem, erros protegidos e auditoria.

Clientes conectam canais no portal. A YUX pode pausar, revisar, desconectar e
acompanhar reautenticacao sem acessar tokens reais.
```

- [ ] **Step 3: Update implementation status**

Add an implementation table row to `docs/implementation-status.md`:

```md
| Meta channel connectors | Implemented in repo | `/portal/omnichannel/channels`, `/admin/channels` | `meta_channel_connectors` migration, Meta Edge Functions, `metaChannelService`, connected-channel workspaces | Requires Meta App configuration, App Review permissions, runtime secrets and authenticated production QA. |
```

Add pending operational work:

```md
- configure Meta App IDs, Embedded Signup config, App Review permissions and runtime secrets;
- deploy Meta channel Edge Functions;
- validate WhatsApp Embedded Signup, Instagram Direct and Messenger with development-mode test assets before production.
```

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/omnichannel-ai-operations.md docs/admin-yux-hub.md docs/implementation-status.md
git commit -m "docs: document meta channel connectors"
```

---

### Task 11: Final Verification And Remote Migration

**Files:**
- No new files unless verification reveals a scoped fix.

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
cd frontend
npm test -- src/lib/meta/metaChannelRules.test.ts src/services/metaChannelService.test.ts src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx src/components/platform/admin/AdminChannelsTable.test.tsx src/lib/platform/navigation.test.ts
```

Expected: pass.

- [ ] **Step 2: Run Edge Function checks**

Run:

```bash
deno test supabase/functions/_shared/metaChannel.test.ts
deno check supabase/functions/start-meta-channel-connect/index.ts
deno check supabase/functions/complete-meta-channel-connect/index.ts
deno check supabase/functions/list-meta-channel-assets/index.ts
deno check supabase/functions/disconnect-meta-channel/index.ts
deno check supabase/functions/refresh-meta-channel-health/index.ts
deno check supabase/functions/send-meta-channel-test/index.ts
deno check supabase/functions/receive-channel-event/index.ts
deno check supabase/functions/dispatch-outbound-message/index.ts
```

Expected: pass.

- [ ] **Step 3: Run repo-level checks**

Run:

```bash
cd frontend
npm run type-check
npm run build
```

Expected: pass when unrelated automations type errors are resolved. If existing automations errors still block repo-level checks, record exact files and keep the Meta connector focused test evidence.

- [ ] **Step 4: Apply migration remotely**

Use Supabase MCP or CLI against the target `portal-yux` project. Apply the generated `meta_channel_connectors` migration only after local review.

Expected migration history contains a remote row named `meta_channel_connectors`.

- [ ] **Step 5: Deploy functions**

Run or execute equivalent deploy process:

```bash
supabase functions deploy start-meta-channel-connect
supabase functions deploy complete-meta-channel-connect
supabase functions deploy list-meta-channel-assets
supabase functions deploy disconnect-meta-channel
supabase functions deploy refresh-meta-channel-health
supabase functions deploy send-meta-channel-test
supabase functions deploy receive-channel-event --no-verify-jwt
supabase functions deploy dispatch-outbound-message
```

Expected: all functions deploy successfully.

- [ ] **Step 6: Start local server and smoke routes**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Smoke:

```bash
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/portal/omnichannel/channels
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/admin/channels
```

Expected: HTTP 200 for both routes.

- [ ] **Step 7: Browser verification**

Open:

- `/portal/omnichannel/channels`;
- `/admin/channels`;
- `/omnichannel`.

Verify:

- no blank screen;
- no console errors from missing imports;
- channel cards fit on desktop and mobile;
- admin table is readable;
- disabled actions are clear;
- no token values are rendered.

- [ ] **Step 8: Commit verification fixes only if needed**

If verification reveals a scoped issue:

```bash
git add <specific files>
git commit -m "fix: finalize meta channel connector verification"
```

If no correction is needed, do not create a commit.

---

## Execution Notes

- The implementation must keep official Meta API as the default path.
- The n8n outbound fallback remains available only when `fallback_mode = 'n8n'` or an adapter is not official.
- The frontend must not receive raw access tokens, app secrets or webhook secrets.
- Customer portal actions must be scoped by membership, active contract and `whatsapp_ai`/omnichannel access.
- Admin YUX can govern all clients but still cannot see raw secrets.
- If Meta official docs differ from assumptions in this plan, update the helper functions and docs before implementing the affected task.

## Self-Review

- Spec coverage: all approved items are mapped to tasks: WhatsApp Embedded Signup, WhatsApp number management, Instagram Direct, Facebook Messenger, portal page, Admin YUX page, health, reauth, disconnect and audit.
- Ambiguity scan: no task relies on unspecified behavior; implementation snippets use concrete functions, fields and commands.
- Type consistency: plan uses `messenger`, `ConnectedChannelState`, `MetaChannel`, `fallback_mode`, `health_status`, `token_state` and `provider_verify_state` consistently across schema, service and UI.
