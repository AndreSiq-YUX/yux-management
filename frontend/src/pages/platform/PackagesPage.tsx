import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Save } from 'lucide-react'
import { platformService } from '@/services/platformService'
import type { PackageDefinition, PlatformModule } from '@/types/platform'

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [modules, setModules] = useState<PlatformModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState<string>('')
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [moduleKeys, setModuleKeys] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [loadedPackages, loadedModules] = await Promise.all([
        platformService.getPackages(),
        platformService.getModules(),
      ])
      setPackages(loadedPackages)
      setModules(loadedModules)
      if (!selectedPackageId && loadedPackages[0]) selectPackage(loadedPackages[0])
    } catch (error) {
      console.error('Error loading platform packages:', error)
      setPackages([])
      setModules([])
      setError('Nao foi possivel carregar os pacotes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function selectPackage(packageItem: PackageDefinition) {
    setSelectedPackageId(packageItem.id)
    setKey(packageItem.key)
    setName(packageItem.name)
    setDescription(packageItem.description)
    setModuleKeys(packageItem.moduleKeys)
    setSaved(false)
  }

  function startNewPackage() {
    setSelectedPackageId('')
    setKey('')
    setName('')
    setDescription('')
    setModuleKeys([])
    setSaved(false)
    setError(null)
  }

  function toggleModule(moduleKey: string) {
    setModuleKeys(current => (
      current.includes(moduleKey)
        ? current.filter(item => item !== moduleKey)
        : [...current, moduleKey]
    ))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const savedPackage = await platformService.upsertPackage({
        id: selectedPackageId || undefined,
        key,
        name,
        description,
        moduleKeys,
      })
      setSelectedPackageId(savedPackage.id)
      setSaved(true)
      await load()
    } catch (error) {
      console.error('Error saving platform package:', error)
      setError('Nao foi possivel salvar o pacote.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando pacotes...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pacotes</h1>
        <p className="text-gray-600">Pacotes comerciais que ativam conjuntos de modulos.</p>
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
              {selectedPackageId ? 'Editar pacote' : 'Novo pacote'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Monte ofertas comerciais vinculando os modulos que o cliente tera no contrato.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewPackage}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium text-gray-700">Descricao</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">Modulos incluidos</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {modules.map(module => (
              <label key={module.key} className="flex items-start gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={moduleKeys.includes(module.key)}
                  onChange={() => toggleModule(module.key)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-gray-900">{module.name}</span>
                  <span className="block text-xs text-gray-500">{module.key}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar pacote'}
          </button>
        </div>

        {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Pacote salvo.</div>}
      </form>

      <div className="space-y-3">
        {packages.length === 0 && (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
            Nenhum pacote carregado.
          </div>
        )}

        {packages.map(packageItem => (
          <button
            key={packageItem.id}
            type="button"
            onClick={() => selectPackage(packageItem)}
            className={`w-full rounded-lg border bg-white p-4 text-left hover:border-yux-300 ${selectedPackageId === packageItem.id ? 'border-yux-500 ring-2 ring-yux-100' : ''}`}
          >
            <h2 className="font-medium text-gray-900">{packageItem.name}</h2>
            <p className="mt-1 text-sm text-gray-600">{packageItem.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {packageItem.moduleKeys.map(moduleKey => (
                <span
                  key={moduleKey}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                >
                  {moduleKey}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
