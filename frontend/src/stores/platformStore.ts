import { create } from 'zustand'
import { platformService } from '@/services/platformService'
import type {
  ContractDetails,
  Organization,
  PackageDefinition,
  PlatformContext,
  PlatformMode,
  PlatformRole,
  PortalContractContext,
} from '@/types/platform'

const fallbackOrganization: Organization = {
  id: 'local-yux',
  name: 'YUX Solucoes em IA',
  slug: 'yux',
  kind: 'yux',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}

const fallbackRole: PlatformRole = {
  key: 'yux_admin',
  name: 'YUX Admin',
  scope: 'internal',
  permissions: ['platform.manage'],
}

const fallbackClientWorkspaceRole: PlatformRole = {
  key: 'client_admin',
  name: 'Client Admin',
  scope: 'client',
  permissions: [
    'crm.read',
    'leads.read',
    'landing_pages.read',
    'projects.read',
    'approvals.read',
    'proposals.read',
    'campaigns.read',
    'marketing_studio.read',
    'reports.read',
    'automations.read',
    'support.read',
    'omnichannel.read',
    'finance.read',
  ],
}

const internalModuleKeys = [
  'clients',
  'crm',
  'projects',
  'proposals',
  'whatsapp_ai',
  'landing_pages',
  'campaigns',
  'bi_reports',
  'automations',
  'support',
  'finance',
  'blueprints',
] as const

const getInternalModuleKeys = () => [...internalModuleKeys]

const createEmptyPortalContractContext = (): PortalContractContext => ({
  contract: null,
  enabledModuleKeys: [],
})

const createSafePortalState = () => ({
  organization: null,
  membership: null,
  role: null,
  activeContract: null,
  portalContractContext: createEmptyPortalContractContext(),
  enabledModuleKeys: [],
})

interface PlatformState extends PlatformContext {
  isLoading: boolean
  error: string | null
  roles: PlatformRole[]
  packages: PackageDefinition[]
  activeContract: ContractDetails | null
  portalContractContext: PortalContractContext
  setMode: (mode: PlatformMode) => void
  initializeForUser: (userId: string) => Promise<void>
  initializeClientWorkspace: (organizationId: string) => Promise<void>
  setEnabledModuleKeys: (moduleKeys: string[]) => void
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  mode: 'internal',
  organization: fallbackOrganization,
  membership: null,
  role: fallbackRole,
  enabledModuleKeys: getInternalModuleKeys(),
  isLoading: false,
  error: null,
  roles: [fallbackRole],
  packages: [],
  activeContract: null,
  portalContractContext: createEmptyPortalContractContext(),

  setMode: (mode) => set((state) => {
    if (mode === 'internal') {
      if (state.mode === 'internal') return { mode }

      return {
        mode,
        organization: fallbackOrganization,
        membership: null,
        role: fallbackRole,
        activeContract: null,
        portalContractContext: createEmptyPortalContractContext(),
        enabledModuleKeys: getInternalModuleKeys(),
      }
    }

    if (mode === 'client_workspace') {
      if (state.mode === 'client_workspace') return { mode }

      return {
        mode,
        organization: null,
        membership: null,
        role: fallbackClientWorkspaceRole,
        activeContract: null,
        portalContractContext: createEmptyPortalContractContext(),
        enabledModuleKeys: [],
        isLoading: true,
        error: null,
      }
    }

    const shouldClearFallbackContext =
      state.mode !== 'portal'
      && (!state.organization || state.organization.id === fallbackOrganization.id)

    return shouldClearFallbackContext
      ? { mode, ...createSafePortalState() }
      : { mode }
  }),

  setEnabledModuleKeys: (enabledModuleKeys) => set({ enabledModuleKeys: [...enabledModuleKeys] }),

