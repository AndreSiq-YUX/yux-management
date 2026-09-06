import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'

const routeRecoveryKey = 'yux:route-recovery'

function rememberRouteRecovery() {
  try {
    window.sessionStorage.setItem(routeRecoveryKey, JSON.stringify({
      pathname: window.location.pathname,
      search: window.location.search,
      recordedAt: new Date().toISOString(),
    }))
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

interface RouteErrorBoundaryProps {
  children: ReactNode
  onReload?: () => void
}

interface RouteErrorBoundaryState {
  error: Error | null
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha ao carregar modulo de rota:', error, info.componentStack)
  }

  private reload = () => {
    rememberRouteRecovery()
    if (this.props.onReload) {
      this.props.onReload()
      return
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <section role="alert" className="mx-auto my-8 max-w-lg space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <div>
            <h1 className="text-lg font-semibold">Esta area recebeu uma atualizacao</h1>
            <p className="mt-1 text-sm leading-6">
              Atualize os arquivos da aplicacao e tente novamente. Rascunhos desta aba permanecem guardados durante a recuperacao.
            </p>
          </div>
          <button type="button" onClick={this.reload} className="rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800">
            Atualizar e tentar novamente
          </button>
        </section>
      )
    }

    return this.props.children
  }
}

export function RouteLoadBoundary({ children, label = 'Abrindo area...' }: { children: ReactNode; label?: string }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<section role="status" aria-live="polite" className="grid min-h-64 place-items-center text-sm text-slate-500">{label}</section>}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  )
}
