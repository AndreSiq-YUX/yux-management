import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { CrmLead, CrmTaskPriority } from '@/types/crm'

interface TaskEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leads: CrmLead[]
  onCreate: (input: { leadId: string; title: string; description?: string; dueAt: string; priority: CrmTaskPriority }) => Promise<void>
}

export function TaskEditorDialog({ open, onOpenChange, leads, onCreate }: TaskEditorDialogProps) {
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<CrmTaskPriority>('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!leadId || !title.trim() || !dueAt) {
      setError('Selecione um lead, informe a ação e o prazo.')
      return
    }
    setSaving(true); setError(null)
    try {
      await onCreate({ leadId, title: title.trim(), description: description.trim() || undefined, dueAt: new Date(dueAt).toISOString(), priority })
      setLeadId(''); setTitle(''); setDescription(''); setDueAt(''); setPriority('medium'); onOpenChange(false)
    } catch (createError) {
      console.error('Erro ao criar tarefa:', createError)
      setError('Não foi possível criar a tarefa.')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova tarefa comercial</DialogTitle><DialogDescription>Crie um follow-up ligado diretamente a um lead.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div><label htmlFor="task-lead" className="text-sm font-medium">Lead</label><select id="task-lead" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={leadId} onChange={event => setLeadId(event.target.value)}><option value="">Selecione um lead</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` - ${lead.company}` : ''}</option>)}</select></div>
          <div><label htmlFor="task-title" className="text-sm font-medium">Ação</label><Input id="task-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Ligar para confirmar diagnóstico" /></div>
          <div><label htmlFor="task-description" className="text-sm font-medium">Observação</label><Input id="task-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Contexto opcional" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="task-due-at" className="text-sm font-medium">Prazo</label><Input id="task-due-at" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></div><div><label htmlFor="task-priority-new" className="text-sm font-medium">Prioridade</label><select id="task-priority-new" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={priority} onChange={event => setPriority(event.target.value as CrmTaskPriority)}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></div></div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar tarefa'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
