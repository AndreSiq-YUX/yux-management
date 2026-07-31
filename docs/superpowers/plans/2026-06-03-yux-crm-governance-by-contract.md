# YUX CRM Governance By Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the contracted CRM governance foundation: CRM instances per contract, seats, teams, roles, scoped lead ownership, blueprint-based configuration, versioned customization, publication migration, audit, and admin/client controls.

**Architecture:** Keep contracts and `contract_modules` as the source of module entitlement, then create one governed `crm_instance` for each active CRM contract. Supabase owns tenancy, RLS, limits, publication state, and audit; React services expose typed operations; pure rule modules keep business decisions testable before UI and schema wiring. Existing CRM tables are extended instead of replaced so current leads, pipelines, omnichannel sync, proposals, reports, finance, and support continue to share the same commercial data.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, Supabase Postgres migrations, Supabase RLS, Supabase Data API grants, Supabase probes.

---

## Execution Strategy

Execute in small commits. The first two tasks establish pure rules and schema. The middle tasks connect services and admin surfaces. The final tasks wire lead ownership, portal operation, docs, and full validation.

This plan is the implementation plan for `docs/superpowers/specs/2026-06-03-yux-crm-governance-contract-design.md`.

## Current Repo Anchors

- Internal CRM route: `frontend/src/pages/leads/LeadsPage.tsx`
- Portal CRM route: `frontend/src/App.tsx` maps `/portal/crm` to `LeadsPage`
- Shared CRM workspace: `frontend/src/components/crm/CrmWorkspace.tsx`
- CRM data service: `frontend/src/services/crmService.ts`
- Platform contracts/blueprints service: `frontend/src/services/platformService.ts`
- CRM types: `frontend/src/types/crm.ts`
- Platform types: `frontend/src/types/platform.ts`
- Existing CRM migrations:
  - `supabase/migrations/20260601110000_multitenant_crm_automation.sql`
  - `supabase/migrations/20260601140000_enable_client_crm_portal.sql`
  - `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`
  - `supabase/migrations/20260601270000_sector_funnel_blueprints.sql`
- Existing commercial MVP plan: `docs/superpowers/plans/2026-06-03-yux-hub-commercial-mvp.md`

## File Structure

Create or modify these files:

- `frontend/src/types/crm.ts`: add CRM governance domain types.
- `frontend/src/lib/crm/governanceRules.ts`: pure business rules for seats, roles, visibility, publication, assignment, and migration.
- `frontend/src/lib/crm/governanceRules.test.ts`: TDD coverage for business rules.
- `supabase/migrations/20260603230000_crm_governance_by_contract.sql`: tables, constraints, indexes, functions, RLS, grants, backfill.
- `supabase/probes/20260603230000_crm_governance_by_contract.sql`: executable assertions for tables, policies, grants, and helper functions.
- `frontend/src/services/crmGovernanceService.ts`: typed Supabase service for instances, members, teams, drafts, publications, and lead assignment.
- `frontend/src/services/crmGovernanceService.test.ts`: payload mapping tests using the existing service test style.
- `frontend/src/services/platformService.ts`: create or update CRM instance during blueprint application and contract module flows.
- `frontend/src/types/platform.ts`: expose CRM module config fields used by contract/blueprint UI.
- `frontend/src/components/platform/CrmInstanceProvisioningPanel.tsx`: YUX admin setup panel for contracted CRM instances.
- `frontend/src/pages/platform/CrmGovernancePage.tsx`: internal governance page.
- `frontend/src/App.tsx`: add `/crm-governance` internal route and `/portal/crm/settings` portal route.
- `frontend/src/lib/platform/navigation.ts`: add internal CRM governance navigation for YUX operators.
- `frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx`: client admin settings page.
- `frontend/src/components/crm-governance/CrmSeatUsagePanel.tsx`: seat limits and usage.
- `frontend/src/components/crm-governance/CrmMembersPanel.tsx`: member invite, role change, deactivation.
- `frontend/src/components/crm-governance/CrmTeamsPanel.tsx`: team creation and membership.
- `frontend/src/components/crm-governance/CrmConfigurationDraftPanel.tsx`: draft editing for funnels, fields, categories, and loss reasons.
- `frontend/src/components/crm-governance/CrmPublicationWizard.tsx`: migration plan and publish flow.
- `frontend/src/components/crm/CrmWorkspace.tsx`: use active CRM instance, team/member scope, and governance actions.
- `frontend/src/components/crm/LeadDetailPanel.tsx`: show owner/team/version context and manager reassignment controls.
- `frontend/src/components/crm/LeadKanbanBoard.tsx`: preserve stable layout while filtering by visible leads.
- `frontend/src/services/crmService.ts`: add governance-aware lead loading and assignment payloads.
- `frontend/src/components/crm/CrmWorkspace.test.tsx`: verify loading, access denied, seller, manager, and client admin states.
- `docs/crm-lead-management.md`: update implementation status and business rules.
- `docs/implementation-status.md`: mark CRM governance phase status when implementation is complete.

## Shared Types

Task 1 must add these exported types to `frontend/src/types/crm.ts`; later tasks must reuse the same names:

```ts
export type CrmInstanceStatus = 'draft' | 'active' | 'paused' | 'archived'
export type CrmInstanceRole = 'seller' | 'manager' | 'client_admin' | 'yux_admin'
export type CrmAssignmentMode = 'manual' | 'queue' | 'round_robin' | 'pull_next'
export type CrmAssignmentState = 'unassigned' | 'assigned' | 'in_queue' | 'reassigned'
export type CrmPublicationStatus = 'draft' | 'reviewing' | 'published' | 'failed'
export type CrmMigrationStrategy = 'keep_existing' | 'migrate_all' | 'migrate_open' | 'mapped_stages'

export interface CrmInstance {
  id: string
  organizationId: string
  contractId: string
  status: CrmInstanceStatus
  sectorKey?: string
  blueprintId?: string
  blueprintApplicationRunId?: string
  sellerSeatLimit: number
  managerSeatLimit: number
  adminSeatLimit: number
  maxPipelineCount: number
  maxCustomFieldCount: number
  maxAutomationCount: number
  allowClientPipelineCustomization: boolean
  allowClientFieldCustomization: boolean
  allowClientCategoryCustomization: boolean
  defaultAssignmentMode: CrmAssignmentMode
  createdAt: string
  updatedAt: string
}

export interface CrmInstanceMember {
  id: string
  crmInstanceId: string
  userId: string
  role: CrmInstanceRole
  displayName?: string
  email?: string
  status: 'active' | 'invited' | 'disabled'
  createdAt: string
  updatedAt: string
}

export interface CrmTeam {
  id: string
  crmInstanceId: string
  name: string
  description?: string
  assignmentMode: CrmAssignmentMode
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CrmTeamMember {
  id: string
  teamId: string
  memberId: string
  role: 'seller' | 'manager'
  createdAt: string
}

export interface CrmGovernanceContext {
  instance: CrmInstance
  currentMember?: CrmInstanceMember
  teams: CrmTeam[]
  teamMemberships: CrmTeamMember[]
}
```

---

### Task 1: Pure CRM Governance Rules

**Files:**
- Modify: `frontend/src/types/crm.ts`
- Create: `frontend/src/lib/crm/governanceRules.ts`
- Create: `frontend/src/lib/crm/governanceRules.test.ts`

- [ ] **Step 1: Add failing seat limit tests**

