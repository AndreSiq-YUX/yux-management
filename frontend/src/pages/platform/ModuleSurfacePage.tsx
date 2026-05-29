import { getPlatformModule } from '@/lib/platform/moduleRegistry'

interface ModuleSurfacePageProps {
  moduleKey: string
}

export function ModuleSurfacePage({ moduleKey }: ModuleSurfacePageProps) {
  const module = getPlatformModule(moduleKey)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{module?.name || 'Modulo'}</h1>
        <p className="text-gray-600">Superficie operacional do YUX OS.</p>
      </div>

      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-500">Sem registros operacionais neste modulo.</p>
      </div>
    </div>
  )
}
