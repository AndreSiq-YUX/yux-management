import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'

export type PlatformMembership = {
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationKind: string
  roleKey: string
}

export type PlatformContext = {
  user: AuthUser
  memberships: PlatformMembership[]
  activeOrganizationId: string | null
  enabledModuleKeys: string[]
}

export type PlatformModule = {
  key: string
  name: string
  base: boolean
  internalRoute: string | null
  portalRoute: string | null
  requiredPermissions: string[]
}

export type Organization = {
  id: string
  name: string
  slug: string
  kind: string
  clientId?: string
  isInternalGrowthWorkspace: boolean
  workspacePurpose: string
  strategyPackScope: string
  createdAt: string
  updatedAt: string
}

export type PlatformRole = {
  key: string
  name: string
  scope: string
  permissions: string[]
}

export type Membership = {
  id: string
  userId: string
  organizationId: string
  roleKey: string
  createdAt: string
  updatedAt: string
}

export type PackageDefinition = {
  id: string
  key: string
  name: string
  description: string
  moduleKeys: string[]
  createdAt: string
  updatedAt: string
}

export type ContractModule = {
  contractId: string
  moduleKey: string
  enabled: boolean
}

export type ContractDetails = {
  id: string
  clientId: string
  packageId: string
  status: string
  startsAt: string
  endsAt?: string
  name?: string
  value?: number
  billingCycle?: string
  notes?: string
  createdAt: string
  updatedAt: string
  package: PackageDefinition | null
  modules: ContractModule[]
}

export type Contract = Omit<ContractDetails, 'package' | 'modules'>

export type ClientSummary = {
  id: string
  companyName: string
  contactName: string
  email: string
  userId?: string
}

export type PortalContractContext = {
  contract: ContractDetails | null
  enabledModuleKeys: string[]
}

export type Blueprint = {
  id: string
  key: string
  name: string
  sector: string
  description: string
  moduleKeys: string[]
  pipelineTemplate?: {
    id: string
    blueprintId: string
    key: string
    name: string
    description?: string
    stages: Array<{
      id: string
      templateId: string
      key: string
      name: string
      color?: string
      orderIndex: number
      isWon: boolean
      isLost: boolean
    }>
  }
  customFields: Array<{
    id: string
    blueprintId: string
    key: string
    label: string
    fieldType: string
    required: boolean
    options: string[]
  }>
  messageTemplates: Array<{
    id: string
    blueprintId: string
    key: string
    name: string
    channel: string
    body: string
  }>
  automationTemplates: Array<{
    id: string
    blueprintId: string
    key: string
    name: string
    triggerEvent: string
    draftPayload: Record<string, unknown>
  }>
  reportPresets: Array<{
    id: string
    blueprintId: string
    key: string
    name: string
    metricKeys: string[]
  }>
  applicationRuns: Array<{
    id: string
    blueprintId: string
    contractId: string
    status: string
    summary: Record<string, unknown>
    error?: string
    createdAt: string
    updatedAt: string
  }>
  createdAt: string
  updatedAt: string
}

export type BlueprintApplicationRun = {
  id: string
  blueprintId: string
  contractId: string
  status: string
  summary: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
}

export async function getOrganizations(pool: pg.Pool): Promise<Organization[]> {
  const result = await pool.query<{
    id: string
    name: string
    slug: string
    kind: string
    client_id: string | null
    is_internal_growth_workspace: boolean
    workspace_purpose: string
    strategy_pack_scope: string
    created_at: string
    updated_at: string
  }>(
    `SELECT
       id,
       name,
       slug,
       kind,
       client_id,
       COALESCE(is_internal_growth_workspace, false) AS is_internal_growth_workspace,
       COALESCE(workspace_purpose, 'client_delivery') AS workspace_purpose,
       COALESCE(strategy_pack_scope, 'client') AS strategy_pack_scope,
       created_at,
       updated_at
     FROM public.organizations
     ORDER BY name ASC`,
  )

  return result.rows.map(mapOrganization)
}

export async function createClientOrganization(
  pool: pg.Pool,
  input: { clientId: string; name: string; slug?: string },
): Promise<Organization> {
  const existing = await pool.query<{
    id: string
    name: string
    slug: string
    kind: string
    client_id: string | null
    is_internal_growth_workspace: boolean
    workspace_purpose: string
    strategy_pack_scope: string
    created_at: string
    updated_at: string
  }>(
    `SELECT
       id,
       name,
       slug,
       kind,
       client_id,
       COALESCE(is_internal_growth_workspace, false) AS is_internal_growth_workspace,
       COALESCE(workspace_purpose, 'client_delivery') AS workspace_purpose,
       COALESCE(strategy_pack_scope, 'client') AS strategy_pack_scope,
       created_at,
       updated_at
     FROM public.organizations
     WHERE client_id = $1
     LIMIT 1`,
    [input.clientId],
  )

  if (existing.rows[0]) return mapOrganization(existing.rows[0])

  const baseSlug = slugify(input.slug || input.name) || `cliente-${input.clientId.slice(0, 8)}`
  const inserted = await pool.query<{
    id: string
    name: string
    slug: string
    kind: string
    client_id: string | null
    is_internal_growth_workspace: boolean
    workspace_purpose: string
    strategy_pack_scope: string
    created_at: string
    updated_at: string
  }>(
    `INSERT INTO public.organizations (name, slug, kind, client_id)
     VALUES ($1, $2, 'client', $3)
     RETURNING
       id,
       name,
       slug,
       kind,
       client_id,
       COALESCE(is_internal_growth_workspace, false) AS is_internal_growth_workspace,
       COALESCE(workspace_purpose, 'client_delivery') AS workspace_purpose,
       COALESCE(strategy_pack_scope, 'client') AS strategy_pack_scope,
       created_at,
       updated_at`,
    [input.name.trim(), `${baseSlug}-${input.clientId.slice(0, 8)}`, input.clientId],
  )

  return mapOrganization(inserted.rows[0])
}

