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

const internalModuleKeys = [
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
] as const

const getInternalModuleKeys = () => [...internalModuleKeys]

const createEmptyPortalContractContext = (): PortalContractContext => ({
  contract: null,
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

  setMode: (mode) => set({ mode }),

  setEnabledModuleKeys: (enabledModuleKeys) => set({ enabledModuleKeys: [...enabledModuleKeys] }),

  initializeForUser: async (userId: string) => {
    set({ isLoading: true, error: null })

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
      const isPortalPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal')
      const isPortalMode = get().mode === 'portal' || isPortalPath

      if (isPortalMode) {
        set({
          organization: null,
          membership: null,
          role: null,
          roles: [fallbackRole],
          packages: [],
          activeContract: null,
          portalContractContext: createEmptyPortalContractContext(),
          error: 'Erro ao carregar contexto da plataforma.',
          enabledModuleKeys: [],
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
