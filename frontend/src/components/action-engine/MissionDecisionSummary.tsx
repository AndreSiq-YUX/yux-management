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
  const radarResearch = summary.changes.some(change => change.label === 'radar › capture › start')
  const contactText = summary.contactImpact.existingContacts > 0
    ? `${summary.contactImpact.existingContacts} contato(s) existente(s)`
    : 'Nenhum contato existente nesta etapa'
  return (
    <section aria-labelledby="mission-decision-title" className="border border-yx-line-strong bg-yx-surface shadow-sm">
      <div className="border-b border-yx-line-strong bg-yx-blue-soft px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-yx-blue">Sua decisão</p>
        <h2 id="mission-decision-title" className="mt-1 text-lg font-semibold text-yx-fg">Revise o que a missão fará</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-yx-fg-2">{summary.headline}</p>
      </div>

      <div className="grid gap-5 p-5">
        <div>
          <h3 className="text-sm font-semibold text-yx-fg">O que será alterado</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.changes.map((change, index) => (
              <div key={`${change.entityType}:${change.operation}:${index}`} className="border border-yx-line bg-yx-surface-2 p-3">
                <p className="text-2xl font-semibold text-yx-blue">{change.quantity}</p>
                <p className="mt-1 text-sm font-medium text-yx-fg">{commercialChangeLabel(change.label)}</p>
              </div>
            ))}
          </div>
        </div>

        {radarResearch ? <p className="rounded-lg border border-yx-line bg-yx-blue-soft p-3 text-sm text-yx-fg-2">Esta decisão aprova o plano. A pesquisa de empresas terá uma aprovação específica antes de começar. Salvar a campanha não inicia a pesquisa nem envia mensagens.</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Fact icon={Users} label="Pessoas impactadas" value={contactText} detail={summary.contactImpact.futureEligibleContacts ? 'Novos contatos elegíveis poderão entrar depois.' : 'A população ficará restrita aos contatos atuais.'} />
          <Fact icon={Coins} label="Custo estimado" value={formatBrl(summary.economics.estimatedCostBrl)} detail={`Teto absoluto: ${formatBrl(summary.economics.maximumCostBrl)}`} />
          <Fact icon={Clock3} label="Trabalho humano" value={`${summary.economics.estimatedHumanMinutes} min estimados`} detail={`Canais: ${humanizeChannels(summary.contactImpact.channels)}`} />
        </div>

        {summary.irreversibleEffects.length > 0 ? (
          <div role="alert" className="border border-yx-crit-line bg-yx-crit-soft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-yx-crit"><AlertTriangle className="h-4 w-4" /> Efeitos que não podem ser desfeitos</div>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-yx-crit">{summary.irreversibleEffects.map(effect => <li key={effect.capabilityKey}>• {effect.description}</li>)}</ul>
          </div>
        ) : null}

        {summary.assumptions.length > 0 ? (
          <div className="border border-yx-warn-line bg-yx-warn-soft p-4">
            <h3 className="text-sm font-semibold text-yx-warn">Premissas usadas no plano</h3>
            <ul className="mt-2 space-y-1 text-sm text-yx-warn">{summary.assumptions.map(item => <li key={item.key}>{humanizeKey(item.key)}: <strong>{item.value}</strong> <span className="text-xs font-normal">({sourceLabel[item.source]})</span></li>)}</ul>
          </div>
        ) : null}

        {!subjectCurrent ? <p role="alert" className="border border-yx-warn-line bg-yx-warn-soft p-3 text-sm font-medium text-yx-warn">O plano mudou desde que esta decisão foi aberta. Recarregue e revise a nova versão antes de aprovar.</p> : null}
        {canApprove ? (
          <button type="button" disabled={busy || !subjectCurrent} onClick={onApprove} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-yx-ok px-5 py-3 text-sm font-semibold text-white hover:bg-yx-ok disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit">
            <Check className="h-4 w-4" /> Li os impactos e aprovo este plano
          </button>
        ) : <p className="text-sm text-yx-fg-2">Seu perfil pode revisar esta decisão, mas não autorizar a execução.</p>}
      </div>
    </section>
  )
}

function commercialChangeLabel(label: string) {
  return ({
    'radar › campaign › create': 'Criar ou selecionar campanha de prospecção',
    'radar › capture › start': 'Solicitar pesquisa de empresas no Radar',
  } as Record<string, string>)[label] ?? label
}

function Fact({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <div className="border border-yx-line p-4"><Icon className="h-4 w-4 text-yx-blue" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-yx-fg-3">{label}</p><p className="mt-1 text-sm font-semibold text-yx-fg">{value}</p><p className="mt-1 text-xs leading-5 text-yx-fg-3">{detail}</p></div>
}

const sourceLabel = { company_context: 'Contexto da Empresa', user: 'informado por você', pack_default: 'padrão recomendado' }
function humanizeKey(value: string) { return value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase()) }
function humanizeChannels(channels: string[]) { return channels.length ? channels.map(channel => channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'e-mail' : humanizeKey(channel)).join(', ') : 'nenhum envio externo' }