export async function getRoles(pool: pg.Pool): Promise<PlatformRole[]> {
  const result = await pool.query<{
    key: string
    name: string
    scope: string
    permissions: string[] | null
  }>(
    `SELECT r.key, r.name, r.scope, array_remove(array_agg(rp.permission_key ORDER BY rp.permission_key), NULL) AS permissions
     FROM public.roles r
     LEFT JOIN public.role_permissions rp ON rp.role_key = r.key
     GROUP BY r.key, r.name, r.scope
     ORDER BY r.name ASC`,
  )

  return result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    scope: row.scope,
    permissions: row.permissions ?? [],
  }))
}

export async function getMembershipsForUser(pool: pg.Pool, userId: string): Promise<Membership[]> {
  const result = await pool.query<{
    id: string
    user_id: string
    organization_id: string
    role_key: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, user_id, organization_id, role_key, created_at, updated_at
     FROM public.memberships
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  )

  return result.rows.map(mapMembership)
}

export async function getPlatformContext(pool: pg.Pool, user: AuthUser): Promise<PlatformContext> {
  const memberships = await pool.query<{
    organization_id: string
    organization_name: string
    organization_slug: string
    organization_kind: string
    role_key: string
  }>(
    `SELECT
       m.organization_id,
       o.name AS organization_name,
       o.slug AS organization_slug,
       o.kind AS organization_kind,
       m.role_key
     FROM public.memberships m
     JOIN public.organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1
     ORDER BY o.kind DESC, o.name ASC`,
    [user.id],
  )

  const mappedMemberships = memberships.rows.map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    organizationKind: row.organization_kind,
    roleKey: row.role_key,
  }))
  const activeOrganizationId = mappedMemberships[0]?.organizationId ?? null
  const enabledModuleKeys = await getEnabledModuleKeys(pool, mappedMemberships, user.role)

  return {
    user,
    memberships: mappedMemberships,
    activeOrganizationId,
    enabledModuleKeys,
  }
}

export async function getPlatformModules(pool: pg.Pool): Promise<PlatformModule[]> {
  const result = await pool.query<{
    key: string
    name: string
    base: boolean
    internal_route: string | null
    portal_route: string | null
    required_permissions: string[] | null
  }>(
    `SELECT key, name, base, internal_route, portal_route, required_permissions
     FROM public.platform_modules
     ORDER BY name ASC`,
  )

  return result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    base: row.base,
    internalRoute: row.internal_route,
    portalRoute: row.portal_route,
    requiredPermissions: row.required_permissions ?? [],
  }))
}

export async function upsertPlatformModule(
  pool: pg.Pool,
  input: {
    key: string
    name: string
    base: boolean
    internalRoute?: string | null
    portalRoute?: string | null
    requiredPermissions?: string[]
  },
): Promise<PlatformModule> {
  const result = await pool.query<{
    key: string
    name: string
    base: boolean
    internal_route: string | null
    portal_route: string | null
    required_permissions: string[] | null
  }>(
    `INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (key) DO UPDATE SET
       name = EXCLUDED.name,
       base = EXCLUDED.base,
       internal_route = EXCLUDED.internal_route,
       portal_route = EXCLUDED.portal_route,
       required_permissions = EXCLUDED.required_permissions,
       updated_at = NOW()
     RETURNING key, name, base, internal_route, portal_route, required_permissions`,
    [
      input.key.trim(),
      input.name.trim(),
      input.base,
      input.internalRoute?.trim() || null,
      input.portalRoute?.trim() || null,
      input.requiredPermissions ?? [],
    ],
  )

  return {
    key: result.rows[0].key,
    name: result.rows[0].name,
    base: result.rows[0].base,
    internalRoute: result.rows[0].internal_route,
    portalRoute: result.rows[0].portal_route,
    requiredPermissions: result.rows[0].required_permissions ?? [],
  }
}

export async function getPackages(pool: pg.Pool): Promise<PackageDefinition[]> {
  const packages = await pool.query<{
    id: string
    key: string
    name: string
    description: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, key, name, description, created_at, updated_at
     FROM public.packages
     ORDER BY name ASC`,
  )

  return mapPackages(pool, packages.rows)
}

export async function upsertPackageDefinition(
  pool: pg.Pool,
  input: { id?: string; key: string; name: string; description: string; moduleKeys: string[] },
): Promise<PackageDefinition> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.packages (id, key, name, description, updated_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       updated_at = NOW()
     RETURNING id`,
    [input.id ?? null, input.key.trim(), input.name.trim(), input.description.trim()],
  )

  await setPackageModules(pool, result.rows[0].id, input.moduleKeys)
  const packageDefinition = await getPackageById(pool, result.rows[0].id)
  if (!packageDefinition) throw new Error('package_not_found')
  return packageDefinition
}

