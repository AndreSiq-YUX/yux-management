import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalButtonClasses } from './buttonStyles'
import { useDialogFocusReturn } from './useDialogFocusReturn'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** `danger` pinta o botão de confirmar em vermelho (ações destrutivas ou irreversíveis). */
  tone?: 'default' | 'danger'
  /**
   * Executada ao confirmar. Enquanto a promessa roda, o botão mostra carregamento e fica desabilitado.
   * Sucesso fecha o diálogo; erro mantém aberto e mostra a mensagem do erro.
   */
  onConfirm: () => Promise<void> | void
  /** Conteúdo extra (ex.: um campo de comentário obrigatório). */
  children?: ReactNode
  confirmDisabled?: boolean
}

const FALLBACK_ERROR = 'Não foi possível concluir. Tente novamente.'

/** Confirmação para ações destrutivas ou irreversíveis (Radix Dialog). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const focusReturn = useDialogFocusReturn()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (busy && !next) return
      onOpenChange(next)
    },
    [busy, onOpenChange],
  )

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      if (mounted.current) {
        setBusy(false)
        onOpenChange(false)
      }
    } catch (err) {
      if (mounted.current) {
        setBusy(false)
        setError(err instanceof Error && err.message ? err.message : FALLBACK_ERROR)
      }
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          {...focusReturn}
          data-tone={tone}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[10px] border border-yx-line bg-yx-surface p-5 text-yx-fg shadow-lg',
            'data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none',
          )}
        >
          <div className="grid gap-1.5 pr-8">
            <DialogPrimitive.Title className="font-display text-lg font-semibold leading-snug tracking-[-0.01em]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-[13.5px] leading-normal text-yx-fg-2">
              {description}
            </DialogPrimitive.Description>
          </div>

          {children ? <div>{children}</div> : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] text-yx-crit">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close
              type="button"
              disabled={busy}
              className={portalButtonClasses('ghost')}
            >
              {cancelLabel}
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || confirmDisabled}
              aria-busy={busy}
              className={portalButtonClasses(tone === 'danger' ? 'danger' : 'primary')}
            >
              {busy ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
              {confirmLabel}
            </button>
          </div>

          <DialogPrimitive.Close
            aria-label="Fechar"
            disabled={busy}
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-lg text-yx-fg-3 hover:bg-yx-surface-2 hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
