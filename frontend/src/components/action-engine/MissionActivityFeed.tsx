import { AlertTriangle, CheckCircle2, CircleDot, Clock3, ExternalLink, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MissionActivityItem } from '@/types/actionEngine'

export function MissionActivityFeed({ activity, artifactHref }: { activity: MissionActivityItem[]; artifactHref?: (artifact: NonNullable<MissionActivityItem['artifact']>) => string | undefined }) {
  return (
    <section aria-labelledby="mission-activity-title" className="rounded-xl border border-yx-line bg-yx-surface">
      <div className="border-b border-yx-line px-5 py-4"><h2 id="mission-activity-title" className="font-semibold text-yx-fg">O que já aconteceu</h2><p className="mt-1 text-xs text-yx-fg-3">Atualizações em linguagem simples, na ordem em que aconteceram.</p></div>
      {activity.length ? <ol className="divide-y divide-yx-line px-5">{activity.map(item => <ActivityRow key={item.id} item={item} href={item.artifact && artifactHref ? artifactHref(item.artifact) : undefined} />)}</ol> : <p className="px-5 py-8 text-center text-sm text-yx-fg-3">A primeira atualização aparecerá aqui em instantes.</p>}
    </section>
  )
}

function ActivityRow({ item, href }: { item: MissionActivityItem; href?: string }) {
  const Icon = item.state === 'success' ? CheckCircle2 : item.state === 'error' || item.state === 'warning' ? AlertTriangle : item.state === 'active' ? Loader2 : item.state === 'waiting' ? Clock3 : CircleDot
  return <li className="grid grid-cols-[auto_1fr] gap-3 py-4"><span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full ${stateClass[item.state]}`}><Icon className={`h-4 w-4 ${item.state === 'active' ? 'animate-spin' : ''}`} /></span><div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-yx-fg">{item.title}</h3><p className="mt-1 text-xs leading-5 text-yx-fg-2">{item.description}</p></div><time className="shrink-0 text-[11px] text-yx-fg-3" dateTime={item.occurredAt}>{formatActivityDate(item.occurredAt)}</time></div>{href ? <Link className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-yx-blue hover:text-yx-blue" to={href}>Abrir entregável <ExternalLink className="h-3 w-3" /></Link> : null}{item.technicalEvidence ? <details className="mt-2 text-[11px] text-yx-fg-3"><summary className="cursor-pointer font-semibold">Evidência técnica</summary><pre className="mt-2 overflow-auto rounded bg-ink-900 p-3 text-slate-200">{JSON.stringify(item.technicalEvidence, null, 2)}</pre></details> : null}</div></li>
}

function formatActivityDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Agora' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date) }
const stateClass = { info: 'bg-yx-surface-2 text-yx-fg-2', active: 'bg-yx-blue-soft text-yx-blue', waiting: 'bg-yx-warn-soft text-yx-warn', success: 'bg-yx-ok-soft text-yx-ok', warning: 'bg-yx-warn-soft text-yx-warn', error: 'bg-yx-crit-soft text-yx-crit' }
