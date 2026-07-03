import { useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/navigation/Sidebar'
import { Header } from '@/components/navigation/Header'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

export function DashboardLayout() {
  const location = useLocation()
  const { user } = useAuthStore()
  const initializeForUser = usePlatformStore(state => state.initializeForUser)
  const setMode = usePlatformStore(state => state.setMode)

  useEffect(() => {
    if (user?.id) {
      initializeForUser(user.id)
    }
  }, [initializeForUser, user?.id])

  useLayoutEffect(() => {
    const isSelectedClientWorkspace = /^\/client-workspaces\/[^/]+/.test(location.pathname)
    const mode = location.pathname.startsWith('/portal')
      ? 'portal'
      : isSelectedClientWorkspace
        ? 'client_workspace'
        : 'internal'

    setMode(mode)
  }, [location.pathname, setMode])

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="lg:pl-64">
        <Header />
        
        <main className="py-6">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
