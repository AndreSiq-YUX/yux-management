import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  FolderOpen, 
  Megaphone, 
  UserPlus,
  Settings,
  LogOut
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'client'] },
  { name: 'Clientes', href: '/clients', icon: Users, roles: ['admin', 'manager'] },
  { name: 'Projetos', href: '/projects', icon: FolderOpen, roles: ['admin', 'manager'] },
  { name: 'Campanhas', href: '/campaigns', icon: Megaphone, roles: ['admin', 'manager'] },
  { name: 'Leads', href: '/leads', icon: UserPlus, roles: ['admin', 'manager'] },
  { name: 'Portal do Cliente', href: '/portal', icon: Users, roles: ['client'] },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()

  const filteredNavigation = navigation.filter(item => 
    item.roles.includes(user?.role || 'client')
  )

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg lg:block hidden">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yux-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">YUX</span>
            </div>
            <span className="ml-3 text-lg font-semibold text-gray-900">
              Client Management
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {filteredNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-yux-50 text-yux-700 border-r-2 border-yux-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon
                className="mr-3 h-5 w-5 flex-shrink-0"
                aria-hidden="true"
              />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
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