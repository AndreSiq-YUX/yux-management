# YUX Marketing Studio Phase 9: Native Meta And Google Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current provider stubs with real multi-tenant Meta and Google integrations for approved organic/local publishing and approved paid campaign activation.

**Architecture:** Split phase 9 into two independently testable slices: 9A handles organic/local publishing through `publishing_connections` and `publishing_runs`; 9B handles paid media through `ad_provider_connections`, `ad_accounts`, `ad_provider_mutation_runs`, and campaign tables. Store raw OAuth tokens only in an encrypted service-role-only Supabase table; operational tables keep only token references, status, scopes, external asset ids, sanitized metadata, and protected errors. The current Supabase Data API config exposes only `public` and `graphql_public`, so provider OAuth/session tables live in `public` with RLS and grants tuned per table instead of using an unexposed `private` schema.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres/RLS, Supabase Edge Functions with Deno, Meta Graph API, Meta Marketing API, Google OAuth 2.0, Google Business Profile API, Google Ads API REST.

---

## Current Repo Findings

- `supabase/functions/_shared/adsProvider.ts` is a provider stub. With no token it returns `local_contract_only`; with token it returns `provider_adapter_stub`.
- `supabase/functions/execute-ad-provider-mutation/index.ts` records mutation runs and calls the stub adapter, but does not create real Meta/Google campaigns.
- `supabase/functions/connect-ads-provider/index.ts` accepts manual token input and stores only a token hash/reference. It is not a full OAuth flow and cannot refresh tokens.
- `supabase/functions/start-meta-channel-connect` and `complete-meta-channel-connect` implement a partial Meta channel OAuth flow for WhatsApp/Instagram Direct/Messenger. They are useful patterns but not sufficient for organic publishing or Ads activation because token persistence is still only represented as a reference.
- `supabase/functions/execute-wordpress-publishing/index.ts` is real WordPress publishing. It should remain compatible while a new generic publishing executor expands providers.
- `frontend/src/services/marketingStudioService.ts` already manages `publishing_connections` and `publishing_runs`.
- `frontend/src/services/campaignService.ts` already manages campaign drafts and provider mutation rows.

## Official API References To Recheck During Implementation

- Google Business Profile Local Posts: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create`
- Google Ads campaign creation: `https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns`
- Meta Instagram Content Publishing: `https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing`
- Meta Page feed publishing: `https://developers.facebook.com/docs/graph-api/reference/page/feed`
- Meta Marketing API campaigns: `https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns`

Use these docs during execution to verify current scopes, Graph version, endpoint paths, request bodies, and permission review requirements. If a provider rejects a permission, set the connection to `needs_reauth` or `failed` with sanitized `protected_error`; do not degrade to a fake success.

## File Structure

### New Shared Edge Modules

- Create `supabase/functions/_shared/providerSecrets.ts`
  - Encrypt/decrypt per-client OAuth tokens with AES-GCM using `PROVIDER_SECRET_ENCRYPTION_KEY_B64`.
  - Insert/read rows in `public.provider_integration_secrets` through a service-role client only.
  - Never return raw secrets in API responses.

- Create `supabase/functions/_shared/providerOAuth.ts`
  - Build provider OAuth URLs.
  - Exchange authorization codes.
  - Refresh Google access tokens.
  - Refresh Meta long-lived tokens when supported by current Graph API behavior.
  - Normalize OAuth errors into `connected`, `needs_reauth`, `stale`, or `failed`.

- Create `supabase/functions/_shared/socialPublishingProvider.ts`
  - Execute WordPress, Facebook Page, Instagram Business, and Google Business Profile publish actions.
  - Build provider-specific request payloads from `content_items`, `publishing_connections`, and `publishing_runs`.

- Modify `supabase/functions/_shared/adsProvider.ts`
  - Replace stub execution with real Meta Ads and Google Ads REST adapters.
  - Preserve existing sanitization and idempotency helpers.

### New Edge Functions

- Create `supabase/functions/start-marketing-provider-connect/index.ts`
  - Starts OAuth for `meta_social`, `google_business_profile`, `meta_ads`, and `google_ads`.

- Create `supabase/functions/complete-marketing-provider-connect/index.ts`
  - Exchanges OAuth code, stores encrypted tokens, upserts `publishing_connections` or `ad_provider_connections`, and lists selectable assets/accounts.

- Create `supabase/functions/list-marketing-provider-assets/index.ts`
  - Lists Facebook Pages, Instagram Business accounts, Google Business Profile accounts/locations, Meta ad accounts, or Google Ads accessible customers from stored credentials.

- Create `supabase/functions/execute-marketing-publishing/index.ts`
  - Generic executor for `publishing_runs`.
  - Keeps `execute-wordpress-publishing` as a compatibility wrapper or leaves it in place while frontend moves to the generic function.

### Existing Edge Functions To Modify

- Modify `supabase/functions/execute-ad-provider-mutation/index.ts`
  - Load real provider credentials through `providerSecrets.ts`.
  - Require approved campaigns before live provider mutation.
  - Update local campaign/ad/ad set/creative rows with external ids.

- Modify `supabase/functions/sync-ad-metrics/index.ts`
  - Query real provider metrics where credentials exist.
  - Store `campaign_metric_snapshots`.
  - Set connection status to `needs_reauth` on OAuth/token failures.

### Database

- Create migration with `supabase migration new marketing_studio_native_integrations`.
- Create probe with the same timestamp in `supabase/probes/`.
- Modify these public tables:
  - `publishing_connections`
  - `publishing_runs`
  - `ad_provider_connections`
  - `ad_accounts`
  - `ad_provider_mutation_runs`
  - `campaigns`
  - `campaign_ad_sets`
  - `campaign_ads`
  - `campaign_creatives`
- Create provider auth tables:
  - `public.provider_oauth_sessions` with RLS for users allowed to configure Marketing Studio integrations.
  - `public.provider_integration_secrets` with RLS enabled, no grants to `anon`/`authenticated`, and access through service-role Edge Functions only.

### Frontend

- Modify `frontend/src/types/marketingStudio.ts`
- Modify `frontend/src/types/campaign.ts`
- Modify `frontend/src/services/marketingStudioService.ts`
- Modify `frontend/src/services/campaignService.ts`
- Modify `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Modify `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`
- Modify `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
- Modify `frontend/src/components/campaigns/CampaignsWorkspace.test.tsx`
- Modify or create a focused connector panel under `frontend/src/components/marketing-studio/`

### Docs

- Modify `docs/implementation-status.md`
- Modify `docs/admin-yux-hub.md`
- Add deployment notes to `docs/commercial-mvp-operations.md`

---

## Task 0: Preflight, Docs, And Remote Baseline

**Files:**
- Read: `docs/yux-marketing-studio-agentes.md`
- Read: `docs/implementation-status.md`
- Read: `supabase/migrations/20260607150115_marketing_studio_wordpress_publishing.sql`
- Read: `supabase/migrations/20260605155123_campaigns_ads_api_core.sql`
- Read: `supabase/functions/_shared/adsProvider.ts`
- Read: `supabase/functions/execute-wordpress-publishing/index.ts`

- [x] **Step 1: Confirm clean task boundary**

Run:

```powershell
git status --short
```

Expected:

```text
 M frontend/src/components/ai-assistant/AssistantSettingsPanel.tsx
 M frontend/src/components/omnichannel/ConversationComposer.tsx
 M frontend/src/components/omnichannel/ConversationDetails.tsx
 M frontend/src/components/omnichannel/ConversationList.tsx
 M frontend/src/components/omnichannel/OmnichannelAdminTabs.tsx
 M frontend/src/components/omnichannel/OmnichannelWorkspace.tsx
 M frontend/src/components/omnichannel/PortalOmnichannelWorkspace.tsx
?? docs/superpowers/plans/2026-06-05-yux-marketing-studio-foundation.md
?? docs/yux-marketing-studio-agentes.md
```

