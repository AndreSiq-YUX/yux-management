import { ALL_MODULE_KEYS, CLIENT, ids } from './ids'
import { daysAgo, dayAheadDate } from './time'
import { status, type MockRoute } from './types'

const modules = ALL_MODULE_KEYS

export const clientPermissions = [
  'clients.read', 'crm.read', 'crm.write', 'leads.read', 'leads.write',
  'landing_pages.read', 'landing_pages.write', 'projects.read', 'projects.write',
  'deliveries.read', 'deliveries.write', 'approvals.read', 'approvals.write',
  'proposals.read', 'proposals.write', 'campaigns.read', 'campaigns.write',
  'marketing_studio.read', 'marketing_studio.write', 'marketing_studio.configure',
  'reports.read', 'reports.write', 'automations.read', 'automations.write',
  'support.read', 'support.write', 'omnichannel.read', 'omnichannel.write',
  'omnichannel.configure', 'finance.read', 'action_engine.read', 'action_engine.write',
]

export const roles = [
  { key: 'client_admin', name: 'Administrador da conta', scope: 'client', permissions: clientPermissions },
  { key: 'client_member', name: 'Membro da conta', scope: 'client', permissions: clientPermissions.filter(item => !item.endsWith('.configure')) },
  { key: 'yux_admin', name: 'Admin YUX', scope: 'internal', permissions: ['platform.manage'] },
  { key: 'yux_manager', name: 'Operador YUX', scope: 'internal', permissions: ['clients.read', 'crm.read'] },
]

export const organization = {
  id: ids.organization,
  name: CLIENT.companyName,
  slug: 'clinica-sorriso-pleno',
  kind: 'client',
  clientId: ids.client,
  isInternalGrowthWorkspace: false,
  workspacePurpose: 'client_delivery',
  strategyPackScope: 'client',
  createdAt: daysAgo(210),
  updatedAt: daysAgo(2),
}

export const packageDefinition = {
  id: ids.package,
  key: 'growth_comercial',
  name: 'Growth Comercial',
  description: 'Operação comercial, atendimento com IA e marketing de performance.',
  moduleKeys: modules,
  createdAt: daysAgo(400),
  updatedAt: daysAgo(30),
}

export const activeContract = {
  id: ids.contract,
  clientId: ids.client,
  packageId: ids.package,
  status: 'active',
  name: 'Growth Comercial 2026',
  value: 6800,
  billingCycle: 'monthly',
  startsAt: daysAgo(150),
  endsAt: dayAheadDate(215),
  createdAt: daysAgo(150),
  updatedAt: daysAgo(10),
  package: packageDefinition,
  modules: modules.map(moduleKey => ({ contractId: ids.contract, moduleKey, enabled: true })),
}

export const workspaceContext = {
  schemaVersion: 1,
  organizationId: ids.organization,
  kind: 'client',
  contractId: ids.contract,
  role: 'client_admin',
  moduleKeys: modules,
  canConfigure: true,
  missionCreation: { mode: 'conversation', reasonCode: null },
}

export const platformRoutes: MockRoute[] = [
  { method: 'GET', path: '/platform/organizations', respond: () => [organization] },
  { method: 'GET', path: '/platform/roles', respond: () => roles },
  {
    method: 'GET',
    path: /^\/platform\/users\/[^/]+\/memberships$/,
    respond: () => [{
      id: '66666666-6666-4666-8666-666666666666',
      userId: ids.user,
      organizationId: ids.organization,
      roleKey: 'client_admin',
      createdAt: daysAgo(210),
      updatedAt: daysAgo(210),
    }],
  },
  { method: 'GET', path: '/platform/packages', respond: () => [packageDefinition] },
  {
    method: 'GET',
    path: /^\/platform\/(users|clients)\/[^/]+\/portal-contract-context$/,
    respond: () => ({ contract: activeContract, enabledModuleKeys: modules }),
  },
  { method: 'GET', path: /^\/platform\/clients\/[^/]+\/active-contract$/, respond: () => activeContract },
  { method: 'GET', path: /^\/platform\/clients\/[^/]+\/contracts$/, respond: () => [activeContract] },
  { method: 'GET', path: /^\/platform\/users\/[^/]+\/client$/, respond: () => ({ id: ids.client, companyName: CLIENT.companyName, contactName: CLIENT.contactName, email: CLIENT.email, userId: ids.user }) },
  { method: 'GET', path: /^\/workspace\/organizations\/[^/]+\/context$/, respond: () => workspaceContext },
]

export const authRoutes = (authenticated: boolean): MockRoute[] => [
  {
    method: 'GET',
    path: '/auth/me',
    respond: () => authenticated
      ? { user: { id: ids.user, email: CLIENT.email, displayName: 'Mariana Costa', role: 'client_admin' } }
      : status(401, { error: 'not_authenticated', message: 'Sessao nao autenticada' }),
  },
]
