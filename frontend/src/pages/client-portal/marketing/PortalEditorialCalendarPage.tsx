import { CalendarDays } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalEditorialCalendarPage() {
  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Calendário Editorial"
      description="Visualiza posts, campanhas, conteúdos aprovados, pendências e publicações por semana ou mês."
      icon={CalendarDays}
      metrics={[
        { label: 'Visão', value: 'Calendário', detail: 'Agenda mensal e semanal.' },
        { label: 'Filtros', value: 'Canal', detail: 'Social, blog, newsletter e campanhas.' },
        { label: 'Pendências', value: 'Aprovação', detail: 'Itens aguardando decisão.' },
      ]}
      capabilities={[
        'Ver posts agendados, campanhas, conteúdos aprovados e pendências.',
        'Filtrar por canal, status, data e campanha vinculada.',
        'Identificar lacunas de calendário e próximos conteúdos.',
        'Conectar aprovações de conteúdo com Marketing Studio e campanhas.',
      ]}
      primaryAction={{ label: 'Abrir Marketing Studio', href: '/portal/marketing/studio' }}
      secondaryActions={[
        { label: 'Conteúdo Orgânico', href: '/portal/marketing/conteudo' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
        { label: 'Aprovações', href: '/portal/projetos/aprovacoes' },
      ]}
    />
  )
}
