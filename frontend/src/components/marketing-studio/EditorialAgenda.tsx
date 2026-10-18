import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { EmptyState, StatusChip, sectionLinkClasses } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatShortDate } from '@/lib/client-portal/portalDisplay'
import {
  calendarStatusLabel,
  calendarStatusVariant,
  channelLabel,
  formatTime,
  parseEntryDate,
  upcomingEntries,
  type EditorialCalendarEntry,
} from './editorialCalendar'

export const EDITORIAL_CALENDAR_PATH = '/portal/marketing/calendario'

interface EditorialAgendaProps {
  entries: EditorialCalendarEntry[]
  /** Quantos itens mostrar. */
  limit?: number
  emptyDescription?: string
}

/**
 * Lista compacta dos próximos itens do calendário editorial, com link para o calendário completo.
 * Usada no Marketing Studio e na Central de conteúdo.
 */
export function EditorialAgenda({ entries, limit = 5, emptyDescription }: EditorialAgendaProps) {
  const toWorkspace = usePortalWorkspacePath()
  const next = upcomingEntries(entries, new Date(), limit)

  return (
    <div className="space-y-3">
      {next.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma publicação programada"
          description={emptyDescription ?? 'Quando um conteúdo for agendado, ele aparece aqui com dia, canal e situação.'}
        />
      ) : (
        <ul aria-label="Próximas publicações" className="m-0 grid list-none gap-2 p-0">
          {next.map(entry => {
            const date = parseEntryDate(entry)
            return (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-yx-fg">{entry.title}</p>
                  <p className="text-xs text-yx-fg-3">
                    {date ? `${formatShortDate(date)} às ${formatTime(date)}` : 'Sem data'} · {channelLabel(entry.channel)}
                  </p>
                </div>
                <StatusChip variant={calendarStatusVariant(entry.status)}>{calendarStatusLabel(entry.status)}</StatusChip>
              </li>
            )
          })}
        </ul>
      )}
      <Link to={toWorkspace(EDITORIAL_CALENDAR_PATH)} className={sectionLinkClasses}>
        Ver calendário completo
      </Link>
    </div>
  )
}
