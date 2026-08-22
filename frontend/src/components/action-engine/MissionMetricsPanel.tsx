import { Activity, CircleDollarSign, MessageSquare, PhoneCall, UserRoundCheck } from 'lucide-react'
import { formatMetric } from '@/lib/action-engine/missionRules'
import type { MissionMetrics } from '@/types/actionEngine'

const keys = [
  { key: 'signed_revenue', label: 'Receita recuperada', icon: CircleDollarSign },
  { key: 'contacted_opportunities', label: 'Oportunidades contatadas', icon: PhoneCall },
  { key: 'positive_responses', label: 'Respostas positivas', icon: MessageSquare },
  { key: 'meetings_booked', label: 'Reuniões', icon: UserRoundCheck },
  { key: 'human_hours', label: 'Horas humanas', icon: Activity },
] as const

export function MissionMetricsPanel({ metrics }: { metrics: MissionMetrics }) {
  return <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Resultados observados</h2><p className="mt-1 text-xs text-slate-500">Unknown continua unknown; a interface não inventa zeros.</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-5">{keys.map(({ key, label, icon: Icon }) => <div key={key} className="border-b border-slate-200 p-4 sm:border-r xl:border-b-0"><Icon className="h-4 w-4 text-[#2563EB]" /><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatMetric(metrics[key])}</p></div>)}</div></section>
}
