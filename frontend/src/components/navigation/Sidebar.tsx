import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronDown, X } from 'lucide-react'
import yuxLogo from '@/assets/brand/yux-logo.png'
import { MOBILE_NAV_ID } from '@/components/navigation/constants'
import { getInitials } from '@/components/navigation/initials'
import { iconForNavigationItem } from '@/components/navigation/navigationIcons'
import {
  buildNavigationFooter,
  buildNavigationGroups,
  resolveActiveNavigationItem,
  type NavigationGroup,
  type NavigationItem,
} from '@/lib/platform/navigation'
import { cn } from '@/lib/utils'
import { usePlatformContext, usePlatformStore } from '@/stores/platformStore'
import { usePortalBadgeStore } from '@/stores/portalBadgeStore'
import type { PlatformMode } from '@/types/platform'

const COLLAPSED_STORAGE_KEY = 'yux-portal-nav-collapsed-groups'
const DESKTOP_QUERY = '(min-width: 1024px)'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b9a8ff]'

function readCollapsedGroups(): string[] {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeCollapsedGroups(groups: string[]) {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(groups))
  } catch {
    // Sem armazenamento (janela privada, bloqueio): o menu continua funcionando, só não lembra.
  }
}

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsedGroups)

  const toggle = useCallback((label: string) => {
    setCollapsed(current => {
      const next = current.includes(label) ? current.filter(item => item !== label) : [...current, label]
      writeCollapsedGroups(next)
      return next
    })
  }, [])

  return { collapsed, toggle }
}

interface NavItemLinkProps {
  item: NavigationItem
  active: boolean
  count: number
  onNavigate: () => void
}

function NavItemLink({ item, active, count, onNavigate }: NavItemLinkProps) {
  const Icon = iconForNavigationItem(item)

  return (
    <Link
      to={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'relative flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors lg:min-h-9',
        focusRing,
        active
          ? 'bg-yx-side-active text-yx-side-fg-strong before:absolute before:-left-2.5 before:bottom-1.5 before:top-1.5 before:w-[3px] before:rounded-r-[3px] before:bg-brand-gradient before:content-[""]'
          : 'text-yx-side-fg hover:bg-yx-side-hover hover:text-yx-side-fg-strong',
      )}
    >
      <Icon className={cn('h-[17px] w-[17px] shrink-0', active ? 'text-[#b9a8ff]' : 'text-yx-side-muted')} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span className="ml-auto min-w-[20px] shrink-0 rounded-full bg-brand-gradient px-1.5 text-center font-mono text-[11px] font-semibold leading-[18px] text-white">
          {count > 99 ? '99+' : count}
          <span className="sr-only"> pendentes</span>
        </span>
      ) : null}
    </Link>
  )
}

interface NavGroupSectionProps {
  group: NavigationGroup
  activeItem: NavigationItem | undefined
  collapsed: boolean
  onToggle: (label: string) => void
  badgeCounts: Record<string, number>
  onNavigate: () => void
}

