import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Briefcase, Building2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { platformService } from '@/services/platformService'
import type { ContractDetails, Organization } from '@/types/platform'

interface ClientWorkspaceOption {
  organization: Organization
  contract: ContractDetails | null
}

function getActiveContractForOrganization(organization: Organization, contracts: ContractDetails[]) {
  if (!organization.clientId) return null

  return contracts.find(contract => contract.clientId === organization.clientId && contract.status === 'active') || null
}

export function ClientWorkspaceSelectorPage() {
  const [options, setOptions] = useState<ClientWorkspaceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [organizations, contracts] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getContracts(),
      ])
      const clientOrganizations = organizations
        .filter(organization => organization.kind === 'client' && organization.clientId)
        .map(organization => ({
          organization,
          contract: getActiveContractForOrganization(organization, contracts),
        }))

      setOptions(clientOrganizations)
    } catch (loadError) {
      console.error('Erro ao carregar workspaces de clientes:', loadError)
      setError('Nao foi possivel carregar os clientes operaveis.')
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  const activeOptions = useMemo(() => options.filter(option => option.contract), [options])
  const inactiveOptions = useMemo(() => options.filter(option => !option.contract), [options])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-yux-700">Workspaces dos Clientes</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Selecionar cliente para operar</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Escolha primeiro o cliente. Depois o admin acessa a mesma divisao do portal: Empresa, Comercial, Atendimento & IA, Marketing, Projetos, Relatorios, Suporte e Financeiro.
          </p>
        </div>
        <Button variant="outline" onClick={loadWorkspaces}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {error && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium uppercase text-gray-500">Clientes operaveis</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{activeOptions.length}</p>
          <p className="mt-1 text-sm text-gray-600">Com contrato ativo para abrir workspace.</p>
        </article>
        <article className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium uppercase text-gray-500">Sem contrato ativo</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{inactiveOptions.length}</p>
          <p className="mt-1 text-sm text-gray-600">Devem ser revisados em Clientes & Contratos.</p>
        </article>
        <article className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium uppercase text-gray-500">Fluxo</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">Assistido</p>
          <p className="mt-1 text-sm text-gray-600">Admin opera sem entrar na administracao da plataforma.</p>
        </article>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Clientes com workspace ativo</h2>
        {loading ? (
          <p className="mt-4 text-sm text-gray-600">Carregando clientes...</p>
        ) : activeOptions.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {activeOptions.map(option => (
              <Link
                key={option.organization.id}
                to={`/client-workspaces/${option.organization.id}`}
                className="rounded-lg border bg-gray-50 p-4 transition-colors hover:border-yux-300 hover:bg-yux-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-5 w-5 text-yux-700" />
                    <div>
                      <h3 className="font-semibold text-gray-900">{option.organization.name}</h3>
                      <p className="mt-1 text-sm text-gray-600">{option.contract?.name || 'Contrato ativo'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {option.contract?.package?.name || 'Sem pacote vinculado'} - {option.contract?.modules.filter(module => module.enabled).length || 0} modulos ativos
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-yux-700" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600">Nenhum cliente com contrato ativo encontrado.</p>
        )}
      </section>

      {inactiveOptions.length > 0 && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Clientes sem workspace liberado</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {inactiveOptions.map(option => (
              <div key={option.organization.id} className="rounded-lg border bg-gray-50 p-4">
                <div className="flex items-start gap-3">
                  <Briefcase className="mt-0.5 h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{option.organization.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{statusLabel('paused')} ou sem contrato ativo.</p>
                    <Link to="/contracts" className="mt-2 inline-flex text-sm font-medium text-yux-700 hover:text-yux-800">
                      Revisar contratos
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
