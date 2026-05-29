# YUX OS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the integrated modular foundation for YUX OS and Portal YUX: organizations, roles, contracts, packages, module activation, blueprints, dynamic navigation, and the first complete operational surfaces that future modules can plug into.

**Architecture:** Keep React/Vite as the frontend and Supabase as the operational data core. Add a typed domain layer between UI and Supabase so components consume camelCase business objects, module activation rules, and permission checks instead of raw database details. Implement the complete platform structure now, but deliver it in dependency order so later CRM, portal, proposals, automations, BI, WhatsApp IA, and blueprints reuse the same primitives.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI, Zustand, Supabase JS, PostgreSQL migrations, Vitest for domain/unit tests.

---

## File Structure

Create or modify these files:

- Create: `frontend/src/types/platform.ts`  
  Domain types for organizations, memberships, roles, permissions, packages, contracts, modules, and blueprints.

- Create: `frontend/src/lib/platform/moduleRegistry.ts`  
  Static registry of available modules and navigation metadata.

- Create: `frontend/src/lib/platform/accessControl.ts`  
  Pure permission and module-activation helpers.

- Create: `frontend/src/lib/platform/accessControl.test.ts`  
  Unit tests for module activation, role permissions, and portal/internal visibility.

- Create: `frontend/src/lib/platform/navigation.ts`  
  Pure function that derives sidebar items from current user context and active modules.

- Create: `frontend/src/lib/platform/navigation.test.ts`  
  Unit tests for internal and client portal navigation.

- Create: `frontend/src/services/platformService.ts`  
  Supabase service for loading organizations, contracts, packages, modules, memberships, and blueprints.

- Create: `frontend/src/stores/platformStore.ts`  
  Zustand store for active organization, membership, enabled modules, and portal/internal mode.

- Modify: `frontend/src/components/navigation/Sidebar.tsx`  
  Replace hardcoded menu logic with module-aware navigation.

- Modify: `frontend/src/components/layouts/DashboardLayout.tsx`  
  Load platform context and pass mode-aware navigation.

- Modify: `frontend/src/App.tsx`  
  Keep current route structure and register the concrete modular pages created in this plan.

- Create: `frontend/src/pages/platform/ModulesPage.tsx`  
  Internal page to inspect packages, modules, and enabled contract modules.

- Create: `frontend/src/pages/platform/BlueprintsPage.tsx`  
  Internal page to inspect sector blueprints and module presets.

- Create: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`  
  Client portal dashboard based on active contract modules.

- Create: `supabase/migrations/20260530000000_yux_os_foundation.sql`  
  Database foundation for organizations, memberships, permissions, packages, modules, contracts, contract modules, blueprints, and blueprint module presets.

- Create: `supabase/migrations/20260530001000_yux_os_foundation_seed.sql`  
  Idempotent seed for YUX internal organization, base package, modules, roles, permissions, and starter blueprints.

- Modify: `ARQUITETURA-MINIMA.md`  
  Link the approved YUX OS spec and implementation plan.

- Modify: `README.md` and `ROADMAP.md`  
  Replace old roadmap framing with the integrated modular platform sequence.

---

## Task 1: Add Unit Test Harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tsconfig.json`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: Add test dependencies**

Run:

```powershell
cd frontend
npm install -D vitest @vitest/coverage-v8 jsdom
```

Expected: dependencies install and `package-lock.json` updates.

- [ ] **Step 2: Add test script**

Modify `frontend/package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Create Vitest config**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Run test command**

Run:

```powershell
npm run test
```

Expected: command succeeds with "No test files found" or exits cleanly depending on Vitest version. If Vitest exits nonzero because no tests exist, continue to Task 2 and use the first test file as the red test.

- [ ] **Step 5: Verify existing baseline**

Run:

```powershell
npm run type-check
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

If working in a Git repo:

```powershell
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vitest.config.ts
git commit -m "test: add vitest harness"
```

If the folder is still not a Git repository, record that in the implementation notes and continue without committing.

---

## Task 2: Define Platform Domain Types

**Files:**
- Create: `frontend/src/types/platform.ts`
- Test: `frontend/src/lib/platform/accessControl.test.ts`

- [ ] **Step 1: Write the failing type-consumer test**

Create `frontend/src/lib/platform/accessControl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PlatformModule, PlatformRole } from '@/types/platform'

describe('platform domain types', () => {
  it('supports module and role primitives used by the platform foundation', () => {
    const module: PlatformModule = {
      key: 'crm',
      name: 'CRM',
      base: false,
      internalRoute: '/crm',
      portalRoute: null,
      requiredPermissions: ['crm.read'],
    }

    const role: PlatformRole = {
      key: 'yux_admin',
      name: 'YUX Admin',
      permissions: ['crm.read'],
      scope: 'internal',
    }

    expect(module.key).toBe('crm')
    expect(role.permissions).toContain('crm.read')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: FAIL with an import/type resolution error because `@/types/platform` does not exist.

- [ ] **Step 3: Create platform types**

Create `frontend/src/types/platform.ts`:

```ts
export type PlatformMode = 'internal' | 'portal'

export type OrganizationKind = 'yux' | 'client'

export interface Organization {
  id: string
  name: string
  slug: string
  kind: OrganizationKind
  createdAt: string
  updatedAt: string
}

