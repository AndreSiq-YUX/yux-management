import { AlertTriangle, CheckCircle2, Clock3, MessageCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMissionOutcome } from '@/lib/action-engine/missionRules'
import type { ActionMission, MissionActivityItem, MissionApproval } from '@/types/actionEngine'

export function MissionNowCard({ mission, activity, approvals, conversationHref }: {
  mission: ActionMission
  activity: MissionActivityItem[]
  approvals: MissionApproval[]
  conversationHref?: string
}) {
  const pending = approvals.filter(item => item.status === 'pending')
  const latest = activity[activity.length - 1]
  const now = nowCopy(mission, pending.length, latest)
  const Icon = now.tone === 'success' ? CheckCircle2 : now.tone === 'warning' ? AlertTriangle : now.tone === 'active' ? Sparkles : Clock3
  const understood = mission.goal.scopeHints.length
    ? mission.goal.scopeHints.map(humanize).join(' · ')
    : formatMissionOutcome(mission.goal.requestedOutcome)
  return (
    <section aria-labelledby="mission-now-title" className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-violet-50">
      <div className="grid gap-px bg-blue-100 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
        <div className="bg-white/90 p-5 sm:p-6">
          <div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${toneClass[now.tone]}`}><Icon className={`h-5 w-5 ${now.tone === 'active' ? 'animate-pulse' : ''}`} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Acontecendo agora</p><h2 id="mission-now-title" className="mt-1 text-lg font-semibold text-slate-950">{now.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{now.description}</p></div></div>
          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2"><Fact label="O que você pediu" value={mission.goal.statement || mission.objective} /><Fact label="O que o agente entendeu" value={understood} /></div>
        </div>
        <aside className="bg-white/90 p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Sua próxima decisão</p>{pending.length ? <><p className="mt-2 font-semibold text-slate-950">{pending.length === 1 ? 'Há uma aprovação aguardando você.' : `${pending.length} aprovações aguardam você.`}</p><p className="mt-2 text-sm leading-6 text-slate-600">Revise os impactos antes de permitir que a missão avance.</p></> : <><p className="mt-2 font-semibold text-slate-950">Nenhuma decisão pendente agora.</p><p className="mt-2 text-sm leading-6 text-slate-600">Você pode acompanhar o trabalho pela linha do tempo abaixo.</p></>}{conversationHref ? <Link className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900" to={conversationHref}><MessageCircle className="h-4 w-4" />Ver conversa com o agente</Link> : null}</aside>
      </div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-1.5 text-sm leading-6 text-slate-700">{value}</p></div> }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase()) }
function nowCopy(mission: ActionMission, pending: number, latest?: MissionActivityItem) {
  if (pending) return { tone: 'warning' as const, title: 'O plano está pronto para sua decisão.', description: 'Confira o que será criado, os custos e os efeitos que não podem ser desfeitos.' }
  if (mission.status === 'planning' || mission.status === 'qualifying') return { tone: 'active' as const, title: 'O agente está preparando um plano seguro.', description: 'Estratégia YUX, contexto da empresa e ferramentas contratadas estão sendo verificados.' }
  if (mission.status === 'active' || mission.status === 'evaluating') return { tone: 'active' as const, title: latest?.title ?? 'A missão está em execução.', description: latest?.description ?? 'As etapas autorizadas estão sendo executadas e registradas.' }
  if (mission.status === 'blocked' || mission.status === 'failed') return { tone: 'warning' as const, title: 'A missão precisa de atenção.', description: latest?.description ?? 'Consulte a linha do tempo para entender o bloqueio e como corrigir.' }
  if (mission.status === 'succeeded') return { tone: 'success' as const, title: 'A missão foi concluída.', description: 'Os entregáveis e resultados disponíveis estão organizados abaixo.' }
  if (mission.status === 'paused') return { tone: 'warning' as const, title: 'A missão está pausada.', description: 'Nenhuma nova ação será iniciada até a retomada.' }
  return { tone: 'info' as const, title: latest?.title ?? 'O pedido foi recebido.', description: latest?.description ?? 'O próximo passo aparecerá aqui assim que estiver disponível.' }
}
const toneClass = { info: 'bg-slate-100 text-slate-600', active: 'bg-blue-100 text-blue-700', warning: 'bg-amber-100 text-amber-700', success: 'bg-emerald-100 text-emerald-700' }
