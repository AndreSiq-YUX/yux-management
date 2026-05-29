import { create } from 'zustand'
import { platformService } from '@/services/platformService'
import type {
  Organization,
  PlatformContext,
  PlatformMode,
  PlatformRole,
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

interface PlatformState extends PlatformContext {
  isLoading: boolean
  error: string | null
  roles: PlatformRole[]
  setMode: (mode: PlatformMode) => void
  initializeForUser: (userId: string) => Promise<void>
  setEnabledModuleKeys: (moduleKeys: string[]) => void
}

export const usePlatformStore = create<PlatformState>((set) => ({
  mode: 'internal',
  organization: fallbackOrganization,
  membership: null,
  role: fallbackRole,
  enabledModuleKeys: [
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
  ],
  isLoading: false,
  error: null,
  roles: [fallbackRole],

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
        ? organizations.find(item => item.id === membership.organizationId) || fallbackOrganization
        : organizations.find(item => item.kind === 'yux') || fallbackOrganization
      const role = membership
        ? roles.find(item => item.key === membership.roleKey) || fallbackRole
        : roles.find(item => item.key === 'yux_admin') || fallbackRole

      set({
        organization,
        membership,
        role,
        roles: roles.length ? roles : [fallbackRole],
        isLoading: false,
      })
    } catch (error) {
      console.error('Platform initialization error:', error)
      set({
        organization: fallbackOrganization,
        membership: null,
        role: fallbackRole,
        roles: [fallbackRole],
        error: 'Erro ao carregar contexto da plataforma; usando contexto local.',
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
