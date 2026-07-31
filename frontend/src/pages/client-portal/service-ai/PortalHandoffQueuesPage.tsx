import { MessageCircle } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalHandoffQueuesPage() {
  return (
    <PortalJourneyPage
      eyebrow="Atendimento & IA"
      title="Filas e Handoff"
      description="Define equipes, filas, regras de transferencia, horario comercial, prioridade e SLA de atendimento."
      icon={MessageCircle}
      metrics={[
        { label: 'Equipes', value: 'Atendimento', detail: 'Distribuicao entre atendentes.' },
        { label: 'SLA', value: 'Prioridade', detail: 'Regras por tipo de demanda.' },
        { label: 'Handoff', value: 'Humano', detail: 'Quando a IA transfere a conversa.' },
      ]}
      capabilities={[
        'Gerenciar equipes de atendimento e filas operacionais.',
        'Configurar regras de transferencia, prioridade e horario comercial.',
        'Definir SLA e distribuicao entre atendentes.',
        'Separar governanca de atendimento da tela de mensagens.',
      ]}
      primaryAction={{ label: 'Abrir Conversas', href: '/portal/atendimento/conversas' }}
      secondaryActions={[
        { label: 'Agente IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Canais', href: '/portal/atendimento/canais' },
      ]}
    />
  )
}