Do not stage or revert those unrelated existing changes.

- [x] **Step 2: Recheck provider docs**

Use official provider docs before editing provider adapters:

```text
Meta Instagram Content Publishing:
https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing

Meta Page feed publishing:
https://developers.facebook.com/docs/graph-api/reference/page/feed

Meta Marketing API campaigns:
https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns

Google Business Profile Local Posts:
https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create

Google Ads campaign creation:
https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns
```

Expected:

```text
Record any required scope/endpoint changes directly in the adapter tests before implementing adapters.
```

- [x] **Step 3: Confirm Supabase remote migration history**

Use Supabase MCP `_list_migrations` for project `uuowkncimiydpbxqpkej`.

Expected:

```text
Remote history contains:
- 20260607150115 marketing_studio_wordpress_publishing
- 20260607152544 marketing_studio_campaign_creatives
```

If the remote timestamp differs from the local migration created in this phase, rename local migration/probe files to match the remote timestamp after applying.

---

## Task 1: Pure Domain Rules And Types For Native Integrations

**Files:**
- Modify: `frontend/src/types/marketingStudio.ts`
- Modify: `frontend/src/types/campaign.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`
- Modify: `frontend/src/lib/campaigns/campaignRules.ts`
- Modify: `frontend/src/lib/campaigns/campaignRules.test.ts`

- [x] **Step 1: Write failing tests for publishing safety**

Add to `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`:

```ts
it('requires approved content and connected provider before native publishing', () => {
  expect(canExecuteNativePublishingRun({
    provider: 'meta_instagram',
    contentStatus: 'draft',
    connectionStatus: 'connected',
    action: 'publish',
  })).toEqual({ ok: false, reason: 'content_must_be_approved' })

  expect(canExecuteNativePublishingRun({
    provider: 'google_business_profile',
    contentStatus: 'approved',
    connectionStatus: 'needs_reauth',
    action: 'publish',
  })).toEqual({ ok: false, reason: 'provider_needs_reauth' })

  expect(canExecuteNativePublishingRun({
    provider: 'meta_facebook',
    contentStatus: 'approved',
    connectionStatus: 'connected',
    action: 'publish',
  })).toEqual({ ok: true })
})

it('builds stable native publishing idempotency keys', () => {
  expect(buildNativePublishingIdempotencyKey({
    connectionId: 'connection-1',
    contentItemId: 'content-1',
    action: 'publish',
    provider: 'meta_facebook',
  })).toBe('meta_facebook:connection-1:content-1:publish')
})
```

- [x] **Step 2: Write failing tests for paid campaign safety**

Add to `frontend/src/lib/campaigns/campaignRules.test.ts`:

```ts
it('requires approved campaign before native provider activation', () => {
  expect(canExecuteProviderMutation({
    lifecycleStatus: 'draft',
    providerStatus: 'connected',
    action: 'create_campaign',
    explicitApproval: true,
  })).toEqual({ ok: false, reason: 'campaign_must_be_approved' })

  expect(canExecuteProviderMutation({
    lifecycleStatus: 'approved',
    providerStatus: 'needs_reauth',
    action: 'create_campaign',
    explicitApproval: true,
  })).toEqual({ ok: false, reason: 'provider_needs_reauth' })

  expect(canExecuteProviderMutation({
    lifecycleStatus: 'approved',
    providerStatus: 'connected',
    action: 'create_campaign',
    explicitApproval: false,
  })).toEqual({ ok: false, reason: 'explicit_approval_required' })

  expect(canExecuteProviderMutation({
    lifecycleStatus: 'approved',
    providerStatus: 'connected',
    action: 'create_campaign',
    explicitApproval: true,
  })).toEqual({ ok: true })
})
```

- [x] **Step 3: Run tests and verify failure**

Run from `frontend/`:

```powershell
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts src/lib/campaigns/campaignRules.test.ts
```

Expected:

```text
FAIL because canExecuteNativePublishingRun, buildNativePublishingIdempotencyKey, and canExecuteProviderMutation are not implemented.
```

- [x] **Step 4: Add types**

In `frontend/src/types/marketingStudio.ts`, extend provider/action/status types:

```ts
export type MarketingPublishingProvider =
  | 'wordpress'
  | 'meta_facebook'
  | 'meta_instagram'
  | 'google_business_profile'

export type MarketingPublishingConnectionStatus =
  | 'connected'
  | 'stale'
  | 'needs_reauth'
  | 'failed'
  | 'disabled'

export type MarketingPublishingAction =
  | 'create_draft'
  | 'update_draft'
  | 'publish'

export interface MarketingProviderAsset {
  id: string
  provider: MarketingPublishingProvider | 'meta_ads' | 'google_ads'
  externalId: string
  name: string
  parentExternalId?: string
  status?: string
  metadata: Record<string, unknown>
}
```

In `frontend/src/types/campaign.ts`, extend connection/account metadata:

```ts
export interface AdProviderConnection {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  provider: AdProviderKey
  name: string
  status: ProviderConnectionStatus
  providerAccountId?: string
  tokenReferenceConfigured?: boolean
  lastSyncAt?: string
  createdAt: string
  updatedAt: string
}
```

- [x] **Step 5: Implement Marketing Studio rules**

Add to `frontend/src/lib/marketing-studio/marketingStudioRules.ts`:

```ts
import type {
  MarketingContentStatus,
  MarketingPublishingAction,
  MarketingPublishingConnectionStatus,
  MarketingPublishingProvider,
} from '@/types/marketingStudio'

type NativePublishGuardInput = {
  provider: MarketingPublishingProvider
  contentStatus: MarketingContentStatus
  connectionStatus: MarketingPublishingConnectionStatus
  action: MarketingPublishingAction
}

export type NativePublishGuardResult =
  | { ok: true }
  | { ok: false; reason: 'content_must_be_approved' | 'provider_needs_reauth' | 'provider_not_connected' }

export function canExecuteNativePublishingRun(input: NativePublishGuardInput): NativePublishGuardResult {
  if (input.action === 'publish' && !['approved', 'scheduled'].includes(input.contentStatus)) {
    return { ok: false, reason: 'content_must_be_approved' }
  }
  if (input.connectionStatus === 'needs_reauth') return { ok: false, reason: 'provider_needs_reauth' }
  if (!['connected', 'stale'].includes(input.connectionStatus)) return { ok: false, reason: 'provider_not_connected' }
  return { ok: true }
}

export function buildNativePublishingIdempotencyKey(input: {
  provider: MarketingPublishingProvider
  connectionId: string
  contentItemId: string
  action: MarketingPublishingAction
}) {
  return `${input.provider}:${input.connectionId}:${input.contentItemId}:${input.action}`
}
```

- [x] **Step 6: Implement campaign mutation rules**

Add to `frontend/src/lib/campaigns/campaignRules.ts`:

```ts
import type { CampaignLifecycleStatus, ProviderConnectionStatus, ProviderMutationAction } from '@/types/campaign'

type ProviderMutationGuardInput = {
  lifecycleStatus: CampaignLifecycleStatus
  providerStatus: ProviderConnectionStatus
  action: ProviderMutationAction
  explicitApproval?: boolean
}

export type ProviderMutationGuardResult =
  | { ok: true }
  | { ok: false; reason: 'campaign_must_be_approved' | 'provider_needs_reauth' | 'provider_not_connected' | 'explicit_approval_required' }

export function canExecuteProviderMutation(input: ProviderMutationGuardInput): ProviderMutationGuardResult {
  if (['create_campaign', 'update_budget'].includes(input.action) && input.lifecycleStatus !== 'approved') {
    return { ok: false, reason: 'campaign_must_be_approved' }
  }
  if (input.providerStatus === 'needs_reauth') return { ok: false, reason: 'provider_needs_reauth' }
  if (!['connected', 'stale'].includes(input.providerStatus)) return { ok: false, reason: 'provider_not_connected' }
  if (['create_campaign', 'update_budget'].includes(input.action) && !input.explicitApproval) {
    return { ok: false, reason: 'explicit_approval_required' }
  }
  return { ok: true }
}
```