function NavGroupSection({ group, activeItem, collapsed, onToggle, badgeCounts, onNavigate }: NavGroupSectionProps) {
  const listId = useId()
  const hasActive = Boolean(activeItem && group.items.includes(activeItem))
  // O grupo da página atual nunca fica recolhido: quem navega sempre vê onde está.
  const expanded = hasActive || !collapsed

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-disabled={hasActive || undefined}
        onClick={() => {
          if (!hasActive) onToggle(group.label)
        }}
        className={cn(
          'mb-1 flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left font-mono text-[11px] font-medium uppercase leading-none tracking-[0.1em] text-yx-side-muted transition-colors hover:text-yx-side-fg-strong',
          focusRing,
        )}
      >
        <span className="truncate">{group.label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !expanded && '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <ul id={listId} className="grid gap-0.5">
          {group.items.map(item => (
            <li key={`${item.label}:${item.href}`}>
              <NavItemLink
                item={item}
                active={item === activeItem}
                count={item.badge ? badgeCounts[item.badge] ?? 0 : 0}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

interface OrganizationCardProps {
  mode: PlatformMode
  onNavigate: () => void
}

function OrganizationCard({ mode, onNavigate }: OrganizationCardProps) {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)

  const isInternal = mode === 'internal'
  const name = isInternal ? 'YUX Hub' : organization?.name || 'Sua empresa'
  const subtitle = isInternal
    ? 'Operação interna'
    : activeContract?.package?.name || activeContract?.name || (mode === 'client_workspace' ? 'Workspace do cliente' : 'Portal do Cliente')

  return (
    <div className="mx-3.5 mb-2.5 rounded-lg border border-yx-side-line bg-yx-side-bg-2 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-gradient font-display text-xs font-bold text-white"
        >
          {isInternal ? 'YH' : getInitials(organization?.name)}
        </span>
        <div className="min-w-0">
          <b className="block truncate font-display text-[13.5px] font-semibold leading-tight text-yx-side-fg-strong">{name}</b>
          <span className="block truncate font-mono text-[11px] leading-snug tracking-[0.02em] text-yx-side-muted">{subtitle}</span>
        </div>
      </div>
      {mode === 'client_workspace' ? (
        <Link
          to="/client-workspaces"
          onClick={onNavigate}
          className={cn(
            'mt-2 inline-flex min-h-8 items-center rounded-md text-xs font-medium text-yx-side-fg underline-offset-2 hover:text-yx-side-fg-strong hover:underline',
            focusRing,
          )}
        >
          Trocar cliente
        </Link>
      ) : null}
    </div>
  )
}

interface SidebarPanelProps {
  variant: 'desktop' | 'drawer'
  mode: PlatformMode
  groups: NavigationGroup[]
  footer: NavigationItem[]
  activeItem: NavigationItem | undefined
  collapsedGroups: string[]
  onToggleGroup: (label: string) => void
  badgeCounts: Record<string, number>
  onNavigate: () => void
}

function SidebarPanel({
  variant,
  mode,
  groups,
  footer,
  activeItem,
  collapsedGroups,
  onToggleGroup,
  badgeCounts,
  onNavigate,
}: SidebarPanelProps) {
  const isDrawer = variant === 'drawer'

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-yx-side-bg text-yx-side-fg',
        isDrawer
          ? 'pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pt-[env(safe-area-inset-top,0px)]'
          : 'border-r border-yx-side-line',
      )}
    >
      <div className="flex items-center justify-between px-5 pb-3.5 pt-5">
        <img src={yuxLogo} alt="YUX" className="block h-[22px] w-auto" />
        {isDrawer ? (
          <DialogPrimitive.Close
            aria-label="Fechar menu"
            className={cn(
              'grid h-10 w-10 place-items-center rounded-md text-yx-side-muted hover:bg-yx-side-hover hover:text-yx-side-fg-strong',
              focusRing,
            )}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </div>

      <OrganizationCard mode={mode} onNavigate={onNavigate} />

      <nav
        aria-label={isDrawer ? 'Itens do menu' : 'Menu principal'}
        className="grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto overscroll-contain px-2.5 pb-4 pt-1.5"
      >
        {groups.map(group => (
          <NavGroupSection
            key={group.label}
            group={group}
            activeItem={activeItem}
            collapsed={collapsedGroups.includes(group.label)}
            onToggle={onToggleGroup}
            badgeCounts={badgeCounts}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {footer.length > 0 ? (
        <ul className="grid gap-0.5 border-t border-yx-side-line p-2.5">
          {footer.map(item => (
            <li key={`${item.label}:${item.href}`}>
              <NavItemLink item={item} active={item === activeItem} count={0} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

interface SidebarProps {
  /** Gaveta do menu aberta (abaixo de 1024px). Controlada pelo layout, que também liga o botão do cabeçalho. */
  mobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
}

export function Sidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const location = useLocation()
  const platformContext = usePlatformContext()
  const pendingApprovals = usePortalBadgeStore(state => state.pendingApprovals)
  const { collapsed, toggle } = useCollapsedGroups()

  // `activeItem` é um dos objetos de `groups`/`footer`: precisa nascer na mesma renderização deles.
  const groups = buildNavigationGroups(platformContext)
  const footer = buildNavigationFooter(platformContext)
  const activeItem = resolveActiveNavigationItem([...groups.flatMap(group => group.items), ...footer], location.pathname)
  const badgeCounts = useMemo(() => ({ approvals: pendingApprovals }), [pendingApprovals])

  const setMobileOpen = useCallback((open: boolean) => onMobileOpenChange?.(open), [onMobileOpenChange])
  const closeMobile = useCallback(() => setMobileOpen(false), [setMobileOpen])

  // A gaveta fecha sozinha ao navegar.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, setMobileOpen])

  // Se a janela crescer até o desktop com a gaveta aberta, ela deixa de fazer sentido.
  useEffect(() => {
    if (!mobileOpen || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mobileOpen, setMobileOpen])

  const panelProps = {
    mode: platformContext.mode,
    groups,
    footer,
    activeItem,
    collapsedGroups: collapsed,
    onToggleGroup: toggle,
    badgeCounts,
  }

  return (
    <>
      <aside data-print-hide className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block print:hidden">
        <SidebarPanel {...panelProps} variant="desktop" onNavigate={() => undefined} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[rgba(7,8,17,0.55)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden print:hidden" />
          <DialogPrimitive.Content
            id={MOBILE_NAV_ID}
            aria-label="Menu principal"
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-[70] w-[284px] max-w-[88vw] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden print:hidden motion-reduce:animate-none"
          >
            <DialogPrimitive.Title className="sr-only">Menu principal</DialogPrimitive.Title>
            <SidebarPanel {...panelProps} variant="drawer" onNavigate={closeMobile} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
