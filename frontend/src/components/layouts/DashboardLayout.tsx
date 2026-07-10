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
  const platformError = usePlatformStore(state => state.error)
  const platformLoading = usePlatformStore(state => state.isLoading)

  useEffect(() => {
    if (user?.id) {
      initializeForUser(user.id, user.role)
    }
  }, [initializeForUser, location.pathname, user?.id, user?.role])

  useLayoutEffect(() => {
    const isSelectedClientWorkspace = /^\/client-workspaces\/[^/]+/.test(location.pathname)
    const mode = location.pathname.startsWith('/portal')
      ? 'portal'
      : isSelectedClientWorkspace
        ? 'client_workspace'
        : 'internal'

    setMode(mode)
  }, [location.pathname, setMode])

  if (platformError && !platformLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-gray-50 p-6">
        <section className="max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Contexto da plataforma indisponível</h1>
          <p className="text-sm text-gray-600">{platformError}</p>
          <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" onClick={() => user && initializeForUser(user.id, user.role)}>
            Tentar novamente
          </button>
        </section>
      </main>
    )
  }

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