- [x] **Step 7: Run tests**

Run from `frontend/`:

```powershell
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts src/lib/campaigns/campaignRules.test.ts
```

Expected:

```text
PASS for both focused rule suites.
```

- [x] **Step 8: Commit**

Run:

```powershell
git add frontend/src/types/marketingStudio.ts frontend/src/types/campaign.ts frontend/src/lib/marketing-studio/marketingStudioRules.ts frontend/src/lib/marketing-studio/marketingStudioRules.test.ts frontend/src/lib/campaigns/campaignRules.ts frontend/src/lib/campaigns/campaignRules.test.ts
git commit -m "feat: add native marketing integration guards"
```

---

## Task 2: Supabase Schema For OAuth Tokens, Provider Assets, And Native Runs

**Files:**
- Create: `supabase/migrations/<timestamp>_marketing_studio_native_integrations.sql`
- Create: `supabase/probes/<timestamp>_marketing_studio_native_integrations.sql`

- [x] **Step 1: Create migration**

Run:

```powershell
supabase migration new marketing_studio_native_integrations
```

Expected:

```text
Created new migration under supabase/migrations.
```

- [x] **Step 2: Add provider OAuth and service-role-only secret tables**

Add this SQL to the migration:

```sql
CREATE TABLE IF NOT EXISTS public.provider_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed','expired')),
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  redirect_uri TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_integration_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads','wordpress')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  connection_table TEXT NOT NULL CHECK (connection_table IN ('publishing_connections','ad_provider_connections','channel_connections')),
  connection_id UUID NOT NULL,
  secret_kind TEXT NOT NULL CHECK (secret_kind IN ('access_token','refresh_token','client_secret','application_password')),
  reference TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL CHECK (BTRIM(ciphertext) <> ''),
  nonce TEXT NOT NULL CHECK (BTRIM(nonce) <> ''),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_integration_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.provider_oauth_sessions FROM PUBLIC;
REVOKE ALL ON public.provider_integration_secrets FROM PUBLIC;
REVOKE ALL ON public.provider_integration_secrets FROM anon;
REVOKE ALL ON public.provider_integration_secrets FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.provider_oauth_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_oauth_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_integration_secrets TO service_role;
```

- [x] **Step 3: Extend publishing connections**

Add this SQL:

```sql
ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_provider_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_provider_check
  CHECK (provider IN ('wordpress','meta_facebook','meta_instagram','google_business_profile'));

ALTER TABLE public.publishing_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_asset_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_parent_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_status_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_status_check
  CHECK (status IN ('connected','stale','needs_reauth','failed','disabled'));

CREATE INDEX IF NOT EXISTS idx_publishing_connections_provider_asset
  ON public.publishing_connections(provider, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;
```

- [x] **Step 4: Extend publishing runs**

Add this SQL:

```sql
ALTER TABLE public.publishing_runs
  ADD COLUMN IF NOT EXISTS external_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS external_parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_publishing_runs_provider_post
  ON public.publishing_runs(provider_post_id)
  WHERE provider_post_id IS NOT NULL;
```

- [x] **Step 5: Extend paid provider connections and accounts**

Add this SQL:

```sql
ALTER TABLE public.ad_provider_connections
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS time_zone TEXT,
  ADD COLUMN IF NOT EXISTS can_manage_campaigns BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ad_provider_connections_contract
  ON public.ad_provider_connections(contract_id, provider, status)
  WHERE contract_id IS NOT NULL;
```

- [x] **Step 6: Extend provider mutation runs**

Add this SQL:

```sql
ALTER TABLE public.ad_provider_mutation_runs
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
```

- [x] **Step 7: Add probe**

Create `supabase/probes/<timestamp>_marketing_studio_native_integrations.sql`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'private'
      AND table_name = 'provider_integration_secrets'
  ) THEN
    RAISE EXCEPTION 'Missing public.provider_integration_secrets';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('publishing_connections','ad_provider_connections')
      AND column_name IN ('access_token','refresh_token','client_secret','raw_token')
  ) THEN
    RAISE EXCEPTION 'Public provider connection tables must not expose raw token columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publishing_connections'
      AND column_name = 'provider_asset_id'
  ) THEN
    RAISE EXCEPTION 'publishing_connections.provider_asset_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ad_provider_connections'
      AND column_name = 'contract_id'
  ) THEN
    RAISE EXCEPTION 'ad_provider_connections.contract_id missing';
  END IF;
END $$;
```

- [x] **Step 8: Apply migration remotely**

Use Supabase MCP `_apply_migration` with project `uuowkncimiydpbxqpkej`, name `marketing_studio_native_integrations`, and the migration SQL.

Expected:

```text
success: true
```

- [x] **Step 9: Reconcile local timestamp and run probe**

Use Supabase MCP `_list_migrations` and rename local migration/probe if the remote timestamp differs.

Run probe through Supabase MCP `_execute_sql`.

Expected:

```text
Probe returns [] with no exceptions.
```

- [x] **Step 10: Commit**

Run:

```powershell
git add supabase/migrations/<remote_timestamp>_marketing_studio_native_integrations.sql supabase/probes/<remote_timestamp>_marketing_studio_native_integrations.sql
git commit -m "feat: add native marketing integration schema"
```

---

## Task 3: Shared Encrypted Provider Secret Store

**Files:**
- Create: `supabase/functions/_shared/providerSecrets.ts`
- Create: `supabase/functions/_shared/providerSecrets.test.ts`

- [x] **Step 1: Write tests**

Create `supabase/functions/_shared/providerSecrets.test.ts`:

```ts
import { assertEquals, assertRejects } from 'jsr:@std/assert'
import {
  decryptProviderSecretValue,
  encryptProviderSecretValue,
  getProviderSecretReference,
  requireEncryptionKey,
} from './providerSecrets.ts'

Deno.test('encrypts and decrypts provider secrets without returning plaintext metadata', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32))
  const encrypted = await encryptProviderSecretValue('access-token-value', key)
  assertEquals(typeof encrypted.ciphertext, 'string')
  assertEquals(typeof encrypted.nonce, 'string')
  const decrypted = await decryptProviderSecretValue(encrypted, key)
  assertEquals(decrypted, 'access-token-value')
})

Deno.test('builds stable non-secret references', () => {
  assertEquals(
    getProviderSecretReference({
      provider: 'meta_social',
      targetKind: 'publishing',
      connectionId: 'connection-1',
      secretKind: 'access_token',
    }),
    'meta_social:publishing:connection-1:access_token',
  )
})

Deno.test('requires a 32-byte base64 encryption key', async () => {
  await assertRejects(
    () => Promise.resolve(requireEncryptionKey('short')),
    Error,
    'provider_secret_encryption_key_invalid',
  )
})
```

- [x] **Step 2: Run tests and verify failure**

Run:

```powershell
deno test supabase/functions/_shared/providerSecrets.test.ts
```

Expected:

```text
FAIL because providerSecrets.ts does not exist.
```

- [x] **Step 3: Implement providerSecrets.ts**

Create `supabase/functions/_shared/providerSecrets.ts`:

```ts
type SecretProvider = 'meta_social' | 'google_business_profile' | 'meta_ads' | 'google_ads' | 'wordpress'
type SecretTargetKind = 'publishing' | 'ads'
type SecretKind = 'access_token' | 'refresh_token' | 'client_secret' | 'application_password'

