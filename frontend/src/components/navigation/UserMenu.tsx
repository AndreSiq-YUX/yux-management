import { Link } from 'react-router-dom'
import { LogOut, UserCog } from 'lucide-react'
import { getInitials } from '@/components/navigation/initials'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { roleLabel } from '@/lib/client-portal/portalDisplay'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

const itemClasses = 'min-h-10 cursor-pointer gap-2 px-2.5 text-sm'

/** Menu do usuário: nome, papel em português, "Minha conta" e "Sair". */
export function UserMenu() {
  const user = useAuthStore(state => state.user)
  const logout = useAuthStore(state => state.logout)
  const mode = usePlatformStore(state => state.mode)
  const platformRoleKey = usePlatformStore(state => state.role?.key)
  const portalPath = usePortalWorkspacePath()

  const name = user?.name || 'Usuário'
  const role = roleLabel(platformRoleKey || user?.role)
  // A página "Minha conta" existe no portal e no workspace do cliente, não no Hub interno.
  const showAccount = mode === 'portal' || mode === 'client_workspace'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Menu do usuário: ${name}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-gradient font-display text-xs font-bold text-white"
          >
            {getInitials(user?.name)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 max-w-[calc(100vw-2rem)] border-yx-line bg-yx-surface">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-yx-fg">{name}</span>
          <span className="block truncate text-xs text-yx-fg-3">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showAccount ? (
          <DropdownMenuItem asChild className={itemClasses}>
            <Link to={portalPath('/portal/configuracoes/conta')}>
              <UserCog className="h-4 w-4" aria-hidden="true" />
              Minha conta
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className={itemClasses} onSelect={() => void logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
