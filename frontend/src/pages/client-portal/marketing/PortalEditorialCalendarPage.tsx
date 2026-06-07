import { CalendarDays } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems, formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalEditorialCalendarPage() {
  const {
    loading,
    error,
    calendarItems,
    contents,
  } = usePortalMarketingContext()

  const now = Date.now()
  const upcomingItems = calendarItems.filter(item => new Date(item.startsAt).getTime() >= now)
  const scheduledContents = contents.filter(content => content.status === 'scheduled')

  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Calendario Editorial"
      description="Visualiza posts, campanhas, conteudos aprovados, pendencias e publicacoes por semana ou mes."
      icon={CalendarDays}
      metrics={[
        { label: 'Agenda', value: String(calendarItems.length), detail: `${upcomingItems.length} proximos itens.` },
        { label: 'Agendados', value: String(scheduledContents.length), detail: 'Conteudos com publicacao planejada.' },
        { label: 'Pendencias', value: String(countItems(calendarItems, item => item.status === 'planned')), detail: 'Itens planejados ainda nao prontos.' },
      ]}
      capabilities={[
        'Ver posts agendados, campanhas, conteudos aprovados e pendencias.',
        'Filtrar por canal, status, data e campanha vinculada.',
        'Identificar lacunas de calendario e proximos conteudos.',
        'Conectar aprovacoes de conteudo com Marketing Studio e campanhas.',
      ]}
      primaryAction={{ label: 'Abrir Marketing Studio', href: '/portal/marketing/studio' }}
      secondaryActions={[
        { label: 'Conteudo Organico', href: '/portal/marketing/conteudo' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
        { label: 'Aprovacoes', href: '/portal/projetos/aprovacoes' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Proximas publicacoes</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Carregando calendario...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {calendarItems.slice(0, 10).map(item => (
              <article key={item.id} className="grid gap-3 rounded-md border bg-gray-50 p-3 md:grid-cols-[160px_1fr_auto] md:items-center">
                <p className="text-sm font-medium text-gray-900">{formatPortalDateTime(item.startsAt)}</p>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.channel}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(item.status)}</span>
              </article>
            ))}
            {!calendarItems.length && (
              <p className="text-sm text-gray-600">Nenhum item de calendario editorial cadastrado para este contrato.</p>
            )}
          </div>
        )}
      </section>
    </PortalJourneyPage>
  )
}
