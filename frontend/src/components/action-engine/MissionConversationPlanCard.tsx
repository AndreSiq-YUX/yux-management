import { useState } from 'react'
import { AlertTriangle, BookOpen, Check, PencilLine } from 'lucide-react'
import { MissionDecisionSummary } from './MissionDecisionSummary'
import type { DecisionReasonKey, MissionConversationMessagePayload, MissionConversationPlanReference as PlanReference, MissionDecisionSummary as DecisionSummary } from '@/types/actionEngine'

export function MissionConversationPlanCard({ payload, canApprove, busy, onApprove, onRequestChanges }: {
  payload: MissionConversationMessagePayload
  canApprove: boolean
  busy: boolean
  onApprove: (reference: PlanReference) => void
  onRequestChanges: (reference: PlanReference, reasonKey: DecisionReasonKey, comment?: string) => void
}) {
  const reference = readPlanReference(payload)
  const [editing, setEditing] = useState(false)
  const [reasonKey, setReasonKey] = useState<DecisionReasonKey>('scope_too_broad')
  const [comment, setComment] = useState('')
  if (!reference) return <div className="mt-4 rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3 text-sm text-yx-warn"><AlertTriangle className="mr-2 inline h-4 w-4" />O plano precisa ser recarregado para uma revisão segura.</div>
  return (
    <div className="mt-4 space-y-3">
      <MissionDecisionSummary summary={reference.decisionSummary} approvalSubjectHash={reference.subjectHash} canApprove={canApprove} busy={busy} onApprove={() => onApprove(reference)} />
      {reference.sources.length ? <div className="flex items-center gap-2 text-xs text-yx-fg-3"><BookOpen className="h-3.5 w-3.5" />{reference.sources.length} fonte(s) verificadas sustentam este plano.</div> : null}
      {canApprove ? <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">{editing ? <div className="space-y-3"><label className="block text-xs font-semibold text-yx-fg-2">O que precisa mudar?<select className="mt-1.5 h-10 w-full rounded-md border border-yx-line bg-yx-surface px-3 text-sm" value={reasonKey} onChange={event => setReasonKey(event.target.value as DecisionReasonKey)}><option value="scope_too_broad">Escopo amplo demais</option><option value="scope_too_narrow">Escopo limitado demais</option><option value="wrong_icp">Público incorreto</option><option value="wrong_tone">Tom incorreto</option><option value="cost_too_high">Custo alto demais</option><option value="channel_wrong">Canal inadequado</option><option value="timing_wrong">Momento inadequado</option><option value="other">Outro motivo</option></select></label><textarea aria-label="Detalhes das alterações" className="min-h-20 w-full rounded-md border border-yx-line bg-yx-surface p-3 text-sm" onChange={event => setComment(event.target.value)} placeholder="Explique ao agente o que deve ser ajustado…" value={comment} /><div className="flex gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-md bg-yx-blue px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={busy || (reasonKey === 'other' && comment.trim().length < 3)} onClick={() => onRequestChanges(reference, reasonKey, comment.trim() || undefined)} type="button"><Check className="h-3.5 w-3.5" />Enviar alterações</button><button className="h-9 px-3 text-xs font-semibold text-yx-fg-2" onClick={() => setEditing(false)} type="button">Cancelar</button></div></div> : <button className="inline-flex items-center gap-2 text-xs font-semibold text-yx-fg-2 hover:text-yx-blue" onClick={() => setEditing(true)} type="button"><PencilLine className="h-3.5 w-3.5" />Pedir alterações no plano</button>}</div> : null}
    </div>
  )
}

function readPlanReference(payload: MissionConversationMessagePayload): PlanReference | null {
  const summary = payload.decisionSummary
  if (!summary || typeof summary !== 'object') return null
  const candidate = summary as Partial<DecisionSummary>
  if (!Array.isArray(candidate.changes) || !candidate.contactImpact || !candidate.economics || !candidate.technicalProof || !Array.isArray(candidate.irreversibleEffects) || !Array.isArray(candidate.assumptions) || typeof candidate.headline !== 'string' || typeof candidate.decisionSubjectHash !== 'string') return null
  if (typeof payload.planId !== 'string' || typeof payload.approvalId !== 'string' || typeof payload.subjectHash !== 'string' || typeof payload.missionVersion !== 'number') return null
  return { planId: payload.planId, approvalId: payload.approvalId, subjectHash: payload.subjectHash, missionVersion: payload.missionVersion, decisionSummary: candidate as DecisionSummary, sources: Array.isArray(payload.sources) ? payload.sources.filter((item): item is string => typeof item === 'string') : [] }
}