  initializeClientWorkspace: async (organizationId: string) => {
    set({
      mode: 'client_workspace',
      isLoading: true,
      error: null,
    })

    try {
      const [organizations, roles] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getRoles(),
      ])
      const organization = organizations.find(item => item.id === organizationId && item.kind === 'client') || null

      if (!organization?.clientId) {
        set({
          mode: 'client_workspace',
          organization: null,
          membership: null,
          role: fallbackClientWorkspaceRole,
          activeContract: null,
          portalContractContext: createEmptyPortalContractContext(),
          enabledModuleKeys: [],
          error: 'Cliente nao encontrado para operacao assistida.',
          isLoading: false,
        })
        return
      }

      const portalContractContext = await platformService.getPortalContractContextForClient(organization.clientId)
      const portalContractContextState = {
        ...portalContractContext,
        enabledModuleKeys: [...portalContractContext.enabledModuleKeys],
      }
      const role = roles.find(item => item.key === 'client_admin') || fallbackClientWorkspaceRole

      set({
        mode: 'client_workspace',
        organization,
        membership: null,
        role,
        roles: roles.length ? roles : [fallbackRole, fallbackClientWorkspaceRole],
        activeContract: portalContractContextState.contract,
        portalContractContext: portalContractContextState,
        enabledModuleKeys: portalContractContextState.enabledModuleKeys,
        error: null,
        isLoading: false,
      })
    } catch (error) {
      console.error('Client workspace initialization error:', error)
      set({
        mode: 'client_workspace',
        organization: null,
        membership: null,
        role: fallbackClientWorkspaceRole,
        activeContract: null,
        portalContractContext: createEmptyPortalContractContext(),
        enabledModuleKeys: [],
        error: 'Erro ao carregar workspace do cliente.',
        isLoading: false,
      })
    }
  },

  initializeForUser: async (userId: string) => {
    const isPortalPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal')

    set({
      ...(isPortalPath ? createSafePortalState() : {}),
      mode: isPortalPath ? 'portal' : get().mode,
      isLoading: true,
      error: null,
    })

    try {
      const [
        organizations,
        roles,
        memberships,
        packages,
        portalContractContext,
      ] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getRoles(),
        platformService.getMembershipsForUser(userId),
        platformService.getPackages(),
        platformService.getPortalContractContextForUser(userId),
      ])

      const membership = memberships[0] || null
      const organization = membership
        ? organizations.find(item => item.id === membership.organizationId) || fallbackOrganization
        : organizations.find(item => item.kind === 'yux') || fallbackOrganization
      const role = membership
        ? roles.find(item => item.key === membership.roleKey) || fallbackRole
        : roles.find(item => item.key === 'yux_admin') || fallbackRole
      const portalContractContextState = {
        ...portalContractContext,
        enabledModuleKeys: [...portalContractContext.enabledModuleKeys],
      }
      const enabledModuleKeys = role?.scope === 'client'
        ? [...portalContractContextState.enabledModuleKeys]
        : getInternalModuleKeys()

      set({
        organization,
        membership,
        role,
        roles: roles.length ? roles : [fallbackRole],
        packages,
        activeContract: portalContractContextState.contract,
        portalContractContext: portalContractContextState,
        enabledModuleKeys,
        isLoading: false,
      })
    } catch (error) {
      console.error('Platform initialization error:', error)
      const isPortalMode = get().mode === 'portal' || isPortalPath

      if (isPortalMode) {
        set({
          ...createSafePortalState(),
          roles: [fallbackRole],
          packages: [],
          error: 'Erro ao carregar contexto da plataforma.',
          isLoading: false,
        })
        return
      }

      set({
        organization: fallbackOrganization,
        membership: null,
        role: fallbackRole,
        roles: [fallbackRole],
        packages: [],
        activeContract: null,
        portalContractContext: createEmptyPortalContractContext(),
        error: 'Erro ao carregar contexto da plataforma; usando contexto local.',
        enabledModuleKeys: getInternalModuleKeys(),
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
