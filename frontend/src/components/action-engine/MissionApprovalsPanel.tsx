import { useState } from 'react'
import { Check, Clock3, MessageSquare, X } from 'lucide-react'
import { MissionStatusBadge } from './MissionStatusBadge'
import { decisionReasonOptions } from '@/lib/action-engine/decisionFeedback'
import { approvalStatusLabel, approvalTypeLabel } from '@/lib/action-engine/missionRules'
import type { DecisionReasonKey, MissionApproval } from '@/types/actionEngine'

type ReviewState = { approvalId: string; decision: 'rejected' | 'changes_requested' }

export function MissionApprovalsPanel({ approvals, canWrite, busyApprovalId, onDecision }: {
  approvals: MissionApproval[]
  canWrite: boolean
  busyApprovalId?: string
  onDecision: (approval: MissionApproval, decision: 'approved' | 'rejected' | 'changes_requested', reasonKey?: DecisionReasonKey, comment?: string) => void
}) {
  const [review, setReview] = useState<ReviewState | null>(null)
  const [reasonKey, setReasonKey] = useState<DecisionReasonKey>('wrong_icp')
  const [comment, setComment] = useState('')

  function reset() { setReview(null); setReasonKey('wrong_icp'); setComment('') }
  function begin(approvalId: string, decision: ReviewState['decision']) { reset(); setReview({ approvalId, decision }) }
  function submit(approval: MissionApproval) {
    if (!review || (reasonKey === 'other' && comment.trim().length < 3)) return
    onDecision(approval, review.decision, reasonKey, comment.trim() || undefined)
  }

  return <section className="border border-yx-line bg-yx-surface">
    <div className="flex items-center justify-between border-b border-yx-line px-5 py-4">
      <div><h2 className="font-semibold text-yx-fg">Histórico de decisões</h2><p className="mt-1 text-xs text-yx-fg-3">Autorizações e recusas registradas para esta missão.</p></div>
      <span className="border border-yx-warn-line bg-yx-warn-soft px-2 py-1 text-xs font-semibold text-yx-warn">{approvals.filter(item => item.status === 'pending').length} pendentes</span>
    </div>
    {approvals.length === 0 ? <p className="p-5 text-sm text-yx-fg-3">Nenhuma aprovação registrada.</p> : <div className="divide-y divide-yx-line">{approvals.map(approval => {
      const isPlan = approval.approvalType === 'plan' || approval.approvalType === 'replan'
      const reviewing = review?.approvalId === approval.id
      return <article key={approval.id} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-yx-fg"><Clock3 className="h-4 w-4 text-yx-warn" /> {approvalTypeLabel[approval.approvalType] ?? approval.approvalType}</div>{typeof approval.requestedPayload?.decisionSummary === 'object' && approval.requestedPayload.decisionSummary ? <p className="mt-1 text-xs text-yx-fg-3">{String(Reflect.get(approval.requestedPayload.decisionSummary, 'headline') ?? 'Plano revisável')}</p> : null}</div><MissionStatusBadge label={approvalStatusLabel[approval.status] ?? approval.status} tone={approval.status === 'approved' ? 'success' : approval.status === 'pending' ? 'warning' : approval.status === 'rejected' ? 'danger' : 'neutral'} /></div>
        <RadarApprovalPreview value={approval.requestedPayload?.commercialPreview} />
        {canWrite && approval.status === 'pending' ? <div className="mt-3 space-y-3">{!reviewing ? <div className="flex flex-wrap gap-2">
          {!isPlan ? <button disabled={busyApprovalId === approval.id} onClick={() => onDecision(approval, 'approved')} className="inline-flex h-8 items-center gap-1 bg-yx-ok px-3 text-xs font-semibold text-white"><Check className="h-3 w-3" /> Aprovar</button> : null}
          <button disabled={busyApprovalId === approval.id} onClick={() => begin(approval.id, 'changes_requested')} className="inline-flex h-8 items-center gap-1 border border-yx-warn-line px-3 text-xs font-semibold text-yx-warn"><MessageSquare className="h-3 w-3" /> Solicitar mudanças</button>
          <button disabled={busyApprovalId === approval.id} onClick={() => begin(approval.id, 'rejected')} className="inline-flex h-8 items-center gap-1 border border-yx-crit-line px-3 text-xs font-semibold text-yx-crit"><X className="h-3 w-3" /> Rejeitar</button>
        </div> : <div className="border border-yx-line bg-yx-surface-2 p-3">
          <p className="text-xs font-semibold text-yx-fg">Por que esta proposta precisa mudar?</p>
          <select aria-label="Motivo da decisão" value={reasonKey} onChange={event => setReasonKey(event.target.value as DecisionReasonKey)} className="mt-2 h-9 w-full border border-yx-line-strong bg-yx-surface px-2 text-xs">{decisionReasonOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <label className="mt-3 block text-xs font-medium text-yx-fg-2">{reasonKey === 'other' ? 'Explique o motivo (obrigatório)' : 'Comentário adicional (opcional)'}<textarea aria-label="Comentário da decisão" value={comment} onChange={event => setComment(event.target.value)} className="mt-1 min-h-20 w-full border border-yx-line-strong bg-yx-surface p-2" /></label>
          <div className="mt-3 flex gap-2"><button disabled={busyApprovalId === approval.id || (reasonKey === 'other' && comment.trim().length < 3)} onClick={() => submit(approval)} className="h-8 bg-yx-blue px-3 text-xs font-semibold text-white disabled:opacity-50">Confirmar decisão</button><button onClick={reset} className="h-8 px-3 text-xs font-semibold text-yx-fg-2">Cancelar</button></div>
        </div>}</div> : null}
      </article>
    })}</div>}
  </section>
}

function RadarApprovalPreview({value}:{value:unknown}){
  if(!value||typeof value!=='object')return null
  const preview=value as Record<string,unknown>
  const regions=Array.isArray(preview.targetStates)?preview.targetStates.filter(v=>typeof v==='string').join(', '):''
  return <div className="mt-3 space-y-1 border border-yx-line bg-yx-surface-2 p-3 text-sm">
    <p className="font-semibold">{typeof preview.campaignName==='string'?preview.campaignName:'Pesquisa no Radar'}</p>
    <p>{typeof preview.requestedCount==='number'?`${preview.requestedCount} empresas`:null}{regions?` · ${regions}`:null}</p>
    <p className="text-xs text-yx-fg-3">Configuração {String(preview.configurationRevision??'—')} · Critérios {String(preview.criteriaRevision??'—')}</p>
    {typeof preview.maximumBudgetBrl==='string'?<p className="text-xs">Limite autorizado: {Number(preview.maximumBudgetBrl).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>:null}
  </div>
}