export interface EncryptedProviderSecret {
  ciphertext: string
  nonce: string
}

export function requireEncryptionKey(value = Deno.env.get('PROVIDER_SECRET_ENCRYPTION_KEY_B64') || '') {
  try {
    const decoded = Uint8Array.from(atob(value), char => char.charCodeAt(0))
    if (decoded.length !== 32) throw new Error('invalid length')
    return decoded
  } catch {
    throw new Error('provider_secret_encryption_key_invalid')
  }
}

async function importAesKey(rawKey: Uint8Array) {
  return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptProviderSecretValue(value: string, rawKey = requireEncryptionKey()): Promise<EncryptedProviderSecret> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey(rawKey)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...nonce)),
  }
}

export async function decryptProviderSecretValue(secret: EncryptedProviderSecret, rawKey = requireEncryptionKey()) {
  const key = await importAesKey(rawKey)
  const nonce = Uint8Array.from(atob(secret.nonce), char => char.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(secret.ciphertext), char => char.charCodeAt(0))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

export function getProviderSecretReference(input: {
  provider: SecretProvider
  targetKind: SecretTargetKind
  connectionId: string
  secretKind: SecretKind
}) {
  return `${input.provider}:${input.targetKind}:${input.connectionId}:${input.secretKind}`
}

export async function storeProviderSecret(admin: any, input: {
  organizationId: string
  clientId?: string | null
  contractId?: string | null
  provider: SecretProvider
  targetKind: SecretTargetKind
  connectionTable: 'publishing_connections' | 'ad_provider_connections' | 'channel_connections'
  connectionId: string
  secretKind: SecretKind
  value: string
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}) {
  const encrypted = await encryptProviderSecretValue(input.value)
  const reference = getProviderSecretReference(input)
  const { data, error } = await admin.from('provider_integration_secrets').upsert({
    organization_id: input.organizationId,
    client_id: input.clientId || null,
    contract_id: input.contractId || null,
    provider: input.provider,
    target_kind: input.targetKind,
    connection_table: input.connectionTable,
    connection_id: input.connectionId,
    secret_kind: input.secretKind,
    reference,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    expires_at: input.expiresAt || null,
    metadata: input.metadata || {},
  }, { onConflict: 'reference' }).select('reference, expires_at').single()
  if (error) throw error
  return data
}

export async function loadProviderSecret(admin: any, reference: string) {
  const { data, error } = await admin
    .from('provider_integration_secrets')
    .select('ciphertext, nonce, expires_at, metadata')
    .eq('reference', reference)
    .single()
  if (error) throw error
  return decryptProviderSecretValue({ ciphertext: data.ciphertext, nonce: data.nonce })
}
```

- [x] **Step 4: Run tests**

Run:

```powershell
deno test supabase/functions/_shared/providerSecrets.test.ts
```

Expected:

```text
3 tests pass.
```

- [x] **Step 5: Commit**

Run:

```powershell
git add supabase/functions/_shared/providerSecrets.ts supabase/functions/_shared/providerSecrets.test.ts
git commit -m "feat: add encrypted provider secret store"
```

---

## Task 4: Generic OAuth Connect Flow For Marketing Providers

**Files:**
- Create: `supabase/functions/_shared/providerOAuth.ts`
- Create: `supabase/functions/_shared/providerOAuth.test.ts`
- Create: `supabase/functions/start-marketing-provider-connect/index.ts`
- Create: `supabase/functions/complete-marketing-provider-connect/index.ts`
- Create: `supabase/functions/list-marketing-provider-assets/index.ts`
- Add: matching `deno.json` files for the three new functions

- [x] **Step 1: Write providerOAuth tests**

Create `supabase/functions/_shared/providerOAuth.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
import {
  buildMarketingProviderOAuthUrl,
  normalizeOAuthFailureStatus,
  scopesForMarketingProvider,
} from './providerOAuth.ts'

Deno.test('builds Meta social OAuth URL with publishing scopes', () => {
  const url = buildMarketingProviderOAuthUrl({
    provider: 'meta_social',
    state: 'state-1',
    redirectUri: 'https://example.com/callback',
    clientId: 'meta-app',
    graphVersion: 'v20.0',
  })
  assertStringIncludes(url, 'https://www.facebook.com/v20.0/dialog/oauth')
  assertStringIncludes(decodeURIComponent(url), 'pages_manage_posts')
  assertStringIncludes(decodeURIComponent(url), 'instagram_content_publish')
})

Deno.test('builds Google Business Profile OAuth URL', () => {
  const url = buildMarketingProviderOAuthUrl({
    provider: 'google_business_profile',
    state: 'state-1',
    redirectUri: 'https://example.com/callback',
    clientId: 'google-client',
  })
  assertStringIncludes(url, 'https://accounts.google.com/o/oauth2/v2/auth')
  assertStringIncludes(decodeURIComponent(url), 'https://www.googleapis.com/auth/business.manage')
})

Deno.test('maps OAuth failures to operational states', () => {
  assertEquals(normalizeOAuthFailureStatus(401, { error: 'invalid_grant' }), 'needs_reauth')
  assertEquals(normalizeOAuthFailureStatus(403, { error: 'insufficient_permissions' }), 'needs_reauth')
  assertEquals(normalizeOAuthFailureStatus(500, { error: 'provider_down' }), 'failed')
})

Deno.test('returns exact scopes by provider', () => {
  assertEquals(scopesForMarketingProvider('google_ads'), ['https://www.googleapis.com/auth/adwords'])
})
```

- [x] **Step 2: Run tests and verify failure**

Run:

```powershell
deno test supabase/functions/_shared/providerOAuth.test.ts
```

Expected:

```text
FAIL because providerOAuth.ts does not exist.
```

- [x] **Step 3: Implement providerOAuth.ts**

Create `supabase/functions/_shared/providerOAuth.ts`:

```ts
export type MarketingOAuthProvider = 'meta_social' | 'google_business_profile' | 'meta_ads' | 'google_ads'

export function scopesForMarketingProvider(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social') {
    return ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish']
  }
  if (provider === 'meta_ads') {
    return ['ads_management', 'ads_read', 'business_management']
  }
  if (provider === 'google_business_profile') {
    return ['https://www.googleapis.com/auth/business.manage']
  }
  return ['https://www.googleapis.com/auth/adwords']
}

export function buildMarketingProviderOAuthUrl(input: {
  provider: MarketingOAuthProvider
  state: string
  redirectUri: string
  clientId: string
  graphVersion?: string
}) {
  if (input.provider === 'meta_social' || input.provider === 'meta_ads') {
    const url = new URL(`https://www.facebook.com/${input.graphVersion || 'v20.0'}/dialog/oauth`)
    url.searchParams.set('client_id', input.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('state', input.state)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scopesForMarketingProvider(input.provider).join(','))
    return url.toString()
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', scopesForMarketingProvider(input.provider).join(' '))
  return url.toString()
}

export function normalizeOAuthFailureStatus(status: number, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload).toLowerCase()
  if (status === 401 || status === 403) return 'needs_reauth' as const
  if (text.includes('invalid_grant') || text.includes('revoked') || text.includes('reauth')) return 'needs_reauth' as const
  return 'failed' as const
}
```

- [x] **Step 4: Implement start function**

Create `supabase/functions/start-marketing-provider-connect/index.ts`:

```ts
import { corsHeaders, getUserClient, hashToken, json } from '../_shared/edge.ts'
import { buildMarketingProviderOAuthUrl, scopesForMarketingProvider, type MarketingOAuthProvider } from '../_shared/providerOAuth.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const provider = requireProvider(body.provider)
    const targetKind = requireTargetKind(body.targetKind)
    const organizationId = requireString(body.organizationId, 'organizationId')
    const state = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const redirectUri = requireRedirectUri(provider)
    const clientId = requireClientId(provider)
    const userClient = getUserClient(authorization)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { error } = await userClient.from('provider_oauth_sessions').insert({
      organization_id: organizationId,
      client_id: optionalString(body.clientId) || null,
      contract_id: optionalString(body.contractId) || null,
      user_id: user.id,
      provider,
      target_kind: targetKind,
      state_hash: await hashToken(state),
      requested_scopes: scopesForMarketingProvider(provider),
      redirect_uri: redirectUri,
      expires_at: expiresAt,
    })
    if (error) throw error

    return json({
      provider,
      targetKind,
      state,
      authUrl: buildMarketingProviderOAuthUrl({
        provider,
        state,
        redirectUri,
        clientId,
        graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
      }),
      expiresAt,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'marketing_provider_connect_start_failed' }, 400)
  }
})

