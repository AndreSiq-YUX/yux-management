import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/apiClient'
export function ActivateQualification({
  crmInstanceId,
  onChanged,
}: {
  crmInstanceId: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Usar regras por campos personalizados e atividades
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar pontuação por soma?</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            O novo cálculo soma os pontos das regras de perfil e atividades. As
            regras ponderadas anteriores ficam preservadas no histórico e deixam
            de participar dos novos cálculos. Configure as novas regras, confira
            a prévia e recalcule os leads existentes.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await apiRequest('/crm/scoring/activate-sum', {
                    method: 'POST',
                    body: { crmInstanceId },
                  })
                  setOpen(false)
                  onChanged()
                } catch {
                  setError('Não foi possível ativar o novo cálculo.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Ativar pontuação por soma
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
