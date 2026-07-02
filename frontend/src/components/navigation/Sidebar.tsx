import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderKanban,
  LayoutDashboard, 
  Mail,
  MessageCircle,
  Users, 
  Megaphone, 
  UserPlus,
  Settings,
  ShieldCheck,
  LogOut,
  UserCog,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buildNavigationGroups } from '@/lib/platform/navigation'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformContext } from '@/stores/platformStore'

const COLLAPSED_GROUPS_KEY = 'yux-sidebar-collapsed-groups'

function getInitialCollapsedGroups(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_GROUPS_KEY)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch {
    // ignore
  }
  return new Set()
}

interface SidebarProps {
  mobileMenuOpen?: boolean
  onClose?: () => void
}

const iconByModule: Record<string, LucideIcon> = {
  clients: Users,
  crm: UserPlus,
  projects: FolderKanban,
  proposals: FileText,
  whatsapp_ai: Bot,
  landing_pages: FileText,
  campaigns: Megaphone,
  bi_reports: BarChart3,
  automations: Boxes,
  support: ShieldCheck,
  finance: Briefcase,
  blueprints: ClipboardList,
}

const iconByHref: Record<string, LucideIcon> = {
  '/admin': ShieldCheck,
  '/admin/integrations': Settings,
  '/admin/email': Mail,
  '/admin/ai': Bot,
  '/admin/health': Activity,
  '/admin/limits': Briefcase,
  '/client-workspaces': Building2,
  '/client-conversions': UserPlus,
  '/contracts': FileCheck2,
  '/packages': Boxes,
  '/modules': LayoutDashboard,
  '/crm-governance': ShieldCheck,
  '/portal': LayoutDashboard,
  '/portal/empresa/perfil': Building2,
  '/portal/empresa/usuarios': Users,
  '/portal/empresa/conhecimento': BookOpen,
  '/portal/empresa/marca': FileText,
  '/portal/empresa/integracoes': Settings,
  '/portal/comercial/contas': Building2,
  '/portal/comercial/tarefas': CheckCircle2,
  '/portal/atendimento/agente-ia': Bot,
  '/portal/atendimento/filas-handoff': MessageCircle,
  '/portal/projetos/aprovacoes': CheckCircle2,
  '/portal/configuracoes/conta': UserCog,
}

export function Sidebar({ mobileMenuOpen = false, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const platformContext = usePlatformContext()
  const navigationGroups = buildNavigationGroups(platformContext)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(getInitialCollapsedGroups)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups]))
    } catch {
      // ignore
    }
  }, [collapsedGroups])

  const toggleGroup = (groupLabel: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupLabel)) {
        next.delete(groupLabel)
      } else {
        next.add(groupLabel)
      }
      return next
    })
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-200">
        <div className="flex items-center flex-1">
          <div className="w-8 h-8 bg-yux-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">YUX</span>
          </div>
          <span className="ml-3 truncate text-lg font-semibold text-gray-900">
            {platformContext.mode === 'client_workspace'
              ? 'Workspace Cliente'
              : platformContext.mode === 'internal'
                ? 'YUX Hub'
                : 'Portal YUX'}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-yux-500"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-5">
          {navigationGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label)
            
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="mb-2 flex w-full items-center justify-between truncate px-3 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                  aria-expanded={!isCollapsed}
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronDown 
                    className={`h-3 w-3 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} 
                    aria-hidden="true" 
                  />
                </button>
                {!isCollapsed && (
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.moduleKey
                        ? iconByModule[item.moduleKey] || LayoutDashboard
                        : iconByHref[item.href] || LayoutDashboard
                      const navigationKey = `${group.label}:${item.label}:${item.href}`

                      return (
                        <NavLink
                          key={navigationKey}
                          to={item.href}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? 'border-l-2 border-yux-600 bg-yux-50 text-yux-700'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                            }`
                          }
                        >
                          <Icon
                            className="mr-3 h-5 w-5 flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-gray-700">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="ml-3 min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="truncate text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <button className="group flex w-full items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 hover:text-gray-900">
            <Settings className="mr-3 h-4 w-4" />
            Configuracoes
          </button>
          <button 
            onClick={logout}
            className="group flex w-full items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 hover:text-gray-900"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg lg:block hidden">
        {sidebarContent}
      </div>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-gray-900/50 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl transform transition-transform">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
