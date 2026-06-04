# YUX Hub Admin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implantar o Admin YUX Hub como camada central de administracao da plataforma, cobrindo navegacao agrupada, clientes/contratos/limites, integracoes, SMTP2GO, IA/LLM, governanca por modulo, auditoria, saude e refinamento comercial.

**Architecture:** A implantacao sera incremental: primeiro navegacao e painel central sem bloquear modulos existentes; depois schema e servicos administrativos; por fim telas profundas que consomem esses servicos. A seguranca fica no banco via RLS com `private.is_platform_admin()` e no frontend por rotas internas existentes.

**Tech Stack:** React 18, Vite, TypeScript, Zustand, Supabase JS, Postgres/Supabase migrations, Vitest, Tailwind, lucide-react.

---

## File Structure

### Frontend navigation and shell

- Modify: `frontend/src/lib/platform/navigation.ts`
  - Add grouped navigation model for internal sidebar.
- Modify: `frontend/src/lib/platform/navigation.test.ts`
  - Cover grouped internal navigation and portal flat compatibility.
- Modify: `frontend/src/components/navigation/Sidebar.tsx`
  - Render grouped navigation and update logo text to YUX Hub.
- Modify: `frontend/src/App.tsx`
  - Add `/admin`, `/admin/integrations`, `/admin/email`, `/admin/ai`, `/admin/health`, `/admin/modules-governance`.

### Frontend types, rules, and services

- Create: `frontend/src/types/adminPlatform.ts`
  - Admin summary, limits, providers, usage, audit and health types.
- Create: `frontend/src/lib/platform/adminRules.ts`
  - Pure functions for status labels, limit status, provider masking and dashboard summaries.
- Create: `frontend/src/lib/platform/adminRules.test.ts`
  - Unit tests for admin rules.
- Create: `frontend/src/services/adminPlatformService.ts`
  - Supabase reads/writes for admin tables and summary composition.
- Create: `frontend/src/services/adminPlatformService.test.ts`
  - Service tests with Supabase mocked.

### Frontend pages and components

- Create: `frontend/src/pages/platform/AdminHubPage.tsx`
- Create: `frontend/src/pages/platform/AdminIntegrationsPage.tsx`
- Create: `frontend/src/pages/platform/AdminEmailPage.tsx`
- Create: `frontend/src/pages/platform/AdminAiPage.tsx`
- Create: `frontend/src/pages/platform/AdminModuleGovernancePage.tsx`
- Create: `frontend/src/pages/platform/AdminHealthPage.tsx`
- Create: `frontend/src/components/platform/admin/AdminMetricCard.tsx`
- Create: `frontend/src/components/platform/admin/AdminStatusBadge.tsx`
- Create: `frontend/src/components/platform/admin/AdminQuickActions.tsx`
- Create: `frontend/src/components/platform/admin/ClientModuleLimitsPanel.tsx`
- Create: `frontend/src/components/platform/admin/ProviderConnectionPanel.tsx`
- Create: `frontend/src/components/platform/admin/UsageLimitBar.tsx`

### Existing pages to enhance

- Modify: `frontend/src/pages/platform/ContractsPage.tsx`
  - Add link/entry point to effective limits.
- Modify: `frontend/src/components/platform/ContractModulesPanel.tsx`
  - Add module limit summary and action to open limit panel.
- Modify: `frontend/src/pages/platform/ModulesPage.tsx`
  - Use YUX Hub wording and surface module governance links.

### Database

- Create: `supabase/migrations/20260604100000_yux_hub_admin_platform.sql`
  - Add admin provider, limits, usage, audit and health tables.
  - Add RLS policies for internal platform admins.
  - Grant Data API privileges to `authenticated`.

### Documentation

- Modify: `docs/implementation-status.md`
  - Add Admin YUX Hub phase status.
- Create or update: `docs/admin-yux-hub.md`
  - Operational documentation for Admin YUX Hub after implementation.

---

## Phase 1: Navigation and Admin Shell

### Task 1: Build grouped navigation model

**Files:**
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Write failing tests for grouped internal navigation**

Add tests that assert internal navigation has categories and portal navigation still returns flat items. The current `buildNavigation` returns only `NavigationItem[]`, so this must fail until the model is extended.