function requireProvider(value: unknown): MarketingOAuthProvider {
  if (value === 'meta_social' || value === 'google_business_profile' || value === 'meta_ads' || value === 'google_ads') return value
  throw new Error('unsupported_marketing_provider')
}

function requireTargetKind(value: unknown) {
  if (value === 'publishing' || value === 'ads') return value
  throw new Error('unsupported_target_kind')
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireClientId(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') return requireString(Deno.env.get('META_APP_ID'), 'META_APP_ID')
  return requireString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'), 'GOOGLE_OAUTH_CLIENT_ID')
}

function requireRedirectUri(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') return requireString(Deno.env.get('META_MARKETING_OAUTH_REDIRECT_URI'), 'META_MARKETING_OAUTH_REDIRECT_URI')
  return requireString(Deno.env.get('GOOGLE_MARKETING_OAUTH_REDIRECT_URI'), 'GOOGLE_MARKETING_OAUTH_REDIRECT_URI')
}
```

- [x] **Step 5: Implement complete/list functions**

Create `complete-marketing-provider-connect` to:

```text
1. Validate auth user.
2. Validate state against `public.provider_oauth_sessions`.
3. Exchange code with Meta or Google.
4. Create or update publishing_connections for meta_facebook, meta_instagram, google_business_profile when targetKind is publishing.
5. Create or update ad_provider_connections and ad_accounts when targetKind is ads.
6. Store access_token and refresh_token through storeProviderSecret.
7. Store only token_reference, provider scopes, status, asset ids and sanitized metadata in public tables.
```

Create `list-marketing-provider-assets` to:

```text
1. Load stored token from providerSecrets.
2. For meta_social, list Pages and Instagram Business accounts available through /me/accounts and related IG business account fields.
3. For google_business_profile, list accounts and locations with business.manage scope.
4. For meta_ads, list ad accounts.
5. For google_ads, list accessible customers.
6. Return only id, provider, externalId, name, parentExternalId, status and sanitized metadata.
```

- [x] **Step 6: Run Edge tests**

Run:

```powershell
deno test supabase/functions/_shared/providerOAuth.test.ts supabase/functions/_shared/providerSecrets.test.ts
```

Expected:

```text
All provider OAuth/secret tests pass.
```

- [x] **Step 7: Commit**

Run:

```powershell
git add supabase/functions/_shared/providerOAuth.ts supabase/functions/_shared/providerOAuth.test.ts supabase/functions/start-marketing-provider-connect supabase/functions/complete-marketing-provider-connect supabase/functions/list-marketing-provider-assets
git commit -m "feat: add marketing provider oauth flow"
```

---

## Task 5: Slice 9A Organic And Local Publishing Adapters

**Files:**
- Create: `supabase/functions/_shared/socialPublishingProvider.ts`
- Create: `supabase/functions/_shared/socialPublishingProvider.test.ts`
- Create: `supabase/functions/execute-marketing-publishing/index.ts`
- Create: `supabase/functions/execute-marketing-publishing/deno.json`
- Modify: `supabase/functions/execute-wordpress-publishing/index.ts` only if a compatibility wrapper is required

- [x] **Step 1: Write socialPublishingProvider tests**

Create `supabase/functions/_shared/socialPublishingProvider.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
import {
  buildFacebookPagePostRequest,
  buildGoogleBusinessProfilePostRequest,
  buildInstagramMediaContainerRequest,
  buildInstagramPublishRequest,
} from './socialPublishingProvider.ts'

Deno.test('builds Facebook Page feed publish request', () => {
  const request = buildFacebookPagePostRequest({
    pageId: 'page-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    message: 'Post aprovado',
    link: 'https://example.com',
  })
  assertEquals(request.url, 'https://graph.facebook.com/v20.0/page-1/feed')
  assertEquals(request.method, 'POST')
  assertEquals(request.body.message, 'Post aprovado')
  assertEquals(request.body.link, 'https://example.com')
  assertEquals(request.body.access_token, 'token')
})

Deno.test('builds Instagram media container and publish requests', () => {
  const container = buildInstagramMediaContainerRequest({
    instagramAccountId: 'ig-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    caption: 'Legenda aprovada',
    imageUrl: 'https://cdn.example.com/image.jpg',
  })
  assertStringIncludes(container.url, '/ig-1/media')
  assertEquals(container.body.image_url, 'https://cdn.example.com/image.jpg')

  const publish = buildInstagramPublishRequest({
    instagramAccountId: 'ig-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    creationId: 'creation-1',
  })
  assertStringIncludes(publish.url, '/ig-1/media_publish')
  assertEquals(publish.body.creation_id, 'creation-1')
})

Deno.test('builds Google Business Profile local post request', () => {
  const request = buildGoogleBusinessProfilePostRequest({
    locationName: 'accounts/123/locations/456',
    accessToken: 'token',
    summary: 'Post local aprovado',
    ctaUrl: 'https://example.com/landing',
  })
  assertEquals(request.url, 'https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts')
  assertEquals(request.body.topicType, 'STANDARD')
  assertEquals(request.body.summary, 'Post local aprovado')
  assertEquals(request.body.callToAction.url, 'https://example.com/landing')
})
```

- [x] **Step 2: Run tests and verify failure**

Run:

```powershell
deno test supabase/functions/_shared/socialPublishingProvider.test.ts
```

Expected:

```text
FAIL because socialPublishingProvider.ts does not exist.
```

- [x] **Step 3: Implement request builders and executor**

Create `supabase/functions/_shared/socialPublishingProvider.ts` with:

```ts
export function buildFacebookPagePostRequest(input: {
  pageId: string
  graphVersion: string
  accessToken: string
  message: string
  link?: string
}) {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${input.graphVersion}/${input.pageId}/feed`,
    body: {
      message: input.message,
      link: input.link || undefined,
      access_token: input.accessToken,
    },
  }
}

export function buildInstagramMediaContainerRequest(input: {
  instagramAccountId: string
  graphVersion: string
  accessToken: string
  caption: string
  imageUrl: string
}) {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${input.graphVersion}/${input.instagramAccountId}/media`,
    body: {
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: input.accessToken,
    },
  }
}

