import { ArrowRight, Bot, CircleDollarSign, Clock3, Gauge, Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MissionStatusBadge } from './MissionStatusBadge'
import { formatBrl, formatMissionDate, missionStatusMeta } from '@/lib/action-engine/missionRules'
import type { ActionMission, MissionEconomics } from '@/types/actionEngine'

type MissionDashboardProps = {
  missions: ActionMission[]
  economicsByMission?: Record<string, MissionEconomics>
  detailHref: (missionId: string) => string
  canCreate: boolean
  onCreate: () => void
}

export function MissionDashboard({ missions, economicsByMission = {}, detailHref, canCreate, onCreate }: MissionDashboardProps) {
  const active = missions.filter(mission => ['active', 'planning', 'ready', 'pending_plan_approval', 'evaluating'].includes(mission.status)).length
  const pending = missions.filter(mission => mission.status.includes('approval')).length
  const produced = missions.reduce((sum, mission) => sum + Number(economicsByMission[mission.id]?.producedValueBrl ?? 0), 0)
  const completed = missions.filter(mission => mission.status === 'succeeded').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#2563EB]"><ShieldCheck className="h-4 w-4" /> Action Engine</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Missões</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Objetivos de receita transformados em execução governada, mensurável e reutilizável.</p>
        </div>
        {canCreate && <button onClick={onCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Nova missão</button>}
      </header>

      <section className="grid border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CircleDollarSign} label="Valor produzido" value={formatBrl(String(produced))} detail="Receita confirmada nas missões" tone="green" />
        <Metric icon={Bot} label="Missões ativas" value={String(active)} detail={`${completed} ${completed === 1 ? 'concluída' : 'concluídas'}`} />
        <Metric icon={Clock3} label="Aprovações" value={String(pending)} detail="Decisões pendentes" tone="amber" />
        <Metric icon={Gauge} label="Pack operacional" value="v0" detail="Revenue Recovery protegido" tone="violet" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-semibold text-slate-950">Portfólio de missões</h2><p className="mt-1 text-xs text-slate-500">Execução, prazo, target e pack em um só lugar.</p></div>
          <span className="text-xs font-semibold text-slate-500">{missions.length} no total</span>
        </div>
        {missions.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><ShieldCheck className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">Nenhuma missão criada</h3><p className="mt-2 text-sm text-slate-500">Descreva o resultado desejado ou comece por um dos packs disponíveis.</p>{canCreate ? <button type="button" onClick={onCreate} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Criar primeira missão</button> : null}</div></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {missions.map(mission => {
              const meta = missionStatusMeta[mission.status]
              return (
                <Link key={mission.id} to={detailHref(mission.id)} className="grid gap-4 px-5 py-4 transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(260px,1.5fr)_1fr_1fr_1fr_auto] lg:items-center">
                  <div><h3 className="font-semibold text-slate-950">{mission.title}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-500">{mission.objective}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Pack</p><p className="mt-1 text-sm font-medium text-slate-700">Revenue Recovery v0</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Target</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatBrl(mission.parameters.targetRevenueBrl)}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Prazo</p><p className="mt-1 text-sm text-slate-700">{formatMissionDate(mission.deadlineAt)}</p></div>
                  <div className="flex items-center justify-between gap-3 lg:justify-end"><MissionStatusBadge {...meta} /><ArrowRight className="h-4 w-4 text-slate-400" /></div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, tone = 'blue' }: { icon: typeof Bot; label: string; value: string; detail: string; tone?: 'blue' | 'green' | 'amber' | 'violet' }) {
  const color = { blue: 'text-blue-600 bg-blue-50', green: 'text-emerald-700 bg-emerald-50', amber: 'text-amber-700 bg-amber-50', violet: 'text-violet-700 bg-violet-50' }[tone]
  return <article className="flex min-h-32 items-center gap-4 border-b border-slate-200 p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"><span className={`grid h-10 w-10 place-items-center ${color}`}><Icon className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div></article>
}
