import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { cn } from '@/lib/utils'
import { portalButtonClasses } from './buttonStyles'

export interface EmptyStateAction {
  label: string
  /** Caminho interno (`/portal/...`); convertido por `usePortalWorkspacePath()`. */
  href?: string
  onClick?: () => void
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /** Diga o que vai aparecer aqui e como começar. */
  description?: ReactNode
  action?: EmptyStateAction
  className?: string
}

/** Estado vazio honesto: ícone, título, explicação e (opcional) uma ação para começar. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  const toWorkspace = usePortalWorkspacePath()
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-yx-line-strong px-5 py-8 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="mb-1 grid h-10 w-10 place-items-center rounded-lg bg-yx-blue-soft text-yx-blue">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      ) : null}
      <h3 className="font-display text-[15px] font-semibold leading-[1.35] text-yx-fg">{title}</h3>
      {description ? <p className="max-w-[46ch] text-[13px] leading-normal text-yx-fg-2">{description}</p> : null}
      {action ? (
        action.href ? (
          <Link to={toWorkspace(action.href)} onClick={action.onClick} className={portalButtonClasses('primary', 'mt-2')}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={portalButtonClasses('primary', 'mt-2')}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  )
}
