import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Search } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { EmptyState, ErrorState, ResponsiveTable, SectionCard, SkeletonCard, StatusChip, sectionLinkClasses, type ResponsiveTableColumn } from '@/components/portal-ui'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatPortalCurrency, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import type { CrmLead } from '@/types/crm'

export interface CommercialAccount {
  key: string
  name: string
  leads: number
  openValue: number
  lastActivityAt: string
  status: string
}

export type AccountSort = 'value' | 'name' | 'leads' | 'recent'

const sortOptions: Array<{ value: AccountSort; label: string }> = [
  { value: 'value', label: 'Maior valor em aberto' },
  { value: 'leads', label: 'Mais leads' },
  { value: 'recent', label: 'Atividade mais recente' },
  { value: 'name', label: 'Nome (A a Z)' },
]

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Agrupa os leads por empresa (ignorando maiúsculas, acentos e espaços nas pontas). */
export function groupLeadsByCompany(leads: CrmLead[]): CommercialAccount[] {
  const groups = new Map<string, CommercialAccount>()
  for (const lead of leads) {
    const name = lead.company?.trim()
    if (!name) continue
    const key = normalize(name)
    const activityAt = lead.lastActivityAt || lead.updatedAt
    const current = groups.get(key) || { key, name, leads: 0, openValue: 0, lastActivityAt: activityAt, status: lead.status || 'open' }
    current.leads += 1
    if ((lead.status || 'open') === 'open') current.openValue += lead.value || 0
    if (new Date(activityAt).getTime() > new Date(current.lastActivityAt).getTime()) {
      current.lastActivityAt = activityAt
      current.status = lead.status || 'open'
    }
    groups.set(key, current)
  }
  return Array.from(groups.values())
}

export function filterAndSortAccounts(accounts: CommercialAccount[], search: string, sort: AccountSort): CommercialAccount[] {
  const query = normalize(search)
  const filtered = query ? accounts.filter(account => normalize(account.name).includes(query)) : accounts
  return [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
    if (sort === 'leads') return b.leads - a.leads || a.name.localeCompare(b.name, 'pt-BR')
    if (sort === 'recent') return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    return b.openValue - a.openValue || a.name.localeCompare(b.name, 'pt-BR')
  })
}

const statusVariant = (status: string) => (status === 'won' ? 'ok' : status === 'lost' ? 'crit' : 'neutral') as 'ok' | 'crit' | 'neutral'

export function PortalCommercialAccountsPage() {
  const { loading, error, leads, reload } = usePortalCrmContext()
  const portalPath = usePortalWorkspacePath()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<AccountSort>('value')

  const accountLeads = useMemo(() => leads.filter(lead => lead.company?.trim()), [leads])
  const accounts = useMemo(() => groupLeadsByCompany(leads), [leads])
  const visible = useMemo(() => filterAndSortAccounts(accounts, search, sort), [accounts, search, sort])
  const totalOpenValue = accounts.reduce((sum, account) => sum + account.openValue, 0)

  const leadsHref = (account: CommercialAccount) => portalPath(`/portal/comercial/leads?company=${encodeURIComponent(account.name)}`)

  const columns: ResponsiveTableColumn<CommercialAccount>[] = [
    {
      key: 'name',
      header: 'Empresa',
      mobileLabel: '',
      render: account => <span className="font-semibold text-yx-fg">{account.name}</span>,
    },
    { key: 'leads', header: 'Leads', className: 'text-right', render: account => account.leads },
    { key: 'openValue', header: 'Valor em aberto', className: 'text-right', render: account => formatPortalCurrency(account.openValue) },
    { key: 'status', header: 'Situação', render: account => <StatusChip variant={statusVariant(account.status)}>{statusLabel(account.status)}</StatusChip> },
    { key: 'lastActivityAt', header: 'Última atividade', render: account => formatPortalDate(account.lastActivityAt) },
    {
      key: 'open',
      header: <span className="sr-only">Ação</span>,
      mobileLabel: '',
      className: 'text-right',
      render: account => (
        <Link
          to={leadsHref(account)}
          onClick={event => event.stopPropagation()}
          aria-label={`Ver leads de ${account.name}`}
          className={sectionLinkClasses}
        >
          Ver leads
        </Link>
      ),
    },
  ]

  return (
    <PortalPage
      eyebrow="Comercial"
      title="Empresas e contas"
      description="Veja as empresas que aparecem nos seus leads, quanto cada uma vale em aberto e quando houve a última atividade."
      help={[
        'As empresas vêm dos leads que têm o campo Empresa preenchido; leads sem empresa não entram nesta lista.',
        'Procure pelo nome e ordene por valor em aberto, quantidade de leads, atividade recente ou ordem alfabética.',
        'Clique em uma empresa para abrir os leads dela.',
      ]}
      primaryAction={{ label: 'Ver todos os leads', href: '/portal/comercial/leads' }}
      metrics={[
        { label: 'Empresas', value: String(accounts.length), detail: 'Agrupadas a partir dos seus leads.' },
        { label: 'Leads com empresa', value: String(accountLeads.length) },
        { label: 'Valor em aberto', value: formatPortalCurrency(totalOpenValue), detail: 'Soma das oportunidades abertas.' },
      ]}
      related={[
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Tarefas e follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <SectionCard title="Suas empresas" description={accounts.length ? `${visible.length} de ${accounts.length} ${accounts.length === 1 ? 'empresa' : 'empresas'}` : undefined}>
        {loading ? (
          <SkeletonCard lines={4} />
        ) : error ? (
          <ErrorState title="Não foi possível carregar as empresas" description={error} onRetry={() => void reload()} />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa nos seus leads ainda"
            description="Quando um lead tiver o campo Empresa preenchido, a empresa aparece aqui com o valor e a atividade de cada lead."
            action={{ label: 'Ir para Leads', href: '/portal/comercial/leads' }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="account-search" className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Buscar empresa</label>
                <div className="relative mt-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
                  <input
                    id="account-search"
                    type="search"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Nome da empresa"
                    className="flex h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface pl-9 pr-3 text-sm text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="account-sort" className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Ordenar por</label>
                <select
                  id="account-sort"
                  value={sort}
                  onChange={event => setSort(event.target.value as AccountSort)}
                  className="mt-1 flex h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:w-56"
                >
                  {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <ResponsiveTable
              caption="Empresas dos seus leads"
              columns={columns}
              rows={visible}
              getRowKey={account => account.key}
              onRowClick={account => navigate(leadsHref(account))}
              empty={(
                <EmptyState
                  icon={Search}
                  title="Nenhuma empresa encontrada"
                  description={`Nenhuma empresa combina com "${search}". Confira o nome ou limpe a busca.`}
                  action={{ label: 'Limpar busca', onClick: () => setSearch('') }}
                />
              )}
            />
          </div>
        )}
      </SectionCard>
    </PortalPage>
  )
}
