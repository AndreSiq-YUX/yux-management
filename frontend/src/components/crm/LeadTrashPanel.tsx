import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/apiClient'
type RemovedLead = {
  id: string
  name: string
  company: string | null
  deletedAt: string
}
export function LeadTrashPanel({
  crmInstanceId,
  open,
  onClose,
  onRestored,
}: {
  crmInstanceId: string
  open: boolean
  onClose: () => void
  onRestored: () => void
}) {
  const scope = useRef({ key: '', version: 0 })
  const key = `${crmInstanceId}:${open}`
  if (scope.current.key !== key)
    scope.current = { key, version: scope.current.version + 1 }
  const [leads, setLeads] = useState<RemovedLead[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setLeads([])
    setCursor(null)
    setBusy(true)
    setError('')
    apiRequest<{ leads: RemovedLead[]; nextCursor: string | null }>(
      `/crm/leads/trash?crmInstanceId=${encodeURIComponent(crmInstanceId)}`,
    )
      .then((v) => {
        if (active) {
          setLeads(v.leads)
          setCursor(v.nextCursor)
        }
      })
      .catch(() => {
        if (active) setError('Não foi possível consultar os leads excluídos.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [crmInstanceId, open, revision])
  const restore = async (id: string) => {
    const version = scope.current.version
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/crm/leads/${id}/restore`, {
        method: 'POST',
        body: { crmInstanceId },
      })
      if (version !== scope.current.version) return
      setLeads((current) => current.filter((l) => l.id !== id))
      onRestored()
    } catch {
      if (version === scope.current.version)
        setError('Não foi possível recuperar este lead.')
    } finally {
      if (version === scope.current.version) setBusy(false)
    }
  }
  const more = async () => {
    if (!cursor) return
    const version = scope.current.version
    setBusy(true)
    try {
      const v = await apiRequest<{
        leads: RemovedLead[]
        nextCursor: string | null
      }>(
        `/crm/leads/trash?crmInstanceId=${encodeURIComponent(crmInstanceId)}&afterId=${cursor}`,
      )
      if (version !== scope.current.version) return
      setLeads((current) => [...current, ...v.leads])
      setCursor(v.nextCursor)
    } catch {
      if (version === scope.current.version)
        setError('Não foi possível carregar mais leads.')
    } finally {
      if (version === scope.current.version) setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leads excluídos</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Recupere um lead sem alterar seu status comercial. Sequências
          permanecem pausadas.
        </p>
        {error && (
          <p role="alert">
            {error}
            <Button onClick={() => setRevision((v) => v + 1)}>
              Tentar novamente
            </Button>
          </p>
        )}
        {busy && <p role="status">Carregando...</p>}
        <ul className="flex flex-col gap-2">
          {leads.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <span className="min-w-0 break-words text-sm">
                {l.name}
                <span className="block text-xs text-muted-foreground">
                  {new Date(l.deletedAt).toLocaleDateString('pt-BR')}
                </span>
              </span>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void restore(l.id)}
              >
                Recuperar {l.name}
              </Button>
            </li>
          ))}
        </ul>
        {!busy && !leads.length && !error && <p>Nenhum lead excluído.</p>}
        {cursor && (
          <Button disabled={busy} variant="outline" onClick={() => void more()}>
            Carregar mais
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