Create `frontend/src/lib/crm/governanceRules.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  canAddCrmMember,
  canMemberSeeLead,
  canPublishCrmConfiguration,
  chooseLeadMigrationStrategy,
} from './governanceRules'
import type { CrmGovernanceContext, CrmInstanceMember, CrmLead } from '@/types/crm'

const instance = {
  id: 'crm-1',
  organizationId: 'org-1',
  contractId: 'contract-1',
  status: 'active',
  sellerSeatLimit: 2,
  managerSeatLimit: 1,
  adminSeatLimit: 1,
  maxPipelineCount: 3,
  maxCustomFieldCount: 8,
  maxAutomationCount: 2,
  allowClientPipelineCustomization: true,
  allowClientFieldCustomization: true,
  allowClientCategoryCustomization: false,
  defaultAssignmentMode: 'queue',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
} satisfies CrmGovernanceContext['instance']

const member = (id: string, role: CrmInstanceMember['role']): CrmInstanceMember => ({
  id,
  crmInstanceId: 'crm-1',
  userId: `user-${id}`,
  role,
  status: 'active',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
})

describe('canAddCrmMember', () => {
  it('blocks seller creation when the contracted seller limit is reached', () => {
    const result = canAddCrmMember(instance, [member('s1', 'seller'), member('s2', 'seller')], 'seller')
    expect(result).toEqual({
      allowed: false,
      reason: 'seller_seat_limit_reached',
      currentCount: 2,
      limit: 2,
    })
  })

  it('allows client admin creation when the admin limit has capacity', () => {
    const result = canAddCrmMember(instance, [member('s1', 'seller')], 'client_admin')
    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(0)
    expect(result.limit).toBe(1)
  })
})

describe('canMemberSeeLead', () => {
  const lead = {
    id: 'lead-1',
    organizationId: 'org-1',
    crmInstanceId: 'crm-1',
    pipelineId: 'pipe-1',
    stageId: 'stage-1',
    ownerMemberId: 'seller-1',
    teamId: 'team-1',
    name: 'Lead',
    email: 'lead@yux.test',
    source: 'manual',
    score: 40,
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
  } satisfies CrmLead

  it('allows a seller to see only their owned lead', () => {
    expect(canMemberSeeLead(member('seller-1', 'seller'), lead, [])).toBe(true)
    expect(canMemberSeeLead(member('seller-2', 'seller'), lead, [])).toBe(false)
  })

  it('allows a manager to see leads from managed teams', () => {
    expect(canMemberSeeLead(member('manager-1', 'manager'), lead, [{
      id: 'tm-1',
      teamId: 'team-1',
      memberId: 'manager-1',
      role: 'manager',
      createdAt: '2026-06-03T00:00:00.000Z',
    }])).toBe(true)
  })
})

describe('canPublishCrmConfiguration', () => {
  it('requires a migration strategy when existing leads are impacted', () => {
    const result = canPublishCrmConfiguration({
      pipelinesChanged: true,
      customFieldsChanged: false,
      categoriesChanged: false,
      impactedOpenLeadCount: 5,
      migrationStrategy: undefined,
    })
    expect(result).toEqual({ allowed: false, reason: 'migration_strategy_required' })
  })
})

describe('chooseLeadMigrationStrategy', () => {
  it('keeps existing leads when no pipeline or field shape changed', () => {
    expect(chooseLeadMigrationStrategy({
      pipelinesChanged: false,
      customFieldsChanged: false,
      impactedOpenLeadCount: 10,
    })).toBe('keep_existing')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/lib/crm/governanceRules.test.ts
```

Expected: FAIL because `governanceRules.ts` does not exist and the new CRM types are missing.

- [ ] **Step 3: Add CRM governance types**

Modify `frontend/src/types/crm.ts` by adding the Shared Types from this plan and extend `CrmLead` with:

```ts
  crmInstanceId?: string
  teamId?: string
  ownerMemberId?: string
  pipelineVersionId?: string
  stageVersionId?: string
  assignmentState?: CrmAssignmentState
  assignmentMode?: CrmAssignmentMode
  lastAssignmentAt?: string
```

- [ ] **Step 4: Implement pure governance rules**

Create `frontend/src/lib/crm/governanceRules.ts`:

```ts
import type {
  CrmAssignmentMode,
  CrmInstance,
  CrmInstanceMember,
  CrmInstanceRole,
  CrmLead,
  CrmMigrationStrategy,
  CrmTeamMember,
} from '@/types/crm'

export interface SeatDecision {
  allowed: boolean
  reason?: 'seller_seat_limit_reached' | 'manager_seat_limit_reached' | 'admin_seat_limit_reached'
  currentCount: number
  limit: number
}

export interface PublishImpact {
  pipelinesChanged: boolean
  customFieldsChanged: boolean
  categoriesChanged: boolean
  impactedOpenLeadCount: number
  migrationStrategy?: CrmMigrationStrategy
}

export const seatLimitForRole = (instance: CrmInstance, role: CrmInstanceRole) => {
  if (role === 'seller') return instance.sellerSeatLimit
  if (role === 'manager') return instance.managerSeatLimit
  if (role === 'client_admin') return instance.adminSeatLimit
  return Number.POSITIVE_INFINITY
}

export const canAddCrmMember = (
  instance: CrmInstance,
  members: CrmInstanceMember[],
  role: CrmInstanceRole,
): SeatDecision => {
  const limit = seatLimitForRole(instance, role)
  const currentCount = role === 'yux_admin'
    ? members.filter(item => item.role === 'yux_admin' && item.status === 'active').length
    : members.filter(item => item.role === role && item.status !== 'disabled').length

  if (currentCount >= limit) {
    const reason = role === 'seller'
      ? 'seller_seat_limit_reached'
      : role === 'manager'
        ? 'manager_seat_limit_reached'
        : 'admin_seat_limit_reached'
    return { allowed: false, reason, currentCount, limit }
  }

  return { allowed: true, currentCount, limit }
}

export const canMemberSeeLead = (
  member: CrmInstanceMember,
  lead: Pick<CrmLead, 'ownerMemberId' | 'teamId'>,
  teamMemberships: CrmTeamMember[],
) => {
  if (member.role === 'yux_admin' || member.role === 'client_admin') return true
  if (member.role === 'seller') return lead.ownerMemberId === member.id
  if (member.role === 'manager') {
    return teamMemberships.some(item => (
      item.memberId === member.id &&
      item.role === 'manager' &&
      item.teamId === lead.teamId
    ))
  }
  return false
}

export const canManageCrmConfiguration = (
  member: CrmInstanceMember,
  capability: 'pipeline' | 'field' | 'category',
  instance: CrmInstance,
) => {
  if (member.role === 'yux_admin') return true
  if (member.role !== 'client_admin') return false
  if (capability === 'pipeline') return instance.allowClientPipelineCustomization
  if (capability === 'field') return instance.allowClientFieldCustomization
  return instance.allowClientCategoryCustomization
}

export const canPublishCrmConfiguration = (impact: PublishImpact) => {
  const structuralChange = impact.pipelinesChanged || impact.customFieldsChanged || impact.categoriesChanged
  if (!structuralChange) return { allowed: true as const }
  if (impact.impactedOpenLeadCount > 0 && !impact.migrationStrategy) {
    return { allowed: false as const, reason: 'migration_strategy_required' as const }
  }
  return { allowed: true as const }
}

export const chooseLeadMigrationStrategy = (
  input: Pick<PublishImpact, 'pipelinesChanged' | 'customFieldsChanged' | 'impactedOpenLeadCount'>,
): CrmMigrationStrategy => {
  if (!input.pipelinesChanged && !input.customFieldsChanged) return 'keep_existing'
  if (input.impactedOpenLeadCount === 0) return 'migrate_all'
  return 'mapped_stages'
}

export const normalizeAssignmentMode = (mode: CrmAssignmentMode | null | undefined): CrmAssignmentMode => (
  mode || 'queue'
)
```

