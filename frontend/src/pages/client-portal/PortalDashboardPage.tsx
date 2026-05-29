import { Link } from 'react-router-dom'
import { buildNavigation } from '@/lib/platform/navigation'
import { usePlatformContext } from '@/stores/platformStore'

export function PortalDashboardPage() {
  const context = usePlatformContext()
  const items = buildNavigation({ ...context, mode: 'portal' }).filter(item => item.moduleKey)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
        <p className="text-gray-600">Acompanhamento de projetos, aprovacoes, suporte e modulos contratados.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50"
          >
            <h2 className="font-semibold text-gray-900">{item.label}</h2>
            <p className="mt-2 text-sm text-gray-600">Modulo habilitado neste portal.</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
