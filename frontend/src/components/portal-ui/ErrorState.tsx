import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalButtonClasses } from './buttonStyles'

export interface ErrorStateProps {
  title?: string
  description?: ReactNode
  /** Quando informado, mostra o botão "Tentar novamente". */
  onRetry?: () => void
  className?: string
}

/** Estado de erro de carregamento, com ação "Tentar novamente". */
export function ErrorState({ title = 'Não foi possível carregar.', description, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 rounded-[10px] border border-yx-crit-line bg-yx-crit-soft px-5 py-8 text-center',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="h-5 w-5 text-yx-crit" />
      <h3 className="font-display text-[15px] font-semibold leading-[1.35] text-yx-fg">{title}</h3>
      {description ? <p className="max-w-[46ch] text-[13px] leading-normal text-yx-fg-2">{description}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className={portalButtonClasses('ghost', 'mt-2')}>
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}
