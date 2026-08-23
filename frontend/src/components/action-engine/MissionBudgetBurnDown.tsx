import { AlertTriangle, CircleDollarSign } from 'lucide-react'
import { formatBrl } from '@/lib/action-engine/missionRules'
import type { MissionBudgetBurnDown as Budget } from '@/types/actionEngine'

export function MissionBudgetBurnDown({ budget }: { budget: Budget }) {
  const percent = Math.max(0, Math.min(100, Number(budget.consumedPercent)))
  const tone = percent >= 95 ? 'bg-red-600' : percent >= 80 ? 'bg-amber-500' : 'bg-blue-600'
  return <section className="border border-slate-200 bg-white">
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Orçamento da missão</h2><p className="mt-1 text-xs text-slate-500">Realizado + valores reservados para ações pendentes.</p></div><CircleDollarSign className="h-5 w-5 text-blue-600" /></div>
    <div className="space-y-4 p-5"><div className="grid grid-cols-3 gap-3"><Fact label="Consumido" value={formatBrl(budget.consumedCostBrl)} /><Fact label="Restante" value={formatBrl(budget.remainingCostBrl)} /><Fact label="Teto" value={formatBrl(budget.maximumCostBrl)} /></div>
      <div><div className="mb-2 flex justify-between text-xs font-semibold text-slate-600"><span>{Number(budget.consumedPercent).toFixed(1)}% consumido</span><span>versão {budget.envelopeVersion}</span></div><div className="relative h-3 overflow-hidden bg-slate-100"><div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />{[50, 80, 95].map(mark => <span key={mark} className="absolute top-0 h-full w-px bg-slate-600/50" style={{ left: `${mark}%` }} />)}</div></div>
      {budget.alertThresholds.length ? <p className={`flex items-center gap-2 text-xs font-semibold ${percent >= 95 ? 'text-red-700' : 'text-amber-700'}`}><AlertTriangle className="h-4 w-4" /> Alertas emitidos em {budget.alertThresholds.join('%, ')}% do teto.</p> : <p className="text-xs text-slate-500">Próximo alerta: {budget.nextAlertThreshold ?? 100}%.</p>}
    </div>
  </section>
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div> }
