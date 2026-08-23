import { AlertTriangle, Check, Clock3, Coins, Users } from 'lucide-react'
import { formatBrl } from '@/lib/action-engine/missionRules'
import type { MissionApproval, MissionDecisionSummary as DecisionSummary } from '@/types/actionEngine'

export function readDecisionSummary(approval: MissionApproval | undefined): DecisionSummary | null {
  const value = approval?.requestedPayload?.decisionSummary
  if (!value || typeof value !== 'object') return null
  const summary = value as Partial<DecisionSummary>
  if (
    typeof summary.headline !== 'string'
    || !Array.isArray(summary.changes)
    || !summary.contactImpact
    || !summary.economics
    || !Array.isArray(summary.irreversibleEffects)
    || !Array.isArray(summary.assumptions)
    || !summary.technicalProof
    || typeof summary.decisionSubjectHash !== 'string'
  ) return null
  return summary as DecisionSummary
}

export function MissionDecisionSummary({ summary, approvalSubjectHash, canApprove, busy, onApprove }: {
  summary: DecisionSummary
  approvalSubjectHash: string
  canApprove: boolean
  busy: boolean
  onApprove: () => void
}) {
  const subjectCurrent = summary.decisionSubjectHash === approvalSubjectHash
  const contactText = summary.contactImpact.existingContacts > 0
    ? `${summary.contactImpact.existingContacts} contato(s) existente(s)`
    : 'Nenhum contato existente nesta etapa'
  return (
    <section aria-labelledby="mission-decision-title" className="border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Sua decisão</p>
        <h2 id="mission-decision-title" className="mt-1 text-lg font-semibold text-slate-950">Revise o que a missão fará</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{summary.headline}</p>
      </div>

      <div className="grid gap-5 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">O que será alterado</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.changes.map((change, index) => (
              <div key={`${change.entityType}:${change.operation}:${index}`} className="border border-slate-200 bg-slate-50 p-3">
                <p className="text-2xl font-semibold text-blue-700">{change.quantity}</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{change.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Fact icon={Users} label="Pessoas impactadas" value={contactText} detail={summary.contactImpact.futureEligibleContacts ? 'Novos contatos elegíveis poderão entrar depois.' : 'A população ficará restrita aos contatos atuais.'} />
          <Fact icon={Coins} label="Custo estimado" value={formatBrl(summary.economics.estimatedCostBrl)} detail={`Teto absoluto: ${formatBrl(summary.economics.maximumCostBrl)}`} />
          <Fact icon={Clock3} label="Trabalho humano" value={`${summary.economics.estimatedHumanMinutes} min estimados`} detail={`Canais: ${humanizeChannels(summary.contactImpact.channels)}`} />
        </div>

        {summary.irreversibleEffects.length > 0 ? (
          <div role="alert" className="border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-900"><AlertTriangle className="h-4 w-4" /> Efeitos que não podem ser desfeitos</div>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-red-800">{summary.irreversibleEffects.map(effect => <li key={effect.capabilityKey}>• {effect.description}</li>)}</ul>
          </div>
        ) : null}

        {summary.assumptions.length > 0 ? (
          <div className="border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-950">Premissas usadas no plano</h3>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">{summary.assumptions.map(item => <li key={item.key}>{humanizeKey(item.key)}: <strong>{item.value}</strong> <span className="text-xs font-normal">({sourceLabel[item.source]})</span></li>)}</ul>
          </div>
        ) : null}

        {!subjectCurrent ? <p role="alert" className="border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">O plano mudou desde que esta decisão foi aberta. Recarregue e revise a nova versão antes de aprovar.</p> : null}
        {canApprove ? (
          <button type="button" disabled={busy || !subjectCurrent} onClick={onApprove} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit">
            <Check className="h-4 w-4" /> Li os impactos e aprovo este plano
          </button>
        ) : <p className="text-sm text-slate-600">Seu perfil pode revisar esta decisão, mas não autorizar a execução.</p>}
      </div>
    </section>
  )
}

function Fact({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <div className="border border-slate-200 p-4"><Icon className="h-4 w-4 text-blue-600" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
}

const sourceLabel = { company_context: 'Contexto da Empresa', user: 'informado por você', pack_default: 'padrão do pack' }
function humanizeKey(value: string) { return value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase()) }
function humanizeChannels(channels: string[]) { return channels.length ? channels.map(channel => channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'e-mail' : humanizeKey(channel)).join(', ') : 'nenhum envio externo' }
