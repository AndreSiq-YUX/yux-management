import { CalendarDays, CheckCircle2, Coins, Users } from 'lucide-react'
import type { MissionConversationBrief } from '@/types/actionEngine'

export function MissionBriefCard({ brief, onConfirm, disabled }: { brief: MissionConversationBrief; onConfirm?: () => void; disabled?: boolean }) {
  const title = brief.title || 'Resumo do pedido'
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-yx-line-strong bg-yx-blue-soft" aria-label="Briefing da missão">
      <div className="border-b border-yx-line-strong bg-white/70 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-yx-blue">O que entendi</p>
        <h3 className="mt-1 font-semibold text-yx-fg">{title}</h3>
        {brief.objective ? <p className="mt-1 text-sm leading-6 text-yx-fg-2">{brief.objective}</p> : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {brief.requestedOutcome ? <BriefFact icon={CheckCircle2} label="Resultado" value={brief.requestedOutcome} /> : null}
        {brief.deadlineAt ? <BriefFact icon={CalendarDays} label="Prazo" value={new Date(brief.deadlineAt).toLocaleDateString('pt-BR')} /> : null}
        {brief.maxTotalCostBrl ? <BriefFact icon={Coins} label="Custo máximo" value={formatBrl(brief.maxTotalCostBrl)} /> : null}
        {brief.maxExternalContacts != null ? <BriefFact icon={Users} label="Contatos" value={`Até ${brief.maxExternalContacts}`} /> : null}
      </div>
      {brief.scopeHints?.length ? <div className="flex flex-wrap gap-2 border-t border-yx-line-strong px-4 py-3">{brief.scopeHints.map(item => <span className="rounded-full bg-yx-surface px-2.5 py-1 text-xs font-medium text-yx-fg-2" key={item}>{item}</span>)}</div> : null}
      {onConfirm ? <div className="border-t border-yx-line-strong bg-white/70 p-4"><button className="w-full rounded-lg bg-yx-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-yx-blue-ink disabled:bg-yx-line-strong" disabled={disabled} onClick={onConfirm} type="button">Confirmar e preparar plano</button></div> : null}
    </section>
  )
}

function BriefFact({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: string }) {
  return <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-yx-blue" /><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-yx-fg-3">{label}</p><p className="mt-0.5 text-sm font-medium text-yx-fg-2">{value}</p></div></div>
}

function formatBrl(value: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}