export async function getPackageById(pool: pg.Pool, packageId: string): Promise<PackageDefinition | null> {
  const result = await pool.query<{
    id: string
    key: string
    name: string
    description: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, key, name, description, created_at, updated_at
     FROM public.packages
     WHERE id = $1`,
    [packageId],
  )

  const packages = await mapPackages(pool, result.rows)
  return packages[0] ?? null
}

export async function setPackageModules(
  pool: pg.Pool,
  packageId: string,
  moduleKeys: string[],
): Promise<Array<{ packageId: string; moduleKey: string }>> {
  const uniqueModuleKeys = Array.from(new Set(moduleKeys))
  await pool.query('DELETE FROM public.package_modules WHERE package_id = $1', [packageId])

  if (uniqueModuleKeys.length === 0) return []

  const result = await pool.query<{ package_id: string; module_key: string }>(
    `INSERT INTO public.package_modules (package_id, module_key)
     SELECT $1, unnest($2::text[])
     RETURNING package_id, module_key`,
    [packageId, uniqueModuleKeys],
  )

  return result.rows.map((row) => ({ packageId: row.package_id, moduleKey: row.module_key }))
}

export async function getPlatformContracts(pool: pg.Pool, user: AuthUser): Promise<ContractDetails[]> {
  return getContractDetails(pool, user)
}

export async function getContractById(pool: pg.Pool, user: AuthUser, contractId: string) {
  const contracts = await getContractDetails(pool, user, {
    where: 'c.id = $3',
    values: [contractId],
  })
  return contracts[0] ?? null
}

export async function getActiveContractForClient(pool: pg.Pool, user: AuthUser, clientId: string) {
  const contracts = await getContractDetails(pool, user, {
    where: `c.client_id = $3
      AND c.status = 'active'
      AND c.starts_at <= CURRENT_DATE
      AND (c.ends_at IS NULL OR c.ends_at >= CURRENT_DATE)`,
    values: [clientId],
    orderBy: 'c.starts_at DESC',
    limit: 1,
  })
  return contracts[0] ?? null
}

export async function getClientForUser(pool: pg.Pool, userId: string): Promise<ClientSummary | null> {
  const directClient = await pool.query<{
    id: string
    company_name: string
    contact_name: string
    email: string
    user_id: string | null
  }>(
    `SELECT id, company_name, contact_name, email, user_id
     FROM public.clients
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  )

  if (directClient.rows[0]) return mapClientSummary(directClient.rows[0])

  const organizationClient = await pool.query<{
    id: string
    company_name: string
    contact_name: string
    email: string
    user_id: string | null
  }>(
    `SELECT c.id, c.company_name, c.contact_name, c.email, c.user_id
     FROM public.memberships m
     JOIN public.organizations o ON o.id = m.organization_id
     JOIN public.clients c ON c.id = o.client_id
     WHERE m.user_id = $1
     LIMIT 1`,
    [userId],
  )

  return organizationClient.rows[0] ? mapClientSummary(organizationClient.rows[0]) : null
}

export async function getPortalContractContextForUser(
  pool: pg.Pool,
  user: AuthUser,
  userId: string,
): Promise<PortalContractContext> {
  const client = await getClientForUser(pool, userId)
  if (!client) return { contract: null, enabledModuleKeys: [] }
  return getPortalContractContextForClient(pool, user, client.id)
}

export async function getPortalContractContextForClient(
  pool: pg.Pool,
  user: AuthUser,
  clientId: string,
): Promise<PortalContractContext> {
  const contract = await getActiveContractForClient(pool, user, clientId)
  return {
    contract,
    enabledModuleKeys: contract?.modules.filter((module) => module.enabled).map((module) => module.moduleKey) ?? [],
  }
}

export async function createContract(
  pool: pg.Pool,
  user: AuthUser,
  input: {
    clientId: string
    packageId: string
    name: string
    status: string
    startsAt: string
    endsAt?: string | null
    value?: number | null
    billingCycle: string
    notes?: string | null
  },
): Promise<ContractDetails> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.contracts (
       client_id, package_id, name, status, starts_at, ends_at, value, billing_cycle, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.clientId,
      input.packageId,
      input.name,
      input.status,
      input.startsAt,
      input.endsAt ?? null,
      input.value ?? null,
      input.billingCycle,
      input.notes ?? null,
    ],
  )

  const contract = await getContractById(pool, user, result.rows[0].id)
  if (!contract) throw new Error('contract_not_found')
  return contract
}

