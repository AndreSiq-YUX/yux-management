import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Megaphone, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    label: 'Propostas',
    description: 'Consultar propostas e decisoes comerciais pendentes.',
    href: '/portal/projetos/aprovacoes',
    icon: FileText,
  },
]

export function PortalApprovalsPage() {
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
            <Link key={item.href} to={item.href} className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50">
              <Icon className="h-5 w-5 text-yux-700" />
              <h2 className="mt-3 font-semibold text-gray-900">{item.label}</h2>
              <p className="mt-2 text-sm text-gray-600">{item.description}</p>
            </Link>
          )
        })}
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-yux-700" />
          <div>
            <h2 className="font-semibold text-gray-900">Fila consolidada</h2>
            <p className="mt-1 text-sm text-gray-600">
              A fila consolidada de aprovacoes entra nas proximas fases. Por enquanto, use os atalhos acima para revisar cada modulo.
            </p>
          </div>
        </div>
        <Button className="mt-4" asChild>
          <Link to="/portal">Voltar para Visao Geral</Link>
        </Button>
      </section>
    </div>
  )
}
