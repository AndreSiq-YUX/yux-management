import { UserPlus } from 'lucide-react'
import { EmptyState, ErrorState, PendingAction, ResponsiveTable, SectionCard, SkeletonCard, StatusChip, type ResponsiveTableColumn } from '@/components/portal-ui'
import type { CrmInstanceMember } from '@/types/crm'
import { crmMemberStatusLabel, crmRoleLabel, summarizeSeatUsage } from './governanceDisplay'
import { useCrmGovernance } from './useCrmGovernance'

const statusVariant = (status: CrmInstanceMember['status']) => (status === 'active' ? 'ok' : status === 'invited' ? 'warn' : 'neutral') as 'ok' | 'warn' | 'neutral'

/**
 * Pessoas que usam o CRM da empresa, com papel e situação reais.
 * Convidar pessoas depende de gestão de usuários do portal (a vaga no CRM exige uma conta já criada),
 * por isso o botão fica visível e marcado como pendente, junto com as vagas livres.
 */
/** "Administradores" vira "administrador" quando há exatamente uma vaga livre. */
function seatLabel(label: string, count: number) {
  const lower = label.toLowerCase()
  if (count !== 1) return lower
  return lower.endsWith('ores') ? lower.slice(0, -2) : lower.endsWith('s') ? lower.slice(0, -1) : lower
}

export function CrmMembersPanel() {
  const { state, reload } = useCrmGovernance()

  const columns: ResponsiveTableColumn<CrmInstanceMember>[] = [
    {
      key: 'name',
      header: 'Pessoa',
      mobileLabel: '',
      render: member => (
        <span>
          <span className="font-semibold text-yx-fg">{member.displayName || member.email || 'Sem nome'}</span>
          {state.status === 'ready' && state.context.currentMember?.id === member.id ? <span className="ml-2 text-xs text-yx-fg-3">(você)</span> : null}
        </span>
      ),
    },
    { key: 'email', header: 'E-mail', render: member => member.email || '—' },
    { key: 'role', header: 'Papel', render: member => crmRoleLabel[member.role] ?? member.role },
    { key: 'status', header: 'Situação', render: member => <StatusChip variant={statusVariant(member.status)}>{crmMemberStatusLabel[member.status] ?? member.status}</StatusChip> },
  ]

  const seats = state.status === 'ready' ? summarizeSeatUsage(state.context.instance, state.context.members ?? []) : []
  const allFull = seats.length > 0 && seats.every(row => row.free === 0)

  return (
    <SectionCard
      id="crm-members"
      title="Pessoas e papéis"
      description="Quem usa o CRM da sua empresa e o papel de cada pessoa, dentro das vagas contratadas."
      action={<PendingAction code="B24"><UserPlus className="h-4 w-4" />Convidar pessoa</PendingAction>}
    >
      {state.status === 'loading' ? (
        <SkeletonCard lines={4} />
      ) : state.status === 'error' ? (
        <ErrorState title="Não foi possível carregar as pessoas" description="Tente novamente em instantes." onRetry={() => void reload()} />
      ) : state.status === 'unavailable' ? (
        <EmptyState
          title="O CRM ainda não foi publicado"
          description="Quando a equipe YUX publicar o CRM da sua empresa, as pessoas e os papéis aparecem aqui."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-yx-fg-2">
            {allFull
              ? 'Todas as vagas contratadas estão em uso. Para convidar mais pessoas, fale com a equipe YUX para ampliar o contrato.'
              : `Vagas livres: ${seats.map(row => `${row.free} ${seatLabel(row.label, row.free)}`).join(', ')}.`}
          </p>
          <ResponsiveTable
            caption="Pessoas do CRM"
            columns={columns}
            rows={state.context.members ?? []}
            getRowKey={member => member.id}
            empty={(
              <EmptyState
                title="Ninguém foi adicionado ao CRM ainda"
                description="Assim que as primeiras pessoas forem convidadas, elas aparecem aqui com o papel e a situação de cada uma."
              />
            )}
          />
        </div>
      )}
    </SectionCard>
  )
}