export async function updateContract(
  pool: pg.Pool,
  user: AuthUser,
  contractId: string,
  input: Partial<{
    packageId: string
    name: string
    status: string
    startsAt: string
    endsAt: string | null
    value: number | null
    billingCycle: string
    notes: string | null
  }>,
): Promise<ContractDetails | null> {
  const updates: string[] = []
  const values: unknown[] = []

  const addUpdate = (column: string, value: unknown) => {
    values.push(value)
    updates.push(`${column} = $${values.length}`)
  }

  if (input.packageId !== undefined) addUpdate('package_id', input.packageId)
  if (input.name !== undefined) addUpdate('name', input.name)
  if (input.status !== undefined) addUpdate('status', input.status)
  if (input.startsAt !== undefined) addUpdate('starts_at', input.startsAt)
  if (input.endsAt !== undefined) addUpdate('ends_at', input.endsAt)
  if (input.value !== undefined) addUpdate('value', input.value)
  if (input.billingCycle !== undefined) addUpdate('billing_cycle', input.billingCycle)
  if (input.notes !== undefined) addUpdate('notes', input.notes)

  if (updates.length > 0) {
    values.push(contractId)
    await pool.query(
      `UPDATE public.contracts
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values,
    )
  }

  return getContractById(pool, user, contractId)
}

export async function setContractModule(
  pool: pg.Pool,
  contractId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<ContractModule> {
  const result = await pool.query<{ contract_id: string; module_key: string; enabled: boolean }>(
    `INSERT INTO public.contract_modules (contract_id, module_key, enabled, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (contract_id, module_key) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       updated_at = NOW()
     RETURNING contract_id, module_key, enabled`,
    [contractId, moduleKey, enabled],
  )

  return {
    contractId: result.rows[0].contract_id,
    moduleKey: result.rows[0].module_key,
    enabled: result.rows[0].enabled,
  }
}

export async function getContractsForClient(pool: pg.Pool, user: AuthUser, clientId: string): Promise<Contract[]> {
  const contracts = await getContractDetails(pool, user, {
    where: 'c.client_id = $3',
    values: [clientId],
  })
  return contracts.map(({ package: _package, modules: _modules, ...contract }) => contract)
}

export async function getContractModules(pool: pg.Pool, contractId: string): Promise<ContractModule[]> {
  const result = await pool.query<{ contract_id: string; module_key: string; enabled: boolean }>(
    `SELECT contract_id, module_key, enabled
     FROM public.contract_modules
     WHERE contract_id = $1
     ORDER BY module_key ASC`,
    [contractId],
  )

  return result.rows.map((row) => ({
    contractId: row.contract_id,
    moduleKey: row.module_key,
    enabled: row.enabled,
  }))
}

async function getContractDetails(
  pool: pg.Pool,
  user: AuthUser,
  filters: { where?: string; values?: unknown[]; orderBy?: string; limit?: number } = {},
): Promise<ContractDetails[]> {
  const isInternal = user.role === 'yux_admin' || user.role === 'yux_operator'
  const contracts = await pool.query<{
    id: string
    client_id: string
    package_id: string
    status: string
    starts_at: string
    ends_at: string | null
    name: string | null
    value: string | number | null
    billing_cycle: string | null
    notes: string | null
    created_at: string
    updated_at: string
    package_key: string | null
    package_name: string | null
    package_description: string | null
    package_created_at: string | null
    package_updated_at: string | null
  }>(
    `SELECT
       c.id,
       c.client_id,
       c.package_id,
       c.status,
       c.starts_at,
       c.ends_at,
       c.name,
       c.value,
       c.billing_cycle,
       c.notes,
       c.created_at,
       c.updated_at,
       p.key AS package_key,
       p.name AS package_name,
       p.description AS package_description,
       p.created_at AS package_created_at,
       p.updated_at AS package_updated_at
     FROM public.contracts c
     LEFT JOIN public.packages p ON p.id = c.package_id
     WHERE (
       $2::boolean = TRUE
       OR EXISTS (
         SELECT 1
         FROM public.memberships m
         JOIN public.organizations o ON o.id = m.organization_id
         WHERE m.user_id = $1
           AND o.client_id = c.client_id
       )
     )
     ${filters.where ? `AND ${filters.where}` : ''}
     ORDER BY ${filters.orderBy ?? 'c.created_at DESC'}
     ${filters.limit ? `LIMIT ${filters.limit}` : ''}`,
    [user.id, isInternal, ...(filters.values ?? [])],
  )

  if (contracts.rows.length === 0) return []

  const contractIds = contracts.rows.map((row) => row.id)
  const packageIds = Array.from(new Set(contracts.rows.map((row) => row.package_id)))
  const [contractModules, packageModules] = await Promise.all([
    pool.query<{ contract_id: string; module_key: string; enabled: boolean }>(
      `SELECT contract_id, module_key, enabled
       FROM public.contract_modules
       WHERE contract_id = ANY($1::uuid[])
       ORDER BY module_key ASC`,
      [contractIds],
    ),
    pool.query<{ package_id: string; module_key: string }>(
      `SELECT package_id, module_key
       FROM public.package_modules
       WHERE package_id = ANY($1::uuid[])
       ORDER BY module_key ASC`,
      [packageIds],
    ),
  ])

  const modulesByContract = groupRows(contractModules.rows, 'contract_id')
  const modulesByPackage = groupRows(packageModules.rows, 'package_id')

  return contracts.rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    packageId: row.package_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    name: row.name ?? undefined,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
    billingCycle: row.billing_cycle ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    package: row.package_key
      ? {
          id: row.package_id,
          key: row.package_key,
          name: row.package_name ?? '',
          description: row.package_description ?? '',
          moduleKeys: (modulesByPackage.get(row.package_id) ?? []).map((module) => module.module_key),
          createdAt: row.package_created_at ?? row.created_at,
          updatedAt: row.package_updated_at ?? row.updated_at,
        }
      : null,
    modules: (modulesByContract.get(row.id) ?? []).map((module) => ({
      contractId: module.contract_id,
      moduleKey: module.module_key,
      enabled: module.enabled,
    })),
  }))
}

export async function getPlatformBlueprints(pool: pg.Pool): Promise<Blueprint[]> {
  const blueprints = await pool.query<{
    id: string
    key: string
    name: string
    sector: string
    description: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, key, name, sector, description, created_at, updated_at
     FROM public.blueprints
     ORDER BY name ASC`,
  )

  if (blueprints.rows.length === 0) return []

  const blueprintIds = blueprints.rows.map((row) => row.id)
  const [
    modules,
    pipelineTemplates,
    pipelineStages,
    customFields,
    messageTemplates,
    automationTemplates,
    reportPresets,
    applicationRuns,
  ] = await Promise.all([
    pool.query<{ blueprint_id: string; module_key: string }>(
      `SELECT blueprint_id, module_key
       FROM public.blueprint_modules
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY module_key ASC`,
      [blueprintIds],
    ),
    pool.query<{ id: string; blueprint_id: string; key: string; name: string; description: string | null }>(
      `SELECT id, blueprint_id, key, name, description
       FROM public.blueprint_pipeline_templates
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      template_id: string
      key: string
      name: string
      color: string | null
      order_index: number
      is_won: boolean
      is_lost: boolean
    }>(
      `SELECT id, template_id, key, name, color, order_index, is_won, is_lost
       FROM public.blueprint_pipeline_stages
       WHERE template_id = ANY(
         SELECT id FROM public.blueprint_pipeline_templates WHERE blueprint_id = ANY($1::uuid[])
       )
       ORDER BY order_index ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      blueprint_id: string
      key: string
      label: string
      field_type: string
      required: boolean
      options: string[] | null
    }>(
      `SELECT id, blueprint_id, key, label, field_type, required, options
       FROM public.blueprint_custom_fields
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY order_index ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      blueprint_id: string
      key: string
      name: string
      channel: string
      body: string
    }>(
      `SELECT id, blueprint_id, key, name, channel, body
       FROM public.blueprint_message_templates
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY name ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      blueprint_id: string
      key: string
      name: string
      trigger_event: string
      draft_payload: Record<string, unknown> | null
    }>(
      `SELECT id, blueprint_id, key, name, trigger_event, draft_payload
       FROM public.blueprint_automation_templates
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY name ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      blueprint_id: string
      key: string
      name: string
      metric_keys: string[] | null
    }>(
      `SELECT id, blueprint_id, key, name, metric_keys
       FROM public.blueprint_report_presets
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY name ASC`,
      [blueprintIds],
    ),
    pool.query<{
      id: string
      blueprint_id: string
      contract_id: string
      status: string
      summary: Record<string, unknown> | null
      error: string | null
      created_at: string
      updated_at: string
    }>(
      `SELECT id, blueprint_id, contract_id, status, summary, error, created_at, updated_at
       FROM public.blueprint_application_runs
       WHERE blueprint_id = ANY($1::uuid[])
       ORDER BY created_at DESC`,
      [blueprintIds],
    ),
  ])

  const modulesByBlueprint = groupRows(modules.rows, 'blueprint_id')
  const pipelineTemplatesByBlueprint = groupRows(pipelineTemplates.rows, 'blueprint_id')
  const stagesByTemplate = groupRows(pipelineStages.rows, 'template_id')
  const customFieldsByBlueprint = groupRows(customFields.rows, 'blueprint_id')
  const messageTemplatesByBlueprint = groupRows(messageTemplates.rows, 'blueprint_id')
  const automationTemplatesByBlueprint = groupRows(automationTemplates.rows, 'blueprint_id')
  const reportPresetsByBlueprint = groupRows(reportPresets.rows, 'blueprint_id')
  const applicationRunsByBlueprint = groupRows(applicationRuns.rows, 'blueprint_id')

  return blueprints.rows.map((row) => {
    const pipelineTemplate = pipelineTemplatesByBlueprint.get(row.id)?.[0]

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      sector: row.sector,
      description: row.description,
      moduleKeys: (modulesByBlueprint.get(row.id) ?? []).map((module) => module.module_key),
      pipelineTemplate: pipelineTemplate
        ? {
            id: pipelineTemplate.id,
            blueprintId: pipelineTemplate.blueprint_id,
            key: pipelineTemplate.key,
            name: pipelineTemplate.name,
            description: pipelineTemplate.description ?? undefined,
            stages: (stagesByTemplate.get(pipelineTemplate.id) ?? []).map((stage) => ({
              id: stage.id,
              templateId: stage.template_id,
              key: stage.key,
              name: stage.name,
              color: stage.color ?? undefined,
              orderIndex: stage.order_index,
              isWon: stage.is_won,
              isLost: stage.is_lost,
            })),
          }
        : undefined,
      customFields: (customFieldsByBlueprint.get(row.id) ?? []).map((field) => ({
        id: field.id,
        blueprintId: field.blueprint_id,
        key: field.key,
        label: field.label,
        fieldType: field.field_type,
        required: field.required,
        options: field.options ?? [],
      })),
      messageTemplates: (messageTemplatesByBlueprint.get(row.id) ?? []).map((template) => ({
        id: template.id,
        blueprintId: template.blueprint_id,
        key: template.key,
        name: template.name,
        channel: template.channel,
        body: template.body,
      })),
      automationTemplates: (automationTemplatesByBlueprint.get(row.id) ?? []).map((template) => ({
        id: template.id,
        blueprintId: template.blueprint_id,
        key: template.key,
        name: template.name,
        triggerEvent: template.trigger_event,
        draftPayload: template.draft_payload ?? {},
      })),
      reportPresets: (reportPresetsByBlueprint.get(row.id) ?? []).map((preset) => ({
        id: preset.id,
        blueprintId: preset.blueprint_id,
        key: preset.key,
        name: preset.name,
        metricKeys: preset.metric_keys ?? [],
      })),
      applicationRuns: (applicationRunsByBlueprint.get(row.id) ?? []).map((run) => ({
        id: run.id,
        blueprintId: run.blueprint_id,
        contractId: run.contract_id,
        status: run.status,
        summary: run.summary ?? {},
        error: run.error ?? undefined,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export async function getPlatformBlueprintById(pool: pg.Pool, blueprintId: string): Promise<Blueprint | null> {
  const blueprints = await getPlatformBlueprints(pool)
  return blueprints.find((blueprint) => blueprint.id === blueprintId) ?? null
}

export async function applyBlueprintToContract(
  pool: pg.Pool,
  user: AuthUser,
  input: { blueprintId: string; contractId: string; organizationId: string },
): Promise<BlueprintApplicationRun> {
  const blueprint = await getPlatformBlueprintById(pool, input.blueprintId)
  if (!blueprint) throw new Error('blueprint_not_found')

  const existingRun = await pool.query<{
    id: string
    blueprint_id: string
    contract_id: string
    status: string
    summary: Record<string, unknown> | null
    error: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, blueprint_id, contract_id, status, summary, error, created_at, updated_at
     FROM public.blueprint_application_runs
     WHERE blueprint_id = $1 AND contract_id = $2
     LIMIT 1`,
    [input.blueprintId, input.contractId],
  )

  if (existingRun.rows[0]?.status === 'succeeded') {
    await ensureOnboardingChecklist(pool, input.organizationId, input.contractId, blueprint)
    return mapBlueprintApplicationRun(existingRun.rows[0])
  }

  const summary = summarizeBlueprintApplication(blueprint)
  const runningRun = await pool.query<{
    id: string
    blueprint_id: string
    contract_id: string
    status: string
    summary: Record<string, unknown> | null
    error: string | null
    created_at: string
    updated_at: string
  }>(
    `INSERT INTO public.blueprint_application_runs (
       blueprint_id, contract_id, organization_id, status, summary, error, started_at, completed_at
     )
     VALUES ($1, $2, $3, 'running', $4::jsonb, NULL, NOW(), NULL)
     ON CONFLICT (blueprint_id, contract_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       status = 'running',
       summary = EXCLUDED.summary,
       error = NULL,
       started_at = NOW(),
       completed_at = NULL,
       updated_at = NOW()
     RETURNING id, blueprint_id, contract_id, status, summary, error, created_at, updated_at`,
    [input.blueprintId, input.contractId, input.organizationId, JSON.stringify(summary)],
  )

  const runId = runningRun.rows[0].id
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (blueprint.moduleKeys.length > 0) {
      await client.query(
        `INSERT INTO public.contract_modules (contract_id, module_key, enabled, updated_at)
         SELECT $1, unnest($2::text[]), TRUE, NOW()
         ON CONFLICT (contract_id, module_key) DO UPDATE SET
           enabled = TRUE,
           updated_at = NOW()`,
        [input.contractId, blueprint.moduleKeys],
      )
    }

    let crmInstanceId: string | null = null
    if (blueprint.moduleKeys.includes('crm')) {
      const crmInstance = await client.query<{ id: string }>(
        `INSERT INTO public.crm_instances (
           organization_id,
           contract_id,
           status,
           sector_key,
           blueprint_id,
           blueprint_application_run_id,
           seller_seat_limit,
           manager_seat_limit,
           admin_seat_limit,
           max_pipeline_count,
           max_custom_field_count,
           max_automation_count,
           allow_client_pipeline_customization,
           allow_client_field_customization,
           allow_client_category_customization,
           default_assignment_mode,
           created_by,
           updated_by
         )
         VALUES ($1, $2, 'draft', $3, $4, $5, 3, 1, 1, 3, 20, 5, TRUE, TRUE, TRUE, 'queue', $6, $6)
         ON CONFLICT (contract_id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           sector_key = EXCLUDED.sector_key,
           blueprint_id = EXCLUDED.blueprint_id,
           blueprint_application_run_id = EXCLUDED.blueprint_application_run_id,
           seller_seat_limit = EXCLUDED.seller_seat_limit,
           manager_seat_limit = EXCLUDED.manager_seat_limit,
           admin_seat_limit = EXCLUDED.admin_seat_limit,
           max_pipeline_count = EXCLUDED.max_pipeline_count,
           max_custom_field_count = EXCLUDED.max_custom_field_count,
           max_automation_count = EXCLUDED.max_automation_count,
           allow_client_pipeline_customization = EXCLUDED.allow_client_pipeline_customization,
           allow_client_field_customization = EXCLUDED.allow_client_field_customization,
           allow_client_category_customization = EXCLUDED.allow_client_category_customization,
           default_assignment_mode = EXCLUDED.default_assignment_mode,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id`,
        [input.organizationId, input.contractId, blueprint.sector, blueprint.id, runId, user.id],
      )
      crmInstanceId = crmInstance.rows[0].id
    }

    const pipelineTemplate = buildPipelineFromBlueprint(blueprint)
    const pipeline = await client.query<{ id: string }>(
      `INSERT INTO public.crm_pipelines (
         organization_id, crm_instance_id, name, description, is_default, is_active
       )
       VALUES ($1, $2, $3, $4, FALSE, TRUE)
       ON CONFLICT (organization_id, name) DO UPDATE SET
         crm_instance_id = COALESCE(EXCLUDED.crm_instance_id, public.crm_pipelines.crm_instance_id),
         description = EXCLUDED.description,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id`,
      [input.organizationId, crmInstanceId, pipelineTemplate.name, pipelineTemplate.description || blueprint.description],
    )

    if (pipelineTemplate.stages.length > 0) {
      for (const stage of pipelineTemplate.stages) {
        await client.query(
          `INSERT INTO public.crm_pipeline_stages (
             pipeline_id, key, name, color, order_index, is_won, is_lost, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
           ON CONFLICT (pipeline_id, key) DO UPDATE SET
             name = EXCLUDED.name,
             color = EXCLUDED.color,
             order_index = EXCLUDED.order_index,
             is_won = EXCLUDED.is_won,
             is_lost = EXCLUDED.is_lost,
             is_active = TRUE,
             updated_at = NOW()`,
          [
            pipeline.rows[0].id,
            stage.key,
            stage.name,
            stage.color ?? '#64748b',
            stage.orderIndex,
            Boolean(stage.isWon),
            Boolean(stage.isLost),
          ],
        )
      }
    }

    await ensureOnboardingChecklist(client, input.organizationId, input.contractId, blueprint)

    const completedSummary = {
      ...summary,
      pipelineId: pipeline.rows[0].id,
      linkedMessageTemplateKeys: blueprint.messageTemplates.map((template) => template.key),
      linkedAutomationTemplateKeys: blueprint.automationTemplates.map((template) => template.key),
      linkedReportPresetKeys: blueprint.reportPresets.map((preset) => preset.key),
    }

    const completedRun = await client.query<{
      id: string
      blueprint_id: string
      contract_id: string
      status: string
      summary: Record<string, unknown> | null
      error: string | null
      created_at: string
      updated_at: string
    }>(
      `UPDATE public.blueprint_application_runs
       SET status = 'succeeded',
           pipeline_id = $2,
           summary = $3::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, blueprint_id, contract_id, status, summary, error, created_at, updated_at`,
      [runId, pipeline.rows[0].id, JSON.stringify(completedSummary)],
    )

    await client.query('COMMIT')
    return mapBlueprintApplicationRun(completedRun.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    await pool.query(
      `UPDATE public.blueprint_application_runs
       SET status = 'failed', error = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [runId, error instanceof Error ? error.message : 'Erro ao aplicar blueprint'],
    )
    throw error
  } finally {
    client.release()
  }
}

async function getEnabledModuleKeys(pool: pg.Pool, memberships: PlatformMembership[], userRole: string) {
  if (userRole === 'yux_admin' || userRole === 'yux_operator') {
    const modules = await pool.query<{ key: string }>('SELECT key FROM public.platform_modules ORDER BY key')
    return modules.rows.map((row) => row.key)
  }

  if (memberships.length === 0) return []

  const modules = await pool.query<{ module_key: string }>(
    `SELECT DISTINCT cm.module_key
     FROM public.memberships m
     JOIN public.organizations o ON o.id = m.organization_id
     JOIN public.contracts c ON c.client_id = o.client_id
     JOIN public.contract_modules cm ON cm.contract_id = c.id
     WHERE m.organization_id = ANY($1::uuid[])
       AND c.status = 'active'
       AND cm.enabled = TRUE
     ORDER BY cm.module_key`,
    [memberships.map((membership) => membership.organizationId)],
  )

  return modules.rows.map((row) => row.module_key)
}

type Queryable = {
  query: pg.Pool['query']
}

type BlueprintPipelineStage = {
  key: string
  name: string
  color?: string
  orderIndex: number
  isWon?: boolean
  isLost?: boolean
}

type BlueprintPipelineTemplate = {
  key: string
  name: string
  description?: string
  stages: BlueprintPipelineStage[]
}

const fallbackStageColors = ['#2563eb', '#7c3aed', '#d97706', '#0891b2', '#16a34a', '#64748b', '#475569']

const onboardingBaseSteps = [
  { key: 'company_profile', label: 'Completar perfil da empresa', moduleKey: 'company', estimatedMinutes: 10, sortOrder: 1 },
  { key: 'users_and_permissions', label: 'Convidar equipe e revisar permissoes', moduleKey: 'company', estimatedMinutes: 8, sortOrder: 2 },
  { key: 'brand_voice', label: 'Configurar marca e tom de voz', moduleKey: 'marketing_studio', estimatedMinutes: 15, sortOrder: 3 },
  { key: 'knowledge_base', label: 'Carregar base de conhecimento', moduleKey: 'knowledge_base', estimatedMinutes: 20, sortOrder: 4 },
  { key: 'channels', label: 'Conectar canais de atendimento', moduleKey: 'whatsapp_ai', estimatedMinutes: 15, sortOrder: 5 },
  { key: 'crm_pipeline', label: 'Revisar funil comercial setorial', moduleKey: 'crm', estimatedMinutes: 12, sortOrder: 6 },
  { key: 'campaign_plan', label: 'Criar primeira Campanha 360', moduleKey: 'campaigns', estimatedMinutes: 18, sortOrder: 7 },
  { key: 'landing_page', label: 'Preparar primeira landing page', moduleKey: 'landing_pages', estimatedMinutes: 15, sortOrder: 8 },
  { key: 'automation', label: 'Ativar automacao inicial', moduleKey: 'automations', estimatedMinutes: 15, sortOrder: 9 },
  { key: 'reports', label: 'Validar relatorios executivos', moduleKey: 'bi_reports', estimatedMinutes: 10, sortOrder: 10 },
]

const onboardingSectorOverrides: Record<string, Partial<Record<string, string>>> = {
  clinicas: {
    channels: 'Conectar WhatsApp para agendamentos',
    crm_pipeline: 'Revisar funil de triagem, consulta e retorno',
    campaign_plan: 'Criar campanha de captacao de pacientes',
  },
  saude: {
    channels: 'Conectar WhatsApp para agendamentos',
    crm_pipeline: 'Revisar funil de triagem, consulta e retorno',
    campaign_plan: 'Criar campanha de captacao de pacientes',
  },
  imobiliarias: {
    crm_pipeline: 'Revisar funil de imoveis e visitas',
    campaign_plan: 'Criar campanha para captacao de compradores',
    reports: 'Validar relatorio de origem, visitas e propostas',
  },
  imobiliario: {
    crm_pipeline: 'Revisar funil de imoveis e visitas',
    campaign_plan: 'Criar campanha para captacao de compradores',
    reports: 'Validar relatorio de origem, visitas e propostas',
  },
  revendas_carro: {
    crm_pipeline: 'Revisar funil de test-drive e proposta',
    campaign_plan: 'Criar campanha para ofertas de veiculos',
    automation: 'Ativar follow-up automatico de proposta',
  },
  automotivo: {
    crm_pipeline: 'Revisar funil de test-drive e proposta',
    campaign_plan: 'Criar campanha para ofertas de veiculos',
    automation: 'Ativar follow-up automatico de proposta',
  },
  agencias: {
    crm_pipeline: 'Revisar funil de briefing, proposta e entrega',
    campaign_plan: 'Criar campanha de aquisicao B2B',
    reports: 'Validar relatorio de campanhas e entregas',
  },
  consultorias: {
    crm_pipeline: 'Revisar funil consultivo e diagnostico',
    campaign_plan: 'Criar campanha para diagnostico comercial',
    reports: 'Validar relatorio de propostas, receita e MROI',
  },
}

async function mapPackages(
  pool: pg.Pool,
  packageRows: Array<{
    id: string
    key: string
    name: string
    description: string
    created_at: string
    updated_at: string
  }>,
) {
  if (packageRows.length === 0) return []

  const packageIds = packageRows.map((row) => row.id)
  const modules = await pool.query<{ package_id: string; module_key: string }>(
    `SELECT package_id, module_key
     FROM public.package_modules
     WHERE package_id = ANY($1::uuid[])
     ORDER BY module_key ASC`,
    [packageIds],
  )
  const modulesByPackage = groupRows(modules.rows, 'package_id')

  return packageRows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    moduleKeys: (modulesByPackage.get(row.id) ?? []).map((module) => module.module_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function buildPipelineFromBlueprint(blueprint: Blueprint): BlueprintPipelineTemplate {
  const fallbackTemplate: BlueprintPipelineTemplate = {
    key: `${blueprint.key}_pipeline`,
    name: `Funil ${blueprint.name}`,
    description: blueprint.description,
    stages: [
      { key: 'new', name: 'Novo lead', orderIndex: 0 },
      { key: 'qualified', name: 'Qualificado', orderIndex: 1 },
      { key: 'proposal', name: 'Proposta', orderIndex: 2 },
      { key: 'won', name: 'Ganho', orderIndex: 3, isWon: true },
      { key: 'lost', name: 'Perdido', orderIndex: 4, isLost: true },
    ],
  }
  const resolved = blueprint.pipelineTemplate ?? fallbackTemplate

  return {
    ...resolved,
    stages: [...resolved.stages]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((stage, index) => ({
        ...stage,
        color: stage.color ?? fallbackStageColors[index % fallbackStageColors.length],
        isWon: Boolean(stage.isWon),
        isLost: Boolean(stage.isLost),
      })),
  }
}

function summarizeBlueprintApplication(blueprint: Blueprint) {
  return {
    moduleCount: blueprint.moduleKeys.length,
    stageCount: buildPipelineFromBlueprint(blueprint).stages.length,
    customFieldCount: blueprint.customFields.length,
    messageTemplateCount: blueprint.messageTemplates.length,
    automationTemplateCount: blueprint.automationTemplates.length,
    reportPresetCount: blueprint.reportPresets.length,
  }
}

async function ensureOnboardingChecklist(
  queryable: Queryable,
  organizationId: string,
  contractId: string,
  blueprint: Blueprint,
) {
  const existing = await queryable.query<{ id: string }>(
    `SELECT id
     FROM public.growth_onboarding_checklists
     WHERE organization_id = $1
       AND contract_id = $2
       AND source_blueprint_id = $3
     LIMIT 1`,
    [organizationId, contractId, blueprint.id],
  )

  if (existing.rows[0]) return existing.rows[0].id

  const checklist = await queryable.query<{ id: string }>(
    `INSERT INTO public.growth_onboarding_checklists (
       organization_id, contract_id, source_blueprint_id, status
     )
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [organizationId, contractId, blueprint.id],
  )

  const steps = buildOnboardingChecklistFromBlueprint(blueprint)
  for (const step of steps) {
    await queryable.query(
      `INSERT INTO public.growth_onboarding_steps (
         checklist_id, step_key, label, module_key, status, estimated_minutes, sort_order
       )
       VALUES ($1, $2, $3, $4, 'not_started', $5, $6)
       ON CONFLICT (checklist_id, step_key) DO NOTHING`,
      [checklist.rows[0].id, step.key, step.label, step.moduleKey, step.estimatedMinutes, step.sortOrder],
    )
  }

  return checklist.rows[0].id
}

function buildOnboardingChecklistFromBlueprint(blueprint: Pick<Blueprint, 'key' | 'sector' | 'moduleKeys'>) {
  const overrides = onboardingSectorOverrides[resolveOnboardingSectorKey(blueprint)] ?? {}
  const moduleKeys = new Set(blueprint.moduleKeys)

  return onboardingBaseSteps
    .filter((step) => step.moduleKey === 'company' || step.moduleKey === 'knowledge_base' || moduleKeys.has(step.moduleKey))
    .map((step) => ({
      ...step,
      label: overrides[step.key] ?? step.label,
    }))
}

function resolveOnboardingSectorKey(blueprint: Pick<Blueprint, 'key' | 'sector'>) {
  const candidates = [normalizeKey(blueprint.key), normalizeKey(blueprint.sector)]
  return candidates.find((candidate) => onboardingSectorOverrides[candidate]) ?? 'generic'
}

function normalizeKey(value?: string) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function mapBlueprintApplicationRun(row: {
  id: string
  blueprint_id: string
  contract_id: string
  status: string
  summary: Record<string, unknown> | null
  error: string | null
  created_at: string
  updated_at: string
}): BlueprintApplicationRun {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    contractId: row.contract_id,
    status: row.status,
    summary: row.summary ?? {},
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOrganization(row: {
  id: string
  name: string
  slug: string
  kind: string
  client_id: string | null
  is_internal_growth_workspace?: boolean
  workspace_purpose?: string
  strategy_pack_scope?: string
  created_at: string
  updated_at: string
}): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    clientId: row.client_id ?? undefined,
    isInternalGrowthWorkspace: row.is_internal_growth_workspace ?? false,
    workspacePurpose: row.workspace_purpose ?? 'client_delivery',
    strategyPackScope: row.strategy_pack_scope ?? 'client',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMembership(row: {
  id: string
  user_id: string
  organization_id: string
  role_key: string
  created_at: string
  updated_at: string
}): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    roleKey: row.role_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapClientSummary(row: {
  id: string
  company_name: string
  contact_name: string
  email: string
  user_id: string | null
}): ClientSummary {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    userId: row.user_id ?? undefined,
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function groupRows<Row extends Record<Key, string>, Key extends keyof Row>(rows: Row[], key: Key) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const groupKey = row[key]
    const group = groups.get(groupKey) ?? []
    group.push(row)
    groups.set(groupKey, group)
  }
  return groups
}
