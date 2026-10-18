import { EmptyState, ErrorState, ProgressRow, SectionCard, SkeletonCard, StatusChip } from '@/components/portal-ui'
import { summarizeSeatUsage } from './governanceDisplay'
import { useCrmGovernance } from './useCrmGovernance'

/** Vagas contratadas do CRM (vendedores, gerentes e administradores): usadas x limite reais. */
export function CrmSeatUsagePanel() {
  const { state, reload } = useCrmGovernance()

  return (
    <SectionCard
      id="crm-seats"
      title="Vagas contratadas"
      description="Quantas pessoas de cada papel podem usar o CRM da sua empresa, conforme o seu contrato."
    >
      {state.status === 'loading' ? (
        <SkeletonCard lines={3} />
      ) : state.status === 'error' ? (
        <ErrorState title="Não foi possível carregar as vagas" description="Tente novamente em instantes." onRetry={() => void reload()} />
      ) : state.status === 'unavailable' ? (
        <EmptyState
          title="O CRM ainda não foi publicado"
          description="Quando a equipe YUX publicar o CRM da sua empresa, as vagas contratadas aparecem aqui."
        />
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
          {summarizeSeatUsage(state.context.instance, state.context.members ?? []).map(row => {
            const full = row.used >= row.limit
            return (
              <li key={row.role} className="rounded-lg border border-yx-line bg-yx-surface p-3.5">
                <ProgressRow
                  title={row.label}
                  subtitle={`${row.used} / ${row.limit} em uso`}
                  percent={row.limit > 0 ? (row.used / row.limit) * 100 : 0}
                  status={
                    row.limit === 0
                      ? <StatusChip variant="neutral">Sem vagas</StatusChip>
                      : full
                        ? <StatusChip variant="warn">Completo</StatusChip>
                        : <StatusChip variant="ok">{row.free} {row.free === 1 ? 'livre' : 'livres'}</StatusChip>
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
