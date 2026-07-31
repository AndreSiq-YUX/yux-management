# YUX OS Contracts, Modules, and Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first functional YUX OS slice: packages, contracts, active contract modules, and a client portal that is filtered by the client's active contract.

**Architecture:** Keep Supabase as the data source and React as the interface. Add pure helpers for contract/module rules, then wire Supabase services, Zustand context, internal admin pages, and portal UI to those helpers. The portal must derive available modules from the active contract, not from hardcoded defaults.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, Supabase JS, PostgreSQL migrations, Vitest, Tailwind CSS.

---

## Scope Boundary

This is the first implementation plan from the approved functional spec. It intentionally covers only:

- package visibility and module composition;
- contract CRUD enough for internal management;
- contract module activation;
- active contract lookup for clients;
- portal navigation/cards filtered by contract modules;
- demo data for the existing test client.

It does not implement deliverables, approvals, documents, support, finance, proposals, n8n, WhatsApp IA, Ads, or deployment. Those get separate plans after this foundation is working.

---

## File Structure

Create or modify these files:

- Modify: `frontend/src/types/platform.ts`  
  Add contract commercial fields, detailed contract shape, and portal context types.

- Create: `frontend/src/lib/platform/contracts.ts`  
  Pure helpers for deriving active contracts and enabled module keys.

- Create: `frontend/src/lib/platform/contracts.test.ts`  
  Unit tests for active contract selection and module derivation.

- Modify: `frontend/src/services/platformService.ts`  
  Add CRUD/read methods for packages, contracts, contract modules, active contract, and portal context.

- Modify: `frontend/src/stores/platformStore.ts`  
  Store active contract, packages, contract modules, and derive `enabledModuleKeys` from the active contract for clients.

- Modify: `frontend/src/lib/platform/navigation.ts`  
  Keep navigation pure, but ensure portal navigation relies only on `enabledModuleKeys` from store.

- Create: `frontend/src/pages/platform/ContractsPage.tsx`  
  Internal page for managing client contracts and module activation.

- Create: `frontend/src/pages/platform/PackagesPage.tsx`  
  Internal page for package/module inspection.

- Create: `frontend/src/components/platform/ContractFormModal.tsx`  
  Create/edit contract modal.

- Create: `frontend/src/components/platform/ContractModulesPanel.tsx`  
  Toggle contract modules.

- Modify: `frontend/src/pages/platform/ModulesPage.tsx`  
  Replace package section with links/summary if packages move to `PackagesPage`.

- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`  
  Show active contract, package, enabled modules, and blocked/empty states.

- Modify: `frontend/src/App.tsx`  
  Register `/contracts` and `/packages` internal routes, and portal module routes.

- Modify: `frontend/src/components/navigation/Sidebar.tsx`  
  Add icons for packages/contracts if needed.

- Create: `supabase/migrations/20260601000000_contracts_modules_portal.sql`  
  Add contract fields, idempotent demo contract, active modules, and client organization/membership data.

- Modify: `ARQUITETURA-MINIMA.md` and `ROADMAP.md`  
  Document that contract-driven portal is the first functional slice.

---

## Task 1: Add Contract Rule Tests

**Files:**
- Create: `frontend/src/lib/platform/contracts.test.ts`
- Create: `frontend/src/lib/platform/contracts.ts`
- Modify: `frontend/src/types/platform.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/platform/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  deriveEnabledModuleKeys,
  findActiveContract,
  isContractActive,
} from '@/lib/platform/contracts'
import type { Contract, ContractModule } from '@/types/platform'