```ts
it('builds grouped internal navigation for YUX Hub administration', () => {
  const groups = buildNavigationGroups({
    ...internalContext,
    enabledModuleKeys: [
      'clients',
      'crm',
      'projects',
      'proposals',
      'landing_pages',
      'campaigns',
      'bi_reports',
      'automations',
      'support',
      'finance',
      'blueprints',
    ],
  })

  expect(groups.map(group => group.label)).toEqual([
    'Operacao',
    'Comercial',
    'Gestao YUX Hub',
    'Infraestrutura',
    'Financeiro',
  ])
  expect(groups.find(group => group.label === 'Gestao YUX Hub')?.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Admin YUX Hub', href: '/admin' }),
      expect.objectContaining({ label: 'Contratos', href: '/contracts' }),
      expect.objectContaining({ label: 'Governanca CRM', href: '/crm-governance' }),
    ]),
  )
})

it('keeps portal navigation flat for client users', () => {
  const groups = buildNavigationGroups({
    ...internalContext,
    mode: 'portal',
    role: {
      key: 'client_admin',
      name: 'Client Admin',
      scope: 'client',
      permissions: ['projects.read', 'support.read'],
    },
    enabledModuleKeys: ['projects', 'support'],
  })

  expect(groups).toEqual([
    {
      label: 'Portal',
      items: [
        { label: 'Portal', href: '/portal' },
        { label: 'Projetos e Entregas', href: '/portal/projects', moduleKey: 'projects' },
        { label: 'Suporte', href: '/portal/support', moduleKey: 'support' },
      ],
    },
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend`:

```bash
npm test -- src/lib/platform/navigation.test.ts
```

Expected: FAIL with `buildNavigationGroups` not exported.

- [ ] **Step 3: Implement navigation groups**

Add `NavigationGroup` and `buildNavigationGroups`. Keep `buildNavigation` as a compatibility flattening function.

```ts
export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

const internalBaseGroups: NavigationGroup[] = [
  {
    label: 'Operacao',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Projetos', href: '/projects', moduleKey: 'projects' },
      { label: 'Suporte', href: '/support', moduleKey: 'support' },
    ],
  },
  {
    label: 'Gestao YUX Hub',
    items: [
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos', href: '/modules' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Governanca CRM', href: '/crm-governance' },
    ],
  },
]
```

Use module lookups for Comercial and Financeiro so permissions and enabled modules continue to apply.

- [ ] **Step 4: Run focused navigation tests**

Run:

```bash
npm test -- src/lib/platform/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: group yux hub navigation"
```

### Task 2: Render grouped sidebar and YUX Hub branding

**Files:**
- Modify: `frontend/src/components/navigation/Sidebar.tsx`

- [ ] **Step 1: Update sidebar to consume groups**

Replace the flat `navigation.map` with grouped rendering from `buildNavigationGroups`.

```tsx
const navigationGroups = buildNavigationGroups(platformContext)

<nav className="flex-1 overflow-y-auto px-4 py-5">
  <div className="space-y-5">
    {navigationGroups.map(group => (
      <div key={group.label}>
        {platformContext.mode === 'internal' && (
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </p>
        )}
        <div className="space-y-1">
          {group.items.map(item => {
            const Icon = item.moduleKey
              ? iconByModule[item.moduleKey] || LayoutDashboard
              : iconByHref[item.href] || LayoutDashboard

            return (
              <NavLink key={item.href} to={item.href} className={/* existing active classes */}>
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </div>
    ))}
  </div>
</nav>
```

- [ ] **Step 2: Update logo copy**

Use:

```tsx
{platformContext.mode === 'internal' ? 'YUX Hub' : 'Portal YUX'}
```

- [ ] **Step 3: Add icons for admin routes**

Add href icons:

```ts
const iconByHref: Record<string, LucideIcon> = {
  '/admin': ShieldCheck,
  '/admin/integrations': Settings,
  '/admin/email': Mail,
  '/admin/ai': Bot,
  '/admin/health': Activity,
  '/contracts': FileCheck2,
  '/packages': Boxes,
  '/modules': LayoutDashboard,
  '/crm-governance': ShieldCheck,
}
```

- [ ] **Step 4: Verify type-check**

Run from `frontend`:

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/navigation/Sidebar.tsx
git commit -m "feat: render grouped admin sidebar"
```

### Task 3: Add Admin YUX Hub routes and first dashboard page

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/platform/AdminHubPage.tsx`
- Create: `frontend/src/components/platform/admin/AdminMetricCard.tsx`
- Create: `frontend/src/components/platform/admin/AdminQuickActions.tsx`

- [ ] **Step 1: Create reusable metric card**

