import { NavLink } from 'react-router-dom'
import { 
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Briefcase,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderKanban,
  LayoutDashboard, 
  Mail,
  Users, 
  Megaphone, 
  UserPlus,
  Settings,
  ShieldCheck,
  LogOut
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buildNavigationGroups } from '@/lib/platform/navigation'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformContext } from '@/stores/platformStore'

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
  '/contracts': FileCheck2,
  '/packages': Boxes,
  '/modules': LayoutDashboard,
  '/crm-governance': ShieldCheck,
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const platformContext = usePlatformContext()
  const navigationGroups = buildNavigationGroups(platformContext)

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg lg:block hidden">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yux-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">YUX</span>
            </div>
            <span className="ml-3 truncate text-lg font-semibold text-gray-900">
              {platformContext.mode === 'internal' ? 'YUX Hub' : 'Portal YUX'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className={platformContext.mode === 'internal' ? 'space-y-5' : 'space-y-1'}>
            {navigationGroups.map((group) => (
              <div key={group.label}>
                {platformContext.mode === 'internal' && (
                  <p className="mb-2 truncate px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </p>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.moduleKey
                      ? iconByModule[item.moduleKey] || LayoutDashboard
                      : iconByHref[item.href] || LayoutDashboard

                    return (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        className={({ isActive }) =>
                          `group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-r-2 border-yux-600 bg-yux-50 text-yux-700'
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
              </div>
            ))}
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
              Configurações
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
    </div>
  )
}
