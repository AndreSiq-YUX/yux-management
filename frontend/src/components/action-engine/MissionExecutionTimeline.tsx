import { AlertTriangle, Check, Clock3, Loader2, RefreshCw, UserCheck } from 'lucide-react'
import { MissionStatusBadge } from './MissionStatusBadge'
import { actionStatusMeta } from '@/lib/action-engine/missionRules'
import type { MissionActionRun } from '@/types/actionEngine'

export function MissionExecutionTimeline({ actions, canWrite, busyActionId, onRetry, onResolveHuman }: {
  actions: MissionActionRun[]; canWrite: boolean; busyActionId?: string; onRetry: (action: MissionActionRun) => void; onResolveHuman: (action: MissionActionRun) => void
}) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Execução</h2><p className="mt-1 text-xs text-slate-500">Cada efeito registra estado, tentativa, evidência e custo.</p></div>
      {actions.length === 0 ? <p className="p-6 text-sm text-slate-500">As ações aparecerão após a aprovação e o início do plano.</p> : <div className="divide-y divide-slate-200">{actions.map((action, index) => {
        const meta = actionStatusMeta[action.status]
        const Icon = action.status === 'succeeded' ? Check : action.status === 'running' ? Loader2 : action.status === 'failed' || action.status === 'blocked' ? AlertTriangle : action.capabilityKey === 'human.task.create' ? UserCheck : Clock3
        return <article key={action.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[40px_1fr_auto] sm:items-center"><div className={`grid h-9 w-9 place-items-center border ${action.status === 'succeeded' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : action.status === 'failed' || action.status === 'blocked' ? 'border-red-200 bg-red-50 text-red-600' : 'border-blue-200 bg-blue-50 text-blue-600'}`}><Icon className={`h-4 w-4 ${action.status === 'running' ? 'animate-spin' : ''}`} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{String(index + 1).padStart(2, '0')} · {action.stepKey}</p><h3 className="mt-1 text-sm font-semibold text-slate-900">{action.capabilityKey}</h3>{action.lastError && <p className="mt-1 text-xs text-red-600">{action.lastError}</p>}</div><div className="flex flex-wrap items-center gap-2"><MissionStatusBadge {...meta} />{canWrite && ['failed', 'blocked'].includes(action.status) && <button disabled={busyActionId === action.id} onClick={() => onRetry(action)} className="inline-flex h-8 items-center gap-1 border border-slate-300 px-2 text-xs font-semibold text-slate-700"><RefreshCw className="h-3 w-3" /> Tentar novamente</button>}{canWrite && action.capabilityKey === 'human.task.create' && action.status === 'running' && <button disabled={busyActionId === action.id} onClick={() => onResolveHuman(action)} className="inline-flex h-8 items-center gap-1 bg-slate-900 px-2 text-xs font-semibold text-white"><UserCheck className="h-3 w-3" /> Concluir tarefa</button>}</div></article>
      })}</div>}
    </section>
  )
}
