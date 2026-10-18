import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, UserCheck, X } from 'lucide-react'
import { portalButtonClasses } from '@/components/portal-ui/buttonStyles'
import { useDialogFocusReturn } from '@/components/portal-ui/useDialogFocusReturn'
import type { MissionActionRun } from '@/types/actionEngine'

const fieldClasses =
  'mt-2 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm font-normal text-yx-fg placeholder:text-yx-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue'

export function HumanTaskResolutionDialog({ action, busy, onCancel, onConfirm }: {
  action: MissionActionRun | null; busy: boolean; onCancel: () => void; onConfirm: (actualMinutes: number, evidence: string) => void
}) {
  const focusReturn = useDialogFocusReturn()
  const [minutes, setMinutes] = useState('')
  const [evidence, setEvidence] = useState('')
  useEffect(() => { if (action) { setMinutes(''); setEvidence('') } }, [action])
  const parsed = Number(minutes)
  const validMinutes = Number.isInteger(parsed) && parsed > 0 && parsed <= 1440
  const valid = validMinutes && evidence.trim().length > 0
  return (
    <DialogPrimitive.Root open={Boolean(action)} onOpenChange={next => { if (!next && !busy) onCancel() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/45" />
        <DialogPrimitive.Content
          {...focusReturn}
          aria-describedby="human-task-description"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg shadow-2xl focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3 border-b border-yx-line p-5">
            <div>
              <DialogPrimitive.Title className="font-semibold text-yx-fg">Concluir tarefa humana</DialogPrimitive.Title>
              <DialogPrimitive.Description id="human-task-description" className="mt-1 text-xs text-yx-fg-3">
                A evidência e o tempo real preservam a rastreabilidade e alimentam o custo da missão.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar"
              disabled={busy}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-yx-fg-3 hover:bg-yx-surface-2 hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue disabled:opacity-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="space-y-4 p-5">
            <label htmlFor="human-task-evidence" className="block text-xs font-semibold text-yx-fg-2">
              Evidência da conclusão
              <textarea
                id="human-task-evidence"
                value={evidence}
                onChange={event => setEvidence(event.target.value)}
                rows={3}
                className={`${fieldClasses} py-2`}
                placeholder="Descreva o resultado, link ou confirmação obtida"
              />
            </label>
            <div>
              <label htmlFor="actual-minutes" className="text-xs font-semibold text-yx-fg-2">Minutos efetivamente trabalhados</label>
              <input
                id="actual-minutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={minutes}
                onChange={event => setMinutes(event.target.value)}
                className={`${fieldClasses} h-10`}
                placeholder="Ex.: 25"
              />
              {minutes && !validMinutes ? <p className="mt-2 text-xs text-yx-crit">Informe um número inteiro entre 1 e 1.440 minutos.</p> : null}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-yx-line p-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={busy} className={portalButtonClasses('ghost')}>Cancelar</button>
            <button type="button" onClick={() => valid && onConfirm(parsed, evidence.trim())} disabled={!valid || busy} className={portalButtonClasses('primary')}>
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <UserCheck aria-hidden="true" />} Registrar e concluir
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