const baseContract: Contract = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  status: 'active',
  startsAt: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('contract module rules', () => {
  it('treats active contracts without an end date as active', () => {
    expect(isContractActive(baseContract, new Date('2026-02-01'))).toBe(true)
  })

  it('blocks paused, draft, cancelled and completed contracts', () => {
    expect(isContractActive({ ...baseContract, status: 'paused' }, new Date('2026-02-01'))).toBe(false)
    expect(isContractActive({ ...baseContract, status: 'draft' }, new Date('2026-02-01'))).toBe(false)
    expect(isContractActive({ ...baseContract, status: 'cancelled' }, new Date('2026-02-01'))).toBe(false)
    expect(isContractActive({ ...baseContract, status: 'completed' }, new Date('2026-02-01'))).toBe(false)
  })

  it('selects the newest active contract', () => {
    const contracts: Contract[] = [
      { ...baseContract, id: 'old', startsAt: '2026-01-01' },
      { ...baseContract, id: 'new', startsAt: '2026-03-01' },
    ]

    expect(findActiveContract(contracts, new Date('2026-03-15'))?.id).toBe('new')
  })

  it('derives enabled module keys from enabled contract modules', () => {
    const contractModules: ContractModule[] = [
      { contractId: 'contract-1', moduleKey: 'projects', enabled: true },
      { contractId: 'contract-1', moduleKey: 'campaigns', enabled: false },
      { contractId: 'contract-1', moduleKey: 'support', enabled: true },
    ]

    expect(deriveEnabledModuleKeys(contractModules)).toEqual(['projects', 'support'])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
cd frontend
npm run test -- src/lib/platform/contracts.test.ts
```

Expected: FAIL because `@/lib/platform/contracts` does not exist.

- [ ] **Step 3: Add contract helper implementation**

Create `frontend/src/lib/platform/contracts.ts`:

```ts
import type { Contract, ContractModule } from '@/types/platform'

export function isContractActive(contract: Contract, now = new Date()) {
  if (contract.status !== 'active') return false

  const startsAt = new Date(`${contract.startsAt}T00:00:00`)
  if (startsAt > now) return false

  if (!contract.endsAt) return true

  const endsAt = new Date(`${contract.endsAt}T23:59:59`)
  return endsAt >= now
}

export function findActiveContract(contracts: Contract[], now = new Date()) {
  return contracts
    .filter(contract => isContractActive(contract, now))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] || null
}

export function deriveEnabledModuleKeys(contractModules: ContractModule[]) {
  return contractModules
    .filter(item => item.enabled)
    .map(item => item.moduleKey)
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm run test -- src/lib/platform/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run baseline checks**

Run:

```powershell
npm run test
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/lib/platform/contracts.ts frontend/src/lib/platform/contracts.test.ts
git commit -m "feat: add contract module rules"
```

---

## Task 2: Extend Platform Types for Contract Management

**Files:**
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/lib/platform/contracts.test.ts`

- [ ] **Step 1: Extend type-consumer test**

Append to `frontend/src/lib/platform/contracts.test.ts`:

```ts
import type { ContractDetails, PortalContractContext } from '@/types/platform'

describe('contract management types', () => {
  it('supports contract details and portal contract context', () => {
    const details: ContractDetails = {
      ...baseContract,
      name: 'Contrato Maquina Comercial',
      value: 4500,
      billingCycle: 'monthly',
      package: {
        id: 'package-1',
        key: 'maquina_comercial',
        name: 'Maquina Comercial',
        description: 'Pacote comercial completo',
        moduleKeys: ['projects', 'campaigns'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      modules: [
        { contractId: 'contract-1', moduleKey: 'projects', enabled: true },
      ],
    }

    const context: PortalContractContext = {
      contract: details,
      enabledModuleKeys: ['projects'],
    }

    expect(context.contract.name).toBe('Contrato Maquina Comercial')
    expect(context.enabledModuleKeys).toEqual(['projects'])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm run test -- src/lib/platform/contracts.test.ts
```

Expected: FAIL because `ContractDetails` and `PortalContractContext` do not exist.

- [ ] **Step 3: Update platform types**

Modify `frontend/src/types/platform.ts` by replacing the existing `Contract` interface with:

```ts
export type ContractStatus = 'draft' | 'active' | 'paused' | 'cancelled' | 'completed'
export type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'yearly'

export interface Contract {
  id: string
  clientId: string
  packageId: string
  status: ContractStatus
  startsAt: string
  endsAt?: string
  name?: string
  value?: number
  billingCycle?: BillingCycle
  notes?: string
  createdAt: string
  updatedAt: string
}
```

Then add below `ContractModule`:

```ts
export interface ContractDetails extends Contract {
  package: PackageDefinition | null
  modules: ContractModule[]
}

export interface PortalContractContext {
  contract: ContractDetails | null
  enabledModuleKeys: string[]
}
```

- [ ] **Step 4: Run tests and type-check**

Run:

```powershell
npm run test -- src/lib/platform/contracts.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/types/platform.ts frontend/src/lib/platform/contracts.test.ts
git commit -m "feat: extend contract platform types"
```

---

## Task 3: Add Contract Fields and Demo Contract Migration

**Files:**
- Create: `supabase/migrations/20260601000000_contracts_modules_portal.sql`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260601000000_contracts_modules_portal.sql`:

```sql
-- Contract management and portal demo data.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS value DECIMAL(15,2);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'
  CHECK (billing_cycle IN ('one_time', 'monthly', 'quarterly', 'yearly'));
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_starts_at ON public.contracts(starts_at);
CREATE INDEX IF NOT EXISTS idx_contracts_status_client ON public.contracts(client_id, status);

INSERT INTO public.organizations (id, name, slug, kind, client_id)
VALUES (
  '650e8400-e29b-41d4-a716-446655440101',
  'Empresa ABC Ltda',
  'empresa-abc',
  'client',
  '550e8400-e29b-41d4-a716-446655440001'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  client_id = EXCLUDED.client_id,
  updated_at = NOW();

UPDATE public.clients
SET user_id = '33333333-3333-3333-3333-333333333333'
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

INSERT INTO public.memberships (user_id, organization_id, role_key)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '650e8400-e29b-41d4-a716-446655440101',
  'client_admin'
)
ON CONFLICT (user_id, organization_id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  updated_at = NOW();

INSERT INTO public.contracts (
  id,
  client_id,
  package_id,
  name,
  status,
  starts_at,
  value,
  billing_cycle,
  notes
)
SELECT
  '660e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440001',
  p.id,
  'Contrato Maquina Comercial - Empresa ABC',
  'active',
  '2026-01-01',
  4500.00,
  'monthly',
  'Contrato demo para validar portal filtrado por modulos.'
FROM public.packages p
WHERE p.key = 'maquina_comercial'
ON CONFLICT (id) DO UPDATE SET
  package_id = EXCLUDED.package_id,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  value = EXCLUDED.value,
  billing_cycle = EXCLUDED.billing_cycle,
  notes = EXCLUDED.notes,
  updated_at = NOW();

WITH enabled_modules(module_key) AS (
  VALUES
    ('projects'),
    ('campaigns'),
    ('bi_reports'),
    ('support'),
    ('whatsapp_ai')
)
INSERT INTO public.contract_modules (contract_id, module_key, enabled)
SELECT '660e8400-e29b-41d4-a716-446655440001', module_key, true
FROM enabled_modules
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

WITH disabled_modules(module_key) AS (
  VALUES
    ('finance'),
    ('automations'),
    ('proposals'),
    ('blueprints')
)
INSERT INTO public.contract_modules (contract_id, module_key, enabled)
SELECT '660e8400-e29b-41d4-a716-446655440001', module_key, false
FROM disabled_modules
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration to Supabase**

Run the migration through the Supabase connector or CLI. With CLI, use:

```powershell
supabase db push
```

Expected: migration applies without errors.

- [ ] **Step 3: Verify remote data**

Run this SQL against project `uuowkncimiydpbxqpkej`:

```sql
select c.name, c.status, c.value, p.key as package_key
from public.contracts c
join public.packages p on p.id = c.package_id
where c.id = '660e8400-e29b-41d4-a716-446655440001';

select module_key, enabled
from public.contract_modules
where contract_id = '660e8400-e29b-41d4-a716-446655440001'
order by module_key;
```

Expected: one active demo contract and enabled/disabled modules.

- [ ] **Step 4: Commit**

Run:

```powershell
git add supabase/migrations/20260601000000_contracts_modules_portal.sql
git commit -m "db: add contract module portal data"
```

---

## Task 4: Add Platform Service Contract Methods

**Files:**
- Modify: `frontend/src/services/platformService.ts`

- [ ] **Step 1: Add imports**

Update the type imports in `frontend/src/services/platformService.ts` to include:

```ts
  BillingCycle,
  ContractDetails,
  ContractStatus,
  PortalContractContext,
```

- [ ] **Step 2: Update contract mapper**

Replace `mapContract` with:

```ts
function mapContract(row: any): Contract {
  return {
    id: row.id,
    clientId: row.client_id,
    packageId: row.package_id,
    status: row.status as ContractStatus,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    name: row.name || undefined,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
    billingCycle: row.billing_cycle as BillingCycle | undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 3: Add details mapper**

Add below `mapContractModule`:

```ts
function mapContractDetails(row: any): ContractDetails {
  return {
    ...mapContract(row),
    package: row.packages ? mapPackage(row.packages) : null,
    modules: Array.isArray(row.contract_modules)
      ? row.contract_modules.map(mapContractModule)
      : [],
  }
}
```

- [ ] **Step 4: Add service methods**

Inside `PlatformService`, add:

```ts
  async getContracts() {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapContractDetails)
  }

  async getContractById(contractId: string) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .eq('id', contractId)
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async getActiveContractForClient(clientId: string): Promise<ContractDetails | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .lte('starts_at', new Date().toISOString().split('T')[0])
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString().split('T')[0]}`)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data ? mapContractDetails(data) : null
  }

  async getClientForUser(userId: string) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name, contact_name, email, user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data
      ? {
          id: data.id,
          companyName: data.company_name,
          contactName: data.contact_name,
          email: data.email,
          userId: data.user_id,
        }
      : null
  }

  async getPortalContractContextForUser(userId: string): Promise<PortalContractContext> {
    const client = await this.getClientForUser(userId)
    if (!client) {
      return { contract: null, enabledModuleKeys: [] }
    }

    const contract = await this.getActiveContractForClient(client.id)
    return {
      contract,
      enabledModuleKeys: contract
        ? contract.modules.filter(module => module.enabled).map(module => module.moduleKey)
        : [],
    }
  }

  async createContract(input: {
    clientId: string
    packageId: string
    name: string
    status: ContractStatus
    startsAt: string
    endsAt?: string
    value?: number
    billingCycle: BillingCycle
    notes?: string
  }) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        client_id: input.clientId,
        package_id: input.packageId,
        name: input.name,
        status: input.status,
        starts_at: input.startsAt,
        ends_at: input.endsAt || null,
        value: input.value ?? null,
        billing_cycle: input.billingCycle,
        notes: input.notes || null,
      })
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async updateContract(contractId: string, input: Partial<{
    packageId: string
    name: string
    status: ContractStatus
    startsAt: string
    endsAt?: string | null
    value?: number | null
    billingCycle: BillingCycle
    notes?: string | null
  }>) {
    const payload: Record<string, unknown> = {}

    if (input.packageId !== undefined) payload.package_id = input.packageId
    if (input.name !== undefined) payload.name = input.name
    if (input.status !== undefined) payload.status = input.status
    if (input.startsAt !== undefined) payload.starts_at = input.startsAt
    if (input.endsAt !== undefined) payload.ends_at = input.endsAt
    if (input.value !== undefined) payload.value = input.value
    if (input.billingCycle !== undefined) payload.billing_cycle = input.billingCycle
    if (input.notes !== undefined) payload.notes = input.notes

    const { data, error } = await supabase
      .from('contracts')
      .update(payload)
      .eq('id', contractId)
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async setContractModule(contractId: string, moduleKey: string, enabled: boolean) {
    const { data, error } = await supabase
      .from('contract_modules')
      .upsert({
        contract_id: contractId,
        module_key: moduleKey,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return mapContractModule(data)
  }
```

- [ ] **Step 5: Run type-check**

Run:

```powershell
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/services/platformService.ts
git commit -m "feat: add platform contract service methods"
```

---

## Task 5: Load Contract Context in Platform Store

**Files:**
- Modify: `frontend/src/stores/platformStore.ts`

- [ ] **Step 1: Update imports**

Add `ContractDetails`, `PackageDefinition`, and `PortalContractContext` to the type imports.

- [ ] **Step 2: Extend state interface**

Replace the current `PlatformState` interface with:

```ts
interface PlatformState extends PlatformContext {
  isLoading: boolean
  error: string | null
  roles: PlatformRole[]
  packages: PackageDefinition[]
  activeContract: ContractDetails | null
  portalContractContext: PortalContractContext
  setMode: (mode: PlatformMode) => void
  initializeForUser: (userId: string) => Promise<void>
  setEnabledModuleKeys: (moduleKeys: string[]) => void
}
```

- [ ] **Step 3: Add initial state**

In the store initial object, add:

```ts
  packages: [],
  activeContract: null,
  portalContractContext: {
    contract: null,
    enabledModuleKeys: [],
  },
```

- [ ] **Step 4: Update initializeForUser**

Inside `initializeForUser`, replace the `Promise.all` block with:

```ts
      const [organizations, roles, memberships, packages, portalContractContext] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getRoles(),
        platformService.getMembershipsForUser(userId),
        platformService.getPackages(),
        platformService.getPortalContractContextForUser(userId),
      ])
```

Then update the final `set` block:

```ts
      const enabledModuleKeys = role?.scope === 'client'
        ? portalContractContext.enabledModuleKeys
        : [
            'clients',
            'crm',
            'projects',
            'proposals',
            'whatsapp_ai',
            'campaigns',
            'bi_reports',
            'automations',
            'support',
            'finance',
            'blueprints',
          ]

      set({
        organization,
        membership,
        role,
        packages,
        activeContract: portalContractContext.contract,
        portalContractContext,
        enabledModuleKeys,
        roles: roles.length ? roles : [fallbackRole],
        isLoading: false,
      })
```

- [ ] **Step 5: Update catch fallback**

In the catch `set`, add:

```ts
        packages: [],
        activeContract: null,
        portalContractContext: {
          contract: null,
          enabledModuleKeys: [],
        },
```

- [ ] **Step 6: Run type-check and tests**

Run:

```powershell
cd frontend
npm run test
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add frontend/src/stores/platformStore.ts
git commit -m "feat: load portal contract context"
```

---

## Task 6: Add Contract Admin Page

**Files:**
- Create: `frontend/src/pages/platform/ContractsPage.tsx`
- Create: `frontend/src/components/platform/ContractFormModal.tsx`
- Create: `frontend/src/components/platform/ContractModulesPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/components/navigation/Sidebar.tsx`

- [ ] **Step 1: Create contract modules panel**

Create `frontend/src/components/platform/ContractModulesPanel.tsx`:

```tsx
import { useState } from 'react'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import { platformService } from '@/services/platformService'
import type { ContractDetails } from '@/types/platform'

interface ContractModulesPanelProps {
  contract: ContractDetails
  onChange: () => void
}

export function ContractModulesPanel({ contract, onChange }: ContractModulesPanelProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const isEnabled = (moduleKey: string) =>
    contract.modules.some(module => module.moduleKey === moduleKey && module.enabled)

  const toggleModule = async (moduleKey: string) => {
    setSavingKey(moduleKey)
    try {
      await platformService.setContractModule(contract.id, moduleKey, !isEnabled(moduleKey))
      onChange()
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-3">
      {PLATFORM_MODULES.map(module => (
        <label key={module.key} className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
          <div>
            <div className="text-sm font-medium text-gray-900">{module.name}</div>
            <div className="text-xs text-gray-500">{module.key}</div>
          </div>
          <input
            type="checkbox"
            checked={isEnabled(module.key)}
            disabled={savingKey === module.key}
            onChange={() => toggleModule(module.key)}
            className="h-4 w-4 rounded border-gray-300 text-yux-600 focus:ring-yux-500"
          />
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create contract form modal**

Create `frontend/src/components/platform/ContractFormModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { BillingCycle, ContractDetails, ContractStatus, PackageDefinition } from '@/types/platform'
import type { Client } from '@/types/client'

interface ContractFormModalProps {
  open: boolean
  contract: ContractDetails | null
  clients: Client[]
  packages: PackageDefinition[]
  onClose: () => void
  onSaved: () => void
}

const statusOptions: ContractStatus[] = ['draft', 'active', 'paused', 'cancelled', 'completed']
const billingOptions: BillingCycle[] = ['one_time', 'monthly', 'quarterly', 'yearly']

export function ContractFormModal({ open, contract, clients, packages, onClose, onSaved }: ContractFormModalProps) {
  const [clientId, setClientId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ContractStatus>('draft')
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split('T')[0])
  const [endsAt, setEndsAt] = useState('')
  const [value, setValue] = useState('')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    setClientId(contract?.clientId || clients[0]?.id || '')
    setPackageId(contract?.packageId || packages[0]?.id || '')
    setName(contract?.name || '')
    setStatus(contract?.status || 'draft')
    setStartsAt(contract?.startsAt || new Date().toISOString().split('T')[0])
    setEndsAt(contract?.endsAt || '')
    setValue(contract?.value?.toString() || '')
    setBillingCycle(contract?.billingCycle || 'monthly')
    setNotes(contract?.notes || '')
  }, [clients, contract, open, packages])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        clientId,
        packageId,
        name,
        status,
        startsAt,
        endsAt: endsAt || undefined,
        value: value ? Number(value) : undefined,
        billingCycle,
        notes: notes || undefined,
      }

      if (contract) {
        await platformService.updateContract(contract.id, payload)
      } else {
        await platformService.createContract(payload)
      }

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{contract ? 'Editar contrato' : 'Novo contrato'}</h2>
          <p className="text-sm text-gray-500">Defina pacote, status e dados comerciais.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Cliente</span>
            <select value={clientId} onChange={event => setClientId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {clients.map(client => <option key={client.id} value={client.id}>{client.companyName}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Pacote</span>
            <select value={packageId} onChange={event => setPackageId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {packages.map(packageItem => <option key={packageItem.id} value={packageItem.id}>{packageItem.name}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-gray-700">Nome</span>
            <input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Status</span>
            <select value={status} onChange={event => setStatus(event.target.value as ContractStatus)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {statusOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Ciclo</span>
            <select value={billingCycle} onChange={event => setBillingCycle(event.target.value as BillingCycle)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {billingOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Inicio</span>
            <input type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Fim</span>
            <input type="date" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Valor</span>
            <input type="number" value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-gray-700">Notas</span>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700">Cancelar</button>
          <button onClick={save} disabled={saving || !clientId || !packageId || !name} className="rounded-md bg-yux-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create contracts page**

Create `frontend/src/pages/platform/ContractsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { ContractFormModal } from '@/components/platform/ContractFormModal'
import { ContractModulesPanel } from '@/components/platform/ContractModulesPanel'
import { platformService } from '@/services/platformService'
import { supabaseService } from '@/services/supabaseService'
import type { Client } from '@/types/client'
import type { ContractDetails, PackageDefinition } from '@/types/platform'

export function ContractsPage() {
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [selectedContract, setSelectedContract] = useState<ContractDetails | null>(null)
  const [editingContract, setEditingContract] = useState<ContractDetails | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [loadedContracts, loadedPackages, clientsResponse] = await Promise.all([
        platformService.getContracts(),
        platformService.getPackages(),
        supabaseService.getClients({ page: 1, limit: 500 }),
      ])
      setContracts(loadedContracts)
      setPackages(loadedPackages)
      setClients(clientsResponse.clients || [])
      setSelectedContract(current => current ? loadedContracts.find(item => item.id === current.id) || null : loadedContracts[0] || null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openNew = () => {
    setEditingContract(null)
    setShowForm(true)
  }

  const openEdit = (contract: ContractDetails) => {
    setEditingContract(contract)
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-600">Controle pacotes, status e modulos ativos por cliente.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm text-white">
            <Plus className="h-4 w-4" />
            Novo contrato
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Carregando contratos...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Contrato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contracts.map(contract => (
                  <tr key={contract.id} className={selectedContract?.id === contract.id ? 'bg-yux-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedContract(contract)} className="text-left">
                        <div className="text-sm font-medium text-gray-900">{contract.name || contract.id}</div>
                        <div className="text-xs text-gray-500">{contract.package?.name || 'Sem pacote'} - Inicio {contract.startsAt}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{contract.status}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{contract.value ? contract.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(contract)} className="text-sm font-medium text-yux-700">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border bg-gray-50 p-4">
            {selectedContract ? (
              <ContractModulesPanel contract={selectedContract} onChange={load} />
            ) : (
              <div className="text-sm text-gray-500">Selecione um contrato para gerenciar modulos.</div>
            )}
          </div>
        </div>
      )}

      <ContractFormModal
        open={showForm}
        contract={editingContract}
        clients={clients}
        packages={packages}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
    </div>
  )
}
```

- [ ] **Step 4: Register internal route**

Modify `frontend/src/App.tsx` imports:

```tsx
import { ContractsPage } from '@/pages/platform/ContractsPage'
```

Inside internal routes, add:

```tsx
<Route path="contracts" element={<ContractsPage />} />
```

- [ ] **Step 5: Add navigation item**

Modify `frontend/src/lib/platform/navigation.ts` internal base items:

```ts
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Contratos', href: '/contracts' },
          { label: 'Modulos', href: '/modules' },
        ]
```

- [ ] **Step 6: Add sidebar icon**

In `frontend/src/components/navigation/Sidebar.tsx`, import `FileCheck2` from `lucide-react` and use it for `/contracts` by changing icon selection:

```tsx
const Icon = item.href === '/contracts'
  ? FileCheck2
  : item.moduleKey
    ? iconByModule[item.moduleKey] || LayoutDashboard
    : LayoutDashboard
```

- [ ] **Step 7: Run verification**

Run:

```powershell
cd frontend
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add frontend/src/components/platform/ContractFormModal.tsx frontend/src/components/platform/ContractModulesPanel.tsx frontend/src/pages/platform/ContractsPage.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/components/navigation/Sidebar.tsx
git commit -m "feat: add contract admin workflow"
```

---

## Task 7: Add Packages Page and Simplify Modules Page

**Files:**
- Create: `frontend/src/pages/platform/PackagesPage.tsx`
- Modify: `frontend/src/pages/platform/ModulesPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`

- [ ] **Step 1: Create packages page**

Create `frontend/src/pages/platform/PackagesPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { PackageDefinition } from '@/types/platform'

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        setPackages(await platformService.getPackages())
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando pacotes...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pacotes</h1>
        <p className="text-gray-600">Pacotes comerciais que ativam conjuntos de modulos.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {packages.map(packageItem => (
          <div key={packageItem.id} className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold text-gray-900">{packageItem.name}</h2>
            <p className="mt-1 text-sm text-gray-600">{packageItem.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {packageItem.moduleKeys.map(moduleKey => (
                <span key={moduleKey} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                  {moduleKey}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register route**

Modify `frontend/src/App.tsx` imports:

```tsx
import { PackagesPage } from '@/pages/platform/PackagesPage'
```

Inside internal routes, add:

```tsx
<Route path="packages" element={<PackagesPage />} />
```

- [ ] **Step 3: Add navigation item**

Modify `frontend/src/lib/platform/navigation.ts` internal base items:

```ts
          { label: 'Pacotes', href: '/packages' },
```

Place it after `Contratos`.

- [ ] **Step 4: Run verification**

Run:

```powershell
cd frontend
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/pages/platform/PackagesPage.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts
git commit -m "feat: add package overview page"
```

---

## Task 8: Make Portal Dashboard Contract-Driven

**Files:**
- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
- Modify: `frontend/src/pages/platform/ModuleSurfacePage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace portal dashboard**

Replace `frontend/src/pages/client-portal/PortalDashboardPage.tsx` with:

```tsx
import { Link } from 'react-router-dom'
import { buildNavigation } from '@/lib/platform/navigation'
import { usePlatformContext, usePlatformStore } from '@/stores/platformStore'

export function PortalDashboardPage() {
  const context = usePlatformContext()
  const activeContract = usePlatformStore(state => state.activeContract)
  const isLoading = usePlatformStore(state => state.isLoading)
  const items = buildNavigation({ ...context, mode: 'portal' }).filter(item => item.moduleKey)

  if (isLoading) {
    return <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Carregando portal...</div>
  }

  if (!activeContract) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
          <p className="text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
        </div>
        <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">
          Entre em contato com a YUX para ativar seu acesso ao portal.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
        <p className="text-gray-600">Acompanhamento de projetos, aprovacoes, suporte e modulos contratados.</p>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">{activeContract.name || 'Contrato ativo'}</h2>
            <p className="text-sm text-gray-600">{activeContract.package?.name || 'Pacote nao informado'}</p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <div>Status: {activeContract.status}</div>
            <div>Inicio: {activeContract.startsAt}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50"
          >
            <h2 className="font-semibold text-gray-900">{item.label}</h2>
            <p className="mt-2 text-sm text-gray-600">Modulo habilitado neste contrato.</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Make module surface portal-aware**

Modify `frontend/src/pages/platform/ModuleSurfacePage.tsx` to show a portal-specific empty state when URL starts with `/portal`:

```tsx
import { useLocation } from 'react-router-dom'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'

interface ModuleSurfacePageProps {
  moduleKey: string
}

export function ModuleSurfacePage({ moduleKey }: ModuleSurfacePageProps) {
  const location = useLocation()
  const module = getPlatformModule(moduleKey)
  const portalMode = location.pathname.startsWith('/portal')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{module?.name || 'Modulo'}</h1>
        <p className="text-gray-600">
          {portalMode ? 'Area do portal do cliente.' : 'Superficie operacional do YUX OS.'}
        </p>
      </div>

      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-500">
          {portalMode ? 'Este modulo esta habilitado no contrato, mas ainda nao possui registros publicados.' : 'Sem registros operacionais neste modulo.'}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register portal module routes**

Inside the client portal route block in `frontend/src/App.tsx`, replace the single wildcard route with:

```tsx
<>
  <Route path="portal" element={<PortalDashboardPage />} />
  <Route path="portal/projects" element={<ModuleSurfacePage moduleKey="projects" />} />
  <Route path="portal/whatsapp-ai" element={<ModuleSurfacePage moduleKey="whatsapp_ai" />} />
  <Route path="portal/campaigns" element={<ModuleSurfacePage moduleKey="campaigns" />} />
  <Route path="portal/reports" element={<ModuleSurfacePage moduleKey="bi_reports" />} />
  <Route path="portal/support" element={<ModuleSurfacePage moduleKey="support" />} />
  <Route path="portal/finance" element={<ModuleSurfacePage moduleKey="finance" />} />
</>
```

- [ ] **Step 4: Run verification**

Run:

```powershell
cd frontend
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/pages/client-portal/PortalDashboardPage.tsx frontend/src/pages/platform/ModuleSurfacePage.tsx frontend/src/App.tsx
git commit -m "feat: make portal contract driven"
```

---

## Task 9: Browser Verify Internal and Portal Flows

**Files:**
- No code changes expected.

- [ ] **Step 1: Start dev server**

Run:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves `http://127.0.0.1:3000`.

- [ ] **Step 2: Verify admin login**

Open `http://127.0.0.1:3000/auth/login`.

Login:

```text
admin@yux.com.br
admin123
```

Expected:

- redirects to dashboard;
- sidebar shows `Contratos`, `Pacotes`, `Modulos`, `Clientes`, `CRM`, `Projetos e Entregas`, and other internal modules;
- `/contracts` loads contract table;
- selecting a contract shows module toggles.

- [ ] **Step 3: Verify client login**

Logout and login:

```text
cliente1@empresa.com
client123
```

Expected:

- redirects to `/portal`;
- portal shows active contract;
- portal cards show only modules enabled in `contract_modules`;
- disabled modules such as `finance`, `automations`, `proposals`, and `blueprints` do not appear.

- [ ] **Step 4: Toggle a module and verify portal changes**

Login as admin, open `/contracts`, select the demo contract, enable `finance`, then login as client.

Expected:

- `Financeiro` appears in portal navigation/cards.

Disable `finance` again.

Expected:

- `Financeiro` disappears from portal navigation/cards.

---

## Task 10: Final Verification and Documentation

**Files:**
- Modify: `ARQUITETURA-MINIMA.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update architecture doc**

Append to `ARQUITETURA-MINIMA.md`:

```md
## Primeira Fatia Funcional

A primeira fatia funcional apos a fundacao e o controle de contratos, pacotes e
modulos ativos. O portal do cliente deve derivar sua navegacao e seus cards do
contrato ativo, evitando menus hardcoded e evitando exposicao de modulos nao
contratados.
```

- [ ] **Step 2: Update roadmap**

Add near the top of `ROADMAP.md`:

```md
## Proximo Marco: Contratos e Portal por Modulos

1. CRUD interno de contratos.
2. Controle de modulos ativos por contrato.
3. Portal do cliente filtrado pelo contrato ativo.
4. Validacao com usuario admin e usuario cliente.
```

- [ ] **Step 3: Run final commands**

Run:

```powershell
cd frontend
npm run test
npm run type-check
npm run build
```

Expected:

- tests PASS;
- type-check exits `0`;
- build exits `0`;
- existing warnings about Browserslist or large chunks are acceptable.

- [ ] **Step 4: Verify Supabase counts**

Run SQL against project `uuowkncimiydpbxqpkej`:

```sql
select count(*)::int as contracts from public.contracts;
select count(*)::int as contract_modules from public.contract_modules;
select count(*)::int as active_client_contracts
from public.contracts
where client_id = '550e8400-e29b-41d4-a716-446655440001'
  and status = 'active';
```

Expected:

- at least `1` contract;
- at least `1` contract module;
- exactly `1` active demo contract for Empresa ABC.

- [ ] **Step 5: Commit docs**

Run:

```powershell
git add ARQUITETURA-MINIMA.md ROADMAP.md
git commit -m "docs: document contract driven portal milestone"
```

---

## Self-Review

### Spec Coverage

- Contract as source of truth: covered by Tasks 1-5 and 8.
- Internal contract management: covered by Task 6.
- Package/module visibility: covered by Tasks 4, 6, and 7.
- Portal filtered by active contract: covered by Tasks 5 and 8.
- Supabase migration and demo data: covered by Task 3.
- Verification: covered by Tasks 9 and 10.

### Scope Held Back Intentionally

- Deliverables and approvals are next because they require contract-driven portal first.
- Finance has only contract value fields here; invoices/billing get a separate plan.
- n8n, WhatsApp IA, Ads, and reports remain integration plans after operational surfaces exist.

### Type Consistency

The plan uses `Contract`, `ContractDetails`, `ContractModule`, `PackageDefinition`, `BillingCycle`, `ContractStatus`, and `PortalContractContext` consistently across helpers, service, store, and UI.
