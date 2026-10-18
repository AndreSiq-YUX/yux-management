import { cn } from '@/lib/utils'

export type PortalButtonVariant = 'primary' | 'ghost' | 'yux' | 'danger'

const base =
  'inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3.5 font-sans text-[13px] font-semibold no-underline transition-colors sm:min-h-[34px] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0'

const variants: Record<PortalButtonVariant, string> = {
  primary: 'bg-yx-blue text-white hover:bg-yx-blue-ink',
  ghost: 'border-yx-line-strong bg-yx-surface text-yx-fg hover:border-yx-blue hover:text-yx-blue',
  // Gradiente = trabalho feito pela YUX / IA.
  yux: 'bg-brand-gradient text-white hover:brightness-110',
  danger: 'bg-yx-crit text-white hover:brightness-110',
}

/**
 * Classes dos botões do portal (mesmo visual do mockup aprovado).
 * Use em `<button>`, `<a>` ou `<Link>`: `className={portalButtonClasses('primary')}`.
 * Altura mínima de 40px no celular e 34px a partir de `sm`.
 */
export function portalButtonClasses(variant: PortalButtonVariant = 'primary', className?: string) {
  return cn(base, variants[variant], className)
}

/** Anel de foco padrão para elementos interativos que não são botões. */
export const portalFocusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface'
