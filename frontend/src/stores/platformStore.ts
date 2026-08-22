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
  isInternalGrowthWorkspace: true,
  workspacePurpose: 'yux_growth',
  strategyPackScope: 'internal',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}

const internalModuleKeys = [
  'action_engine',
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
  'marketing_studio',
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
  initializeForUser: (userId: string, authenticatedRole?: 'admin' | 'manager' | 'client') => Promise<void>
  initializeClientWorkspace: (organizationId: string) => Promise<void>
  setEnabledModuleKeys: (moduleKeys: string[]) => void
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  mode: 'internal',
  organization: null,
  membership: null,
  role: null,
  enabledModuleKeys: [],
  isLoading: false,
  error: null,
  roles: [],
  packages: [],
  activeContract: null,
  portalContractContext: createEmptyPortalContractContext(),

  setMode: (mode) => set((state) => {
    if (mode === 'internal') {
      if (state.mode === 'internal') return { mode }

      return {
        mode,
        ...createSafePortalState(),
      }
    }

    if (mode === 'client_workspace') {
      if (state.mode === 'client_workspace') return { mode }

      return {
        mode,
        organization: null,
        membership: null,
        role: null,
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

    return shouldClearFallbackContext || mode === 'portal'
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
      const organization = organizations.find(item => (
        item.id === organizationId
        && (item.kind === 'client' || item.isInternalGrowthWorkspace)
      )) || null

      if (organization?.isInternalGrowthWorkspace) {
        const role = roles.find(item => item.key === 'yux_admin') || null
        if (!role) throw new Error('workspace_role_unavailable')
        const portalContractContext = organization.clientId
          ? await platformService.getPortalContractContextForClient(organization.clientId)
          : createEmptyPortalContractContext()
        const portalContractContextState = {
          ...portalContractContext,
          enabledModuleKeys: [...portalContractContext.enabledModuleKeys],
        }
        set({
          mode: 'client_workspace',
          organization,
          membership: null,
          role,
          roles,
          activeContract: portalContractContextState.contract,
          portalContractContext: portalContractContextState,
          enabledModuleKeys: getInternalModuleKeys(),
          error: null,
          isLoading: false,
        })
        return
      }

      if (!organization?.clientId) {
        set({
          mode: 'client_workspace',
          organization: null,
          membership: null,
          role: null,
          activeContract: null,
          portalContractContext: createEmptyPortalContractContext(),
          enabledModuleKeys: [],
          error: 'Workspace operacional nao encontrado para operacao assistida.',
          isLoading: false,
        })
        return
      }

      const portalContractContext = await platformService.getPortalContractContextForClient(organization.clientId)
      const portalContractContextState = {
        ...portalContractContext,
        enabledModuleKeys: [...portalContractContext.enabledModuleKeys],
      }
      const role = roles.find(item => item.key === 'client_admin') || null
      if (!role) throw new Error('workspace_role_unavailable')

      set({
        mode: 'client_workspace',
        organization,
        membership: null,
        role,
        roles,
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
        role: null,
        activeContract: null,
        portalContractContext: createEmptyPortalContractContext(),
        enabledModuleKeys: [],
        error: 'Erro ao carregar workspace do cliente.',
        isLoading: false,
      })
    }
  },

  initializeForUser: async (userId: string, authenticatedRole) => {
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
        ? organizations.find(item => item.id === membership.organizationId) || null
        : authenticatedRole === 'admin' || authenticatedRole === 'manager'
          ? organizations.find(item => item.kind === 'yux') || null
          : null
      const internalRoleKey = authenticatedRole === 'admin' ? 'yux_admin' : 'yux_operator'
      const role = membership
        ? roles.find(item => item.key === membership.roleKey) || null
        : authenticatedRole === 'admin' || authenticatedRole === 'manager'
          ? roles.find(item => item.key === internalRoleKey) || null
          : null
      if (!organization || !role) throw new Error('platform_context_unavailable')
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
        roles,
        packages,
        activeContract: portalContractContextState.contract,
        portalContractContext: portalContractContextState,
        enabledModuleKeys,
        isLoading: false,
      })
    } catch (error) {
      console.error('Platform initialization error:', error)
      set({
        ...createSafePortalState(),
        roles: [],
        packages: [],
        error: 'Não foi possível carregar o contexto da plataforma. Tente novamente.',
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
