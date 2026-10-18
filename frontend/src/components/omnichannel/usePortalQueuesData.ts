import { useCallback, useEffect, useState } from 'react'
import { omnichannelService } from '@/services/omnichannelService'

export interface PortalTeam {
  id: string
  name: string
  availabilityMode: string
  isActive: boolean
  members: Array<{ id: string; name: string }>
}

export interface PortalQueue {
  id: string
  name: string
  strategy: string
  teamId?: string
  teamName?: string
  isActive: boolean
  firstResponseMinutes?: number
}

export interface PortalHandoffRule {
  id: string
  name: string
  priority?: number
  isEnabled: boolean
}

export interface PortalQueuesData {
  teams: PortalTeam[]
  queues: PortalQueue[]
  rules: PortalHandoffRule[]
}

/** Linha devolvida pelas rotas (snake_case ou camelCase). */
interface RouteRow {
  id: string
  name: string
  strategy?: string
  priority?: number
  omnichannel_teams?: { name?: string }
  team?: { name?: string }
  [key: string]: unknown
}

interface MemberRow {
  id?: string
  user_id?: string
  userId?: string
  name?: string
  users?: { name?: string }
  user?: { name?: string }
}

const pick = <T,>(row: Record<string, unknown> | undefined, snake: string, camel: string, fallback?: T): T | undefined => (row?.[snake] ?? row?.[camel] ?? fallback) as T | undefined

/** As rotas devolvem linhas do banco (snake_case); aceita camelCase também. */
export function normalizeTeam(row: RouteRow, members: MemberRow[] = []): PortalTeam {
  return {
    id: row.id,
    name: row.name,
    availabilityMode: pick<string>(row, 'availability_mode', 'availabilityMode', 'business_hours') as string,
    isActive: pick<boolean>(row, 'is_active', 'isActive', true) as boolean,
    members: members.map((member, index) => ({
      id: member.id || member.user_id || member.userId || `member-${index}`,
      name: member.users?.name || member.user?.name || member.name || 'Atendente',
    })),
  }
}

export function normalizeQueue(row: RouteRow, teams: PortalTeam[] = []): PortalQueue {
  const teamId = pick<string>(row, 'team_id', 'teamId')
  const sla = pick<Record<string, unknown>>(row, 'sla_settings', 'slaSettings') || {}
  const minutes = Number(sla.firstResponseMinutes)
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy || 'round_robin',
    teamId: teamId || undefined,
    teamName: row.omnichannel_teams?.name || row.team?.name || teams.find(team => team.id === teamId)?.name,
    isActive: pick<boolean>(row, 'is_active', 'isActive', true) as boolean,
    firstResponseMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
  }
}

export function normalizeRule(row: RouteRow): PortalHandoffRule {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    isEnabled: pick<boolean>(row, 'is_enabled', 'isEnabled', true) as boolean,
  }
}

/** Equipes, filas e regras de transferência da organização (lidas das rotas do módulo whatsapp_ai). */
export function usePortalQueuesData(organizationId?: string) {
  const [data, setData] = useState<PortalQueuesData>({ teams: [], queues: [], rules: [] })
  const [loading, setLoading] = useState(Boolean(organizationId))
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!organizationId) {
      setLoading(false)
      return
    }
    try {
      setError(null)
      const [teamRows, queueRows, ruleRows] = await Promise.all([
        omnichannelService.getTeams(organizationId),
        omnichannelService.getQueues(organizationId),
        omnichannelService.getRules(organizationId).catch(() => [] as RouteRow[]),
      ])
      const memberLists = await Promise.all(
        (teamRows || []).map(team => omnichannelService.getTeamMembers(team.id).catch(() => [] as MemberRow[])),
      )
      const teams = (teamRows || []).map((row, index) => normalizeTeam(row, memberLists[index] || []))
      setData({
        teams,
        queues: (queueRows || []).map(row => normalizeQueue(row, teams)),
        rules: (ruleRows || []).map(normalizeRule),
      })
    } catch (loadError) {
      console.error('Erro ao carregar equipes e filas:', loadError)
      setError('Não foi possível carregar as equipes e filas agora. Tente novamente em instantes.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void reload() }, [reload])

  return { ...data, loading, error, reload }
}
