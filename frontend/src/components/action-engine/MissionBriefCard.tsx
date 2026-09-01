import { CalendarDays, CheckCircle2, Coins, Users } from 'lucide-react'
import type { MissionConversationBrief } from '@/types/actionEngine'

export function MissionBriefCard({ brief, onConfirm, disabled }: { brief: MissionConversationBrief; onConfirm?: () => void; disabled?: boolean }) {
  const title = brief.title || 'Resumo do pedido'
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60" aria-label="Briefing da missão">
      <div className="border-b border-blue-100 bg-white/70 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">O que entendi</p>
        <h3 className="mt-1 font-semibold text-slate-950">{title}</h3>
        {brief.objective ? <p className="mt-1 text-sm leading-6 text-slate-600">{brief.objective}</p> : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {brief.requestedOutcome ? <BriefFact icon={CheckCircle2} label="Resultado" value={brief.requestedOutcome} /> : null}
        {brief.deadlineAt ? <BriefFact icon={CalendarDays} label="Prazo" value={new Date(brief.deadlineAt).toLocaleDateString('pt-BR')} /> : null}
        {brief.maxTotalCostBrl ? <BriefFact icon={Coins} label="Custo máximo" value={formatBrl(brief.maxTotalCostBrl)} /> : null}
        {brief.maxExternalContacts != null ? <BriefFact icon={Users} label="Contatos" value={`Até ${brief.maxExternalContacts}`} /> : null}
      </div>
      {brief.scopeHints?.length ? <div className="flex flex-wrap gap-2 border-t border-blue-100 px-4 py-3">{brief.scopeHints.map(item => <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600" key={item}>{item}</span>)}</div> : null}
      {onConfirm ? <div className="border-t border-blue-100 bg-white/70 p-4"><button className="w-full rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300" disabled={disabled} onClick={onConfirm} type="button">Confirmar e preparar plano</button></div> : null}
    </section>
  )
}

function BriefFact({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: string }) {
  return <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-0.5 text-sm font-medium text-slate-700">{value}</p></div></div>
}

function formatBrl(value: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}
