import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Building2, Edit, HardDrive, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react'
import { adminPlatformService } from '@/services/adminPlatformService'

interface OrgWithLimit {
  id: string
  name: string
  slug: string
  limit: number | null
}

export function AdminLimitsPage() {
  const [globalLimit, setGlobalLimit] = useState<number>(10)
  const [orgs, setOrgs] = useState<OrgWithLimit[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Edit client modal/state
  const [editingOrg, setEditingOrg] = useState<OrgWithLimit | null>(null)
  const [editingLimitVal, setEditingLimitVal] = useState<string>('')
  const [savingClient, setSavingClient] = useState(false)
  const [savingGlobal, setSavingGlobal] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const globLimit = await adminPlatformService.getGlobalUploadLimit()
      const orgList = await adminPlatformService.getOrganizationsWithLimits()
      setGlobalLimit(globLimit)
      setOrgs(orgList)
    } catch (err) {
      console.error('Error loading limits config:', err)
      setError('Não foi possível carregar as configurações de limite de upload.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSaveGlobal(e: React.FormEvent) {
    e.preventDefault()
    setSavingGlobal(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await adminPlatformService.updateGlobalUploadLimit(globalLimit)
      setSuccessMessage('Limite global de upload atualizado com sucesso!')
    } catch (err) {
      console.error('Error saving global limit:', err)
      setError('Erro ao salvar o limite global de upload.')
    } finally {
      setSavingGlobal(false)
    }
  }

  async function handleSaveClientLimit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingOrg) return
    
    const limitNum = Number(editingLimitVal)
    if (isNaN(limitNum) || limitNum <= 0) {
      alert('Por favor, insira um valor numérico válido maior que 0.')
      return
    }

    setSavingClient(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await adminPlatformService.updateClientUploadLimit(editingOrg.id, limitNum)
      setSuccessMessage(`Limite de upload para a empresa ${editingOrg.name} atualizado com sucesso!`)
      setEditingOrg(null)
      // Reload list
      const orgList = await adminPlatformService.getOrganizationsWithLimits()
      setOrgs(orgList)
    } catch (err) {
      console.error('Error saving client limit:', err)
      setError(`Erro ao salvar o limite de upload para ${editingOrg.name}.`)
    } finally {
      setSavingClient(false)
    }
  }

  const filteredOrgs = useMemo(() => {
    return orgs.filter(
      org =>
        org.name.toLowerCase().includes(search.toLowerCase()) ||
        org.slug.toLowerCase().includes(search.toLowerCase())
    )
  }, [orgs, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/admin"
              className="inline-flex items-center text-sm font-medium text-yux-600 hover:text-yux-700"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar ao Admin Hub
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Limites de Upload de Materiais</h1>
          <p className="text-gray-600">
            Defina o tamanho máximo padrão de arquivos anexados e personalize limites para clientes específicos.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="alert">
          {successMessage}
        </div>
      )}

      {loading && <p className="text-sm text-gray-600">Carregando dados de limites...</p>}

      {!loading && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Global Limit Configuration */}
          <section className="lg:col-span-1 rounded-lg border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b">
              <span className="rounded-md bg-yux-50 p-2 text-yux-700">
                <HardDrive className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900 font-inter">Configuração Global</h2>
                <p className="text-xs text-gray-500">Aplica-se a todos os clientes sem limite customizado</p>
              </div>
            </div>

            <form onSubmit={handleSaveGlobal} className="space-y-4">
              <div>
                <label htmlFor="globalLimitInput" className="block text-sm font-medium text-gray-700 mb-1">
                  Tamanho Máximo Global (MB)
                </label>
                <div className="flex rounded-md shadow-sm">
                  <input
                    id="globalLimitInput"
                    type="number"
                    min="1"
                    required
                    value={globalLimit}
                    onChange={e => setGlobalLimit(Math.max(1, Number(e.target.value)))}
                    className="block w-full min-w-0 flex-1 rounded-none rounded-l-md border-gray-300 focus:border-yux-500 focus:ring-yux-500 sm:text-sm"
                  />
                  <span className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm">
                    MB
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  O valor padrão recomendado pela plataforma é 10 MB.
                </p>
              </div>

              <button
                type="submit"
                disabled={savingGlobal}
                className="w-full inline-flex items-center justify-center rounded-md border border-transparent bg-yux-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yux-700 focus:outline-none focus:ring-2 focus:ring-yux-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {savingGlobal ? 'Salvando...' : 'Salvar Limite Global'}
              </button>
            </form>
          </section>

          {/* Per-Client Configuration List */}
          <section className="lg:col-span-2 rounded-lg border bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Limites Customizados por Cliente</h2>
                <p className="text-xs text-gray-500">Gerencie regras específicas que sobrepõem o limite global</p>
              </div>
              <div className="relative rounded-md shadow-sm max-w-xs">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="block w-full rounded-md border-gray-300 pl-9 focus:border-yux-500 focus:ring-yux-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Empresa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Slug / Identificador</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Limite de Upload</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredOrgs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                        Nenhum cliente cadastrado ou encontrado.
                      </td>
                    </tr>
                  )}
                  {filteredOrgs.map(org => (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                          <div className="text-sm font-medium text-gray-900">{org.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {org.slug}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {org.limit !== null ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            {org.limit} MB (Customizado)
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            {globalLimit} MB (Global)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOrg(org)
                            setEditingLimitVal(org.limit !== null ? String(org.limit) : String(globalLimit))
                          }}
                          className="inline-flex items-center text-yux-600 hover:text-yux-900"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" role="dialog">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Customizar Limite de Upload</h3>
              <p className="text-sm text-gray-500 mt-1">
                Ajuste o tamanho máximo permitido de anexo para a empresa <span className="font-semibold text-gray-800">{editingOrg.name}</span>.
              </p>
            </div>

            <form onSubmit={handleSaveClientLimit} className="space-y-4">
              <div>
                <label htmlFor="clientLimitInput" className="block text-sm font-medium text-gray-700 mb-1">
                  Limite Máximo de Upload (MB)
                </label>
                <div className="flex rounded-md shadow-sm">
                  <input
                    id="clientLimitInput"
                    type="number"
                    min="1"
                    required
                    value={editingLimitVal}
                    onChange={e => setEditingLimitVal(e.target.value)}
                    className="block w-full min-w-0 flex-1 rounded-none rounded-l-md border-gray-300 focus:border-yux-500 focus:ring-yux-500 sm:text-sm"
                  />
                  <span className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm">
                    MB
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-yux-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yux-700 focus:outline-none focus:ring-2 focus:ring-yux-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {savingClient ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
