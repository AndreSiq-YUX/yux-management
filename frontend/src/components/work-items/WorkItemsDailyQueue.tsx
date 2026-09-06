import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, ExternalLink, Loader2, ShieldQuestion } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { useAuthStore } from '@/stores/authStore'
import { workItemsService, type WorkItem } from '@/services/workItemsService'

type Group = {
  key: 'today' | 'overdue' | 'blocked' | 'awaiting_approval' | 'upcoming'
  title: string
  description: string
  icon: typeof Clock3
  items: WorkItem[]
}

export function WorkItemsDailyQueue({ organizationId, onCompleted }: { organizationId: string; onCompleted?: () => Promise<void> | void }) {
  const currentUserId = useAuthStore(state => state.user?.id)
  const currentUserRole = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  const [searchParams] = useSearchParams()
  const selectedSourceId = searchParams.get('sourceId')
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [evidence, setEvidence] = useState('')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await workItemsService.list({ organizationId, due: 'all' })
      setItems(result.items)
    } catch (loadError) {
      console.error('Erro ao carregar fila diária:', loadError)
      setError('Não foi possível carregar a fila diária. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => groupItems(items), [items])
  const startCompletion = (item: WorkItem) => {
    setEditing(item.sourceId)
    setEvidence('')
    setMinutes('')
  }
  const complete = async (item: WorkItem) => {
    const trimmed = evidence.trim()
    const minutesSpent = Number(minutes)
    if (!trimmed) return setError('Descreva a evidência da conclusão.')
    if (!Number.isInteger(minutesSpent) || minutesSpent <= 0 || minutesSpent > 1440) return setError('Informe o tempo gasto em minutos, entre 1 e 1440.')
    setBusy(item.sourceId)
    setError(null)
    try {
      await workItemsService.complete(item, { evidence: { note: trimmed }, minutesSpent })
      setEditing(null)
      await Promise.all([load(), onCompleted?.()])
      toast.success('Trabalho concluído com evidência registrada.')
    } catch (completionError) {
      console.error('Erro ao concluir trabalho:', completionError)
      setError('Não foi possível concluir. A fila foi atualizada para evitar sobrescrever uma alteração recente.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="daily-work-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Fila operacional unificada</p><h2 id="daily-work-title" className="mt-1 text-lg font-semibold text-slate-950">Meu trabalho diário</h2><p className="mt-1 text-sm text-slate-600">Tarefas comerciais, entregas de projeto e intervenções de missões, sem cópias independentes.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"><Clock3 className="h-4 w-4" />Atualizar fila</button>
      </div>
      {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading && items.length === 0 ? <p className="mt-5 inline-flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Carregando trabalho diário...</p> : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {groups.map(group => <WorkItemGroup key={group.key} group={group} selectedSourceId={selectedSourceId} currentUserId={currentUserId} currentUserRole={currentUserRole} portalPath={portalPath} editing={editing} evidence={evidence} minutes={minutes} busy={busy} onStart={startCompletion} onCancel={() => setEditing(null)} onEvidence={setEvidence} onMinutes={setMinutes} onComplete={complete} />)}
        </div>
      )}
    </section>
  )
}

function WorkItemGroup({ group, selectedSourceId, currentUserId, currentUserRole, portalPath, editing, evidence, minutes, busy, onStart, onCancel, onEvidence, onMinutes, onComplete }: {
  group: Group
  selectedSourceId: string | null
  currentUserId?: string
  currentUserRole?: 'admin' | 'manager' | 'client'
  portalPath: (href?: string) => string
  editing: string | null
  evidence: string
  minutes: string
  busy: string | null
  onStart: (item: WorkItem) => void
  onCancel: () => void
  onEvidence: (value: string) => void
  onMinutes: (value: string) => void
  onComplete: (item: WorkItem) => void
}) {
  const Icon = group.icon
  return <div className="rounded-md border border-slate-200 bg-slate-50/60"><div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3"><Icon className="mt-0.5 h-4 w-4 text-blue-700" /><div><h3 className="text-sm font-semibold text-slate-950">{group.title} <span className="text-slate-400">({group.items.length})</span></h3><p className="mt-0.5 text-xs text-slate-500">{group.description}</p></div></div>{group.items.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">Nenhum item nesta situação.</p> : <div className="divide-y divide-slate-200">{group.items.map(item => {
    const assignmentAllowed = !item.assigneeId || item.assigneeId === currentUserId || currentUserRole === 'admin'
    const sourceAllowed = item.sourceType !== 'mission_human_task' || currentUserRole === 'admin' || currentUserRole === 'manager'
    const canComplete = ['pending', 'in_progress'].includes(item.status) && assignmentAllowed && sourceAllowed
    const highlighted = item.sourceId === selectedSourceId
    return <article id={`work-item-${item.sourceId}`} key={`${item.sourceType}:${item.sourceId}`} className={`p-4 ${highlighted ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : 'bg-white'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{sourceLabel(item.sourceType)}</p><h4 className="mt-1 text-sm font-semibold text-slate-900">{item.title}</h4><p className="mt-1 text-xs text-slate-500">{item.dueAt ? `Prazo: ${new Date(item.dueAt).toLocaleString('pt-BR')}` : 'Sem prazo definido'}</p></div><div className="flex items-center gap-2"><Link to={sourceHref(item, portalPath)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:border-blue-400"><ExternalLink className="h-3 w-3" />Abrir origem</Link>{canComplete ? <button type="button" onClick={() => onStart(item)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2 text-xs font-semibold text-white"><CheckCircle2 className="h-3 w-3" />Concluir</button> : null}</div></div>{editing === item.sourceId ? <div className="mt-4 space-y-3 rounded-md border border-blue-200 bg-blue-50 p-3"><label className="block text-xs font-semibold text-slate-700">Evidência da conclusão<textarea autoFocus value={evidence} onChange={event => onEvidence(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm font-normal" placeholder="Descreva o resultado, link ou confirmação obtida" /></label><label className="block text-xs font-semibold text-slate-700">Tempo gasto (minutos)<input type="number" min={1} max={1440} step={1} value={minutes} onChange={event => onMinutes(event.target.value)} className="mt-1 block w-36 rounded-md border border-slate-300 bg-white p-2 text-sm font-normal" /></label><div className="flex gap-2"><button type="button" disabled={busy === item.sourceId} onClick={() => onComplete(item)} className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy === item.sourceId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Registrar conclusão</button><button type="button" disabled={busy === item.sourceId} onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-semibold text-slate-600">Cancelar</button></div></div> : null}</article>
  })}</div>}</div>
}

function groupItems(items: WorkItem[]): Group[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const regular = items.filter(item => !['blocked', 'awaiting_approval'].includes(item.status))
  return [
    { key: 'today', title: 'Hoje', description: 'Itens com prazo para o dia atual.', icon: Clock3, items: regular.filter(item => item.dueAt && new Date(item.dueAt) >= start && new Date(item.dueAt) < end) },
    { key: 'overdue', title: 'Atrasadas', description: 'Itens vencidos que precisam de atenção.', icon: AlertTriangle, items: regular.filter(item => item.dueAt && new Date(item.dueAt) < start) },
    { key: 'blocked', title: 'Bloqueadas', description: 'A origem precisa ser corrigida antes de continuar.', icon: ShieldQuestion, items: items.filter(item => item.status === 'blocked') },
    { key: 'awaiting_approval', title: 'Aguardando aprovação', description: 'Dependem de uma decisão registrada na origem.', icon: CalendarClock, items: items.filter(item => item.status === 'awaiting_approval') },
    { key: 'upcoming', title: 'Próximas', description: 'Trabalho futuro já programado.', icon: CalendarClock, items: regular.filter(item => !item.dueAt || new Date(item.dueAt) >= end) },
  ]
}

function sourceLabel(sourceType: WorkItem['sourceType']) {
  if (sourceType === 'crm_task') return 'CRM'
  if (sourceType === 'project_task') return 'Projeto'
  return 'Missão'
}

function sourceHref(item: WorkItem, portalPath: (href?: string) => string) {
  if (item.missionId) return portalPath(`/portal/missoes/${item.missionId}`)
  if (item.sourceType === 'project_task') return portalPath(`/portal/projetos/projetos?taskId=${item.sourceId}`)
  return portalPath(`/portal/comercial/tarefas?sourceType=${item.sourceType}&sourceId=${item.sourceId}`)
}
