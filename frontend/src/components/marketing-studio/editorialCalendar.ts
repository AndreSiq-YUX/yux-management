import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { StatusChipVariant } from '@/components/portal-ui'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import type { MarketingCalendarStatus } from '@/types/marketingStudio'

/** Item mínimo do calendário editorial (aceita o item completo e o resumo do Marketing Studio). */
export interface EditorialCalendarEntry {
  id: string
  title: string
  channel: string
  status: MarketingCalendarStatus | string
  startsAt: string
}

export type CalendarView = 'month' | 'week'

/** O calendário começa no domingo, como na maioria dos calendários brasileiros. */
const WEEK_OPTIONS = { weekStartsOn: 0 as const, locale: ptBR }

const CHANNEL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  blog: 'Blog',
  newsletter: 'Newsletter',
  email: 'E-mail',
  ad: 'Anúncios',
  video_script: 'Vídeo',
  carousel: 'Carrossel',
  whatsapp_broadcast: 'WhatsApp',
}

/** Nome do canal editorial para o cliente (sem códigos internos). */
export function channelLabel(channel?: string | null): string {
  if (!channel) return 'Canal não informado'
  return CHANNEL_LABELS[channel] || statusLabel(channel)
}

/** Texto do status de um item do calendário. */
export function calendarStatusLabel(status: string): string {
  return statusLabel(status)
}

export function calendarStatusVariant(status: string): StatusChipVariant {
  switch (status) {
    case 'scheduled':
    case 'published':
      return 'ok'
    case 'ready':
      return 'warn'
    case 'missed':
      return 'crit'
    default:
      return 'neutral'
  }
}

/** Chave estável do dia local ("2026-10-20"). */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function parseEntryDate(entry: EditorialCalendarEntry): Date | null {
  const date = new Date(entry.startsAt)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Todos os dias exibidos na grade do mês (semanas completas, de domingo a sábado). */
export function getMonthGridDays(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor), WEEK_OPTIONS)
  const end = endOfWeek(endOfMonth(anchor), WEEK_OPTIONS)
  const days: Date[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
}

/** Os sete dias da semana que contém `anchor`. */
export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, WEEK_OPTIONS)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Move a âncora um mês ou uma semana. */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  return view === 'month' ? addMonths(anchor, direction) : addWeeks(anchor, direction)
}

/** Título do período exibido: "outubro de 2026" ou "18 a 24 de out. de 2026". */
export function rangeLabel(view: CalendarView, anchor: Date): string {
  if (view === 'month') return format(anchor, "MMMM 'de' yyyy", { locale: ptBR })
  const days = getWeekDays(anchor)
  const first = days[0]
  const last = days[6]
  if (first.getMonth() === last.getMonth()) {
    return `${format(first, 'd')} a ${format(last, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
  }
  return `${format(first, "d 'de' MMM", { locale: ptBR })} a ${format(last, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
}

/** Agrupa os itens pelo dia local de `startsAt`, cada dia em ordem de horário. */
export function groupEntriesByDay<T extends EditorialCalendarEntry>(entries: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  const sorted = entries
    .map(entry => ({ entry, date: parseEntryDate(entry) }))
    .filter((row): row is { entry: T; date: Date } => row.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  sorted.forEach(({ entry, date }) => {
    const key = dayKey(date)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  })
  return groups
}

/** Itens a partir do início de hoje, do mais próximo ao mais distante. */
export function upcomingEntries<T extends EditorialCalendarEntry>(entries: T[], now: Date = new Date(), limit = 5): T[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return entries
    .map(entry => ({ entry, date: parseEntryDate(entry) }))
    .filter((row): row is { entry: T; date: Date } => row.date !== null && row.date.getTime() >= startOfToday)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
    .map(row => row.entry)
}

/** Itens que caem dentro do período exibido (mês inteiro ou semana). */
export function entriesInPeriod<T extends EditorialCalendarEntry>(entries: T[], view: CalendarView, anchor: Date): T[] {
  const start = view === 'month' ? startOfMonth(anchor) : startOfWeek(anchor, WEEK_OPTIONS)
  const end = view === 'month' ? endOfMonth(anchor) : endOfWeek(anchor, WEEK_OPTIONS)
  return entries.filter(entry => {
    const date = parseEntryDate(entry)
    return date !== null && date >= start && date <= end
  })
}

export function formatDayHeading(date: Date): string {
  return format(date, "EEE, d 'de' MMM", { locale: ptBR })
}

export function formatTime(date: Date): string {
  return format(date, 'HH:mm')
}
