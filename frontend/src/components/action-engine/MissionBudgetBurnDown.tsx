import { AlertTriangle, CircleDollarSign } from 'lucide-react'
import { formatBrl } from '@/lib/action-engine/missionRules'
import type { MissionBudgetBurnDown as Budget } from '@/types/actionEngine'

export function MissionBudgetBurnDown({ budget }: { budget: Budget }) {
  const percent = Math.max(0, Math.min(100, Number(budget.consumedPercent)))
  const tone = percent >= 95 ? 'bg-yx-crit' : percent >= 80 ? 'bg-yx-warn' : 'bg-yx-blue'
  return <section className="border border-yx-line bg-yx-surface">
    <div className="flex items-start justify-between gap-4 border-b border-yx-line px-5 py-4"><div><h2 className="font-semibold text-yx-fg">Orçamento da missão</h2><p className="mt-1 text-xs text-yx-fg-3">Realizado + valores reservados para ações pendentes.</p></div><CircleDollarSign className="h-5 w-5 text-yx-blue" /></div>
    <div className="space-y-4 p-5"><div className="grid grid-cols-3 gap-3"><Fact label="Consumido" value={formatBrl(budget.consumedCostBrl)} /><Fact label="Restante" value={formatBrl(budget.remainingCostBrl)} /><Fact label="Teto" value={formatBrl(budget.maximumCostBrl)} /></div>
      <div><div className="mb-2 flex justify-between text-xs font-semibold text-yx-fg-2"><span>{Number(budget.consumedPercent).toFixed(1)}% consumido</span><span>versão {budget.envelopeVersion}</span></div><div className="relative h-3 overflow-hidden bg-yx-surface-2"><div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />{[50, 80, 95].map(mark => <span key={mark} className="absolute top-0 h-full w-px bg-yx-fg-3" style={{ left: `${mark}%` }} />)}</div></div>
      {budget.alertThresholds.length ? <p className={`flex items-center gap-2 text-xs font-semibold ${percent >= 95 ? 'text-yx-crit' : 'text-yx-warn'}`}><AlertTriangle className="h-4 w-4" /> Alertas emitidos em {budget.alertThresholds.join('%, ')}% do teto.</p> : <p className="text-xs text-yx-fg-3">Próximo alerta: {budget.nextAlertThreshold ?? 100}%.</p>}
    </div>
  </section>
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold uppercase tracking-wide text-yx-fg-3">{label}</p><p className="mt-1 text-sm font-semibold text-yx-fg">{value}</p></div> }