```tsx
import type { LucideIcon } from 'lucide-react'

interface AdminMetricCardProps {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
}

export function AdminMetricCard({ label, value, detail, icon: Icon }: AdminMetricCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          <p className="mt-1 text-sm text-gray-600">{detail}</p>
        </div>
        <span className="rounded-md bg-yux-50 p-2 text-yux-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create quick actions**

```tsx
import { Link } from 'react-router-dom'

export interface AdminQuickAction {
  label: string
  description: string
  href: string
}

export function AdminQuickActions({ actions }: { actions: AdminQuickAction[] }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Acoes administrativas</h2>
      </div>
      <div className="divide-y">
        {actions.map(action => (
          <Link key={action.href} to={action.href} className="block px-4 py-3 hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-900">{action.label}</p>
            <p className="text-sm text-gray-500">{action.description}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `AdminHubPage` with static shell**

Use existing pages style: `space-y-6`, `text-2xl`, `rounded-lg border bg-white`.

```tsx
import { Activity, Boxes, Building2, FileCheck2 } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { AdminQuickActions } from '@/components/platform/admin/AdminQuickActions'

export function AdminHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin YUX Hub</h1>
        <p className="text-gray-600">Controle central de clientes, contratos, modulos, limites e integracoes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Clientes" value="-" detail="Carregando via servico administrativo" icon={Building2} />
        <AdminMetricCard label="Contratos ativos" value="-" detail="Base comercial da plataforma" icon={FileCheck2} />
        <AdminMetricCard label="Modulos ativos" value="-" detail="CRM, Automacoes, Suporte e mais" icon={Boxes} />
        <AdminMetricCard label="Saude" value="-" detail="Integracoes, IA, email e webhooks" icon={Activity} />
      </div>

      <AdminQuickActions
        actions={[
          { label: 'Contratos e limites', description: 'Gerenciar modulos contratados e quotas por cliente.', href: '/contracts' },
          { label: 'Integracoes', description: 'Configurar provedores globais e por cliente.', href: '/admin/integrations' },
          { label: 'Email/SMTP2GO', description: 'Gerenciar conta master, subcontas, dominios e envios.', href: '/admin/email' },
          { label: 'IA/LLM', description: 'Controlar provedores, modelos, custos e uso por modulo.', href: '/admin/ai' },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 4: Register route**

In `frontend/src/App.tsx`:

```tsx
import { AdminHubPage } from '@/pages/platform/AdminHubPage'

<Route path="admin" element={<AdminHubPage />} />
```

- [ ] **Step 5: Verify type-check**

Run:

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/platform/AdminHubPage.tsx frontend/src/components/platform/admin/AdminMetricCard.tsx frontend/src/components/platform/admin/AdminQuickActions.tsx
git commit -m "feat: add admin yux hub dashboard shell"
```

---

## Phase 2: Contracts, Limits and Admin Data Foundation

### Task 4: Add admin platform migration

**Files:**
- Create: `supabase/migrations/20260604100000_yux_hub_admin_platform.sql`

- [ ] **Step 1: Create enums and tables**

Use `private.is_platform_admin()` for internal admin access. Create these tables:

```sql
DO $$
BEGIN
  CREATE TYPE public.platform_provider_type AS ENUM ('llm', 'email', 'whatsapp', 'ads', 'webhook', 'automation', 'storage', 'database', 'internal_service');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.platform_provider_status AS ENUM ('not_configured', 'active', 'degraded', 'failed', 'disabled', 'needs_reauth', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.client_module_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  limit_key TEXT NOT NULL,
  limit_value NUMERIC NOT NULL CHECK (limit_value >= 0),
  source TEXT NOT NULL DEFAULT 'contract' CHECK (source IN ('package', 'contract', 'manual_override')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, limit_key)
);

CREATE TABLE IF NOT EXISTS public.platform_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type public.platform_provider_type NOT NULL,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  fallback_provider_id UUID REFERENCES public.platform_provider_connections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_type, provider_key, environment)
);

CREATE TABLE IF NOT EXISTS public.client_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES public.platform_provider_connections(id) ON DELETE CASCADE,
  module_key TEXT,
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  inherits_global BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_connection_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.platform_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_value NUMERIC NOT NULL DEFAULT 0 CHECK (used_value >= 0),
  limit_value NUMERIC CHECK (limit_value IS NULL OR limit_value >= 0),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'near_limit', 'over_limit', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, resource_key, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Add indexes, RLS and grants**

```sql
CREATE INDEX IF NOT EXISTS idx_client_module_limits_org_module ON public.client_module_limits(organization_id, module_key);
CREATE INDEX IF NOT EXISTS idx_provider_connections_type_status ON public.platform_provider_connections(provider_type, status);
CREATE INDEX IF NOT EXISTS idx_client_provider_settings_org ON public.client_provider_settings(organization_id, module_key);
CREATE INDEX IF NOT EXISTS idx_platform_usage_counters_org_period ON public.platform_usage_counters(organization_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_created ON public.platform_admin_audit_events(created_at DESC);

ALTER TABLE public.client_module_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage client module limits" ON public.client_module_limits
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

CREATE POLICY "Platform admins manage provider connections" ON public.platform_provider_connections
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

CREATE POLICY "Platform admins manage client provider settings" ON public.client_provider_settings
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

CREATE POLICY "Platform admins manage usage counters" ON public.platform_usage_counters
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

CREATE POLICY "Platform admins read audit events" ON public.platform_admin_audit_events
  FOR SELECT TO authenticated USING (private.is_platform_admin());

CREATE POLICY "Platform admins insert audit events" ON public.platform_admin_audit_events
  FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin());

REVOKE ALL ON public.client_module_limits FROM anon;
REVOKE ALL ON public.platform_provider_connections FROM anon;
REVOKE ALL ON public.client_provider_settings FROM anon;
REVOKE ALL ON public.platform_usage_counters FROM anon;
REVOKE ALL ON public.platform_admin_audit_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_module_limits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_provider_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_provider_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_usage_counters TO authenticated, service_role;
GRANT SELECT, INSERT ON public.platform_admin_audit_events TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Verify migration locally when Docker is available**

Run from repository root:

```bash
supabase db reset --debug
```

Expected: PASS. If Docker is unavailable, record the Docker error and apply through Supabase MCP or CLI against the target project before browser testing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604100000_yux_hub_admin_platform.sql
git commit -m "feat: add yux hub admin platform schema"
```

### Task 5: Add admin types and pure business rules

**Files:**
- Create: `frontend/src/types/adminPlatform.ts`
- Create: `frontend/src/lib/platform/adminRules.ts`
- Create: `frontend/src/lib/platform/adminRules.test.ts`

- [ ] **Step 1: Create types**

```ts
export type PlatformProviderType = 'llm' | 'email' | 'whatsapp' | 'ads' | 'webhook' | 'automation' | 'storage' | 'database' | 'internal_service'
export type PlatformProviderStatus = 'not_configured' | 'active' | 'degraded' | 'failed' | 'disabled' | 'needs_reauth' | 'stale'
export type PlatformLimitStatus = 'ok' | 'near_limit' | 'over_limit' | 'blocked'

export interface ClientModuleLimit {
  id: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  limitKey: string
  limitValue: number
  source: 'package' | 'contract' | 'manual_override'
  effectiveFrom: string
  effectiveUntil?: string | null
  metadata: Record<string, unknown>
}

export interface PlatformProviderConnection {
  id: string
  providerType: PlatformProviderType
  providerKey: string
  displayName: string
  environment: string
  status: PlatformProviderStatus
  publicConfig: Record<string, unknown>
  secretReference?: string | null
  lastCheckedAt?: string | null
  lastError?: string | null
  isDefault: boolean
  fallbackProviderId?: string | null
}

export interface PlatformUsageCounter {
  id: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  resourceKey: string
  periodStart: string
  periodEnd: string
  usedValue: number
  limitValue?: number | null
  status: PlatformLimitStatus
}

export interface AdminHubSummary {
  clientCount: number
  activeContractCount: number
  activeModuleCount: number
  failingProviderCount: number
  nearLimitCount: number
}
```

- [ ] **Step 2: Write rule tests**

```ts
import { describe, expect, it } from 'vitest'
import { getLimitStatus, maskSecretReference, summarizeAdminHub } from '@/lib/platform/adminRules'

describe('adminRules', () => {
  it('marks near limit at 80 percent usage', () => {
    expect(getLimitStatus(80, 100)).toBe('near_limit')
  })

  it('marks over limit above the configured limit', () => {
    expect(getLimitStatus(101, 100)).toBe('over_limit')
  })

  it('masks provider secret references', () => {
    expect(maskSecretReference('smtp2go:master-api-key')).toBe('smtp2go:***********')
  })

  it('summarizes failing providers and near limits', () => {
    expect(summarizeAdminHub({
      clients: [{ id: 'org-1' }],
      contracts: [{ id: 'contract-1', status: 'active' }],
      modules: ['crm', 'automations'],
      providers: [{ id: 'provider-1', status: 'failed' }],
      usage: [{ id: 'usage-1', status: 'near_limit' }],
    })).toMatchObject({
      clientCount: 1,
      activeContractCount: 1,
      activeModuleCount: 2,
      failingProviderCount: 1,
      nearLimitCount: 1,
    })
  })
})
```

- [ ] **Step 3: Implement rules**

```ts
import type { AdminHubSummary, PlatformLimitStatus, PlatformProviderStatus } from '@/types/adminPlatform'

export function getLimitStatus(usedValue: number, limitValue?: number | null): PlatformLimitStatus {
  if (!limitValue || limitValue <= 0) return 'ok'
  if (usedValue > limitValue) return 'over_limit'
  if (usedValue / limitValue >= 0.8) return 'near_limit'
  return 'ok'
}

export function isProviderFailing(status: PlatformProviderStatus) {
  return status === 'failed' || status === 'needs_reauth' || status === 'stale' || status === 'degraded'
}

export function maskSecretReference(secretReference?: string | null) {
  if (!secretReference) return 'Nao configurado'
  const [prefix] = secretReference.split(':')
  return `${prefix}:***********`
}

export function summarizeAdminHub(input: {
  clients: Array<{ id: string }>
  contracts: Array<{ id: string; status: string }>
  modules: string[]
  providers: Array<{ id: string; status: PlatformProviderStatus }>
  usage: Array<{ id: string; status: PlatformLimitStatus }>
}): AdminHubSummary {
  return {
    clientCount: input.clients.length,
    activeContractCount: input.contracts.filter(contract => contract.status === 'active').length,
    activeModuleCount: new Set(input.modules).size,
    failingProviderCount: input.providers.filter(provider => isProviderFailing(provider.status)).length,
    nearLimitCount: input.usage.filter(item => item.status === 'near_limit' || item.status === 'over_limit' || item.status === 'blocked').length,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/platform/adminRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/adminPlatform.ts frontend/src/lib/platform/adminRules.ts frontend/src/lib/platform/adminRules.test.ts
git commit -m "feat: add admin platform rules"
```

### Task 6: Add admin platform service

**Files:**
- Create: `frontend/src/services/adminPlatformService.ts`
- Create: `frontend/src/services/adminPlatformService.test.ts`

- [ ] **Step 1: Write service tests with Supabase mocked**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPlatformService } from '@/services/adminPlatformService'

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}))

describe('adminPlatformService', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('loads provider connections and maps snake_case fields', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        order: async () => ({
          data: [{
            id: 'provider-1',
            provider_type: 'email',
            provider_key: 'smtp2go',
            display_name: 'SMTP2GO',
            environment: 'production',
            status: 'active',
            public_config: { sender: 'mail.yux.com.br' },
            secret_reference: 'smtp2go:master',
            last_checked_at: null,
            last_error: null,
            is_default: true,
            fallback_provider_id: null,
          }],
          error: null,
        }),
      }),
    })

    await expect(adminPlatformService.getProviderConnections()).resolves.toEqual([
      expect.objectContaining({
        id: 'provider-1',
        providerType: 'email',
        providerKey: 'smtp2go',
        displayName: 'SMTP2GO',
      }),
    ])
  })
})
```

- [ ] **Step 2: Implement mapper and reads**

```ts
import { supabase } from '@/lib/supabase'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

function mapProvider(row: any): PlatformProviderConnection {
  return {
    id: row.id,
    providerType: row.provider_type,
    providerKey: row.provider_key,
    displayName: row.display_name,
    environment: row.environment,
    status: row.status,
    publicConfig: row.public_config || {},
    secretReference: row.secret_reference,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    isDefault: row.is_default,
    fallbackProviderId: row.fallback_provider_id,
  }
}

export class AdminPlatformService {
  async getProviderConnections() {
    const { data, error } = await supabase
      .from('platform_provider_connections')
      .select('*')
      .order('provider_type')

    if (error) throw error
    return (data || []).map(mapProvider)
  }
}

export const adminPlatformService = new AdminPlatformService()
```

Add methods in the same service:

- `getClientModuleLimits(organizationId?: string)`
- `upsertClientModuleLimit(input)`
- `getUsageCounters(organizationId?: string)`
- `getAuditEvents(limit = 50)`
- `recordAuditEvent(input)`
- `getAdminHubSummary()`

- [ ] **Step 3: Run service tests**

```bash
npm test -- src/services/adminPlatformService.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/adminPlatformService.ts frontend/src/services/adminPlatformService.test.ts
git commit -m "feat: add admin platform service"
```

### Task 7: Wire dashboard to live admin summary

**Files:**
- Modify: `frontend/src/pages/platform/AdminHubPage.tsx`

- [ ] **Step 1: Load summary with fallback states**

Use `adminPlatformService.getAdminHubSummary()` and show:

- loading text: `Carregando administracao do YUX Hub...`
- error alert: `Nao foi possivel carregar o Admin YUX Hub.`
- metric cards with real numbers.

```tsx
const [summary, setSummary] = useState<AdminHubSummary | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  let active = true

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await adminPlatformService.getAdminHubSummary()
      if (active) setSummary(result)
    } catch (error) {
      console.error('Error loading Admin YUX Hub:', error)
      if (active) setError('Nao foi possivel carregar o Admin YUX Hub.')
    } finally {
      if (active) setLoading(false)
    }
  }

  load()
  return () => { active = false }
}, [])
```

- [ ] **Step 2: Verify type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/platform/AdminHubPage.tsx
git commit -m "feat: load admin hub summary"
```

---

## Phase 3: Integrations, SMTP2GO and AI Administration

### Task 8: Create global integrations page

**Files:**
- Create: `frontend/src/pages/platform/AdminIntegrationsPage.tsx`
- Create: `frontend/src/components/platform/admin/AdminStatusBadge.tsx`
- Create: `frontend/src/components/platform/admin/ProviderConnectionPanel.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create status badge**

```tsx
const classByStatus = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  degraded: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  disabled: 'bg-gray-100 text-gray-700 border-gray-200',
  needs_reauth: 'bg-orange-50 text-orange-700 border-orange-200',
  stale: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  not_configured: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function AdminStatusBadge({ status }: { status: keyof typeof classByStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${classByStatus[status]}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 2: Create provider panel**

The panel must show provider name, type, environment, status, masked secret, last check and error.

```tsx
export function ProviderConnectionPanel({ providers }: { providers: PlatformProviderConnection[] }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Provedores globais</h2>
      </div>
      <div className="divide-y">
        {providers.map(provider => (
          <div key={provider.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900">{provider.displayName}</p>
                <p className="text-sm text-gray-500">{provider.providerType} / {provider.environment}</p>
                <p className="mt-1 text-xs text-gray-500">{maskSecretReference(provider.secretReference)}</p>
              </div>
              <AdminStatusBadge status={provider.status} />
            </div>
            {provider.lastError && <p className="mt-2 text-sm text-red-600">{provider.lastError}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create page and route**

Register:

```tsx
import { AdminIntegrationsPage } from '@/pages/platform/AdminIntegrationsPage'

<Route path="admin/integrations" element={<AdminIntegrationsPage />} />
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/platform/AdminIntegrationsPage.tsx frontend/src/components/platform/admin/AdminStatusBadge.tsx frontend/src/components/platform/admin/ProviderConnectionPanel.tsx
git commit -m "feat: add admin integrations page"
```

### Task 9: Create Email/SMTP2GO administration page

**Files:**
- Create: `frontend/src/pages/platform/AdminEmailPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/adminPlatformService.ts`
- Modify: `frontend/src/types/adminPlatform.ts`

- [ ] **Step 1: Add email admin types**

```ts
export interface Smtp2GoAdminSummary {
  connectionCount: number
  subaccountCount: number
  sentToday: number
  failedToday: number
  suppressedCount: number
}
```

- [ ] **Step 2: Add service method**

Read existing tables from `20260604070000_smtp2go_email_hub.sql`:

```ts
async getSmtp2GoSummary(): Promise<Smtp2GoAdminSummary> {
  const today = new Date().toISOString().slice(0, 10)
  const [connections, subaccounts, usage, suppressions] = await Promise.all([
    supabase.from('email_provider_connections').select('id', { count: 'exact', head: true }),
    supabase.from('smtp2go_subaccounts').select('id', { count: 'exact', head: true }),
    supabase.from('email_usage_counters').select('sent_count, failed_count').eq('period_date', today),
    supabase.from('email_suppression_entries').select('id', { count: 'exact', head: true }),
  ])

  if (connections.error) throw connections.error
  if (subaccounts.error) throw subaccounts.error
  if (usage.error) throw usage.error
  if (suppressions.error) throw suppressions.error

  return {
    connectionCount: connections.count || 0,
    subaccountCount: subaccounts.count || 0,
    sentToday: (usage.data || []).reduce((sum, row: any) => sum + Number(row.sent_count || 0), 0),
    failedToday: (usage.data || []).reduce((sum, row: any) => sum + Number(row.failed_count || 0), 0),
    suppressedCount: suppressions.count || 0,
  }
}
```

- [ ] **Step 3: Create page**

The page must state that SMTP2GO is shared infrastructure and show:

- master connections;
- subaccounts;
- sent today;
- failed today;
- suppressions;
- link back to integrations.

- [ ] **Step 4: Register route**

```tsx
import { AdminEmailPage } from '@/pages/platform/AdminEmailPage'

<Route path="admin/email" element={<AdminEmailPage />} />
```

- [ ] **Step 5: Run tests and type-check**

```bash
npm test -- src/services/adminPlatformService.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/platform/AdminEmailPage.tsx frontend/src/services/adminPlatformService.ts frontend/src/types/adminPlatform.ts frontend/src/services/adminPlatformService.test.ts
git commit -m "feat: add smtp2go admin page"
```

### Task 10: Create IA/LLM administration page

**Files:**
- Create: `frontend/src/pages/platform/AdminAiPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Filter LLM providers from existing provider service**

In the page:

```tsx
const providers = await adminPlatformService.getProviderConnections()
setProviders(providers.filter(provider => provider.providerType === 'llm'))
```

- [ ] **Step 2: Render governance sections**

Page sections:

- Provedores LLM;
- Modelos globais;
- Uso por modulo;
- Overrides por cliente;
- Custos e falhas;
- Aviso de credenciais server-side.

Use empty state:

```tsx
{providers.length === 0 && (
  <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-gray-500">
    Nenhum provedor LLM configurado. Cadastre a conexao global em Integracoes antes de liberar IA para clientes.
  </div>
)}
```

- [ ] **Step 3: Register route**

```tsx
import { AdminAiPage } from '@/pages/platform/AdminAiPage'

<Route path="admin/ai" element={<AdminAiPage />} />
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/platform/AdminAiPage.tsx
git commit -m "feat: add llm admin page"
```

---

## Phase 4: Module Governance and Client Limits

### Task 11: Add client module limits panel

**Files:**
- Create: `frontend/src/components/platform/admin/UsageLimitBar.tsx`
- Create: `frontend/src/components/platform/admin/ClientModuleLimitsPanel.tsx`
- Modify: `frontend/src/components/platform/ContractModulesPanel.tsx`

- [ ] **Step 1: Create usage limit bar**

```tsx
export function UsageLimitBar({ used, limit }: { used: number; limit?: number | null }) {
  const percentage = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{used}</span>
        <span>{limit ?? 'Sem limite'}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yux-600" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create limits panel**

The panel receives `organizationId`, `contractId`, `moduleKey`, loads limits, and renders:

- `limitKey`;
- `limitValue`;
- `source`;
- effective date.

- [ ] **Step 3: Add panel entry point in contract modules**

Inside each module row, show a small link/button:

```tsx
<button
  type="button"
  className="text-xs font-medium text-yux-700 hover:text-yux-800"
  onClick={event => {
    event.preventDefault()
    setSelectedLimitModule(module.key)
  }}
>
  Limites
</button>
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/platform/admin/UsageLimitBar.tsx frontend/src/components/platform/admin/ClientModuleLimitsPanel.tsx frontend/src/components/platform/ContractModulesPanel.tsx
git commit -m "feat: surface contract module limits"
```

### Task 12: Add module governance page

**Files:**
- Create: `frontend/src/pages/platform/AdminModuleGovernancePage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`

- [ ] **Step 1: Create page**

The page must group clients by module:

- CRM;
- Automacoes;
- Financeiro;
- Suporte;
- Email;
- IA.

For the first implementation, derive module activity from contracts and `client_module_limits`.

- [ ] **Step 2: Register route and sidebar item**

```tsx
import { AdminModuleGovernancePage } from '@/pages/platform/AdminModuleGovernancePage'

<Route path="admin/modules-governance" element={<AdminModuleGovernancePage />} />
```

Add item under Gestao YUX Hub or Infraestrutura:

```ts
{ label: 'Governanca por Modulo', href: '/admin/modules-governance' }
```

- [ ] **Step 3: Run navigation tests and type-check**

```bash
npm test -- src/lib/platform/navigation.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts frontend/src/pages/platform/AdminModuleGovernancePage.tsx
git commit -m "feat: add module governance overview"
```

---

## Phase 5: Audit, Health and Commercial Refinement

### Task 13: Add audit and health page

**Files:**
- Create: `frontend/src/pages/platform/AdminHealthPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`

- [ ] **Step 1: Create health page**

Sections:

- provedores com falha;
- limites excedidos;
- eventos de auditoria recentes;
- falhas de email;
- falhas de IA;
- clientes impactados.

Use `adminPlatformService.getProviderConnections()`, `getUsageCounters()` and `getAuditEvents(50)`.

- [ ] **Step 2: Register route and sidebar item**

```tsx
import { AdminHealthPage } from '@/pages/platform/AdminHealthPage'

<Route path="admin/health" element={<AdminHealthPage />} />
```

Sidebar item:

```ts
{ label: 'Saude do Sistema', href: '/admin/health' }
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/pages/platform/AdminHealthPage.tsx
git commit -m "feat: add admin health center"
```

### Task 14: Update existing platform copy and docs

**Files:**
- Modify: `frontend/src/pages/platform/ModulesPage.tsx`
- Modify: `docs/implementation-status.md`
- Create or modify: `docs/admin-yux-hub.md`

- [ ] **Step 1: Update visible copy**

In `ModulesPage`, replace:

```tsx
<p className="text-gray-600">Controle a base modular do YUX OS.</p>
```

with:

```tsx
<p className="text-gray-600">Controle a base modular do YUX Hub.</p>
```

- [ ] **Step 2: Create operational documentation**

`docs/admin-yux-hub.md` must include:

- finalidade do Admin YUX Hub;
- quem pode acessar;
- relacao entre clientes, contratos, pacotes e modulos;
- como limites sao aplicados;
- onde configurar integracoes;
- como SMTP2GO e usado;
- como IA/LLM e governada;
- como consultar saude e auditoria;
- funcionalidades implementadas;
- funcionalidades futuras fora deste ciclo.

- [ ] **Step 3: Update implementation status**

Add section:

```md
## Admin YUX Hub

Status: implementado em fases.

- Sidebar agrupada por categorias.
- Painel central Admin YUX Hub.
- Limites por cliente, contrato e modulo.
- Integracoes globais e por cliente.
- Governanca SMTP2GO.
- Governanca IA/LLM.
- Governanca por modulo.
- Auditoria e saude operacional.
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/platform/ModulesPage.tsx docs/implementation-status.md docs/admin-yux-hub.md
git commit -m "docs: document admin yux hub"
```

### Task 15: Full verification

**Files:**
- No code changes expected unless verification finds defects.

- [ ] **Step 1: Run focused tests**

From `frontend`:

```bash
npm test -- src/lib/platform/navigation.test.ts src/lib/platform/adminRules.test.ts src/services/adminPlatformService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start local dev server**

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 5: Browser verification**

Open:

- `http://127.0.0.1:5173/admin`
- `http://127.0.0.1:5173/admin/integrations`
- `http://127.0.0.1:5173/admin/email`
- `http://127.0.0.1:5173/admin/ai`
- `http://127.0.0.1:5173/admin/modules-governance`
- `http://127.0.0.1:5173/admin/health`

Verify:

- sidebar groups render;
- logo says YUX Hub;
- client portal still says Portal YUX;
- no console error from missing routes;
- loading states resolve or show explicit backend unavailable messages;
- pages do not expose raw secret values.

- [ ] **Step 6: Commit verification fixes if they were needed**

If verification required fixes, run `git status --short`, review the exact files changed by the fix, then commit only those files with:

```bash
git commit -m "fix: stabilize admin yux hub verification"
```

---

## Implementation Order

1. Task 1: grouped navigation model.
2. Task 2: grouped sidebar and branding.
3. Task 3: Admin YUX Hub dashboard shell.
4. Task 4: database foundation.
5. Task 5: admin rules and types.
6. Task 6: admin platform service.
7. Task 7: dashboard live summary.
8. Task 8: global integrations page.
9. Task 9: Email/SMTP2GO page.
10. Task 10: IA/LLM page.
11. Task 11: contract module limits panel.
12. Task 12: module governance page.
13. Task 13: health and audit page.
14. Task 14: docs and copy.
15. Task 15: full verification.

## Self-Review

- Spec coverage: all eight phases from `2026-06-04-yux-hub-admin-platform-design.md` map to tasks in this plan.
- Scope: the plan builds the admin platform foundation and visible pages; advanced billing, checkout and automatic provider provisioning remain out of scope.
- Data safety: credentials remain represented by `secret_reference`; no raw API keys are stored or rendered by frontend tasks.
- Access control: database policies use `private.is_platform_admin()` and frontend routes stay under internal-only route block.
- Testing: navigation, pure rules, service mapping, type-check, build and browser verification are covered.
