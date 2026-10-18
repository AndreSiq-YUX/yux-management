import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalButtonClasses } from './buttonStyles'

export interface MasterDetailProps {
  list: ReactNode
  /** `null` = nada selecionado. */
  detail: ReactNode | null
  onBack: () => void
  backLabel?: string
  /** Largura da coluna da lista no desktop (px). */
  listWidth?: number
  /** Conteúdo exibido na coluna de detalhe do desktop quando `detail` é `null`. */
  emptyDetail?: ReactNode
  className?: string
}

/**
 * Lista + detalhe. A partir de 1024px: duas colunas. Abaixo: mostra a lista, ou o detalhe em tela cheia
 * com botão "Voltar" quando há um item selecionado.
 */
export function MasterDetail({ list, detail, onBack, backLabel = 'Voltar', listWidth = 320, emptyDetail, className }: MasterDetailProps) {
  const hasDetail = detail !== null && detail !== undefined
  return (
    <div
      data-has-detail={hasDetail}
      style={{ '--md-list-w': `${listWidth}px` } as CSSProperties}
      className={cn('min-w-0 lg:grid lg:grid-cols-[var(--md-list-w)_minmax(0,1fr)] lg:items-start lg:gap-5', className)}
    >
      <div data-testid="master-list" className={cn('min-w-0', hasDetail ? 'hidden lg:block' : 'block')}>
        {list}
      </div>
      <div data-testid="master-detail" className={cn('min-w-0', hasDetail ? 'block' : 'hidden lg:block')}>
        {hasDetail ? (
          <>
            <button type="button" onClick={onBack} className={portalButtonClasses('ghost', 'mb-3 lg:hidden')}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </button>
            {detail}
          </>
        ) : (
          emptyDetail ?? null
        )}
      </div>
    </div>
  )
}
