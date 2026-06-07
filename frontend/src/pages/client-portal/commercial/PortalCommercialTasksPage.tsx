import { CheckCircle2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCommercialTasksPage() {
  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Tarefas e Follow-ups"
      description="Centraliza próximas ações comerciais por lead, empresa, responsável e prazo."
      icon={CheckCircle2}
      metrics={[
        { label: 'Fila', value: 'Ações', detail: 'Follow-ups e tarefas comerciais.' },
        { label: 'Prioridade', value: 'Atrasadas', detail: 'Atividades que precisam de atenção.' },
        { label: 'Responsável', value: 'Equipe', detail: 'Distribuição por pessoa.' },
      ]}
      capabilities={[
        'Ver tarefas comerciais atrasadas, pendentes e concluídas.',
        'Agrupar atividades por responsável, lead, empresa ou etapa do funil.',
        'Criar, concluir e reagendar tarefas de follow-up.',
        'Preparar alertas automáticos e rotinas comerciais nas próximas fases.',
      ]}
      primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }}
      secondaryActions={[
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Empresas / Contas', href: '/portal/comercial/contas' },
      ]}
    />
  )
}
