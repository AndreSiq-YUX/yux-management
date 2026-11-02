import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { crmService } from '@/services/crmService'
import type { CrmLead } from '@/types/crm'
export type LeadAction =
  | 'note'
  | 'email'
  | 'whatsapp'
  | 'call'
  | 'task'
  | 'meeting'
  | 'proposal'
export type ActivityKind = 'note' | 'call' | 'task' | 'meeting'
export function useLeadOperations({
  lead,
  onChanged,
}: {
  lead: CrmLead
  organizationId: string
  onChanged: () => void | Promise<void>
}) {
  const [action, setAction] = useState<LeadAction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const scope = useRef(lead.id),
    pending = useRef(false),
    requestId = useRef(crypto.randomUUID())
  useEffect(() => {
    scope.current = lead.id
    return () => {
      scope.current = ''
    }
  }, [lead.id])
  const changed = useCallback(async () => {
    window.dispatchEvent(new Event('crm-leads-changed'))
    await onChanged()
  }, [onChanged])
  const open = (value: LeadAction) => {
    setAction(value)
    setError('')
    setMessage('')
    requestId.current = crypto.randomUUID()
  }
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (pending.current) return false
    const id = lead.id
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
      if (scope.current !== id) return false
      setMessage(success)
      await changed()
      return true
    } catch (reason) {
      if (scope.current === id)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível concluir esta ação.',
        )
      return false
    } finally {
      pending.current = false
      if (scope.current === id) setBusy(false)
    }
  }
  const saveActivity = async (
    kind: ActivityKind,
    input: { title: string; description: string; dueAt?: string },
  ) => {
    const saved = await run(
      () =>
        apiRequest(`/crm/leads/${lead.id}/activities`, {
          method: 'POST',
          body: { kind, ...input, requestId: requestId.current },
        }),
      kind === 'meeting'
        ? 'Reunião agendada no CRM.'
        : kind === 'task'
          ? 'Tarefa criada.'
          : 'Registro salvo no histórico.',
    )
    if (saved) {
      setAction(null)
      requestId.current = crypto.randomUUID()
    }
    return saved
  }
  return {
    execute: run,
    action,
    open,
    close: () => {
      if (!pending.current) setAction(null)
    },
    busy,
    error,
    message,
    saveActivity,
    changed,
    completeTask: (id: string) =>
      run(() => crmService.completeLeadTask(id), 'Tarefa concluída.'),
    markWon: () =>
      run(
        () => crmService.markLeadWon({ leadId: lead.id, value: lead.value }),
        'Lead marcado como ganho.',
      ),
    markLost: () =>
      run(
        () =>
          crmService.markLeadLost({
            leadId: lead.id,
            lostReason: 'Marcado manualmente na ficha.',
          }),
        'Lead marcado como perdido.',
      ),
  }
}
