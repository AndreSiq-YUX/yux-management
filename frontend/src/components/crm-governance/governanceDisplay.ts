import { seatLimitForRole } from '@/lib/crm/governanceRules'
import type { CrmAssignmentMode, CrmInstance, CrmInstanceMember, CrmInstanceRole } from '@/types/crm'

export const crmRoleLabel: Record<CrmInstanceRole, string> = {
  seller: 'Vendedor',
  manager: 'Gerente',
  client_admin: 'Administrador',
  yux_admin: 'Equipe YUX',
}

export const crmMemberStatusLabel: Record<CrmInstanceMember['status'], string> = {
  active: 'Ativo',
  invited: 'Convite pendente',
  disabled: 'Desativado',
}

export const crmAssignmentModeLabel: Record<CrmAssignmentMode, string> = {
  manual: 'Distribuição manual',
  queue: 'Fila de leads',
  round_robin: 'Rodízio entre vendedores',
  pull_next: 'Vendedor puxa o próximo lead',
}

export type SeatRole = Extract<CrmInstanceRole, 'seller' | 'manager' | 'client_admin'>

export interface SeatUsageRow {
  role: SeatRole
  label: string
  used: number
  limit: number
  free: number
}

const seatRoles: Array<{ role: SeatRole; label: string }> = [
  { role: 'seller', label: 'Vendedores' },
  { role: 'manager', label: 'Gerentes' },
  { role: 'client_admin', label: 'Administradores' },
]

/** Vagas usadas x contratadas por papel (mesma contagem de `canAddCrmMember`: desativados não ocupam vaga). */
export function summarizeSeatUsage(instance: CrmInstance, members: CrmInstanceMember[]): SeatUsageRow[] {
  return seatRoles.map(({ role, label }) => {
    const limit = seatLimitForRole(instance, role)
    const used = members.filter(member => member.role === role && member.status !== 'disabled').length
    return { role, label, used, limit, free: Math.max(0, limit - used) }
  })
}
