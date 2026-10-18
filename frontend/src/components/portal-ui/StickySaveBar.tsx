import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalButtonClasses } from './buttonStyles'

export interface StickySaveBarProps {
  /** A barra só aparece quando há alterações não salvas. */
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
  /** Desabilita "Salvar" (ex.: formulário inválido). */
  saveDisabled?: boolean
  className?: string
}

/**
 * Barra fixa no rodapé com aviso de alterações não salvas. Respeita a área segura do aparelho
 * e deixa espaço para o menu lateral de 264px a partir de 1024px (`lg:left-64`).
 */
export function StickySaveBar({ dirty, saving = false, onSave, onDiscard, saveDisabled = false, className }: StickySaveBarProps) {
  if (!dirty) return null
  return (
    <div
      role="region"
      aria-label="Alterações não salvas"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-yx-line bg-yx-surface pb-[max(12px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-3 shadow-[0_-4px_16px_rgba(14,17,32,0.08)] lg:left-64',
        className,
      )}
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-[13px] font-medium text-yx-fg" role="status">
          Você tem alterações não salvas
        </p>
        <div className="flex gap-2 sm:justify-end">
          <button type="button" onClick={onDiscard} disabled={saving} className={portalButtonClasses('ghost', 'flex-1 sm:flex-none')}>
            Descartar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saveDisabled}
            aria-busy={saving}
            className={portalButtonClasses('primary', 'flex-1 sm:flex-none')}
          >
            {saving ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Avisa o navegador antes de recarregar/fechar a aba enquanto houver alterações não salvas.
 * (Navegação interna do React Router deve ser tratada pela tela com `ConfirmDialog`.)
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return undefined
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