- [ ] **Step 5: Run rule tests and type-check**

Run:

```bash
npm test -- src/lib/crm/governanceRules.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add frontend/src/types/crm.ts frontend/src/lib/crm/governanceRules.ts frontend/src/lib/crm/governanceRules.test.ts
git commit -m "feat: add crm governance rules"
```

---

### Task 2: Supabase CRM Governance Schema, RLS, Grants, And Probe

**Files:**
- Create: `supabase/migrations/20260603230000_crm_governance_by_contract.sql`
- Create: `supabase/probes/20260603230000_crm_governance_by_contract.sql`

- [ ] **Step 1: Create the migration and probe files**

Create `supabase/migrations/20260603230000_crm_governance_by_contract.sql` and `supabase/probes/20260603230000_crm_governance_by_contract.sql`.

- [ ] **Step 2: Add schema and constraints**

The migration must create:

```sql
create type public.crm_instance_status as enum ('draft', 'active', 'paused', 'archived');
create type public.crm_instance_role as enum ('seller', 'manager', 'client_admin', 'yux_admin');
create type public.crm_member_status as enum ('invited', 'active', 'disabled');
create type public.crm_assignment_mode as enum ('manual', 'queue', 'round_robin', 'pull_next');
create type public.crm_assignment_state as enum ('unassigned', 'assigned', 'in_queue', 'reassigned');
create type public.crm_publication_status as enum ('draft', 'reviewing', 'published', 'failed');
create type public.crm_migration_strategy as enum ('keep_existing', 'migrate_all', 'migrate_open', 'mapped_stages');

create table public.crm_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  status public.crm_instance_status not null default 'draft',
  sector_key text,
  blueprint_id uuid references public.blueprints(id) on delete set null,
  blueprint_application_run_id uuid references public.blueprint_application_runs(id) on delete set null,
  seller_seat_limit integer not null default 1 check (seller_seat_limit >= 0),
  manager_seat_limit integer not null default 0 check (manager_seat_limit >= 0),
  admin_seat_limit integer not null default 1 check (admin_seat_limit >= 0),
  max_pipeline_count integer not null default 1 check (max_pipeline_count >= 1),
  max_custom_field_count integer not null default 0 check (max_custom_field_count >= 0),
  max_automation_count integer not null default 0 check (max_automation_count >= 0),
  allow_client_pipeline_customization boolean not null default false,
  allow_client_field_customization boolean not null default false,
  allow_client_category_customization boolean not null default false,
  default_assignment_mode public.crm_assignment_mode not null default 'queue',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id)
);

create table public.crm_instance_members (
  id uuid primary key default gen_random_uuid(),
  crm_instance_id uuid not null references public.crm_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.crm_instance_role not null,
  status public.crm_member_status not null default 'invited',
  display_name text,
  email text,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crm_instance_id, user_id)
);

create table public.crm_teams (
  id uuid primary key default gen_random_uuid(),
  crm_instance_id uuid not null references public.crm_instances(id) on delete cascade,
  name text not null,
  description text,
  assignment_mode public.crm_assignment_mode not null default 'queue',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crm_instance_id, name)
);

create table public.crm_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.crm_teams(id) on delete cascade,
  member_id uuid not null references public.crm_instance_members(id) on delete cascade,
  role text not null check (role in ('seller', 'manager')),
  created_at timestamptz not null default now(),
  unique (team_id, member_id)
);
```

Also create these tables with `jsonb not null default '{}'::jsonb` payload columns where needed:

- `crm_pipeline_versions`: instance, version number, status, published_at, published_by, source_pipeline_id.
- `crm_stage_versions`: pipeline version, stable key, display name, color, order, won/lost flags.
- `crm_custom_field_definitions`: instance, stable key, label, field_type, options, required, version.
- `crm_categories`: instance, stable key, name, color, is_active.
- `crm_tags`: instance, stable key, name, color, is_active.
- `crm_loss_reasons`: instance, stable key, label, is_active.
- `crm_configuration_drafts`: instance, draft_payload, created_by, updated_by.
- `crm_configuration_publications`: draft, instance, status, migration_strategy, impact_summary, published_by.
- `crm_configuration_migration_runs`: publication, instance, status, processed_count, failed_count, error.
- `crm_audit_events`: instance, organization, actor, event_type, entity_type, entity_id, before_payload, after_payload.

Extend existing CRM tables:

```sql
alter table public.crm_pipelines
  add column if not exists crm_instance_id uuid references public.crm_instances(id) on delete set null;

alter table public.leads
  add column if not exists crm_instance_id uuid references public.crm_instances(id) on delete set null,
  add column if not exists team_id uuid references public.crm_teams(id) on delete set null,
  add column if not exists owner_member_id uuid references public.crm_instance_members(id) on delete set null,
  add column if not exists pipeline_version_id uuid references public.crm_pipeline_versions(id) on delete set null,
  add column if not exists stage_version_id uuid references public.crm_stage_versions(id) on delete set null,
  add column if not exists assignment_state public.crm_assignment_state not null default 'unassigned',
  add column if not exists assignment_mode public.crm_assignment_mode,
  add column if not exists last_assignment_at timestamptz;
```

- [ ] **Step 3: Add helper functions**

Add private security definer helpers:

```sql
create or replace function private.can_access_crm_instance(target_instance_id uuid)
returns boolean
language sql
security definer
set search_path = private, public
as $$
  select exists (
    select 1
    from public.crm_instance_members cim
    where cim.crm_instance_id = target_instance_id
      and cim.user_id = auth.uid()
      and cim.status = 'active'
  )
  or exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.role_key in ('admin', 'manager')
  );
$$;

create or replace function private.crm_member_role(target_instance_id uuid)
returns public.crm_instance_role
language sql
security definer
set search_path = private, public
as $$
  select cim.role
  from public.crm_instance_members cim
  where cim.crm_instance_id = target_instance_id
    and cim.user_id = auth.uid()
    and cim.status = 'active'
  limit 1;
$$;

create or replace function private.can_manage_crm_instance(target_instance_id uuid)
returns boolean
language sql
security definer
set search_path = private, public
as $$
  select coalesce(private.crm_member_role(target_instance_id) in ('client_admin', 'yux_admin'), false)
  or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.role_key in ('admin', 'manager')
  );
$$;
```

Add `private.can_access_crm_lead_v2(lead_id uuid)` and `private.can_update_crm_lead_v2(lead_id uuid)` using these rules:

- YUX internal admin/manager can access all client CRM leads.
- `client_admin` can access all leads in the CRM instance.
- `manager` can access leads from managed teams.
- `seller` can access only leads where `owner_member_id` is their member id.
- unassigned queue leads are visible to `client_admin`, YUX roles, and managers of the queue team.

- [ ] **Step 4: Enable RLS and grants**

For every new public table:

```sql
alter table public.crm_instances enable row level security;
grant select, insert, update, delete on public.crm_instances to authenticated;
```

Create policies with explicit names:

