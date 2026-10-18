import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FileEdit,
  FileSignature,
  FolderKanban,
  Image as ImageIcon,
  MousePointerClick,
  type LucideIcon,
} from 'lucide-react'
import {
  DecisionCard,
  EmptyState,
  ErrorState,
  PageHeader,
  portalButtonClasses,
  SkeletonCard,
  StatusChip,
} from '@/components/portal-ui'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatRelativeTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'

type ApprovalTypeKey = 'deliveries' | 'landing' | 'content' | 'creatives' | 'proposals' | 'other'

interface ApprovalTypeInfo {
  /** Rótulo do filtro (plural). */
  label: string
  /** Módulo onde a decisão é feita. */
  module: string
  icon: LucideIcon
}

const APPROVAL_TYPES: Record<ApprovalTypeKey, ApprovalTypeInfo> = {
  deliveries: { label: 'Entregas', module: 'Projetos e entregas', icon: FolderKanban },
  landing: { label: 'Landing pages', module: 'Landing pages', icon: MousePointerClick },
  content: { label: 'Conteúdos', module: 'Marketing Studio', icon: FileEdit },
  creatives: { label: 'Criativos', module: 'Criativos', icon: ImageIcon },
  proposals: { label: 'Propostas', module: 'Propostas', icon: FileSignature },
  other: { label: 'Outras', module: 'Portal', icon: CheckCircle2 },
}

/** Qual módulo recebe a decisão, a partir do caminho do link (o módulo decide; esta fila só encaminha). */
function typeFromHref(href: string): ApprovalTypeKey {
  if (href.startsWith('/portal/projetos/propostas')) return 'proposals'
  if (href.startsWith('/portal/projetos')) return 'deliveries'
  if (href.startsWith('/portal/marketing/landing-pages')) return 'landing'
  if (href.startsWith('/portal/marketing/studio')) return 'content'
  if (href.startsWith('/portal/marketing/criativos')) return 'creatives'
  return 'other'
}

interface QueueItem {
  id: string
  type: ApprovalTypeKey
  title: string
  description?: string
  /** Texto do tempo de espera, quando o dado existe. */
  wait?: string
  href: string
}

const waitText = (value?: string) => {
  const relative = formatRelativeTime(value)
  return relative === 'Sem data' ? undefined : `enviada ${relative}`
}

export function PortalApprovalsPage() {
  const portalPath = usePortalWorkspacePath()
  const { actions, approvals, loading, error, reload } = usePortalActionSummary()
  const [filter, setFilter] = useState<ApprovalTypeKey | 'all'>('all')

  const items = useMemo<QueueItem[]>(() => {
    const projectItems: QueueItem[] = approvals
      .filter(approval => approval.status === 'pending')
      .sort((a, b) => (a.submittedAt || '').localeCompare(b.submittedAt || ''))
      .map(approval => ({
        id: `approval-${approval.id}`,
        type: 'deliveries',
        title: approval.title,
        description: approval.instructions || undefined,
        wait: waitText(approval.submittedAt),
        href: `/portal/projetos/projetos?projectId=${encodeURIComponent(approval.projectId)}&tab=approvals`,
      }))
    // A ação "project-approvals" resume as aprovações de projeto, que já aparecem uma a uma acima.
    const actionItems: QueueItem[] = actions
      .filter(action => (action.kind === 'approval' || action.kind === 'marketing') && action.id !== 'project-approvals')
      .map(action => ({
        id: `action-${action.id}`,
        type: typeFromHref(action.href),
        title: action.title,
        description: action.description,
        href: action.href,
      }))
    return [...projectItems, ...actionItems]
  }, [actions, approvals])

  const typeCounts = useMemo(() => {
    const counts = new Map<ApprovalTypeKey, number>()
    for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
    return counts
  }, [items])

  // Se o tipo filtrado deixar de existir (ex.: depois de atualizar), volta para "Todos".
  const activeFilter = filter !== 'all' && typeCounts.has(filter) ? filter : 'all'
  const visible = activeFilter === 'all' ? items : items.filter(item => item.type === activeFilter)

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Aprovações"
        lead="Veja tudo o que está esperando a sua decisão. Cada decisão é feita na tela do módulo de origem."
        meta={items.length > 0 && !loading ? <StatusChip variant="warn">{items.length} aguardando você</StatusChip> : undefined}
      />

      {loading ? (
        <div>
          <p role="status" className="sr-only">Carregando aprovações...</p>
          <div aria-hidden="true" className="grid gap-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Não foi possível carregar suas aprovações."
          description="Verifique sua conexão e tente de novo."
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhuma aprovação pendente"
          description="Quando houver entregas, conteúdos ou criativos aguardando a sua decisão, eles aparecem nesta fila."
        />
      ) : (
        <>
          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-yx-warn-line bg-yx-warn-soft px-4 py-3 text-[13px] text-yx-fg"
            >
              <span>Algumas aprovações podem não estar aparecendo. Atualize para conferir.</span>
              <button type="button" onClick={reload} className={portalButtonClasses('ghost')}>
                Tentar novamente
              </button>
            </div>
          ) : null}

          {typeCounts.size > 1 ? (
            <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
              <FilterChip active={activeFilter === 'all'} onClick={() => setFilter('all')} label="Todas" count={items.length} />
              {(Object.keys(APPROVAL_TYPES) as ApprovalTypeKey[])
                .filter(key => typeCounts.has(key))
                .map(key => (
                  <FilterChip
                    key={key}
                    active={activeFilter === key}
                    onClick={() => setFilter(key)}
                    label={APPROVAL_TYPES[key].label}
                    count={typeCounts.get(key) ?? 0}
                  />
                ))}
            </div>
          ) : null}

          <ul aria-label="Fila de aprovações" className="m-0 grid list-none gap-3 p-0">
            {visible.map(item => {
              const info = APPROVAL_TYPES[item.type]
              return (
                <li key={item.id}>
                  <DecisionCard
                    tone="warn"
                    module={{ label: info.module, icon: info.icon }}
                    wait={item.wait}
                    title={item.title}
                    description={item.description}
                    actions={
                      <Link to={portalPath(item.href)} className={portalButtonClasses('primary')}>
                        Revisar e decidir
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    }
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 font-sans text-[13px] font-semibold transition-colors sm:min-h-[34px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface',
        'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
        'aria-pressed:border-yx-blue aria-pressed:bg-yx-blue-soft aria-pressed:text-yx-blue',
      )}
    >
      {label}
      <span className="font-mono text-[11.5px] tabular-nums">{count}</span>
    </button>
  )
}
