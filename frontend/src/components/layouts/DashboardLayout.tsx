import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/navigation/Sidebar'
import { Header } from '@/components/navigation/Header'
import { portalButtonClasses } from '@/components/portal-ui'
import { RouteLoadBoundary } from '@/components/routing/RouteLoadBoundary'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'
import { usePortalBadgeStore } from '@/stores/portalBadgeStore'
import { resolvePlatformMode } from './platformMode'

export function DashboardLayout() {
  const location = useLocation()
  const { user } = useAuthStore()
  const initializeForUser = usePlatformStore(state => state.initializeForUser)
  const setMode = usePlatformStore(state => state.setMode)
  const platformError = usePlatformStore(state => state.error)
  const platformLoading = usePlatformStore(state => state.isLoading)
  const platformMode = usePlatformStore(state => state.mode)
  const organizationId = usePlatformStore(state => state.organization?.id)
  const contractId = usePlatformStore(state => state.activeContract?.id)
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const refreshBadges = usePortalBadgeStore(state => state.refresh)
  const routeMode = resolvePlatformMode(location.pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const openMenu = useCallback(() => setMenuOpen(true), [])
  const modulesKey = (enabledModuleKeys ?? []).join(',')

  useEffect(() => {
    if (user?.id && routeMode !== 'client_workspace') {
      initializeForUser(user.id, user.role)
    }
  }, [initializeForUser, routeMode, user?.id, user?.role])

  useLayoutEffect(() => {
    setMode(routeMode)
  }, [routeMode, setMode])

  // Contadores do menu e do sino: uma vez por organização/contrato, só no portal e no workspace do cliente.
  // `platformMode === routeMode` evita pedir dados com o contexto da tela anterior ainda no store.
  useEffect(() => {
    if (routeMode === 'internal' || platformMode !== routeMode || platformLoading || !organizationId) return
    void refreshBadges(organizationId, contractId, modulesKey ? modulesKey.split(',') : [])
  }, [routeMode, platformMode, platformLoading, organizationId, contractId, modulesKey, refreshBadges])

  if (routeMode !== 'client_workspace' && platformError && !platformLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-yx-bg p-4">
        <section
          role="alert"
          className="w-full max-w-md space-y-4 rounded-xl border border-yx-line bg-yx-surface p-6 shadow-sm"
        >
          <h1 className="font-display text-xl font-semibold text-yx-fg">Contexto da plataforma indisponível</h1>
          <p className="text-sm leading-relaxed text-yx-fg-2">{platformError}</p>
          <button
            type="button"
            className={portalButtonClasses('primary')}
            onClick={() => user && initializeForUser(user.id, user.role)}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-yx-bg">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-yx-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-yx-fg focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <Sidebar mobileOpen={menuOpen} onMobileOpenChange={setMenuOpen} />

      <div className="min-w-0 lg:pl-64 print:pl-0">
        <Header onOpenMenu={openMenu} menuOpen={menuOpen} />

        <main id="conteudo-principal" tabIndex={-1} className="py-6 outline-none print:py-0">
          <div className="w-full px-4 sm:px-6 lg:px-8 print:px-0">
            <RouteLoadBoundary>
              <Outlet />
            </RouteLoadBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
