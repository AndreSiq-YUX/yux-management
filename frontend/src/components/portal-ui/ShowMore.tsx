import { portalButtonClasses } from './buttonStyles'
import { SHOW_MORE_STEP } from './useShowMore'

export interface ShowMoreButtonProps {
  shown: number
  total: number
  step?: number
  onClick: () => void
  className?: string
}

/** Botão "Mostrar mais" com o contador "Mostrando X de Y". */
export function ShowMoreButton({ shown, total, step = SHOW_MORE_STEP, onClick, className }: ShowMoreButtonProps) {
  const remaining = Math.max(total - shown, 0)
  if (remaining === 0) return null
  return (
    <div className={className ?? 'mt-3 flex flex-wrap items-center justify-center gap-3'}>
      <p role="status" className="text-[13px] text-yx-fg-3">
        Mostrando {shown} de {total}
      </p>
      <button type="button" onClick={onClick} className={portalButtonClasses('ghost')}>
        Mostrar mais {Math.min(step, remaining)}
      </button>
    </div>
  )
}