export function buildInstagramPublishRequest(input: {
  instagramAccountId: string
  graphVersion: string
  accessToken: string
  creationId: string
}) {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${input.graphVersion}/${input.instagramAccountId}/media_publish`,
    body: {
      creation_id: input.creationId,
      access_token: input.accessToken,
    },
  }
}

export function buildGoogleBusinessProfilePostRequest(input: {
  locationName: string
  accessToken: string
  summary: string
  ctaUrl?: string
}) {
  return {
    method: 'POST',
    url: `https://mybusiness.googleapis.com/v4/${input.locationName}/localPosts`,
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body: {
      languageCode: 'pt-BR',
      summary: input.summary,
      topicType: 'STANDARD',
      callToAction: input.ctaUrl ? { actionType: 'LEARN_MORE', url: input.ctaUrl } : undefined,
    },
  }
}
```

Then add `executeSocialPublishingAction(connection, content, run, accessToken)` that:

```text
1. Validates provider.
2. Requires image_url for Instagram publishing.
3. Sends provider fetch.
4. Parses JSON safely.
5. Throws provider_http_<status> with sanitized body on failure.
6. Returns provider_post_id and published_url/search_url where available.
```

- [x] **Step 4: Implement generic publishing function**

Create `supabase/functions/execute-marketing-publishing/index.ts` that mirrors `execute-wordpress-publishing` but:

```text
1. Accepts publishingRunId or creates a run from body.
2. Requires marketing_studio.write for create/update draft and marketing_studio.supervise for publish.
3. Loads publishing connection and content item.
4. Applies canExecuteNativePublishingRun-equivalent checks server-side.
5. Loads access token using connection.token_reference through providerSecrets for social/google providers.
6. Calls WordPress existing logic for provider wordpress.
7. Calls socialPublishingProvider for meta_facebook, meta_instagram, google_business_profile.
8. Updates publishing_runs with status, provider_post_id, published_url, response_payload, protected_error, completed_at.
9. Updates content_items status/published_url/published_at for publish.
10. Sets publishing_connections.status = needs_reauth when provider returns OAuth/permission failure.
```

- [x] **Step 5: Run tests**

Run:

```powershell
deno test supabase/functions/_shared/socialPublishingProvider.test.ts supabase/functions/_shared/providerSecrets.test.ts
```

Expected:

```text
All shared publishing/provider secret tests pass.
```

- [x] **Step 6: Commit**

Run:

```powershell
git add supabase/functions/_shared/socialPublishingProvider.ts supabase/functions/_shared/socialPublishingProvider.test.ts supabase/functions/execute-marketing-publishing
git commit -m "feat: add native social publishing adapters"
```

---

## Task 6: Slice 9A Frontend Service And UI

**Files:**
- Modify: `frontend/src/services/marketingStudioService.ts`
- Modify: `frontend/src/services/marketingStudioService.test.ts`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`

- [x] **Step 1: Add service tests**

Add to `frontend/src/services/marketingStudioService.test.ts`:

```ts
it('invokes generic marketing publishing for native social providers', async () => {
  const invoke = vi.fn().mockResolvedValue({ data: { success: true, run: { id: 'run-1' } }, error: null })
  mockSupabase.functions.invoke = invoke

  await marketingStudioService.executePublishingRun({
    provider: 'meta_instagram',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    connectionId: 'connection-1',
    contentItemId: 'content-1',
    action: 'publish',
  })

  expect(invoke).toHaveBeenCalledWith('execute-marketing-publishing', expect.objectContaining({
    body: expect.objectContaining({
      provider: 'meta_instagram',
      connectionId: 'connection-1',
      contentItemId: 'content-1',
      action: 'publish',
    }),
  }))
})
```

- [x] **Step 2: Run test and verify failure**

Run from `frontend/`:

```powershell
npm test -- src/services/marketingStudioService.test.ts
```

Expected:

```text
FAIL because executePublishingRun still targets execute-wordpress-publishing for every provider or does not include provider.
```

- [x] **Step 3: Update service**

Modify `marketingStudioService.executePublishingRun`:

```ts
const functionName = input.provider === 'wordpress'
  ? 'execute-wordpress-publishing'
  : 'execute-marketing-publishing'

const { data, error } = await supabase.functions.invoke(functionName, {
  body: {
    provider: input.provider,
    organizationId: input.organizationId,
    clientId: input.clientId,
    contractId: input.contractId,
    connectionId: input.connectionId,
    contentItemId: input.contentItemId,
    calendarItemId: input.calendarItemId,
    workflowRunId: input.workflowRunId,
    action: input.action,
    idempotencyKey: input.idempotencyKey,
    requestPayload: input.requestPayload || {},
  },
})
if (error) throw error
return data
```

- [x] **Step 4: Update Marketing Studio UI**

In `MarketingStudioWorkspace.tsx`, add a compact provider status panel that displays:

```text
WordPress
Facebook Page
Instagram
Google Business Profile
```

Each row must show:

```text
status, provider asset name, last published date, needs_reauth warning, publish action availability
```

Do not expose raw token references; display only "credencial configurada" when `tokenReference` is present.

- [x] **Step 5: Add UI test**

Add to `MarketingStudioWorkspace.test.tsx`:

```ts
it('renders native publishing provider states without exposing token references', () => {
  render(<MarketingStudioWorkspace
    {...baseProps}
    publishingConnections={[
      {
        id: 'connection-ig',
        organizationId: 'org-1',
        clientId: 'client-1',
        contractId: 'contract-1',
        provider: 'meta_instagram',
        name: 'Instagram Cliente',
        status: 'needs_reauth',
        tokenReference: 'meta_social:publishing:connection-ig:access_token',
        providerAssetName: '@cliente',
        createdAt: '2026-06-07T10:00:00.000Z',
        updatedAt: '2026-06-07T10:00:00.000Z',
      },
    ]}
  />)

  expect(screen.getByText('Instagram Cliente')).toBeInTheDocument()
  expect(screen.getByText('@cliente')).toBeInTheDocument()
  expect(screen.getByText('needs_reauth')).toBeInTheDocument()
  expect(screen.queryByText('meta_social:publishing:connection-ig:access_token')).not.toBeInTheDocument()
})
```

- [x] **Step 6: Run focused frontend tests**

Run from `frontend/`:

```powershell
npm test -- src/services/marketingStudioService.test.ts src/components/marketing-studio/MarketingStudioWorkspace.test.tsx
```

Expected:

```text
Both suites pass.
```

- [x] **Step 7: Commit**

Run:

```powershell
git add frontend/src/services/marketingStudioService.ts frontend/src/services/marketingStudioService.test.ts frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx
git commit -m "feat: surface native marketing publishing"
```

---

## Task 7: Slice 9B Real Meta And Google Ads Adapters

**Files:**
- Modify: `supabase/functions/_shared/adsProvider.ts`
- Modify: `supabase/functions/_shared/adsProvider.test.ts`

- [x] **Step 1: Replace stub expectations with real request builder tests**

Modify `supabase/functions/_shared/adsProvider.test.ts` to include:

```ts
Deno.test('builds Meta campaign creation requests', () => {
  const requests = buildMetaCampaignRequests({
    graphVersion: 'v20.0',
    accessToken: 'token',
    adAccountId: 'act_123',
    campaign: {
      name: 'Campanha aprovada',
      objective: 'lead_generation',
      dailyBudget: 5000,
      landingPageUrl: 'https://example.com',
      headline: 'Fale com a YUX',
      body: 'Campanha aprovada',
    },
  })

  assertEquals(requests[0].url, 'https://graph.facebook.com/v20.0/act_123/campaigns')
  assertEquals(requests[0].body.status, 'PAUSED')
  assertEquals(requests[0].body.special_ad_categories, '[]')
})

Deno.test('builds Google Ads mutate operations for campaign activation draft', () => {
  const operations = buildGoogleAdsCampaignMutateOperations({
    customerId: '1234567890',
    campaign: {
      name: 'Campanha aprovada',
      objective: 'lead_generation',
      dailyBudgetMicros: 50_000_000,
      landingPageUrl: 'https://example.com',
      headline: 'Fale com a YUX',
      body: 'Campanha aprovada',
    },
  })

  assertEquals(operations.some(operation => 'campaignBudgetOperation' in operation), true)
  assertEquals(operations.some(operation => 'campaignOperation' in operation), true)
  assertEquals(operations.some(operation => 'adGroupOperation' in operation), true)
  assertEquals(operations.some(operation => 'adGroupAdOperation' in operation), true)
})
```