```sql
create policy "crm_instances_select_accessible"
on public.crm_instances
for select
to authenticated
using (private.can_access_crm_instance(id));

create policy "crm_instances_update_manageable"
on public.crm_instances
for update
to authenticated
using (private.can_manage_crm_instance(id))
with check (private.can_manage_crm_instance(id));
```

Repeat with table-specific `using` expressions for members, teams, versions, definitions, drafts, publications, migration runs, and audit events. Grant `select, insert, update, delete` only to `authenticated`; do not grant new tables to `anon`.

- [ ] **Step 5: Backfill existing CRM records conservatively**

Add a backfill block that:

- creates `crm_instances` for active contracts with enabled `crm` module and no instance;
- links existing `crm_pipelines` by `organization_id`;
- links existing open `leads` by `organization_id` and default instance;
- keeps `owner_id` and `assigned_to` values untouched;
- does not create CRM members without a real user id.

- [ ] **Step 6: Write probe assertions**

The probe must return zero rows on failure by raising exceptions:

```sql
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_instances'
  ) then
    raise exception 'crm_instances table missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_instances'
      and policyname = 'crm_instances_select_accessible'
  ) then
    raise exception 'crm_instances select policy missing';
  end if;

  if not has_table_privilege('authenticated', 'public.crm_instances', 'SELECT') then
    raise exception 'authenticated cannot select crm_instances';
  end if;
end $$;
```

Add equivalent checks for `crm_instance_members`, `crm_teams`, `crm_configuration_drafts`, `crm_configuration_publications`, and `leads.crm_instance_id`.

- [ ] **Step 7: Validate migration locally**

Run:

```bash
npx supabase db reset
npx supabase db push --local
psql "$SUPABASE_DB_URL" -f supabase/probes/20260603230000_crm_governance_by_contract.sql
```

Expected: migration applies and probe returns without exceptions.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase/migrations/20260603230000_crm_governance_by_contract.sql supabase/probes/20260603230000_crm_governance_by_contract.sql
git commit -m "feat: add crm governance schema"
```

---

### Task 3: Typed CRM Governance Service

**Files:**
- Create: `frontend/src/services/crmGovernanceService.ts`
- Create: `frontend/src/services/crmGovernanceService.test.ts`
- Modify: `frontend/src/services/platformService.ts`

- [ ] **Step 1: Write service payload tests**

Create `frontend/src/services/crmGovernanceService.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCrmInstanceInsertPayload,
  buildCrmMemberInvitePayload,
  buildCrmPublicationPayload,
} from './crmGovernanceService'

