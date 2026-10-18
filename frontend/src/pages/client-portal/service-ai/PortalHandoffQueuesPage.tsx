import { PortalPage } from '@/components/client-portal/PortalPage'
import { PortalQueuesWorkspace } from '@/components/omnichannel/PortalQueuesWorkspace'
import { useCanConfigureOmnichannel } from '@/components/omnichannel/useCanConfigureOmnichannel'
import { usePortalQueuesData } from '@/components/omnichannel/usePortalQueuesData'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalHandoffQueuesPage() {
  const canConfigure = useCanConfigureOmnichannel()
  const organizationId = usePlatformStore(state => state.organization?.id || state.activeContract?.clientId)
  const { teams, queues, rules, loading, error, reload } = usePortalQueuesData(organizationId)

  const ready = !loading && !error
  const metrics = ready
    ? [
        { label: 'Equipes ativas', value: String(teams.filter(team => team.isActive).length), detail: 'Equipes que recebem conversas.' },
        { label: 'Filas ativas', value: String(queues.filter(queue => queue.isActive).length), detail: 'Filas que distribuem conversas.' },
        {
          label: 'Atendentes',
          value: String(new Set(teams.flatMap(team => team.members.map(member => member.id))).size),
          detail: 'Pessoas nas equipes.',
        },
      ]
    : []

  return (
    <PortalPage
      eyebrow="Atendimento"
      title="Filas e transferência para atendente"
      description="Veja quem atende as conversas que a IA transfere e como elas são distribuídas."
      metrics={metrics}
      help={[
        'Equipes reúnem as pessoas que atendem os clientes.',
        'Filas decidem como as conversas transferidas são distribuídas entre os atendentes.',
        'Os gatilhos que fazem a IA transferir a conversa ficam no Agente IA.',
      ]}
      related={[
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Agente IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Canais conectados', href: '/portal/atendimento/canais' },
      ]}
    >
      <PortalQueuesWorkspace
        organizationId={organizationId}
        teams={teams}
        queues={queues}
        rules={rules}
        loading={loading}
        error={error}
        canConfigure={canConfigure}
        onChanged={() => { void reload() }}
      />
    </PortalPage>
  )
}