export type PermissionKey =
  | 'platform.manage'
  | 'clients.read'
  | 'clients.write'
  | 'crm.read'
  | 'crm.write'
  | 'leads.read'
  | 'leads.write'
  | 'projects.read'
  | 'projects.write'
  | 'deliveries.read'
  | 'deliveries.write'
  | 'approvals.read'
  | 'approvals.write'
  | 'proposals.read'
  | 'proposals.write'
  | 'campaigns.read'
  | 'campaigns.write'
  | 'reports.read'
  | 'reports.write'
  | 'automations.read'
  | 'automations.write'
  | 'support.read'
  | 'support.write'
  | 'finance.read'
  | 'finance.write'
  | 'blueprints.read'
  | 'blueprints.write'

export type RoleScope = 'internal' | 'client'

export interface PlatformRole {
  key: string
  name: string
  scope: RoleScope
  permissions: PermissionKey[]
}

export interface Membership {
  id: string
  userId: string
  organizationId: string
  roleKey: string
  createdAt: string
  updatedAt: string
}

export interface PlatformModule {
  key: string
  name: string
  base: boolean
  internalRoute: string | null
  portalRoute: string | null
  requiredPermissions: PermissionKey[]
}

export interface PackageDefinition {
  id: string
  key: string
  name: string
  description: string
  moduleKeys: string[]
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  clientId: string
  packageId: string
  status: 'draft' | 'active' | 'paused' | 'cancelled' | 'completed'
  startsAt: string
  endsAt?: string
  createdAt: string
  updatedAt: string
}

export interface ContractModule {
  contractId: string
  moduleKey: string
  enabled: boolean
}

export interface Blueprint {
  id: string
  key: string
  name: string
  sector: string
  description: string
  moduleKeys: string[]
  createdAt: string
  updatedAt: string
}

