import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Megaphone, MousePointerClick } from 'lucide-react'
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { Button } from '@/components/ui/button'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'

const approvalLinks = [
  {
    label: 'Landing Pages',
    description: 'Revisar previews, aprovar publicacao ou pedir ajustes.',
    href: '/portal/marketing/landing-pages',
    icon: MousePointerClick,
  },
  {
    label: 'Campanhas',
    description: 'Acompanhar criativos, status e aprovacoes de campanha.',
    href: '/portal/marketing/campanhas',
    icon: Megaphone,
  },
  {
    label: 'Propostas e documentos',
    description: 'Consultar propostas, entregaveis e decisoes comerciais pendentes.',
    href: '/portal/projetos/documentos',
    icon: FileText,
  },
]

export function PortalApprovalsPage() {
  const portalPath = usePortalWorkspacePath()
  const { actions, approvals, loading, error } = usePortalActionSummary()
  const pendingProjectApprovals = approvals.filter(approval => approval.status === 'pending')
  const approvalActions = actions.filter(action => action.kind === 'approval' || action.kind === 'marketing')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aprovacoes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pendencias recorrentes do cliente para aprovar, comentar ou solicitar alteracoes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {approvalLinks.map(item => {
          const Icon = item.icon
          return (
            <Link key={item.href} to={portalPath(item.href)} className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50">
              <Icon className="h-5 w-5 text-yux-700" />
              <h2 className="mt-3 font-semibold text-gray-900">{item.label}</h2>
              <p className="mt-2 text-sm text-gray-600">{item.description}</p>
            </Link>
          )
        })}
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-yux-700" />
            <div>
              <h2 className="font-semibold text-gray-900">Fila consolidada</h2>
              <p className="mt-1 text-sm text-gray-600">
                Acompanhe aprovacoes de projetos, criativos e conteudos em um unico lugar.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to={portalPath('/portal')}>Voltar para Visao Geral</Link>
          </Button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-gray-600">Carregando aprovacoes...</p>
        ) : error ? (
          <p className="mt-4 text-sm text-amber-700">{error}</p>
        ) : approvalActions.length > 0 || pendingProjectApprovals.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {approvalActions.map(action => (
              <Link key={action.id} to={portalPath(action.href)} className="rounded-md border bg-gray-50 p-4 hover:border-yux-300 hover:bg-yux-50">
                <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                <p className="mt-1 text-sm text-gray-600">{action.description}</p>
              </Link>
            ))}
            {pendingProjectApprovals.slice(0, 6).map(approval => (
              <Link key={approval.id} to={portalPath('/portal/projetos/projetos')} className="rounded-md border bg-gray-50 p-4 hover:border-yux-300 hover:bg-yux-50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{approval.title}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(approval.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Solicitado em {formatPortalDateTime(approval.submittedAt)}</p>
                {approval.instructions && <p className="mt-2 text-sm text-gray-600">{approval.instructions}</p>}
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <PortalEmptyState
              icon={CheckCircle2}
              title="Nenhuma aprovacao pendente"
              description="Quando houver entregaveis, criativos, conteudos ou documentos aguardando decisao, eles aparecem nesta fila."
            />
          </div>
        )}
      </section>
    </div>
  )
}