- [x] **Step 2: Run tests and verify failure**

Run:

```powershell
deno test supabase/functions/_shared/adsProvider.test.ts
```

Expected:

```text
FAIL because buildMetaCampaignRequests and buildGoogleAdsCampaignMutateOperations are not implemented.
```

- [x] **Step 3: Implement Meta request builders**

In `adsProvider.ts`, add:

```ts
export function buildMetaCampaignRequests(input: {
  graphVersion: string
  accessToken: string
  adAccountId: string
  campaign: {
    name: string
    objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
    dailyBudget: number
    landingPageUrl: string
    headline: string
    body: string
  }
}) {
  const baseUrl = `https://graph.facebook.com/${input.graphVersion}/${input.adAccountId}`
  const objectiveMap = {
    lead_generation: 'OUTCOME_LEADS',
    traffic: 'OUTCOME_TRAFFIC',
    conversions: 'OUTCOME_SALES',
    awareness: 'OUTCOME_AWARENESS',
  } as const

  return [
    {
      step: 'campaign',
      method: 'POST',
      url: `${baseUrl}/campaigns`,
      body: {
        name: input.campaign.name,
        objective: objectiveMap[input.campaign.objective],
        status: 'PAUSED',
        special_ad_categories: '[]',
        access_token: input.accessToken,
      },
    },
    {
      step: 'adset',
      method: 'POST',
      url: `${baseUrl}/adsets`,
      body: {
        name: `${input.campaign.name} - Ad Set`,
        daily_budget: Math.round(input.campaign.dailyBudget * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: input.campaign.objective === 'traffic' ? 'LINK_CLICKS' : 'LEAD_GENERATION',
        status: 'PAUSED',
        access_token: input.accessToken,
      },
    },
    {
      step: 'creative',
      method: 'POST',
      url: `${baseUrl}/adcreatives`,
      body: {
        name: `${input.campaign.name} - Creative`,
        object_story_spec: {
          link_data: {
            link: input.campaign.landingPageUrl,
            message: input.campaign.body,
            name: input.campaign.headline,
          },
        },
        access_token: input.accessToken,
      },
    },
    {
      step: 'ad',
      method: 'POST',
      url: `${baseUrl}/ads`,
      body: {
        name: `${input.campaign.name} - Ad`,
        status: 'PAUSED',
        access_token: input.accessToken,
      },
    },
  ]
}
```

- [x] **Step 4: Implement Google Ads mutate builders**

In `adsProvider.ts`, add:

```ts
export function buildGoogleAdsCampaignMutateOperations(input: {
  customerId: string
  campaign: {
    name: string
    objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
    dailyBudgetMicros: number
    landingPageUrl: string
    headline: string
    body: string
  }
}) {
  const budgetResource = `customers/${input.customerId}/campaignBudgets/-1`
  const campaignResource = `customers/${input.customerId}/campaigns/-2`
  const adGroupResource = `customers/${input.customerId}/adGroups/-3`

  return [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResource,
          name: `${input.campaign.name} Budget`,
          amountMicros: input.campaign.dailyBudgetMicros,
          deliveryMethod: 'STANDARD',
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResource,
          name: input.campaign.name,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: budgetResource,
          manualCpc: {},
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupResource,
          campaign: campaignResource,
          name: `${input.campaign.name} Ad Group`,
          status: 'PAUSED',
        },
      },
    },
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'PAUSED',
          ad: {
            finalUrls: [input.campaign.landingPageUrl],
            responsiveSearchAd: {
              headlines: [{ text: input.campaign.headline }],
              descriptions: [{ text: input.campaign.body }],
            },
          },
        },
      },
    },
  ]
}
```

- [x] **Step 5: Implement real executeProviderAdapter**

Change `executeProviderAdapter` so:

```text
1. It never returns provider_adapter_stub.
2. It loads provider request payload from the mutation run request.
3. It requires accessToken and provider account/customer ids.
4. For Meta create_campaign, it performs sequential requests: campaign, adset, creative, ad.
5. For Google create_campaign, it sends one mutate request with multiple operations.
6. For update_budget, it calls the provider budget endpoint/mutate operation.
7. For pause_campaign, it updates provider status to PAUSED.
8. For sync_metrics, it queries provider metrics and returns normalized spend/impressions/clicks/leads.
9. It sanitizes all provider responses and errors.
```

- [x] **Step 6: Run tests**

Run:

```powershell
deno test supabase/functions/_shared/adsProvider.test.ts
```

Expected:

```text
All adsProvider tests pass.
```

- [x] **Step 7: Commit**

Run:

```powershell
git add supabase/functions/_shared/adsProvider.ts supabase/functions/_shared/adsProvider.test.ts
git commit -m "feat: add native ads provider adapters"
```

---

## Task 8: Slice 9B Execute Mutations, Metrics Sync, And Campaign UI

**Files:**
- Modify: `supabase/functions/execute-ad-provider-mutation/index.ts`
- Modify: `supabase/functions/sync-ad-metrics/index.ts`
- Modify: `frontend/src/services/campaignService.ts`
- Modify: `frontend/src/services/campaignService.test.ts`
- Modify: `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
- Modify: `frontend/src/components/campaigns/CampaignsWorkspace.test.tsx`

- [x] **Step 1: Add service test for Edge Function execution**

Add to `frontend/src/services/campaignService.test.ts`:

```ts
it('executes approved provider mutation through edge function instead of only inserting a row', async () => {
  const invoke = vi.fn().mockResolvedValue({ data: { success: true, run: { id: 'run-1' } }, error: null })
  mockSupabase.functions.invoke = invoke

  await campaignService.executeProviderMutation({
    organizationId: 'org-1',
    provider: 'meta',
    action: 'create_campaign',
    campaignId: 'campaign-1',
    providerConnectionId: 'connection-1',
    explicitApproval: true,
    requestPayload: { landingPageUrl: 'https://example.com' },
  })

  expect(invoke).toHaveBeenCalledWith('execute-ad-provider-mutation', expect.objectContaining({
    body: expect.objectContaining({
      provider: 'meta',
      action: 'create_campaign',
      campaignId: 'campaign-1',
      explicitApproval: true,
    }),
  }))
})
```

- [x] **Step 2: Run test and verify failure**

Run from `frontend/`:

```powershell
npm test -- src/services/campaignService.test.ts
```

Expected:

```text
FAIL because campaignService only inserts ad_provider_mutation_runs.
```

- [x] **Step 3: Modify execute-ad-provider-mutation**

Update the function to:

```text
1. Load run or create run.
2. Load campaign and connection.
3. Reject create_campaign/update_budget unless campaign.lifecycle_status = approved and explicitApproval = true.
4. Load token from connection.token_reference using providerSecrets.
5. Pass accessToken, ad account/customer id, and normalized campaign payload to executeProviderAdapter.
6. Update ad_provider_mutation_runs with started_at, completed_at, external ids, response_payload, protected_error.
7. Update local campaign lifecycle_status to active only when provider confirms success and request explicitly asks for activation; otherwise keep provider-created campaigns paused locally.
8. Update local campaign_ad_sets, campaign_ads, and campaign_creatives external ids when provider returns them.
```

- [x] **Step 4: Modify sync-ad-metrics**

Update the function to:

