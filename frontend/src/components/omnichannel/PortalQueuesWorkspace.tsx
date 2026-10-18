import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ListChecks, Users } from 'lucide-react'
import { ConfirmDialog, EmptyState, SectionCard, StatusChip, portalButtonClasses, sectionLinkClasses } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { omnichannelService } from '@/services/omnichannelService'
import {
  QUEUE_STRATEGY_OPTIONS,
  TEAM_AVAILABILITY_OPTIONS,
  queueStrategyLabel,
  teamAvailabilityLabel,
} from './portalLabels'
import type { PortalHandoffRule, PortalQueue, PortalTeam } from './usePortalQueuesData'

export interface PortalQueuesWorkspaceProps {
  organizationId?: string
  teams: PortalTeam[]
  queues: PortalQueue[]
  rules: PortalHandoffRule[]
  loading?: boolean
  error?: string | null
  /** `omnichannel.configure` ou `platform.manage`. Sem isso, a tela é somente leitura. */
  canConfigure: boolean
  onChanged?: () => void
}

const fieldClasses =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-2 text-[13px] text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue'

type PendingDeactivation = { kind: 'team' | 'queue'; id: string; name: string } | null

/** Equipes, filas e regras de transferência. Quem pode configurar edita aqui; os demais só consultam. */
export function PortalQueuesWorkspace({
  organizationId,
  teams,
  queues,
  rules,
  loading = false,
  error,
  canConfigure,
  onChanged,
}: PortalQueuesWorkspaceProps) {
  const portalPath = usePortalWorkspacePath()
  const [newTeamName, setNewTeamName] = useState('')
  const [newQueueName, setNewQueueName] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDeactivation, setPendingDeactivation] = useState<PendingDeactivation>(null)

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      setBusy(true)
      await action()
      toast.success(success)
      onChanged?.()
    } catch (actionError) {
      console.error(success, actionError)
      toast.error('Não foi possível salvar a alteração. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const createTeam = async (event: FormEvent) => {
    event.preventDefault()
    const name = newTeamName.trim()
    if (!name || !organizationId) return
    await run('Equipe criada', () => omnichannelService.createTeam({ organizationId, name }))
    setNewTeamName('')
  }

  const createQueue = async (event: FormEvent) => {
    event.preventDefault()
    const name = newQueueName.trim()
    if (!name || !organizationId) return
    await run('Fila criada', () => omnichannelService.createQueue({ organizationId, name }))
    setNewQueueName('')
  }

  const setActive = (kind: 'team' | 'queue', id: string, isActive: boolean) =>
    run(
      isActive ? (kind === 'team' ? 'Equipe ativada' : 'Fila ativada') : (kind === 'team' ? 'Equipe desativada' : 'Fila desativada'),
      () => (kind === 'team' ? omnichannelService.updateTeam(id, { isActive }) : omnichannelService.updateQueue(id, { isActive })),
    )

  if (error) {
    return <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft p-4 text-sm text-yx-crit">{error}</p>
  }

  return (
    <div className="space-y-6">
      {!canConfigure ? (
        <p role="note" className="rounded-lg border border-yx-line bg-yx-surface-2 px-4 py-3 text-[13px] text-yx-fg-2">
          Você pode consultar as equipes e filas. Quem administra a conta altera a configuração.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard
          id="filas-equipes"
          title="Equipes"
          description="Quem atende as conversas transferidas pela IA."
        >
          {loading ? (
            <p className="text-sm text-yx-fg-2">Carregando equipes...</p>
          ) : teams.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhuma equipe ainda"
              description={canConfigure
                ? 'Crie a primeira equipe abaixo. Depois, as filas distribuem as conversas entre os atendentes dela.'
                : 'Quando a equipe de atendimento for criada, ela aparece aqui com os atendentes.'}
            />
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {teams.map(team => (
                <li key={team.id} className="space-y-2.5 rounded-lg border border-yx-line bg-yx-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-[15px] font-semibold text-yx-fg">{team.name}</h3>
                    <StatusChip variant={team.isActive ? 'ok' : 'neutral'}>{team.isActive ? 'Ativa' : 'Inativa'}</StatusChip>
                  </div>
                  <p className="text-[13px] text-yx-fg-2">Disponibilidade: {teamAvailabilityLabel(team.availabilityMode)}</p>
                  {team.members.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`Atendentes de ${team.name}`}>
                      {team.members.map(member => (
                        <li key={member.id} className="rounded-full border border-yx-line-strong bg-yx-surface px-2.5 py-1 text-[13px] text-yx-fg">
                          {member.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-yx-fg-3">Nenhum atendente nesta equipe ainda.</p>
                  )}
                  {canConfigure ? (
                    <div className="flex flex-wrap items-end gap-2 border-t border-yx-line pt-3">
                      <label className="min-w-[12rem] flex-1 space-y-1">
                        <span className="text-xs font-medium text-yx-fg-2">Disponibilidade</span>
                        <select
                          className={fieldClasses}
                          disabled={busy}
                          value={team.availabilityMode}
                          onChange={event => run('Disponibilidade atualizada', () => omnichannelService.updateTeam(team.id, { availabilityMode: event.target.value }))}
                        >
                          {TEAM_AVAILABILITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => (team.isActive ? setPendingDeactivation({ kind: 'team', id: team.id, name: team.name }) : setActive('team', team.id, true))}
                        className={portalButtonClasses('ghost')}
                      >
                        {team.isActive ? 'Desativar equipe' : 'Ativar equipe'}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canConfigure ? (
            <form onSubmit={createTeam} className="mt-4 flex flex-wrap items-end gap-2 border-t border-yx-line pt-4">
              <label className="min-w-[12rem] flex-1 space-y-1">
                <span className="text-xs font-medium text-yx-fg-2">Nome da nova equipe</span>
                <input className={fieldClasses} value={newTeamName} onChange={event => setNewTeamName(event.target.value)} placeholder="Ex.: Atendimento" />
              </label>
              <button type="submit" disabled={busy || !newTeamName.trim()} className={portalButtonClasses('primary')}>Criar equipe</button>
            </form>
          ) : null}
        </SectionCard>

        <SectionCard
          id="filas-filas"
          title="Filas"
          description="Como as conversas transferidas são distribuídas."
        >
          {loading ? (
            <p className="text-sm text-yx-fg-2">Carregando filas...</p>
          ) : queues.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma fila ainda"
              description={canConfigure
                ? 'Crie uma fila abaixo para decidir como as conversas são distribuídas entre os atendentes.'
                : 'Quando as filas forem criadas, elas aparecem aqui com a forma de distribuição.'}
            />
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {queues.map(queue => (
                <li key={queue.id} className="space-y-2.5 rounded-lg border border-yx-line bg-yx-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-[15px] font-semibold text-yx-fg">{queue.name}</h3>
                    <StatusChip variant={queue.isActive ? 'ok' : 'neutral'}>{queue.isActive ? 'Ativa' : 'Inativa'}</StatusChip>
                  </div>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-yx-fg-3">Distribuição</dt>
                    <dd className="m-0 text-yx-fg">{queueStrategyLabel(queue.strategy)}</dd>
                    <dt className="text-yx-fg-3">Equipe</dt>
                    <dd className="m-0 text-yx-fg">{queue.teamName || 'Sem equipe'}</dd>
                    {queue.firstResponseMinutes ? (
                      <>
                        <dt className="text-yx-fg-3">Prazo de resposta</dt>
                        <dd className="m-0 text-yx-fg">{queue.firstResponseMinutes} min para a primeira resposta</dd>
                      </>
                    ) : null}
                  </dl>
                  {canConfigure ? (
                    <div className="flex flex-wrap items-end gap-2 border-t border-yx-line pt-3">
                      <label className="min-w-[14rem] flex-1 space-y-1">
                        <span className="text-xs font-medium text-yx-fg-2">Distribuição</span>
                        <select
                          className={fieldClasses}
                          disabled={busy}
                          value={queue.strategy}
                          onChange={event => run('Distribuição atualizada', () => omnichannelService.updateQueue(queue.id, { strategy: event.target.value }))}
                        >
                          {QUEUE_STRATEGY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="min-w-[14rem] flex-1 space-y-1">
                        <span className="text-xs font-medium text-yx-fg-2">Equipe da fila</span>
                        <select
                          className={fieldClasses}
                          disabled={busy}
                          value={queue.teamId || ''}
                          onChange={event => run('Equipe da fila atualizada', () => omnichannelService.updateQueue(queue.id, { teamId: event.target.value || null }))}
                        >
                          <option value="">Sem equipe</option>
                          {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => (queue.isActive ? setPendingDeactivation({ kind: 'queue', id: queue.id, name: queue.name }) : setActive('queue', queue.id, true))}
                        className={portalButtonClasses('ghost')}
                      >
                        {queue.isActive ? 'Desativar fila' : 'Ativar fila'}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canConfigure ? (
            <form onSubmit={createQueue} className="mt-4 flex flex-wrap items-end gap-2 border-t border-yx-line pt-4">
              <label className="min-w-[12rem] flex-1 space-y-1">
                <span className="text-xs font-medium text-yx-fg-2">Nome da nova fila</span>
                <input className={fieldClasses} value={newQueueName} onChange={event => setNewQueueName(event.target.value)} placeholder="Ex.: Comercial" />
              </label>
              <button type="submit" disabled={busy || !newQueueName.trim()} className={portalButtonClasses('primary')}>Criar fila</button>
            </form>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        id="filas-regras"
        title="Quando a IA transfere para um atendente"
        description="Regras que levam a conversa da IA para uma pessoa."
        action={
          <Link to={portalPath('/portal/atendimento/agente-ia')} className={sectionLinkClasses}>
            {canConfigure ? 'Ajustar no Agente IA' : 'Ver no Agente IA'}
          </Link>
        }
      >
        {loading ? (
          <p className="text-sm text-yx-fg-2">Carregando regras...</p>
        ) : rules.length === 0 ? (
          <EmptyState
            title="Nenhuma regra de transferência"
            description="Sem regras, a IA só transfere quando o cliente pede para falar com uma pessoa. Defina os gatilhos no Agente IA."
          />
        ) : (
          <ul className="m-0 list-none divide-y divide-yx-line p-0">
            {rules.map(rule => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-yx-fg">{rule.name}</span>
                <StatusChip variant={rule.isEnabled ? 'ok' : 'neutral'}>{rule.isEnabled ? 'Em uso' : 'Desligada'}</StatusChip>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={pendingDeactivation !== null}
        onOpenChange={open => { if (!open) setPendingDeactivation(null) }}
        title={pendingDeactivation?.kind === 'team' ? 'Desativar equipe?' : 'Desativar fila?'}
        description={pendingDeactivation?.kind === 'team'
          ? `A equipe ${pendingDeactivation?.name} deixa de receber conversas transferidas. Você pode ativá-la de novo quando quiser.`
          : `Novas conversas deixam de entrar na fila ${pendingDeactivation?.name}. Você pode ativá-la de novo quando quiser.`}
        confirmLabel="Desativar"
        tone="danger"
        onConfirm={async () => {
          if (!pendingDeactivation) return
          await setActive(pendingDeactivation.kind, pendingDeactivation.id, false)
          setPendingDeactivation(null)
        }}
      />
    </div>
  )
}
