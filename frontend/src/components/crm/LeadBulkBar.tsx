import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/apiClient'
import { requestLeadDeletion } from '@/lib/crm/leadDeletionEvents'
import { automationSequenceService } from '@/services/automationSequenceService'
import type { AutomationSequence } from '@/types/automationSequence'
import type { CrmLead, CrmPipeline } from '@/types/crm'

type BulkAction = 'move_stage' | 'enroll_sequence' | 'pause_sequences'
type BulkResult = { done: number; skipped: number; failed: number }

/** Actions that work for one lead also work for the selection (up to 100). */
export function LeadBulkBar({
  selected,
  stages,
  onClear,
}: {
  selected: CrmLead[]
  stages: CrmPipeline['stages']
  onClear: () => void
}) {
  const organizationId = selected[0]?.organizationId || ''
  const [action, setAction] = useState<BulkAction | ''>('')
  const [target, setTarget] = useState('')
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const deletable = selected.filter((lead) => lead.canDelete)

  useEffect(() => {
    if (action !== 'enroll_sequence' || !organizationId) return
    let active = true
    automationSequenceService
      .getSequences(organizationId)
      .then((rows) => {
        if (active) setSequences(rows.filter((sequence) => sequence.status === 'active'))
      })
      .catch(() => {
        if (active) setFeedback('Não foi possível carregar as sequências.')
      })
    return () => {
      active = false
    }
  }, [action, organizationId])

  const apply = async () => {
    if (!action || (action !== 'pause_sequences' && !target)) return
    setBusy(true)
    setFeedback('')
    try {
      const result = await apiRequest<BulkResult>('/crm/leads/bulk', {
        method: 'POST',
        body: {
          action,
          organizationId,
          leadIds: selected.map((lead) => lead.id),
          ...(action === 'move_stage' ? { stageId: target } : {}),
          ...(action === 'enroll_sequence' ? { sequenceId: target } : {}),
        },
      })
      const parts = [`${result.done} concluído(s)`]
      if (result.skipped) parts.push(`${result.skipped} já estavam assim`)
      if (result.failed) parts.push(`${result.failed} não puderam ser alterados`)
      setFeedback(parts.join(' · '))
      window.dispatchEvent(new Event('crm-leads-changed'))
      if (!result.failed) {
        setAction('')
        setTarget('')
        onClear()
      }
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Não foi possível aplicar a ação.')
    } finally {
      setBusy(false)
    }
  }

  if (!selected.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ações em massa">
      <span className="text-sm font-medium">{selected.length} selecionado(s)</span>
      <select
        aria-label="Ação em massa"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={action}
        disabled={busy}
        onChange={(event) => {
          setAction(event.target.value as BulkAction | '')
          setTarget('')
          setFeedback('')
        }}
      >
        <option value="">Escolher ação…</option>
        <option value="move_stage">Mover para etapa</option>
        <option value="enroll_sequence">Inscrever em sequência</option>
        <option value="pause_sequences">Pausar sequências</option>
      </select>
      {action === 'move_stage' && (
        <select
          aria-label="Etapa de destino"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={target}
          disabled={busy}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">Etapa…</option>
          {(stages || []).map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      )}
      {action === 'enroll_sequence' && (
        <select
          aria-label="Sequência"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={target}
          disabled={busy}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">{sequences.length ? 'Sequência…' : 'Nenhuma sequência ativa'}</option>
          {sequences.map((sequence) => (
            <option key={sequence.id} value={sequence.id}>
              {sequence.name}
            </option>
          ))}
        </select>
      )}
      {action && (
        <Button size="sm" disabled={busy || (action !== 'pause_sequences' && !target)} onClick={() => void apply()}>
          {busy ? 'Aplicando…' : 'Aplicar'}
        </Button>
      )}
      {deletable.length > 0 && (
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => requestLeadDeletion(deletable)}>
          Excluir {deletable.length}
        </Button>
      )}
      {feedback && <span className="text-sm text-muted-foreground" role="status">{feedback}</span>}
    </div>
  )
}
