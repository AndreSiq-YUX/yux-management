import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { buildNavigation } from '@/lib/platform/navigation'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'

function formatDateOnly(value: string) {
  const [year, month, day] = value.split('T')[0].split('-')
  return [day, month, year].filter(Boolean).join('/')
}

const summaryByModule: Record<string, { title: string; value: string; detail: string }> = {
  crm: { title: 'Comercial', value: 'Leads e funis', detail: 'Pipeline, oportunidades e proximas acoes.' },
  whatsapp_ai: { title: 'Atendimento & IA', value: 'Conversas', detail: 'Atendimentos, handoff e contexto comercial.' },
  landing_pages: { title: 'Marketing', value: 'Landing Pages', detail: 'Versoes, ajustes e publicacoes.' },
  campaigns: { title: 'Marketing', value: 'Campanhas', detail: 'Investimento, leads, CPL e recomendacoes.' },
  marketing_studio: { title: 'Marketing', value: 'Conteudo e calendario', detail: 'Conteudos, aprovacoes e diretrizes da marca.' },
  proposals: { title: 'Aprovacoes', value: 'Propostas', detail: 'Decisoes comerciais pendentes.' },
  support: { title: 'Suporte', value: 'Chamados e SLA', detail: 'Status de chamados e prioridade.' },
  finance: { title: 'Financeiro', value: 'Faturas', detail: 'Resumo financeiro contratado.' },
  bi_reports: { title: 'Relatorios', value: 'Indicadores', detail: 'Resultados comerciais seguros para o cliente.' },
}

const actionTone: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  high: 'border-amber-200 bg-amber-50 text-amber-800',
  normal: 'border-yux-200 bg-yux-50 text-yux-800',
}

export function PortalDashboardPage() {
  const {
    activeContract,
    enabledModuleKeys,
    isLoading,
    membership,
    organization,
    role,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    membership: state.membership,
    organization: state.organization,
    role: state.role,
  }))
  const actionSummary = usePortalActionSummary()
  const items = buildNavigation({
    enabledModuleKeys,
    membership,
    mode: 'portal',
    organization,
    role,
  }).filter(item => item.moduleKey)

  if (isLoading) {
    return <p className="text-sm text-gray-600">Carregando portal...</p>
  }

  if (!activeContract) {
    return (
      <PortalEmptyState
        title="Nenhum contrato ativo encontrado"
        description="Entre em contato com a YUX para revisar o acesso ao portal e liberar os modulos contratados."
      />
    )
  }

  const startsAt = formatDateOnly(activeContract.startsAt)
  const commercialItems = items.filter(item => item.moduleKey && summaryByModule[item.moduleKey])
  const visibleActions = actionSummary.actions.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visao Geral</h1>
          <p className="text-gray-600">Acompanhe prioridades, aprovacoes, operacao comercial e modulos contratados.</p>
        </div>
        <Link
          to="/portal/projetos/aprovacoes"
          className="inline-flex items-center justify-center rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700"
        >
          Pendencias de aprovacao
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{activeContract.name || 'Contrato ativo'}</h2>
            <p className="mt-1 text-sm text-gray-600">{organization?.name || 'Empresa do cliente'}</p>
          </div>
          <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium uppercase text-gray-600">
            {statusLabel(activeContract.status)}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-gray-500">Pacote</dt>
            <dd className="font-medium text-gray-900">{activeContract.package?.name || 'Sem pacote vinculado'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Inicio</dt>
            <dd className="font-medium text-gray-900">{startsAt}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Areas ativas</dt>
            <dd className="font-medium text-gray-900">{commercialItems.length}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Proximas acoes</dt>
            <dd className="font-medium text-gray-900">{actionSummary.loading ? 'Carregando' : actionSummary.actions.length}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-yux-700">Proximas acoes</p>
            <h2 className="text-lg font-semibold text-gray-900">O que precisa de atencao agora</h2>
          </div>
          {actionSummary.error && <span className="text-xs text-amber-700">{actionSummary.error}</span>}
        </div>

        {actionSummary.loading ? (
          <p className="mt-4 text-sm text-gray-600">Carregando prioridades do cliente...</p>
        ) : visibleActions.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {visibleActions.map(action => (
              <Link
                key={action.id}
                to={action.href}
                className={`rounded-md border p-4 transition-colors hover:border-yux-300 ${actionTone[action.priority]}`}
              >
                <div className="flex items-start gap-3">
                  {action.priority === 'critical' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />}
                  <div>
                    <h3 className="font-semibold">{action.title}</h3>
                    <p className="mt-1 text-sm opacity-80">{action.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <PortalEmptyState
            icon={CheckCircle2}
            title="Nenhuma pendencia critica no momento"
            description="Quando houver aprovacoes, follow-ups, vencimentos ou revisoes, elas aparecem aqui como proximas acoes."
          />
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {commercialItems.map(item => {
          const summary = summaryByModule[item.moduleKey!]
          return (
            <Link
              key={`summary-${item.href}`}
              to={item.href}
              className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50"
            >
              <p className="text-xs font-medium uppercase text-gray-500">{summary.title}</p>
              <h2 className="mt-2 font-semibold text-gray-900">{summary.value}</h2>
              <p className="mt-2 text-sm text-gray-600">{summary.detail}</p>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