export interface PlatformContext {
  mode: PlatformMode
  organization: Organization | null
  membership: Membership | null
  role: PlatformRole | null
  enabledModuleKeys: string[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/types/platform.ts frontend/src/lib/platform/accessControl.test.ts
git commit -m "feat: define platform domain types"
```

Skip commit only if the workspace is not a Git repository.

---

## Task 3: Implement Module Registry

**Files:**
- Create: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/lib/platform/accessControl.test.ts`

- [ ] **Step 1: Extend failing test for module registry**

Append to `frontend/src/lib/platform/accessControl.test.ts`:

```ts
import { PLATFORM_MODULES, getPlatformModule } from '@/lib/platform/moduleRegistry'

describe('module registry', () => {
  it('contains the modules required by the approved YUX OS design', () => {
    const keys = PLATFORM_MODULES.map(module => module.key)

    expect(keys).toContain('crm')
    expect(keys).toContain('projects')
    expect(keys).toContain('proposals')
    expect(keys).toContain('whatsapp_ai')
    expect(keys).toContain('campaigns')
    expect(keys).toContain('bi_reports')
    expect(keys).toContain('automations')
    expect(keys).toContain('support')
    expect(keys).toContain('finance')
    expect(keys).toContain('blueprints')
  })

  it('can find a module by key', () => {
    expect(getPlatformModule('projects')?.name).toBe('Projetos e Entregas')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: FAIL because `@/lib/platform/moduleRegistry` does not exist.

- [ ] **Step 3: Create module registry**

Create `frontend/src/lib/platform/moduleRegistry.ts`:

```ts
import type { PlatformModule } from '@/types/platform'

export const PLATFORM_MODULES: PlatformModule[] = [
  {
    key: 'clients',
    name: 'Clientes',
    base: true,
    internalRoute: '/clients',
    portalRoute: null,
    requiredPermissions: ['clients.read'],
  },
  {
    key: 'crm',
    name: 'CRM',
    base: false,
    internalRoute: '/leads',
    portalRoute: null,
    requiredPermissions: ['crm.read', 'leads.read'],
  },
  {
    key: 'projects',
    name: 'Projetos e Entregas',
    base: true,
    internalRoute: '/projects',
    portalRoute: '/portal/projects',
    requiredPermissions: ['projects.read'],
  },
  {
    key: 'proposals',
    name: 'Propostas',
    base: false,
    internalRoute: '/proposals',
    portalRoute: null,
    requiredPermissions: ['proposals.read'],
  },
  {
    key: 'whatsapp_ai',
    name: 'WhatsApp IA',
    base: false,
    internalRoute: '/whatsapp-ai',
    portalRoute: '/portal/whatsapp-ai',
    requiredPermissions: ['support.read'],
  },
  {
    key: 'campaigns',
    name: 'Campanhas e Ads',
    base: false,
    internalRoute: '/campaigns',
    portalRoute: '/portal/campaigns',
    requiredPermissions: ['campaigns.read'],
  },
  {
    key: 'bi_reports',
    name: 'BI e Relatorios',
    base: false,
    internalRoute: '/reports',
    portalRoute: '/portal/reports',
    requiredPermissions: ['reports.read'],
  },
  {
    key: 'automations',
    name: 'Automacoes',
    base: false,
    internalRoute: '/automations',
    portalRoute: null,
    requiredPermissions: ['automations.read'],
  },
  {
    key: 'support',
    name: 'Suporte',
    base: true,
    internalRoute: '/support',
    portalRoute: '/portal/support',
    requiredPermissions: ['support.read'],
  },
  {
    key: 'finance',
    name: 'Financeiro',
    base: false,
    internalRoute: '/finance',
    portalRoute: '/portal/finance',
    requiredPermissions: ['finance.read'],
  },
  {
    key: 'blueprints',
    name: 'Blueprints',
    base: false,
    internalRoute: '/blueprints',
    portalRoute: null,
    requiredPermissions: ['blueprints.read'],
  },
]

export function getPlatformModule(key: string) {
  return PLATFORM_MODULES.find(module => module.key === key)
}
```

- [ ] **Step 4: Run registry tests**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run baseline checks**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/lib/platform/moduleRegistry.ts frontend/src/lib/platform/accessControl.test.ts
git commit -m "feat: add platform module registry"
```

---

## Task 4: Implement Access Control Helpers

**Files:**
- Create: `frontend/src/lib/platform/accessControl.ts`
- Modify: `frontend/src/lib/platform/accessControl.test.ts`

- [ ] **Step 1: Add failing access-control tests**

Append to `frontend/src/lib/platform/accessControl.test.ts`:

```ts
import { canAccessModule, hasPermission } from '@/lib/platform/accessControl'

describe('access control', () => {
  const role = {
    key: 'yux_admin',
    name: 'YUX Admin',
    scope: 'internal' as const,
    permissions: ['projects.read', 'clients.read'] as const,
  }

  it('allows a base module when role has required permission', () => {
    const module = getPlatformModule('projects')!

    expect(canAccessModule(module, role, ['projects'])).toBe(true)
  })

  it('blocks optional modules that are not enabled', () => {
    const module = getPlatformModule('campaigns')!

    expect(canAccessModule(module, role, ['projects'])).toBe(false)
  })

  it('checks individual permissions', () => {
    expect(hasPermission(role, 'projects.read')).toBe(true)
    expect(hasPermission(role, 'finance.write')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: FAIL because `accessControl.ts` does not exist.

- [ ] **Step 3: Create access-control implementation**

Create `frontend/src/lib/platform/accessControl.ts`:

```ts
import type { PermissionKey, PlatformModule, PlatformRole } from '@/types/platform'

export function hasPermission(role: PlatformRole | null, permission: PermissionKey) {
  if (!role) return false
  if (role.permissions.includes('platform.manage')) return true
  return role.permissions.includes(permission)
}

export function hasEveryPermission(role: PlatformRole | null, permissions: PermissionKey[]) {
  return permissions.every(permission => hasPermission(role, permission))
}

export function isModuleEnabled(module: PlatformModule, enabledModuleKeys: string[]) {
  return module.base || enabledModuleKeys.includes(module.key)
}

export function canAccessModule(
  module: PlatformModule,
  role: PlatformRole | null,
  enabledModuleKeys: string[],
) {
  return isModuleEnabled(module, enabledModuleKeys) && hasEveryPermission(role, module.requiredPermissions)
}
```

- [ ] **Step 4: Run access-control tests**

Run:

```powershell
npm run test -- src/lib/platform/accessControl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run baseline checks**

Run:

```powershell
npm run type-check
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/lib/platform/accessControl.ts frontend/src/lib/platform/accessControl.test.ts
git commit -m "feat: add platform access control helpers"
```

---

## Task 5: Implement Dynamic Navigation

**Files:**
- Create: `frontend/src/lib/platform/navigation.ts`
- Create: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Write failing navigation tests**

Create `frontend/src/lib/platform/navigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildNavigation } from '@/lib/platform/navigation'
import type { PlatformContext } from '@/types/platform'

const internalContext: PlatformContext = {
  mode: 'internal',
  organization: null,
  membership: null,
  role: {
    key: 'yux_admin',
    name: 'YUX Admin',
    scope: 'internal',
    permissions: ['platform.manage'],
  },
  enabledModuleKeys: ['crm', 'projects', 'campaigns', 'blueprints'],
}

describe('buildNavigation', () => {
  it('builds internal navigation from active modules and permissions', () => {
    const items = buildNavigation(internalContext)
    const labels = items.map(item => item.label)

    expect(labels).toContain('Dashboard')
    expect(labels).toContain('Clientes')
    expect(labels).toContain('CRM')
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas e Ads')
    expect(labels).toContain('Blueprints')
  })

  it('builds portal navigation without internal-only modules', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'campaigns.read', 'support.read'],
      },
      enabledModuleKeys: ['projects', 'campaigns', 'support', 'blueprints'],
    })
    const labels = items.map(item => item.label)

    expect(labels).toContain('Portal')
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas e Ads')
    expect(labels).toContain('Suporte')
    expect(labels).not.toContain('Blueprints')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- src/lib/platform/navigation.test.ts
```

Expected: FAIL because `navigation.ts` does not exist.

- [ ] **Step 3: Create navigation builder**

Create `frontend/src/lib/platform/navigation.ts`:

```ts
import type { PlatformContext } from '@/types/platform'
import { canAccessModule } from '@/lib/platform/accessControl'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'

export interface NavigationItem {
  label: string
  href: string
  moduleKey?: string
}

export function buildNavigation(context: PlatformContext): NavigationItem[] {
  const baseItems: NavigationItem[] = context.mode === 'internal'
    ? [{ label: 'Dashboard', href: '/dashboard' }]
    : [{ label: 'Portal', href: '/portal' }]

  const moduleItems = PLATFORM_MODULES
    .filter(module => {
      const route = context.mode === 'internal' ? module.internalRoute : module.portalRoute
      if (!route) return false
      return canAccessModule(module, context.role, context.enabledModuleKeys)
    })
    .map(module => ({
      label: module.name,
      href: context.mode === 'internal' ? module.internalRoute! : module.portalRoute!,
      moduleKey: module.key,
    }))

  return [...baseItems, ...moduleItems]
}
```

- [ ] **Step 4: Run navigation tests**

Run:

```powershell
npm run test -- src/lib/platform/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and type-check**

Run:

```powershell
npm run test
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: derive navigation from modules and permissions"
```

---

## Task 6: Add YUX OS Foundation Database Migration

**Files:**
- Create: `supabase/migrations/20260530000000_yux_os_foundation.sql`
- Create: `supabase/migrations/20260530001000_yux_os_foundation_seed.sql`

- [ ] **Step 1: Create foundation schema migration**

Create `supabase/migrations/20260530000000_yux_os_foundation.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('yux', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.roles (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('internal', 'client')),
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES public.roles(key),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.platform_modules (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base BOOLEAN NOT NULL DEFAULT FALSE,
  internal_route TEXT,
  portal_route TEXT,
  required_permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.package_modules (
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  PRIMARY KEY (package_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'cancelled', 'completed')),
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_modules (
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (contract_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blueprint_modules (
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  PRIMARY KEY (blueprint_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE CASCADE,
  module_key TEXT REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean', 'textarea')),
  options JSONB,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, module_key, entity, key)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON public.memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_modules_contract_id ON public.contract_modules(contract_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_modules_blueprint_id ON public.blueprint_modules(blueprint_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read organizations" ON public.organizations;
CREATE POLICY "Authenticated users can read organizations" ON public.organizations FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.roles;
CREATE POLICY "Authenticated users can read roles" ON public.roles FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read memberships" ON public.memberships;
CREATE POLICY "Authenticated users can read memberships" ON public.memberships FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read modules" ON public.platform_modules;
CREATE POLICY "Authenticated users can read modules" ON public.platform_modules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read packages" ON public.packages;
CREATE POLICY "Authenticated users can read packages" ON public.packages FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read package modules" ON public.package_modules;
CREATE POLICY "Authenticated users can read package modules" ON public.package_modules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read contracts" ON public.contracts;
CREATE POLICY "Authenticated users can read contracts" ON public.contracts FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read contract modules" ON public.contract_modules;
CREATE POLICY "Authenticated users can read contract modules" ON public.contract_modules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read blueprints" ON public.blueprints;
CREATE POLICY "Authenticated users can read blueprints" ON public.blueprints FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read blueprint modules" ON public.blueprint_modules;
CREATE POLICY "Authenticated users can read blueprint modules" ON public.blueprint_modules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read custom fields" ON public.custom_fields;
CREATE POLICY "Authenticated users can read custom fields" ON public.custom_fields FOR SELECT USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Create foundation seed migration**

Create `supabase/migrations/20260530001000_yux_os_foundation_seed.sql`:

```sql
INSERT INTO public.organizations (id, name, slug, kind)
VALUES ('00000000-0000-0000-0000-000000000001', 'YUX Solucoes em IA', 'yux', 'yux')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind;

INSERT INTO public.roles (key, name, scope, permissions)
VALUES
('yux_owner', 'YUX Owner', 'internal', ARRAY['platform.manage']),
('yux_admin', 'YUX Admin', 'internal', ARRAY['clients.read','clients.write','crm.read','crm.write','leads.read','leads.write','projects.read','projects.write','deliveries.read','deliveries.write','approvals.read','approvals.write','proposals.read','proposals.write','campaigns.read','campaigns.write','reports.read','reports.write','automations.read','automations.write','support.read','support.write','finance.read','finance.write','blueprints.read','blueprints.write']),
('yux_operator', 'YUX Operator', 'internal', ARRAY['clients.read','crm.read','leads.read','leads.write','projects.read','projects.write','support.read','support.write']),
('client_admin', 'Client Admin', 'client', ARRAY['projects.read','approvals.read','approvals.write','campaigns.read','reports.read','support.read','support.write','finance.read']),
('client_user', 'Client User', 'client', ARRAY['projects.read','approvals.read','support.read','support.write','reports.read'])
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope, permissions = EXCLUDED.permissions;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES
('clients', 'Clientes', true, '/clients', null, ARRAY['clients.read']),
('crm', 'CRM', false, '/leads', null, ARRAY['crm.read','leads.read']),
('projects', 'Projetos e Entregas', true, '/projects', '/portal/projects', ARRAY['projects.read']),
('proposals', 'Propostas', false, '/proposals', null, ARRAY['proposals.read']),
('whatsapp_ai', 'WhatsApp IA', false, '/whatsapp-ai', '/portal/whatsapp-ai', ARRAY['support.read']),
('campaigns', 'Campanhas e Ads', false, '/campaigns', '/portal/campaigns', ARRAY['campaigns.read']),
('bi_reports', 'BI e Relatorios', false, '/reports', '/portal/reports', ARRAY['reports.read']),
('automations', 'Automacoes', false, '/automations', null, ARRAY['automations.read']),
('support', 'Suporte', true, '/support', '/portal/support', ARRAY['support.read']),
('finance', 'Financeiro', false, '/finance', '/portal/finance', ARRAY['finance.read']),
('blueprints', 'Blueprints', false, '/blueprints', null, ARRAY['blueprints.read'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  base = EXCLUDED.base,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions;

INSERT INTO public.packages (id, key, name, description)
VALUES
('10000000-0000-0000-0000-000000000001', 'presenca-digital-ia', 'Presenca Digital + IA', 'Entrada com site, formulario, portal, WhatsApp basico e relatorio simples.'),
('10000000-0000-0000-0000-000000000002', 'atendimento-inteligente', 'Atendimento Inteligente', 'WhatsApp IA, base de conhecimento, CRM basico, follow-up, agenda e relatorio.'),
('10000000-0000-0000-0000-000000000003', 'maquina-comercial', 'Maquina Comercial', 'CRM, WhatsApp IA, campanhas, landing pages, automacoes, ROI e relatorios.'),
('10000000-0000-0000-0000-000000000004', 'operacao-inteligente', 'Operacao Inteligente', 'Automacoes internas, BI, integracoes, financeiro, atendimento e relatorios.'),
('10000000-0000-0000-0000-000000000005', 'software-sob-medida', 'Software Sob Medida', 'App, portal, dashboard, IA customizada, integracoes e suporte evolutivo.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO public.package_modules (package_id, module_key)
VALUES
('10000000-0000-0000-0000-000000000001', 'clients'),
('10000000-0000-0000-0000-000000000001', 'projects'),
('10000000-0000-0000-0000-000000000001', 'support'),
('10000000-0000-0000-0000-000000000002', 'clients'),
('10000000-0000-0000-0000-000000000002', 'crm'),
('10000000-0000-0000-0000-000000000002', 'whatsapp_ai'),
('10000000-0000-0000-0000-000000000002', 'support'),
('10000000-0000-0000-0000-000000000003', 'clients'),
('10000000-0000-0000-0000-000000000003', 'crm'),
('10000000-0000-0000-0000-000000000003', 'projects'),
('10000000-0000-0000-0000-000000000003', 'campaigns'),
('10000000-0000-0000-0000-000000000003', 'whatsapp_ai'),
('10000000-0000-0000-0000-000000000003', 'automations'),
('10000000-0000-0000-0000-000000000003', 'bi_reports'),
('10000000-0000-0000-0000-000000000004', 'automations'),
('10000000-0000-0000-0000-000000000004', 'bi_reports'),
('10000000-0000-0000-0000-000000000004', 'finance'),
('10000000-0000-0000-0000-000000000004', 'support'),
('10000000-0000-0000-0000-000000000005', 'clients'),
('10000000-0000-0000-0000-000000000005', 'projects'),
('10000000-0000-0000-0000-000000000005', 'automations'),
('10000000-0000-0000-0000-000000000005', 'bi_reports'),
('10000000-0000-0000-0000-000000000005', 'support')
ON CONFLICT DO NOTHING;

INSERT INTO public.blueprints (id, key, name, sector, description)
VALUES
('20000000-0000-0000-0000-000000000001', 'clinicas', 'Clinicas', 'Saude', 'Blueprint para captacao, atendimento e acompanhamento de pacientes.'),
('20000000-0000-0000-0000-000000000002', 'imobiliarias', 'Imobiliarias', 'Imobiliario', 'Blueprint para leads de imoveis, atendimento, propostas e campanhas.'),
('20000000-0000-0000-0000-000000000003', 'ecommerce', 'E-commerce', 'E-commerce', 'Blueprint para loja virtual, campanhas, ROI e automacoes comerciais.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector, description = EXCLUDED.description;

INSERT INTO public.blueprint_modules (blueprint_id, module_key)
VALUES
('20000000-0000-0000-0000-000000000001', 'crm'),
('20000000-0000-0000-0000-000000000001', 'whatsapp_ai'),
('20000000-0000-0000-0000-000000000001', 'support'),
('20000000-0000-0000-0000-000000000002', 'crm'),
('20000000-0000-0000-0000-000000000002', 'campaigns'),
('20000000-0000-0000-0000-000000000002', 'whatsapp_ai'),
('20000000-0000-0000-0000-000000000003', 'campaigns'),
('20000000-0000-0000-0000-000000000003', 'bi_reports'),
('20000000-0000-0000-0000-000000000003', 'automations')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Review migration locally**

Run:

```powershell
Select-String -Path supabase/migrations/20260530000000_yux_os_foundation.sql -Pattern "CREATE TABLE|CREATE POLICY|ALTER TABLE"
Select-String -Path supabase/migrations/20260530001000_yux_os_foundation_seed.sql -Pattern "INSERT INTO"
```

Expected: output shows the intended tables, policies, and seed inserts.

- [ ] **Step 4: Do not apply remote migration yet**

Do not run remote Supabase migration commands in this task. The Supabase project is currently inactive and production deployment is out of scope. Applying remote migrations belongs to a later environment task.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260530000000_yux_os_foundation.sql supabase/migrations/20260530001000_yux_os_foundation_seed.sql
git commit -m "feat: add yux os foundation schema"
```

---

## Task 7: Implement Platform Service

**Files:**
- Create: `frontend/src/services/platformService.ts`

- [ ] **Step 1: Create platform service**

Create `frontend/src/services/platformService.ts`:

```ts
import { supabase } from '@/lib/supabase'
import type {
  Blueprint,
  Contract,
  ContractModule,
  Membership,
  Organization,
  PackageDefinition,
  PlatformModule,
  PlatformRole,
} from '@/types/platform'

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRole(row: any): PlatformRole {
  return {
    key: row.key,
    name: row.name,
    scope: row.scope,
    permissions: row.permissions || [],
  }
}

function mapMembership(row: any): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    roleKey: row.role_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapModule(row: any): PlatformModule {
  return {
    key: row.key,
    name: row.name,
    base: row.base,
    internalRoute: row.internal_route,
    portalRoute: row.portal_route,
    requiredPermissions: row.required_permissions || [],
  }
}

function mapPackage(row: any): PackageDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    moduleKeys: Array.isArray(row.package_modules)
      ? row.package_modules.map((item: any) => item.module_key)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContract(row: any): Contract {
  return {
    id: row.id,
    clientId: row.client_id,
    packageId: row.package_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContractModule(row: any): ContractModule {
  return {
    contractId: row.contract_id,
    moduleKey: row.module_key,
    enabled: row.enabled,
  }
}

function mapBlueprint(row: any): Blueprint {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sector: row.sector,
    description: row.description || '',
    moduleKeys: Array.isArray(row.blueprint_modules)
      ? row.blueprint_modules.map((item: any) => item.module_key)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PlatformService {
  async getOrganizations() {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name')

    if (error) throw error
    return (data || []).map(mapOrganization)
  }

  async getRoles() {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('name')

    if (error) throw error
    return (data || []).map(mapRole)
  }

  async getMembershipsForUser(userId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error
    return (data || []).map(mapMembership)
  }

  async getModules() {
    const { data, error } = await supabase
      .from('platform_modules')
      .select('*')
      .order('name')

    if (error) throw error
    return (data || []).map(mapModule)
  }

  async getPackages() {
    const { data, error } = await supabase
      .from('packages')
      .select('*, package_modules(module_key)')
      .order('name')

    if (error) throw error
    return (data || []).map(mapPackage)
  }

  async getContractsForClient(clientId: string) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapContract)
  }

  async getContractModules(contractId: string) {
    const { data, error } = await supabase
      .from('contract_modules')
      .select('*')
      .eq('contract_id', contractId)

    if (error) throw error
    return (data || []).map(mapContractModule)
  }

  async getBlueprints() {
    const { data, error } = await supabase
      .from('blueprints')
      .select('*, blueprint_modules(module_key)')
      .order('name')

    if (error) throw error
    return (data || []).map(mapBlueprint)
  }
}

export const platformService = new PlatformService()
```

- [ ] **Step 2: Run type-check**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/services/platformService.ts
git commit -m "feat: add platform service"
```

---

## Task 8: Implement Platform Store

**Files:**
- Create: `frontend/src/stores/platformStore.ts`

- [ ] **Step 1: Create platform store**

Create `frontend/src/stores/platformStore.ts`:

```ts
import { create } from 'zustand'
import type { PlatformContext, PlatformMode, PlatformRole } from '@/types/platform'
import { platformService } from '@/services/platformService'

interface PlatformState extends PlatformContext {
  isLoading: boolean
  error: string | null
  roles: PlatformRole[]
  setMode: (mode: PlatformMode) => void
  initializeForUser: (userId: string) => Promise<void>
  setEnabledModuleKeys: (moduleKeys: string[]) => void
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  mode: 'internal',
  organization: null,
  membership: null,
  role: null,
  enabledModuleKeys: ['clients', 'projects', 'support'],
  isLoading: false,
  error: null,
  roles: [],

  setMode: (mode) => set({ mode }),

  setEnabledModuleKeys: (enabledModuleKeys) => set({ enabledModuleKeys }),

  initializeForUser: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      const [organizations, roles, memberships] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getRoles(),
        platformService.getMembershipsForUser(userId),
      ])

      const membership = memberships[0] || null
      const organization = membership
        ? organizations.find(item => item.id === membership.organizationId) || null
        : organizations.find(item => item.kind === 'yux') || null
      const role = membership
        ? roles.find(item => item.key === membership.roleKey) || null
        : roles.find(item => item.key === 'yux_admin') || null

      set({
        organization,
        membership,
        role,
        roles,
        isLoading: false,
      })
    } catch (error) {
      console.error('Platform initialization error:', error)
      set({
        error: 'Erro ao carregar contexto da plataforma',
        isLoading: false,
      })
    }
  },
}))

export function usePlatformContext(): PlatformContext {
  const state = usePlatformStore()
  return {
    mode: state.mode,
    organization: state.organization,
    membership: state.membership,
    role: state.role,
    enabledModuleKeys: state.enabledModuleKeys,
  }
}
```

- [ ] **Step 2: Run type-check**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/stores/platformStore.ts
git commit -m "feat: add platform context store"
```

---

## Task 9: Wire Dynamic Sidebar Navigation

**Files:**
- Modify: `frontend/src/components/navigation/Sidebar.tsx`
- Modify: `frontend/src/components/layouts/DashboardLayout.tsx`

- [ ] **Step 1: Inspect current sidebar props**

Run:

```powershell
Get-Content -LiteralPath frontend/src/components/navigation/Sidebar.tsx
Get-Content -LiteralPath frontend/src/components/layouts/DashboardLayout.tsx
```

Expected: identify current hardcoded navigation and layout structure.

- [ ] **Step 2: Modify Sidebar to consume platform navigation**

Replace the hardcoded menu list in `Sidebar.tsx` with logic equivalent to:

```tsx
import { Link, useLocation } from 'react-router-dom'
import { buildNavigation } from '@/lib/platform/navigation'
import { usePlatformContext } from '@/stores/platformStore'

export function Sidebar() {
  const location = useLocation()
  const platformContext = usePlatformContext()
  const navigation = buildNavigation(platformContext)

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      <div className="px-6 py-4">
        <div className="text-lg font-semibold text-gray-900">YUX OS</div>
        <div className="text-xs text-gray-500">
          {platformContext.mode === 'internal' ? 'Operacao interna' : 'Portal do cliente'}
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navigation.map(item => {
          const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                active ? 'bg-yux-50 text-yux-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

If the existing sidebar has additional required props or styling, preserve the surrounding shell and replace only the navigation source.

- [ ] **Step 3: Initialize platform context in layout**

In `DashboardLayout.tsx`, import auth and platform stores:

```tsx
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'
```

Inside the component, initialize platform context:

```tsx
const { user } = useAuthStore()
const initializeForUser = usePlatformStore(state => state.initializeForUser)

useEffect(() => {
  if (user?.id) {
    initializeForUser(user.id)
  }
}, [initializeForUser, user?.id])
```

- [ ] **Step 4: Run type-check**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/components/navigation/Sidebar.tsx frontend/src/components/layouts/DashboardLayout.tsx
git commit -m "feat: wire module-aware navigation"
```

---

## Task 10: Add Platform Admin Pages

**Files:**
- Create: `frontend/src/pages/platform/ModulesPage.tsx`
- Create: `frontend/src/pages/platform/BlueprintsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create Modules page**

Create `frontend/src/pages/platform/ModulesPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { PackageDefinition, PlatformModule } from '@/types/platform'

export function ModulesPage() {
  const [modules, setModules] = useState<PlatformModule[]>([])
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [loadedModules, loadedPackages] = await Promise.all([
          platformService.getModules(),
          platformService.getPackages(),
        ])
        setModules(loadedModules)
        setPackages(loadedPackages)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando modulos...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modulos e Pacotes</h1>
        <p className="text-gray-600">Controle a base modular do YUX OS.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Modulos</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(module => (
            <div key={module.key} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{module.name}</h3>
                <span className="text-xs text-gray-500">{module.base ? 'Base' : 'Opcional'}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{module.key}</p>
              <p className="mt-2 text-sm text-gray-600">
                Interno: {module.internalRoute || '-'} | Portal: {module.portalRoute || '-'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Pacotes</h2>
        <div className="space-y-3">
          {packages.map(packageItem => (
            <div key={packageItem.id} className="rounded-lg border bg-white p-4">
              <h3 className="font-medium text-gray-900">{packageItem.name}</h3>
              <p className="text-sm text-gray-600">{packageItem.description}</p>
              <p className="mt-2 text-xs text-gray-500">Modulos: {packageItem.moduleKeys.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create Blueprints page**

Create `frontend/src/pages/platform/BlueprintsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { Blueprint } from '@/types/platform'

export function BlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        setBlueprints(await platformService.getBlueprints())
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando blueprints...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Blueprints</h1>
        <p className="text-gray-600">Modelos setoriais para pacotes, funis, modulos e automacoes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {blueprints.map(blueprint => (
          <div key={blueprint.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{blueprint.name}</h2>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{blueprint.sector}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{blueprint.description}</p>
            <p className="mt-3 text-xs text-gray-500">Modulos: {blueprint.moduleKeys.join(', ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register routes in App**

Modify `frontend/src/App.tsx` imports:

```tsx
import { ModulesPage } from '@/pages/platform/ModulesPage'
import { BlueprintsPage } from '@/pages/platform/BlueprintsPage'
```

Inside protected non-client routes, add:

```tsx
<Route path="modules" element={<ModulesPage />} />
<Route path="blueprints" element={<BlueprintsPage />} />
```

- [ ] **Step 4: Run verification**

Run:

```powershell
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/platform/ModulesPage.tsx frontend/src/pages/platform/BlueprintsPage.tsx frontend/src/App.tsx
git commit -m "feat: add platform modules and blueprints pages"
```

---

## Task 11: Add Client Portal Dashboard Surface

**Files:**
- Create: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`

- [ ] **Step 1: Create portal dashboard page**

Create `frontend/src/pages/client-portal/PortalDashboardPage.tsx`:

```tsx
import { buildNavigation } from '@/lib/platform/navigation'
import { usePlatformContext, usePlatformStore } from '@/stores/platformStore'
import { useEffect } from 'react'

export function PortalDashboardPage() {
  const setMode = usePlatformStore(state => state.setMode)
  const context = usePlatformContext()

  useEffect(() => {
    setMode('portal')
    return () => setMode('internal')
  }, [setMode])

  const items = buildNavigation({ ...context, mode: 'portal' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
        <p className="text-gray-600">Acompanhe projetos, aprovacoes, suporte e modulos contratados.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items
          .filter(item => item.moduleKey)
          .map(item => (
            <div key={item.href} className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold text-gray-900">{item.label}</h2>
              <p className="mt-2 text-sm text-gray-600">Modulo habilitado neste portal.</p>
            </div>
          ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register portal route**

Modify `frontend/src/App.tsx` imports:

```tsx
import { PortalDashboardPage } from '@/pages/client-portal/PortalDashboardPage'
```

Inside client routes, replace or add:

```tsx
<Route path="portal" element={<PortalDashboardPage />} />
```

Keep the existing `ClientPortalPage` import only if another route still uses it.

- [ ] **Step 3: Run verification**

Run:

```powershell
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/pages/client-portal/PortalDashboardPage.tsx frontend/src/App.tsx
git commit -m "feat: add module-aware portal dashboard"
```

---

## Task 12: Update Documentation

**Files:**
- Modify: `ARQUITETURA-MINIMA.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update architecture doc**

Append to `ARQUITETURA-MINIMA.md`:

```md
## Spec e Plano Aprovados

- Spec: `docs/superpowers/specs/2026-05-29-yux-os-platform-design.md`
- Plano: `docs/superpowers/plans/2026-05-29-yux-os-foundation-implementation-plan.md`

A implementacao deve seguir a fundacao integrada do YUX OS: primeiro dados,
permissoes, contratos, pacotes, modulos e blueprints; depois navegacao
modular; depois superficies operacionais e portal do cliente.
```

- [ ] **Step 2: Update README summary**

In `README.md`, add a short section near the top:

```md
## Direcao Atual

O projeto evoluiu de um CRM isolado para o YUX OS: uma plataforma modular usada
internamente pela YUX e exposta aos clientes por um portal filtrado. A base deve
suportar contratos, pacotes, modulos ativaveis e blueprints por setor antes da
implementacao completa dos modulos avancados.
```

- [ ] **Step 3: Update roadmap**

In `ROADMAP.md`, add a first roadmap item:

```md
## Marco Atual: Fundacao Modular YUX OS

1. Schema de organizacoes, usuarios, permissoes, contratos, pacotes, modulos e blueprints.
2. Navegacao interna/portal baseada em modulos ativos.
3. CRM, projetos, tarefas, entregas, suporte e aprovacoes sobre a mesma fundacao.
4. Propostas, ROI, BI, WhatsApp IA e automacoes conectados por extensoes da plataforma.
```

- [ ] **Step 4: Run final verification**

Run:

```powershell
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add ARQUITETURA-MINIMA.md README.md ROADMAP.md
git commit -m "docs: document yux os foundation plan"
```

---

## Task 13: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run all tests**

Run:

```powershell
cd frontend
npm run test
```

Expected: all tests PASS.

- [ ] **Step 2: Run type-check**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: PASS. Warnings about bundle size or Browserslist data are acceptable for this phase if the command exits `0`.

- [ ] **Step 4: Review API legacy references**

Run:

```powershell
rg "apiService" src
```

Expected: no application code depends on `apiService` for platform foundation behavior. If `src/services/api.ts` remains as legacy code, document it as unused legacy.

- [ ] **Step 5: Review Supabase migrations**

Run:

```powershell
Get-ChildItem ..\supabase\migrations | Sort-Object Name | Select-Object Name
```

Expected: new foundation migrations appear after the stabilization migrations.

- [ ] **Step 6: Commit final verification note**

If the repo has a docs area for implementation notes, add a short note with command outputs. If not, include the verification output in the final implementation response rather than creating a new file.

---

## Self-Review

### Spec Coverage

- Single modular platform: covered by Tasks 2-5 and 7-11.
- Portal as filtered view: covered by Tasks 5, 9, and 11.
- Modules, packages, contracts: covered by Tasks 2, 3, 6, 7, and 10.
- Blueprints: covered by Tasks 2, 6, 7, and 10.
- Supabase as data core: covered by Tasks 6 and 7.
- Backend/workers/n8n kept behind the platform: documented in the spec and preserved by not adding frontend integration logic.
- Testing and verification: covered by Tasks 1, 4, 5, and 13.

### Known Gaps Outside This Plan

- Full CRUD for contracts, packages, blueprints, custom fields, approvals, documents, support, proposals, finance, WhatsApp IA, and BI is intentionally not in this first implementation plan. This plan builds the foundation those modules will use.
- Remote Supabase application and Vercel deployment are intentionally out of scope.
- Production-grade RLS is intentionally out of scope; this plan creates read policies suitable for local development and future tightening.

### Type Consistency

The plan uses `PlatformModule`, `PlatformRole`, `PlatformContext`, `PackageDefinition`, `Contract`, `ContractModule`, and `Blueprint` consistently across types, service, store, access control, and navigation.
