import { useId, useState, type ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { getPendingFeature, type PendingCode } from '@/lib/client-portal/pendingFeatures'
import { cn } from '@/lib/utils'
import { PendingBadge } from './PendingBadge'

export interface PendingActionProps {
  code: PendingCode
  /** Conteúdo (rótulo) do botão. */
  children: ReactNode
  variant?: 'primary' | 'outline' | 'ghost' | 'link'
  size?: 'sm' | 'default'
  className?: string
}

const variantMap = {
  primary: 'default',
  outline: 'outline',
  ghost: 'ghost',
  link: 'link',
} as const

/**
 * Ação que ainda não funciona. Continua visível e focável, mas ao clicar
 * apenas explica que a função está em implantação: nunca executa nada
 * nem simula sucesso (por isso não aceita `onClick`).
 */
export function PendingAction({ code, children, variant = 'outline', size = 'default', className }: PendingActionProps) {
  const [open, setOpen] = useState(false)
  const messageId = useId()
  const feature = getPendingFeature(code)

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1.5">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={open ? messageId : undefined}
        onClick={() => setOpen(current => !current)}
        className={cn(
          buttonVariants({ variant: variantMap[variant], size }),
          'gap-2 whitespace-normal opacity-70 cursor-pointer',
          className,
        )}
      >
        {children}
        <PendingBadge code={code} />
      </button>
      {open ? (
        <span id={messageId} role="status" className="max-w-xs text-xs leading-snug text-muted-foreground">
          {feature.clientMessage}
        </span>
      ) : null}
    </span>
  )
}