describe('crmGovernanceService payload builders', () => {
  it('builds contracted instance payload with safe defaults', () => {
    expect(buildCrmInstanceInsertPayload({
      organizationId: 'org-1',
      contractId: 'contract-1',
      sectorKey: 'medical_clinic',
      blueprintId: 'blueprint-1',
      sellerSeatLimit: 10,
      managerSeatLimit: 3,
      adminSeatLimit: 2,
    })).toEqual({
      organization_id: 'org-1',
      contract_id: 'contract-1',
      status: 'draft',
      sector_key: 'medical_clinic',
      blueprint_id: 'blueprint-1',
      seller_seat_limit: 10,
      manager_seat_limit: 3,
      admin_seat_limit: 2,
      max_pipeline_count: 3,
      max_custom_field_count: 20,
      max_automation_count: 5,
      allow_client_pipeline_customization: true,
      allow_client_field_customization: true,
      allow_client_category_customization: true,
      default_assignment_mode: 'queue',
    })
  })

  it('builds member invite payload', () => {
    expect(buildCrmMemberInvitePayload({
      crmInstanceId: 'crm-1',
      userId: 'user-1',
      role: 'seller',
      displayName: 'Ana Silva',
      email: 'ana@yux.test',
    })).toEqual({
      crm_instance_id: 'crm-1',
      user_id: 'user-1',
      role: 'seller',
      status: 'invited',
      display_name: 'Ana Silva',
      email: 'ana@yux.test',
    })
  })

  it('builds publication payload with explicit migration strategy', () => {
    expect(buildCrmPublicationPayload({
      crmInstanceId: 'crm-1',
      draftId: 'draft-1',
      migrationStrategy: 'mapped_stages',
      impactSummary: { impactedOpenLeadCount: 12 },
    })).toEqual({
      crm_instance_id: 'crm-1',
      draft_id: 'draft-1',
      status: 'reviewing',
      migration_strategy: 'mapped_stages',
      impact_summary: { impactedOpenLeadCount: 12 },
    })
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/services/crmGovernanceService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service mappings and methods**

Create `frontend/src/services/crmGovernanceService.ts` with:

```ts
import { supabase } from '@/lib/supabase'
import type {
  CrmAssignmentMode,
  CrmGovernanceContext,
  CrmInstance,
  CrmInstanceMember,
  CrmInstanceRole,
  CrmMigrationStrategy,
  CrmTeam,
} from '@/types/crm'

export interface CreateCrmInstanceInput {
  organizationId: string
  contractId: string
  sectorKey?: string
  blueprintId?: string
  blueprintApplicationRunId?: string
  sellerSeatLimit?: number
  managerSeatLimit?: number
  adminSeatLimit?: number
  maxPipelineCount?: number
  maxCustomFieldCount?: number
  maxAutomationCount?: number
  allowClientPipelineCustomization?: boolean
  allowClientFieldCustomization?: boolean
  allowClientCategoryCustomization?: boolean
  defaultAssignmentMode?: CrmAssignmentMode
}

export interface InviteCrmMemberInput {
  crmInstanceId: string
  userId: string
  role: CrmInstanceRole
  displayName?: string
  email?: string
}

export interface PublishCrmConfigurationInput {
  crmInstanceId: string
  draftId: string
  migrationStrategy: CrmMigrationStrategy
  impactSummary: Record<string, unknown>
}

export const buildCrmInstanceInsertPayload = (input: CreateCrmInstanceInput) => ({
  organization_id: input.organizationId,
  contract_id: input.contractId,
  status: 'draft',
  sector_key: input.sectorKey || null,
  blueprint_id: input.blueprintId || null,
  blueprint_application_run_id: input.blueprintApplicationRunId || null,
  seller_seat_limit: input.sellerSeatLimit ?? 1,
  manager_seat_limit: input.managerSeatLimit ?? 0,
  admin_seat_limit: input.adminSeatLimit ?? 1,
  max_pipeline_count: input.maxPipelineCount ?? 3,
  max_custom_field_count: input.maxCustomFieldCount ?? 20,
  max_automation_count: input.maxAutomationCount ?? 5,
  allow_client_pipeline_customization: input.allowClientPipelineCustomization ?? true,
  allow_client_field_customization: input.allowClientFieldCustomization ?? true,
  allow_client_category_customization: input.allowClientCategoryCustomization ?? true,
  default_assignment_mode: input.defaultAssignmentMode || 'queue',
})

export const buildCrmMemberInvitePayload = (input: InviteCrmMemberInput) => ({
  crm_instance_id: input.crmInstanceId,
  user_id: input.userId,
  role: input.role,
  status: 'invited',
  display_name: input.displayName || null,
  email: input.email || null,
})

export const buildCrmPublicationPayload = (input: PublishCrmConfigurationInput) => ({
  crm_instance_id: input.crmInstanceId,
  draft_id: input.draftId,
  status: 'reviewing',
  migration_strategy: input.migrationStrategy,
  impact_summary: input.impactSummary,
})

const mapInstance = (row: any): CrmInstance => ({
  id: row.id,
  organizationId: row.organization_id,
  contractId: row.contract_id,
  status: row.status,
  sectorKey: row.sector_key || undefined,
  blueprintId: row.blueprint_id || undefined,
  blueprintApplicationRunId: row.blueprint_application_run_id || undefined,
  sellerSeatLimit: row.seller_seat_limit,
  managerSeatLimit: row.manager_seat_limit,
  adminSeatLimit: row.admin_seat_limit,
  maxPipelineCount: row.max_pipeline_count,
  maxCustomFieldCount: row.max_custom_field_count,
  maxAutomationCount: row.max_automation_count,
  allowClientPipelineCustomization: row.allow_client_pipeline_customization,
  allowClientFieldCustomization: row.allow_client_field_customization,
  allowClientCategoryCustomization: row.allow_client_category_customization,
  defaultAssignmentMode: row.default_assignment_mode,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapMember = (row: any): CrmInstanceMember => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  userId: row.user_id,
  role: row.role,
  status: row.status,
  displayName: row.display_name || undefined,
  email: row.email || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapTeam = (row: any): CrmTeam => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  name: row.name,
  description: row.description || undefined,
  assignmentMode: row.assignment_mode,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const crmGovernanceService = {
  async getInstanceByContract(contractId: string) {
    const { data, error } = await supabase
      .from('crm_instances')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle()
    if (error) throw error
    return data ? mapInstance(data) : null
  },

  async getActiveInstanceForOrganization(organizationId: string) {
    const { data, error } = await supabase
      .from('crm_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? mapInstance(data) : null
  },

  async createInstance(input: CreateCrmInstanceInput) {
    const { data, error } = await supabase
      .from('crm_instances')
      .insert(buildCrmInstanceInsertPayload(input))
      .select()
      .single()
    if (error) throw error
    return mapInstance(data)
  },

  async getGovernanceContext(crmInstanceId: string): Promise<CrmGovernanceContext> {
    const [{ data: instance, error: instanceError }, { data: members, error: membersError }, { data: teams, error: teamsError }, { data: teamMembers, error: teamMembersError }] = await Promise.all([
      supabase.from('crm_instances').select('*').eq('id', crmInstanceId).single(),
      supabase.from('crm_instance_members').select('*').eq('crm_instance_id', crmInstanceId),
      supabase.from('crm_teams').select('*').eq('crm_instance_id', crmInstanceId).eq('is_active', true),
      supabase.from('crm_team_members').select('*'),
    ])
    if (instanceError) throw instanceError
    if (membersError) throw membersError
    if (teamsError) throw teamsError
    if (teamMembersError) throw teamMembersError
    return {
      instance: mapInstance(instance),
      currentMember: (members || []).map(mapMember)[0],
      teams: (teams || []).map(mapTeam),
      teamMemberships: (teamMembers || []).map((row: any) => ({
        id: row.id,
        teamId: row.team_id,
        memberId: row.member_id,
        role: row.role,
        createdAt: row.created_at,
      })),
    }
  },

  async inviteMember(input: InviteCrmMemberInput) {
    const { data, error } = await supabase
      .from('crm_instance_members')
      .insert(buildCrmMemberInvitePayload(input))
      .select()
      .single()
    if (error) throw error
    return mapMember(data)
  },

  async publishConfiguration(input: PublishCrmConfigurationInput) {
    const { data, error } = await supabase
      .from('crm_configuration_publications')
      .insert(buildCrmPublicationPayload(input))
      .select()
      .single()
    if (error) throw error
    return data
  },
}
```

- [ ] **Step 4: Wire platform blueprint application**

Modify `frontend/src/services/platformService.ts` inside the successful blueprint application flow so a CRM-enabled contract calls:

```ts
await crmGovernanceService.createInstance({
  organizationId: contract.clientId,
  contractId: contract.id,
  sectorKey: blueprint.sector,
  blueprintId: blueprint.id,
  blueprintApplicationRunId: run.id,
  sellerSeatLimit: 3,
  managerSeatLimit: 1,
  adminSeatLimit: 1,
  defaultAssignmentMode: 'queue',
})
```

Import:

```ts
import { crmGovernanceService } from '@/services/crmGovernanceService'
```

Guard it with `if (blueprint.moduleKeys.includes('crm'))`.

- [ ] **Step 5: Run service tests**

Run:

```bash
npm test -- src/services/crmGovernanceService.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add frontend/src/services/crmGovernanceService.ts frontend/src/services/crmGovernanceService.test.ts frontend/src/services/platformService.ts
git commit -m "feat: add crm governance service"
```

---

### Task 4: YUX Admin CRM Instance Provisioning UI

**Files:**
- Create: `frontend/src/components/platform/CrmInstanceProvisioningPanel.tsx`
- Create: `frontend/src/pages/platform/CrmGovernancePage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Test: `frontend/src/pages/platform/CrmGovernancePage.test.tsx`

- [ ] **Step 1: Write page test**

Create `frontend/src/pages/platform/CrmGovernancePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrmGovernancePage } from './CrmGovernancePage'

describe('CrmGovernancePage', () => {
  it('shows contracted CRM governance controls for YUX admins', () => {
    render(<CrmGovernancePage />)
    expect(screen.getByRole('heading', { name: /governanca crm/i })).toBeInTheDocument()
    expect(screen.getByText(/instancias por contrato/i)).toBeInTheDocument()
    expect(screen.getByText(/limites de vendedores/i)).toBeInTheDocument()
    expect(screen.getByText(/blueprint setorial/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing page test**

Run:

```bash
npm test -- src/pages/platform/CrmGovernancePage.test.tsx
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Create YUX provisioning panel**

Create `frontend/src/components/platform/CrmInstanceProvisioningPanel.tsx` with a polished operational layout:

```tsx
import { Settings2, ShieldCheck, Users } from 'lucide-react'

export function CrmInstanceProvisioningPanel() {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            Instancias por contrato
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Cada contrato com modulo CRM ativo recebe uma instancia isolada, com setor, blueprint e status proprios.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            Limites de vendedores
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            YUX define vendedores, gerentes e admins contratados antes do cliente convidar sua equipe.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4" />
            Blueprint setorial
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            O blueprint inicia funis, campos, categorias, mensagens e presets sem travar a personalizacao consultiva.
          </p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create page and routes**

Create `frontend/src/pages/platform/CrmGovernancePage.tsx`:

```tsx
import { CrmInstanceProvisioningPanel } from '@/components/platform/CrmInstanceProvisioningPanel'

export function CrmGovernancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Governanca CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controle comercial de instancias, limites, blueprints e permissoes por contrato.
        </p>
      </div>
      <CrmInstanceProvisioningPanel />
    </div>
  )
}
```

Modify `frontend/src/App.tsx`:

```tsx
import { CrmGovernancePage } from '@/pages/platform/CrmGovernancePage'
```

Add internal route:

```tsx
<Route path="crm-governance" element={<CrmGovernancePage />} />
```

Modify `frontend/src/lib/platform/navigation.ts` to add an internal navigation item:

```ts
{
  key: 'crm_governance',
  label: 'Governanca CRM',
  path: '/crm-governance',
  moduleKey: 'crm',
  permission: 'platform.manage',
}
```

- [ ] **Step 5: Run page and navigation tests**

Run:

```bash
npm test -- src/pages/platform/CrmGovernancePage.test.tsx src/lib/platform/navigation.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add frontend/src/components/platform/CrmInstanceProvisioningPanel.tsx frontend/src/pages/platform/CrmGovernancePage.tsx frontend/src/pages/platform/CrmGovernancePage.test.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts
git commit -m "feat: add crm governance admin surface"
```

---

### Task 5: Client Admin Seats And Teams Portal

**Files:**
- Create: `frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx`
- Create: `frontend/src/components/crm-governance/CrmSeatUsagePanel.tsx`
- Create: `frontend/src/components/crm-governance/CrmMembersPanel.tsx`
- Create: `frontend/src/components/crm-governance/CrmTeamsPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/pages/client-portal/PortalCrmSettingsPage.test.tsx`

- [ ] **Step 1: Write portal settings test**

Create `frontend/src/pages/client-portal/PortalCrmSettingsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PortalCrmSettingsPage } from './PortalCrmSettingsPage'

describe('PortalCrmSettingsPage', () => {
  it('shows client admin CRM controls inside contracted limits', () => {
    render(<PortalCrmSettingsPage />)
    expect(screen.getByRole('heading', { name: /configuracoes do crm/i })).toBeInTheDocument()
    expect(screen.getByText(/assentos contratados/i)).toBeInTheDocument()
    expect(screen.getByText(/equipes comerciais/i)).toBeInTheDocument()
    expect(screen.getByText(/convites e papeis/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- src/pages/client-portal/PortalCrmSettingsPage.test.tsx
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Add seat, members, and teams panels**

Create `frontend/src/components/crm-governance/CrmSeatUsagePanel.tsx`:

```tsx
export function CrmSeatUsagePanel() {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Assentos contratados</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Vendedores', '0 / 0'],
          ['Gerentes', '0 / 0'],
          ['Admins', '0 / 0'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

Create `frontend/src/components/crm-governance/CrmMembersPanel.tsx`:

```tsx
import { UserPlus } from 'lucide-react'

export function CrmMembersPanel() {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Convites e papeis</h2>
        <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <UserPlus className="h-4 w-4" />
          Convidar
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Admins do cliente convidam vendedores e gerentes dentro dos limites configurados pela YUX.
      </p>
    </section>
  )
}
```

Create `frontend/src/components/crm-governance/CrmTeamsPanel.tsx`:

```tsx
import { UsersRound } from 'lucide-react'

export function CrmTeamsPanel() {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4" />
        <h2 className="text-base font-semibold">Equipes comerciais</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Equipes definem visibilidade, distribuicao de leads e supervisao por gerente.
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Create portal settings page and route**

Create `frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx`:

```tsx
import { CrmMembersPanel } from '@/components/crm-governance/CrmMembersPanel'
import { CrmSeatUsagePanel } from '@/components/crm-governance/CrmSeatUsagePanel'
import { CrmTeamsPanel } from '@/components/crm-governance/CrmTeamsPanel'

export function PortalCrmSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Configuracoes do CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie usuarios, equipes e operacao comercial dentro do contrato ativo.
        </p>
      </div>
      <CrmSeatUsagePanel />
      <CrmMembersPanel />
      <CrmTeamsPanel />
    </div>
  )
}
```

Modify `frontend/src/App.tsx`:

```tsx
import { PortalCrmSettingsPage } from '@/pages/client-portal/PortalCrmSettingsPage'
```

Add portal route:

```tsx
<Route path="portal/crm/settings" element={<PortalCrmSettingsPage />} />
```

- [ ] **Step 5: Run portal tests**

Run:

```bash
npm test -- src/pages/client-portal/PortalCrmSettingsPage.test.tsx
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx frontend/src/pages/client-portal/PortalCrmSettingsPage.test.tsx frontend/src/components/crm-governance/CrmSeatUsagePanel.tsx frontend/src/components/crm-governance/CrmMembersPanel.tsx frontend/src/components/crm-governance/CrmTeamsPanel.tsx frontend/src/App.tsx
git commit -m "feat: add client crm governance settings"
```

---

### Task 6: Configuration Drafts, Publication, And Migration Plan UI

**Files:**
- Create: `frontend/src/components/crm-governance/CrmConfigurationDraftPanel.tsx`
- Create: `frontend/src/components/crm-governance/CrmPublicationWizard.tsx`
- Test: `frontend/src/components/crm-governance/CrmPublicationWizard.test.tsx`

- [ ] **Step 1: Write publication wizard test**

Create `frontend/src/components/crm-governance/CrmPublicationWizard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrmPublicationWizard } from './CrmPublicationWizard'

describe('CrmPublicationWizard', () => {
  it('requires a migration plan before publishing impacted leads', () => {
    render(<CrmPublicationWizard impactedOpenLeadCount={7} />)
    expect(screen.getByText(/7 leads abertos impactados/i)).toBeInTheDocument()
    expect(screen.getByText(/mapear etapas antigas para novas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publicar versao/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- src/components/crm-governance/CrmPublicationWizard.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement draft panel**

Create `frontend/src/components/crm-governance/CrmConfigurationDraftPanel.tsx`:

```tsx
import { GitBranch, Tags, TextCursorInput } from 'lucide-react'

export function CrmConfigurationDraftPanel() {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Rascunho de configuracao</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border p-3">
          <GitBranch className="h-4 w-4" />
          <div className="mt-2 text-sm font-medium">Funis e etapas</div>
        </div>
        <div className="rounded-md border p-3">
          <TextCursorInput className="h-4 w-4" />
          <div className="mt-2 text-sm font-medium">Campos personalizados</div>
        </div>
        <div className="rounded-md border p-3">
          <Tags className="h-4 w-4" />
          <div className="mt-2 text-sm font-medium">Categorias e perdas</div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Implement publication wizard**

Create `frontend/src/components/crm-governance/CrmPublicationWizard.tsx`:

```tsx
interface CrmPublicationWizardProps {
  impactedOpenLeadCount: number
  selectedStrategy?: 'keep_existing' | 'migrate_all' | 'migrate_open' | 'mapped_stages'
}

export function CrmPublicationWizard({ impactedOpenLeadCount, selectedStrategy }: CrmPublicationWizardProps) {
  const requiresStrategy = impactedOpenLeadCount > 0

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Publicacao da versao</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {impactedOpenLeadCount} leads abertos impactados pela nova configuracao.
      </p>
      <div className="mt-4 grid gap-2">
        <label className="rounded-md border p-3 text-sm">Manter leads existentes</label>
        <label className="rounded-md border p-3 text-sm">Migrar todos os leads</label>
        <label className="rounded-md border p-3 text-sm">Migrar apenas leads abertos</label>
        <label className="rounded-md border p-3 text-sm">Mapear etapas antigas para novas</label>
      </div>
      <button
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        disabled={requiresStrategy && !selectedStrategy}
      >
        Publicar versao
      </button>
    </section>
  )
}
```

- [ ] **Step 5: Wire panels into portal settings**

Modify `frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx`:

```tsx
import { CrmConfigurationDraftPanel } from '@/components/crm-governance/CrmConfigurationDraftPanel'
import { CrmPublicationWizard } from '@/components/crm-governance/CrmPublicationWizard'
```

Add after `CrmTeamsPanel`:

```tsx
<CrmConfigurationDraftPanel />
<CrmPublicationWizard impactedOpenLeadCount={0} selectedStrategy="keep_existing" />
```

- [ ] **Step 6: Run component tests**

Run:

```bash
npm test -- src/components/crm-governance/CrmPublicationWizard.test.tsx src/pages/client-portal/PortalCrmSettingsPage.test.tsx
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add frontend/src/components/crm-governance/CrmConfigurationDraftPanel.tsx frontend/src/components/crm-governance/CrmPublicationWizard.tsx frontend/src/components/crm-governance/CrmPublicationWizard.test.tsx frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx
git commit -m "feat: add crm configuration publication flow"
```

---

### Task 7: Governance-Aware Lead Service

**Files:**
- Modify: `frontend/src/services/crmService.ts`
- Modify: `frontend/src/services/crmService.test.ts`
- Modify: `frontend/src/types/crm.ts`

- [ ] **Step 1: Add lead payload tests**

Modify `frontend/src/services/crmService.test.ts` with:

```ts
import {
  buildGovernedLeadInsertPayload,
  buildLeadAssignmentPayload,
} from './crmService'

describe('governed lead payloads', () => {
  it('creates a lead linked to crm instance, team, owner, and assignment mode', () => {
    expect(buildGovernedLeadInsertPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      pipelineId: 'pipe-1',
      stageId: 'stage-1',
      teamId: 'team-1',
      ownerMemberId: 'member-1',
      assignmentMode: 'round_robin',
      name: 'Maria',
      email: 'maria@yux.test',
      source: 'whatsapp',
      score: 50,
    })).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      pipeline_id: 'pipe-1',
      stage_id: 'stage-1',
      team_id: 'team-1',
      owner_member_id: 'member-1',
      assignment_mode: 'round_robin',
      assignment_state: 'assigned',
    })
  })

  it('creates reassignment payload with audit-friendly timestamp', () => {
    const payload = buildLeadAssignmentPayload({
      teamId: 'team-2',
      ownerMemberId: 'member-2',
      assignmentMode: 'manual',
    })
    expect(payload).toMatchObject({
      team_id: 'team-2',
      owner_member_id: 'member-2',
      assignment_mode: 'manual',
      assignment_state: 'reassigned',
    })
    expect(typeof payload.last_assignment_at).toBe('string')
  })
})
```

- [ ] **Step 2: Run failing service tests**

Run:

```bash
npm test -- src/services/crmService.test.ts
```

Expected: FAIL because new helpers do not exist.

- [ ] **Step 3: Add governed lead helpers**

Modify `frontend/src/services/crmService.ts`:

```ts
export interface CreateGovernedLeadInput extends Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'> {
  crmInstanceId: string
  teamId?: string
  ownerMemberId?: string
}

export interface AssignLeadInput {
  teamId?: string
  ownerMemberId?: string
  assignmentMode: NonNullable<CrmLead['assignmentMode']>
}

export const buildGovernedLeadInsertPayload = (input: CreateGovernedLeadInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId,
  pipeline_id: input.pipelineId,
  stage_id: input.stageId,
  team_id: input.teamId || null,
  owner_member_id: input.ownerMemberId || null,
  name: input.name,
  email: input.email,
  phone: input.phone || null,
  company: input.company || null,
  source: input.source,
  source_kind: input.sourceKind || 'manual',
  status: input.status || 'open',
  score: input.score,
  value: input.value ?? null,
  notes: input.notes || null,
  owner_id: input.ownerId || input.assignedTo || null,
  assigned_to: input.assignedTo || null,
  assignment_mode: input.assignmentMode || 'queue',
  assignment_state: input.ownerMemberId ? 'assigned' : 'in_queue',
  last_assignment_at: input.ownerMemberId ? new Date().toISOString() : null,
  last_activity_at: input.lastActivityAt || new Date().toISOString(),
  next_follow_up_at: input.nextFollowUpAt || null,
  attribution_context: input.attributionContext || {},
  stage: 'NEW',
})

export const buildLeadAssignmentPayload = (input: AssignLeadInput) => ({
  team_id: input.teamId || null,
  owner_member_id: input.ownerMemberId || null,
  assignment_mode: input.assignmentMode,
  assignment_state: input.ownerMemberId ? 'reassigned' : 'in_queue',
  last_assignment_at: new Date().toISOString(),
})
```

Extend `LeadRow` and `mapLead` to include the governance fields added to `CrmLead`.

- [ ] **Step 4: Add service methods**

Add to `crmService`:

```ts
async getLeadsForInstance(crmInstanceId: string, pipelineId?: string) {
  let query = supabase
    .from('leads')
    .select('*')
    .eq('crm_instance_id', crmInstanceId)
    .order('updated_at', { ascending: false })

  if (pipelineId) query = query.eq('pipeline_id', pipelineId)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(mapLead)
},

async assignLead(leadId: string, input: AssignLeadInput) {
  const { data, error } = await supabase
    .from('leads')
    .update(buildLeadAssignmentPayload(input))
    .eq('id', leadId)
    .select()
    .single()
  if (error) throw error
  return mapLead(data)
},
```

- [ ] **Step 5: Run lead service tests**

Run:

```bash
npm test -- src/services/crmService.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add frontend/src/services/crmService.ts frontend/src/services/crmService.test.ts frontend/src/types/crm.ts
git commit -m "feat: add governed crm lead service"
```

---

### Task 8: CRM Workspace Access States And Role Views

**Files:**
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`
- Modify: `frontend/src/components/crm/LeadDetailPanel.tsx`
- Modify: `frontend/src/components/crm/LeadKanbanBoard.tsx`
- Modify: `frontend/src/components/crm/CrmWorkspace.test.tsx`

- [ ] **Step 1: Add workspace tests for CRM access**

Modify `frontend/src/components/crm/CrmWorkspace.test.tsx` to cover:

```tsx
it('shows contracted CRM unavailable state when no active crm instance exists', async () => {
  render(<CrmWorkspace organizationId="org-1" portalMode />)
  expect(await screen.findByText(/crm nao contratado ou inativo/i)).toBeInTheDocument()
})

it('shows seller-scoped lead view when current member is seller', async () => {
  render(<CrmWorkspace organizationId="org-1" portalMode />)
  expect(await screen.findByText(/meus leads/i)).toBeInTheDocument()
})

it('shows manager team controls when current member manages teams', async () => {
  render(<CrmWorkspace organizationId="org-1" portalMode />)
  expect(await screen.findByText(/leads da equipe/i)).toBeInTheDocument()
})
```

Mock `crmGovernanceService.getActiveInstanceForOrganization`, `crmGovernanceService.getGovernanceContext`, and `crmService.getLeadsForInstance` with deterministic values in the same style used by the existing test file.

- [ ] **Step 2: Run failing workspace tests**

Run:

```bash
npm test -- src/components/crm/CrmWorkspace.test.tsx
```

Expected: FAIL because the workspace still loads by organization/pipeline only.

- [ ] **Step 3: Load CRM governance context in workspace**

Modify `frontend/src/components/crm/CrmWorkspace.tsx` so initial load:

```ts
const instance = await crmGovernanceService.getActiveInstanceForOrganization(organizationId)
if (!instance) {
  setAccessState('unavailable')
  return
}
const governance = await crmGovernanceService.getGovernanceContext(instance.id)
const pipelines = await crmService.getPipelines(organizationId)
const leads = await crmService.getLeadsForInstance(instance.id, pipelines[0]?.id)
```

Render these states:

- loading: current existing skeleton or loading indicator;
- unavailable: text `CRM nao contratado ou inativo`;
- seller: section title `Meus leads`;
- manager: section title `Leads da equipe`;
- client admin or YUX admin: section title `Operacao CRM`;
- error: preserve existing error handling.

- [ ] **Step 4: Add owner/team context to lead detail**

Modify `frontend/src/components/crm/LeadDetailPanel.tsx` to show:

```tsx
{lead.ownerMemberId && (
  <div className="text-xs text-muted-foreground">Responsavel CRM: {lead.ownerMemberId}</div>
)}
{lead.teamId && (
  <div className="text-xs text-muted-foreground">Equipe: {lead.teamId}</div>
)}
```

Only show reassignment controls when the current role is `manager`, `client_admin`, or `yux_admin`.

- [ ] **Step 5: Run workspace tests and type-check**

Run:

```bash
npm test -- src/components/crm/CrmWorkspace.test.tsx
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add frontend/src/components/crm/CrmWorkspace.tsx frontend/src/components/crm/LeadDetailPanel.tsx frontend/src/components/crm/LeadKanbanBoard.tsx frontend/src/components/crm/CrmWorkspace.test.tsx
git commit -m "feat: scope crm workspace by governance"
```

---

### Task 9: Cross-Module Relationships And Documentation

**Files:**
- Modify: `docs/crm-lead-management.md`
- Modify: `docs/implementation-status.md`
- Test: none

- [ ] **Step 1: Update CRM documentation**

Update `docs/crm-lead-management.md` with these sections:

```markdown
## Governanca por contrato

O CRM e uma instancia contratada por cliente e contrato. Sem contrato ativo com modulo `crm`, o portal nao exibe operacao CRM.

## Papeis e visibilidade

- Admin YUX: configura limites, blueprint, status e auditoria.
- Admin cliente: gerencia usuarios, equipes e configuracoes dentro dos limites contratados.
- Gerente: ve leads das equipes sob sua gestao e pode redistribuir responsaveis.
- Vendedor: ve seus proprios leads e filas permitidas.

## Relacoes com outros modulos

- Campanhas criam ou atualizam leads com origem e atribuicao.
- Omnichannel sincroniza conversas e handoff para leads governados.
- Propostas usam o lead como origem comercial.
- Projetos podem nascer de propostas ganhas.
- Financeiro usa vendas/propostas aprovadas para contexto de receita.
- Suporte pode abrir chamados relacionados a clientes e contratos.
- Relatorios leem funil, equipe, vendedor, campanha e status contratual.
```

- [ ] **Step 2: Update implementation status**

Update `docs/implementation-status.md` with:

```markdown
### CRM governado por contrato

Status: planejado para implantacao.

Escopo da fase:

- instancia CRM por contrato;
- limites de vendedores, gerentes e admins;
- equipes comerciais;
- visibilidade por vendedor e gerente;
- personalizacao versionada de funis, campos, categorias e perdas;
- publicacao com plano de migracao;
- auditoria e RLS.
```

After implementation is complete, change status to `implementado localmente` and list the migration, service, UI, tests, and probes executed.

- [ ] **Step 3: Commit Task 9**

```bash
git add docs/crm-lead-management.md docs/implementation-status.md
git commit -m "docs: document crm governance implementation"
```

---

### Task 10: Full Validation And Release Handoff

**Files:**
- Modify only files touched by failing validation.

- [ ] **Step 1: Run frontend unit tests**

Run:

```bash
npm test -- src/lib/crm/governanceRules.test.ts src/services/crmGovernanceService.test.ts src/services/crmService.test.ts src/components/crm/CrmWorkspace.test.tsx src/pages/platform/CrmGovernancePage.test.tsx src/pages/client-portal/PortalCrmSettingsPage.test.tsx src/components/crm-governance/CrmPublicationWizard.test.tsx
```

Expected: all listed tests PASS.

- [ ] **Step 2: Run type-check and build**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands PASS.

- [ ] **Step 3: Run Supabase validation**

Run:

```bash
npx supabase db reset
npx supabase db push --local
psql "$SUPABASE_DB_URL" -f supabase/probes/20260603230000_crm_governance_by_contract.sql
```

Expected: migration and probe PASS.

- [ ] **Step 4: Verify browser flows**

Start the dev server:

```bash
npm run dev
```

Use the browser to verify:

- `/crm-governance` loads for YUX internal users;
- `/portal/crm` does not remain stuck on loading when no CRM instance exists;
- `/portal/crm/settings` shows seats, members, teams, and publication controls;
- a seller view displays `Meus leads`;
- a manager view displays `Leads da equipe`;
- no console error references unauthorized `organizations` loading for CRM fallback state.

- [ ] **Step 5: Final implementation status commit**

If validation required small fixes, commit them:

```bash
git add frontend/src/types/crm.ts frontend/src/lib/crm/governanceRules.ts frontend/src/lib/crm/governanceRules.test.ts frontend/src/services/crmGovernanceService.ts frontend/src/services/crmGovernanceService.test.ts frontend/src/services/platformService.ts frontend/src/services/crmService.ts frontend/src/services/crmService.test.ts frontend/src/components/platform/CrmInstanceProvisioningPanel.tsx frontend/src/pages/platform/CrmGovernancePage.tsx frontend/src/pages/platform/CrmGovernancePage.test.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/pages/client-portal/PortalCrmSettingsPage.tsx frontend/src/pages/client-portal/PortalCrmSettingsPage.test.tsx frontend/src/components/crm-governance/CrmSeatUsagePanel.tsx frontend/src/components/crm-governance/CrmMembersPanel.tsx frontend/src/components/crm-governance/CrmTeamsPanel.tsx frontend/src/components/crm-governance/CrmConfigurationDraftPanel.tsx frontend/src/components/crm-governance/CrmPublicationWizard.tsx frontend/src/components/crm-governance/CrmPublicationWizard.test.tsx frontend/src/components/crm/CrmWorkspace.tsx frontend/src/components/crm/LeadDetailPanel.tsx frontend/src/components/crm/LeadKanbanBoard.tsx frontend/src/components/crm/CrmWorkspace.test.tsx supabase/migrations/20260603230000_crm_governance_by_contract.sql supabase/probes/20260603230000_crm_governance_by_contract.sql docs/crm-lead-management.md docs/implementation-status.md
git commit -m "fix: validate crm governance flows"
```

If `git status --short` shows only a subset of those files, stage only the changed paths from this explicit list before committing.

---

## Success Criteria

The phase is complete when:

- CRM access is determined by active contract and enabled `crm` module.
- Each active CRM contract can have one `crm_instance`.
- YUX admin can configure status, blueprint, sector, limits, and customization permissions.
- Client admin can manage users and teams within limits.
- Sellers only see their own leads.
- Managers see leads for managed teams and can reassign inside allowed scope.
- Configuration changes use draft, publication, migration strategy, and audit.
- Existing CRM leads remain usable after backfill.
- Data API grants and RLS are explicit for every new table.
- CRM docs clearly describe implemented functionality and remaining scope.

## Self-Review Checklist

- Spec coverage: tasks cover instances, seats, teams, roles, RLS, blueprints, drafts, publication, migration plan, lead ownership, admin UI, portal UI, docs, and validation.
- Type consistency: all tasks use `CrmInstance`, `CrmInstanceMember`, `CrmTeam`, `CrmTeamMember`, `CrmGovernanceContext`, `CrmAssignmentMode`, and `CrmMigrationStrategy`.
- Supabase safety: new public tables include RLS and Data API grants for `authenticated`; helper functions live in `private`.
- Product quality: UI surfaces are operational and commercial, with clear panels for contracted limits, teams, and publication.
- Current limitation: this phase establishes governance and settings; advanced CRM redesign, lead scoring AI, full reporting dashboards, and provider automations remain separate follow-up phases.
