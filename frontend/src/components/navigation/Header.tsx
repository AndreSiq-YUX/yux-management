import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Menu } from 'lucide-react'
import { MOBILE_NAV_ID } from '@/components/navigation/constants'
import { HeaderSearch } from '@/components/navigation/HeaderSearch'
import { NotificationsMenu } from '@/components/navigation/NotificationsMenu'
import { UserMenu } from '@/components/navigation/UserMenu'
import { buildBreadcrumbs } from '@/lib/platform/navigation'
import { usePlatformContext } from '@/stores/platformStore'

interface HeaderProps {
  /** Abre a gaveta do menu (abaixo de 1024px). */
  onOpenMenu?: () => void
  menuOpen?: boolean
}

export function Header({ onOpenMenu, menuOpen = false }: HeaderProps) {
  const location = useLocation()
  const platformContext = usePlatformContext()
  const breadcrumbs = buildBreadcrumbs(platformContext, location.pathname)

  return (
    <header data-print-hide className="sticky top-[env(safe-area-inset-top,0px)] z-30 print:hidden border-b border-yx-line bg-yx-surface after:pointer-events-none after:absolute after:-bottom-px after:left-0 after:h-0.5 after:w-[22%] after:bg-brand-gradient after:content-['']">
      <div className="flex h-[60px] items-center gap-3 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
        <button
          type="button"
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          aria-controls={MOBILE_NAV_ID}
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-yx-fg-2 transition-colors hover:bg-yx-surface-2 hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <nav aria-label="Trilha de navegação" className="hidden min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-[13px] text-yx-fg-3 md:flex">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1
            return (
              <Fragment key={`${item.label}-${index}`}>
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                {item.href && !isLast ? (
                  <Link to={item.href} className="truncate rounded hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={isLast ? 'truncate font-semibold text-yx-fg' : 'truncate'}
                  >
                    {item.label}
                  </span>
                )}
              </Fragment>
            )
          })}
        </nav>

        <HeaderSearch className="flex-1 md:w-[min(360px,34vw)] md:flex-none" />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}
