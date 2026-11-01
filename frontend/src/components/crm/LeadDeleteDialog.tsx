import { requestLeadDeletion } from '@/lib/crm/leadDeletionEvents'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/apiClient'
import type { CrmLead } from '@/types/crm'
export function LeadDeleteButton({ lead }: { lead: CrmLead }) {
  if (!lead.canDelete) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={`Excluir ${lead.name}`}
      onClick={(event) => {
        event.stopPropagation()
        requestLeadDeletion([lead])
      }}
    >
      Excluir
    </Button>
  )
}
export function LeadDeleteDialog({
  leads,
  crmInstanceId,
  onClose,
  onDeleted,
}: {
  leads: CrmLead[]
  crmInstanceId?: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const remove = async () => {
    if (!crmInstanceId || busy) return
    setBusy(true)
    setError('')
    try {
      await apiRequest('/crm/leads/trash', {
        method: 'POST',
        body: { crmInstanceId, leadIds: leads.map((l) => l.id) },
      })
      onDeleted()
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível excluir.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={leads.length > 0}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Excluir {leads.length === 1 ? 'lead' : `${leads.length} leads`}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Os leads sairão da lista e do Kanban. Você pode recuperá-los em “Leads
          excluídos”. Sequências ativas serão pausadas.
        </p>
        <ul className="max-h-40 overflow-y-auto text-sm">
          {leads.map((l) => (
            <li key={l.id} className="break-words">
              {l.name}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button disabled={busy} variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !crmInstanceId}
            variant="destructive"
            onClick={() => void remove()}
          >
            {busy ? 'Excluindo...' : 'Confirmar exclusão'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
