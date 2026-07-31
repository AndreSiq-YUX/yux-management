import { Building2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { formatPortalCurrency, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalCommercialAccountsPage() {
  const { loading, error, leads, tasks } = usePortalCrmContext()
  const accountLeads = leads.filter(lead => lead.company?.trim())
  const accounts = Array.from(
    accountLeads.reduce((map, lead) => {
      const key = lead.company?.trim() || ''
      const current = map.get(key) || {
        name: key,
        leads: 0,
        openValue: 0,
        lastActivityAt: lead.lastActivityAt || lead.updatedAt,
        status: lead.status || 'open',
      }
      current.leads += 1
      if ((lead.status || 'open') === 'open') current.openValue += lead.value || 0
      if (new Date(lead.updatedAt).getTime() > new Date(current.lastActivityAt).getTime()) {
        current.lastActivityAt = lead.updatedAt
        current.status = lead.status || 'open'
      }
      map.set(key, current)
      return map
    }, new Map<string, { name: string; leads: number; openValue: number; lastActivityAt: string; status: string }>())
      .values()
  ).sort((a, b) => b.openValue - a.openValue)

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Empresas / Contas"
      description="Area para clientes B2B acompanharem empresas prospectadas, contatos, potencial e oportunidades vinculadas."
      icon={Building2}
      metrics={[
        { label: 'Contas', value: String(accounts.length), detail: 'Empresas agrupadas a partir dos leads.' },
        { label: 'Leads B2B', value: String(accountLeads.length), detail: 'Leads com empresa vinculada.' },
        { label: 'Tarefas', value: String(tasks.length), detail: 'Atividades comerciais relacionadas.' },
      ]}
      capabilities={[
        'Cadastrar empresas prospectadas com segmento, porte, potencial, CNPJ e site.',
        'Vincular contatos, responsavel comercial, oportunidades e propostas.',
        'Consultar historico de interacoes, conversas, tarefas e follow-ups por conta.',
        'Separar vendas B2B estruturadas da lista simples de leads.',
      ]}
      secondaryActions={[
        { label: 'Leads', href: '/portal/comercial/leads' },
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Contas identificadas</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Carregando contas comerciais...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {accounts.slice(0, 10).map(account => (
              <article key={account.name} className="grid gap-2 rounded-md border bg-gray-50 p-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-medium text-gray-900">{account.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{account.leads} contatos ou oportunidades vinculadas</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatPortalCurrency(account.openValue)}</p>
                  <p className="mt-1 text-xs text-gray-500">{statusLabel(account.status)} - {formatPortalDate(account.lastActivityAt)}</p>
                </div>
              </article>
            ))}
            {!accounts.length && (
              <p className="text-sm text-gray-600">Nenhuma empresa vinculada aos leads atuais.</p>
            )}
          </div>
        )}
      </section>
    </PortalJourneyPage>
  )
}
