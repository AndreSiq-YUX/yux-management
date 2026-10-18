import { EmptyState, ErrorState, PendingAction, ResponsiveTable, SectionCard, SkeletonCard, StatusChip, type ResponsiveTableColumn } from '@/components/portal-ui'
import type { CrmInstanceMember, CrmTeam, CrmTeamMember } from '@/types/crm'
import { crmAssignmentModeLabel } from './governanceDisplay'
import { useCrmGovernance } from './useCrmGovernance'

interface TeamRow {
  team: CrmTeam
  sellers: number
  managers: string[]
}

function buildRows(teams: CrmTeam[], memberships: CrmTeamMember[], members: CrmInstanceMember[]): TeamRow[] {
  const memberById = new Map(members.map(member => [member.id, member]))
  return teams.map(team => {
    const inTeam = memberships.filter(item => item.teamId === team.id)
    return {
      team,
      sellers: inTeam.filter(item => item.role === 'seller').length,
      managers: inTeam
        .filter(item => item.role === 'manager')
        .map(item => {
          const member = memberById.get(item.memberId)
          return member?.displayName || member?.email || 'Gerente'
        }),
    }
  })
}

/** Equipes comerciais do CRM: define quem enxerga quais leads e como os leads são distribuídos. */
export function CrmTeamsPanel() {
  const { state, reload } = useCrmGovernance()

  const columns: ResponsiveTableColumn<TeamRow>[] = [
    {
      key: 'name',
      header: 'Equipe',
      mobileLabel: '',
      render: row => (
        <span>
          <span className="font-semibold text-yx-fg">{row.team.name}</span>
          {row.team.description ? <span className="block text-xs text-yx-fg-3">{row.team.description}</span> : null}
        </span>
      ),
    },
    { key: 'assignment', header: 'Distribuição de leads', render: row => crmAssignmentModeLabel[row.team.assignmentMode] ?? row.team.assignmentMode },
    { key: 'managers', header: 'Gerentes', render: row => (row.managers.length ? row.managers.join(', ') : 'Sem gerente') },
    { key: 'sellers', header: 'Vendedores', className: 'text-right', render: row => row.sellers },
    { key: 'status', header: 'Situação', render: row => <StatusChip variant={row.team.isActive ? 'ok' : 'neutral'}>{row.team.isActive ? 'Ativa' : 'Inativa'}</StatusChip> },
  ]

  return (
    <SectionCard
      id="crm-teams"
      title="Equipes comerciais"
      description="As equipes definem quem vê quais leads, como os leads são distribuídos e qual gerente acompanha cada grupo."
      action={<PendingAction code="B25" size="sm">Criar equipe</PendingAction>}
    >
      {state.status === 'loading' ? (
        <SkeletonCard lines={3} />
      ) : state.status === 'error' ? (
        <ErrorState title="Não foi possível carregar as equipes" description="Tente novamente em instantes." onRetry={() => void reload()} />
      ) : state.status === 'unavailable' ? (
        <EmptyState
          title="O CRM ainda não foi publicado"
          description="Quando a equipe YUX publicar o CRM da sua empresa, as equipes comerciais aparecem aqui."
        />
      ) : (
        <ResponsiveTable
          caption="Equipes comerciais"
          columns={columns}
          rows={buildRows(state.context.teams ?? [], state.context.teamMemberships ?? [], state.context.members ?? [])}
          getRowKey={row => row.team.id}
          empty={(
            <EmptyState
              title="Nenhuma equipe criada ainda"
              description="Enquanto não houver equipes, os leads seguem a distribuição padrão do CRM. Para criar equipes, fale com a equipe YUX."
            />
          )}
        />
      )}
    </SectionCard>
  )
}