```text
1. Load token from providerSecrets.
2. Query provider metrics.
3. Insert campaign_metric_snapshots with raw provider payload sanitized.
4. Update campaigns spend, impressions, clicks, leads, cpl, mroi and last_sync_at.
5. Set provider connection status to needs_reauth for OAuth failures.
```

- [x] **Step 5: Modify campaignService**

Add:

```ts
async executeProviderMutation(input: {
  organizationId: string
  provider: 'meta' | 'google'
  action: ProviderMutationAction
  campaignId: string
  providerConnectionId: string
  explicitApproval?: boolean
  requestPayload?: Record<string, unknown>
}) {
  const { data, error } = await supabase.functions.invoke('execute-ad-provider-mutation', {
    body: {
      organizationId: input.organizationId,
      provider: input.provider,
      action: input.action,
      campaignId: input.campaignId,
      providerConnectionId: input.providerConnectionId,
      explicitApproval: Boolean(input.explicitApproval),
      requestPayload: input.requestPayload || {},
    },
  })
  if (error) throw error
  return data
}
```

- [x] **Step 6: Update CampaignsWorkspace**

Add explicit action affordances:

```text
Approve locally
Create in provider
Sync metrics
Pause in provider
Needs reauth warning
```

Disable "Create in provider" unless:

```text
campaign.lifecycleStatus === 'approved'
provider connection status is connected/stale
campaign has providerConnectionId and adAccountId
```

- [x] **Step 7: Run focused tests**

Run from `frontend/`:

```powershell
npm test -- src/services/campaignService.test.ts src/components/campaigns/CampaignsWorkspace.test.tsx
```

Expected:

```text
Both campaign suites pass.
```

- [x] **Step 8: Commit**

Run:

```powershell
git add supabase/functions/execute-ad-provider-mutation supabase/functions/sync-ad-metrics frontend/src/services/campaignService.ts frontend/src/services/campaignService.test.ts frontend/src/components/campaigns/CampaignsWorkspace.tsx frontend/src/components/campaigns/CampaignsWorkspace.test.tsx
git commit -m "feat: execute native ads provider mutations"
```

---

## Task 9: Deploy Functions, Full Validation, Docs, And Status

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: `docs/admin-yux-hub.md`
- Modify: `docs/commercial-mvp-operations.md`

- [x] **Step 1: Run all focused Edge Function tests**

Run:

```powershell
deno test supabase/functions/_shared/providerSecrets.test.ts supabase/functions/_shared/providerOAuth.test.ts supabase/functions/_shared/socialPublishingProvider.test.ts supabase/functions/_shared/adsProvider.test.ts
```

Expected:

```text
All focused Edge Function tests pass.
```

- [x] **Step 2: Run focused frontend tests**

Run from `frontend/`:

```powershell
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts src/services/marketingStudioService.test.ts src/components/marketing-studio/MarketingStudioWorkspace.test.tsx src/lib/campaigns/campaignRules.test.ts src/services/campaignService.test.ts src/components/campaigns/CampaignsWorkspace.test.tsx
```

Expected:

```text
All focused frontend tests pass.
```

- [x] **Step 3: Run type-check and build**

Run from `frontend/`:

```powershell
npm run type-check
npm run build
```

Expected:

```text
type-check passes.
build passes with only known Browserslist/chunk-size warnings.
```

- [x] **Step 4: Deploy Edge Functions**

Deploy to `portal-yux` after secrets are configured:

```powershell
supabase functions deploy start-marketing-provider-connect --project-ref uuowkncimiydpbxqpkej
supabase functions deploy complete-marketing-provider-connect --project-ref uuowkncimiydpbxqpkej
supabase functions deploy list-marketing-provider-assets --project-ref uuowkncimiydpbxqpkej
supabase functions deploy execute-marketing-publishing --project-ref uuowkncimiydpbxqpkej
supabase functions deploy execute-ad-provider-mutation --project-ref uuowkncimiydpbxqpkej
supabase functions deploy sync-ad-metrics --project-ref uuowkncimiydpbxqpkej
```

Expected:

```text
All functions deploy successfully.
```

- [x] **Step 5: Document required runtime secrets**

Add to `docs/commercial-mvp-operations.md`:

```text
Phase 9 native marketing integration secrets:
- PROVIDER_SECRET_ENCRYPTION_KEY_B64
- META_APP_ID
- META_APP_SECRET
- META_GRAPH_VERSION
- META_MARKETING_OAUTH_REDIRECT_URI
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET
- GOOGLE_MARKETING_OAUTH_REDIRECT_URI
- GOOGLE_ADS_DEVELOPER_TOKEN
- GOOGLE_ADS_LOGIN_CUSTOMER_ID when manager-account access is required
```

- [x] **Step 6: Update implementation status**

Add an implementation-status row:

```markdown
| Marketing Studio native Meta/Google integrations | Implemented | `/marketing-studio`, `/campaigns`, `/admin/integrations` | `marketing_studio_native_integrations` migration, generic marketing provider OAuth functions, native social publishing adapter, native ads provider adapter | Adds multi-tenant OAuth token references, encrypted private token storage, Facebook/Instagram/Google Business Profile publishing, and approved Meta/Google Ads provider mutations. Live use requires provider app review, OAuth redirect configuration, encrypted secret key and per-client authorization. |
```

- [x] **Step 7: Final git status and scoped commit**

Run:

```powershell
git status --short
git diff --check
```

Expected:

```text
Only phase 9 files are modified/staged for the final docs/status commit.
```

Commit:

```powershell
git add docs/implementation-status.md docs/admin-yux-hub.md docs/commercial-mvp-operations.md
git commit -m "docs: document native marketing integrations"
```

---

## Acceptance Criteria

- Public tables do not contain raw OAuth access tokens, refresh tokens, client secrets, app secrets, or application passwords.
- `public.provider_integration_secrets` stores encrypted provider tokens, has RLS enabled, and is not granted to `anon` or `authenticated`.
- OAuth flow supports per-client/per-contract connections for:
  - Facebook Page publishing;
  - Instagram Business publishing;
  - Google Business Profile local posts;
  - Meta Ads;
  - Google Ads.
- WordPress publishing still works through the existing path.
- Native social publishing only publishes approved or scheduled content.
- Native ads creation only runs for approved campaigns with explicit provider mutation approval.
- Provider OAuth failures update connection state to `needs_reauth` instead of reporting success.
- Provider errors are sanitized before they reach public tables or frontend responses.
- Mutation runs remain idempotent and record request summary, response summary, external ids, status and protected errors.
- Focused frontend tests, Edge Function tests, type-check and build pass.
- Remote migration and probe pass on `portal-yux`.

## Out Of Scope For This Phase

- LinkedIn, X/Twitter, TikTok and YouTube publishing.
- Automatic posting without human approval.
- Automatic budget increases without explicit approval.
- Creative media generation or upload pipeline beyond using an existing public `media_url`/image URL.
- Advanced metric attribution beyond storing provider snapshots and updating campaign summary fields.
- Provider app review submission itself; the code must expose the required states and docs, but approval is an operational step.

## Self-Review

- Spec coverage: the plan covers the user-approved split into 9A organic/local posting and 9B paid Meta/Google Ads activation. It reuses existing WordPress publishing, campaign draft, mutation run, and Marketing Studio service boundaries.
- Placeholder scan: the plan intentionally avoids fake provider success paths. Steps that depend on provider-specific current docs require rechecking official docs before implementation and then encode exact scopes/endpoints in tests.
- Type consistency: provider names are separated by target kind: `meta_facebook`, `meta_instagram`, `google_business_profile` for publishing; `meta`, `google` for Ads; OAuth flow providers use `meta_social`, `google_business_profile`, `meta_ads`, `google_ads`.
- Risk controls: every sensitive provider mutation is server-side, status-driven, idempotent, approval-gated, and sanitized.
