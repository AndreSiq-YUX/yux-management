import { Link, useLocation } from 'react-router-dom'
import { Bell, ChevronRight, Search, Menu } from 'lucide-react'
import { buildBreadcrumbs } from '@/lib/platform/navigation'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformContext } from '@/stores/platformStore'

export function Header() {
  const { user } = useAuthStore()
  const location = useLocation()
  const platformContext = usePlatformContext()
  const breadcrumbs = buildBreadcrumbs(platformContext, location.pathname)

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center gap-4">
          {/* Mobile menu button */}
          <div className="lg:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>

          {/* Search */}
          <div className="min-w-0 flex-1">
            <nav className="hidden items-center gap-1 text-sm text-gray-500 lg:flex" aria-label="Breadcrumb">
              {breadcrumbs.map((item, index) => (
                <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                  {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />}
                  {item.href && index < breadcrumbs.length - 1 ? (
                    <Link to={item.href} className="truncate hover:text-yux-700">{item.label}</Link>
                  ) : (
                    <span className={index === breadcrumbs.length - 1 ? 'truncate font-medium text-gray-900' : 'truncate'}>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="relative mt-0 max-w-lg lg:hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 text-sm placeholder-gray-500 focus:border-yux-500 focus:ring-yux-500"
                placeholder="Buscar..."
                type="search"
              />
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <button
              type="button"
              title="Notificacoes"
              className="relative rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-yux-500 focus:ring-offset-2"
            >
              <Bell className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                3
              </span>
            </button>

            {/* User info */}
            <div className="flex items-center space-x-3">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
