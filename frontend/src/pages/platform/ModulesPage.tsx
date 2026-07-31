import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Save } from 'lucide-react'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import { platformService } from '@/services/platformService'
import type { PlatformModule } from '@/types/platform'

function permissionsToText(permissions: string[]) {
  return permissions.join(', ')
}

function textToPermissions(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

export function ModulesPage() {
  const [modules, setModules] = useState<PlatformModule[]>(PLATFORM_MODULES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [base, setBase] = useState(false)
  const [internalRoute, setInternalRoute] = useState('')
  const [portalRoute, setPortalRoute] = useState('')
  const [requiredPermissions, setRequiredPermissions] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const loadedModules = await platformService.getModules()
      const nextModules = loadedModules.length ? loadedModules : PLATFORM_MODULES
      setModules(nextModules)
      if (!selectedKey && nextModules[0]) selectModule(nextModules[0])
    } catch (error) {
      console.error('Error loading platform modules:', error)
      setModules(PLATFORM_MODULES)
      if (!selectedKey && PLATFORM_MODULES[0]) selectModule(PLATFORM_MODULES[0])
      setError('Dados do backend indisponiveis; exibindo registro local de modulos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function selectModule(module: PlatformModule) {
    setSelectedKey(module.key)
    setKey(module.key)
    setName(module.name)
    setBase(module.base)
    setInternalRoute(module.internalRoute || '')
    setPortalRoute(module.portalRoute || '')
    setRequiredPermissions(permissionsToText(module.requiredPermissions))
    setSaved(false)
  }

  function startNewModule() {
    setSelectedKey('')
    setKey('')
    setName('')
    setBase(false)
    setInternalRoute('')
    setPortalRoute('')
    setRequiredPermissions('')
    setSaved(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const savedModule = await platformService.upsertModule({
        key,
        name,
        base,
        internalRoute,
        portalRoute,
        requiredPermissions: textToPermissions(requiredPermissions),
      })
      setSaved(true)
      setSelectedKey(savedModule.key)
      await load()
    } catch (error) {
      console.error('Error saving platform module:', error)
      setError('Nao foi possivel salvar o modulo.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando modulos...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modulos</h1>
        <p className="text-gray-600">Controle a base modular do YUX Hub.</p>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {selectedKey ? 'Editar modulo' : 'Novo modulo'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Defina rotas, permissoes e se o modulo entra como base ou opcional nos contratos.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewModule}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Chave</span>
            <input
              value={key}
              onChange={event => setKey(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Nome</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input type="checkbox" checked={base} onChange={event => setBase(event.target.checked)} />
            Modulo base
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Rota interna</span>
            <input
              value={internalRoute}
              onChange={event => setInternalRoute(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="/leads"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Rota portal</span>
            <input
              value={portalRoute}
              onChange={event => setPortalRoute(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="/portal/crm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Permissoes</span>
            <input
              value={requiredPermissions}
              onChange={event => setRequiredPermissions(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="crm.read, crm.write"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar modulo'}
          </button>
        </div>

        {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Modulo salvo.</div>}
      </form>

      <section className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(module => (
            <button
              key={module.key}
              type="button"
              onClick={() => selectModule(module)}
              className={`rounded-lg border bg-white p-4 text-left hover:border-yux-300 ${selectedKey === module.key ? 'border-yux-500 ring-2 ring-yux-100' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-gray-900">{module.name}</h3>
                <span className="text-xs text-gray-500">{module.base ? 'Base' : 'Opcional'}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{module.key}</p>
              <p className="mt-2 text-sm text-gray-600">
                Interno: {module.internalRoute || '-'} | Portal: {module.portalRoute || '-'}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
