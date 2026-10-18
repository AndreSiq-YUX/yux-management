import { CircleDollarSign, Gauge, Timer, TrendingUp } from 'lucide-react'
import { formatBrl } from '@/lib/action-engine/missionRules'
import type { MissionEconomics } from '@/types/actionEngine'

export function MissionEconomicsPanel({ economics }: { economics: MissionEconomics | null }) {
  if (!economics) return null
  const items = [
    { label: 'Valor produzido', value: formatBrl(economics.producedValueBrl), icon: CircleDollarSign, visible: true },
    { label: 'Custo total', value: formatBrl(economics.totalExecutionCostBrl), icon: Timer, visible: economics.totalExecutionCostBrl !== undefined },
    { label: 'Valor / custo', value: ratio(economics.valueCostRatio), icon: TrendingUp, visible: economics.valueCostRatio !== undefined },
    { label: 'Execução sem humano', value: percent(economics.humanFreeExecutionRate), icon: Gauge, visible: true },
  ].filter(item => item.visible)
  return <section className="border border-yx-line bg-yx-surface"><div className="border-b border-yx-line px-5 py-4"><h2 className="font-semibold text-yx-fg">Economia da missão</h2><p className="mt-1 text-xs text-yx-fg-3">Valor, custo total e grau de productização.</p></div><div className={`grid ${items.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>{items.map(({ label, value, icon: Icon }) => <div key={label} className="border-b border-yx-line p-5 sm:border-r xl:border-b-0"><Icon className="h-5 w-5 text-brand-violet-500" /><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-yx-fg-3">{label}</p><p className="mt-2 text-xl font-semibold text-yx-fg">{value}</p></div>)}</div></section>
}

function ratio(value?: string) { return !value || value === 'not_applicable' ? '—' : `${Number(value).toFixed(2)}x` }
function percent(value?: string) { return !value || value === 'not_applicable' ? '—' : `${(Number(value) * 100).toFixed(0)}%` }
