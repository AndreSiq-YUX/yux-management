import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
} from '@/components/portal-ui'
import {
  WEEKDAY_LABELS,
  calendarStatusLabel,
  calendarStatusVariant,
  channelLabel,
  dayKey,
  entriesInPeriod,
  formatDayHeading,
  formatTime,
  getMonthGridDays,
  getWeekDays,
  groupEntriesByDay,
  parseEntryDate,
  rangeLabel,
  shiftAnchor,
  type CalendarView,
} from '@/components/marketing-studio/editorialCalendar'
import { useMediaQuery } from '@/components/marketing-studio/useMediaQuery'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { cn } from '@/lib/utils'
import type { MarketingCalendarItem } from '@/types/marketingStudio'

const MAX_ITEMS_PER_MONTH_CELL = 2
const GRID_QUERY = '(min-width: 1024px)'

interface CalendarFilters {
  channel: string
  status: string
}

const emptyFilters: CalendarFilters = { channel: '', status: '' }

function uniqueOptions(values: string[], label: (value: string) => string) {
  return Array.from(new Set(values))
    .map(value => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

export function PortalEditorialCalendarPage() {
  const { loading, error, calendarItems, reload } = usePortalMarketingContext({ resources: ['calendarItems'] })
  const showGrid = useMediaQuery(GRID_QUERY, true)
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState<Date>(today)
  const [filters, setFilters] = useState<CalendarFilters>(emptyFilters)

  const channelOptions = useMemo(
    () => uniqueOptions(calendarItems.map(item => item.channel), channelLabel),
    [calendarItems],
  )
  const statusOptions = useMemo(
    () => uniqueOptions(calendarItems.map(item => item.status), calendarStatusLabel),
    [calendarItems],
  )

  const filteredItems = useMemo(
    () => calendarItems.filter(item => (
      (!filters.channel || item.channel === filters.channel)
      && (!filters.status || item.status === filters.status)
    )),
    [calendarItems, filters],
  )

  const itemsByDay = useMemo(() => groupEntriesByDay(filteredItems), [filteredItems])
  const periodItems = useMemo(() => entriesInPeriod(filteredItems, view, anchor), [anchor, filteredItems, view])
  const hasActiveFilters = Boolean(filters.channel || filters.status)

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const metrics = !loading && !error && calendarItems.length > 0
    ? [
        { label: 'Itens no calendário', value: String(calendarItems.length), detail: 'Todos os períodos' },
        {
          label: 'Próximas saídas',
          value: String(calendarItems.filter(item => {
            const date = parseEntryDate(item)
            return date !== null && date.getTime() >= startOfToday
          }).length),
          detail: 'De hoje em diante',
        },
        { label: 'Agendados', value: String(calendarItems.filter(item => item.status === 'scheduled').length), detail: 'Com publicação marcada' },
        { label: 'Planejados', value: String(calendarItems.filter(item => item.status === 'planned').length), detail: 'Ainda não estão prontos' },
      ]
    : []

  return (
    <PortalPage
      eyebrow="Marketing"
      title="Calendário editorial"
      description="Veja quando cada conteúdo, post e campanha sai. Para criar ou ajustar, use o Marketing Studio; para aprovar, a Central de conteúdo."
      primaryAction={{ label: 'Planejar no Marketing Studio', href: '/portal/marketing/studio' }}
      metrics={metrics}
      related={[
        { label: 'Central de conteúdo', href: '/portal/marketing/conteudo' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
        { label: 'Aprovações', href: '/portal/projetos/aprovacoes' },
      ]}
    >
      {loading ? (
        <SkeletonCard lines={8} />
      ) : error ? (
        <ErrorState title="Não foi possível carregar o calendário." description={error} onRetry={() => void reload()} />
      ) : calendarItems.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma publicação no calendário ainda"
          description="Quando um conteúdo for planejado ou agendado no Marketing Studio, ele aparece aqui no dia em que sai, com canal e situação."
          action={{ label: 'Ir para o Marketing Studio', href: '/portal/marketing/studio' }}
        />
      ) : (
        <SectionCard id="editorial-calendar" title="Quando cada coisa sai" className="overflow-hidden" bodyClassName="space-y-4">
          <CalendarToolbar
            view={view}
            onViewChange={setView}
            label={rangeLabel(view, anchor)}
            onPrevious={() => setAnchor(current => shiftAnchor(view, current, -1))}
            onNext={() => setAnchor(current => shiftAnchor(view, current, 1))}
            onToday={() => setAnchor(new Date())}
            channelOptions={channelOptions}
            statusOptions={statusOptions}
            filters={filters}
            onFilterChange={(key, value) => setFilters(current => ({ ...current, [key]: value }))}
            onClearFilters={() => setFilters(emptyFilters)}
            hasActiveFilters={hasActiveFilters}
          />

          {filteredItems.length === 0 ? (
            <EmptyState
              title="Nenhum item com esses filtros"
              description="Mude o canal ou o status, ou limpe os filtros para ver todo o calendário."
              action={{ label: 'Limpar filtros', onClick: () => setFilters(emptyFilters) }}
            />
          ) : showGrid ? (
            view === 'month' ? (
              <MonthGrid
                anchor={anchor}
                today={today}
                itemsByDay={itemsByDay}
                onOpenWeek={day => {
                  setAnchor(day)
                  setView('week')
                }}
              />
            ) : (
              <WeekGrid anchor={anchor} today={today} itemsByDay={itemsByDay} />
            )
          ) : (
            <AgendaList items={periodItems} view={view} />
          )}
        </SectionCard>
      )}
    </PortalPage>
  )
}

interface ToolbarProps {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  label: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  channelOptions: Array<{ value: string; label: string }>
  statusOptions: Array<{ value: string; label: string }>
  filters: CalendarFilters
  onFilterChange: (key: keyof CalendarFilters, value: string) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

function CalendarToolbar({
  view,
  onViewChange,
  label,
  onPrevious,
  onNext,
  onToday,
  channelOptions,
  statusOptions,
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
}: ToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onPrevious} aria-label="Período anterior" className={portalButtonClasses('ghost', 'px-2.5')}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" onClick={onToday} className={portalButtonClasses('ghost')}>
            Hoje
          </button>
          <button type="button" onClick={onNext} aria-label="Próximo período" className={portalButtonClasses('ghost', 'px-2.5')}>
            <ChevronRight aria-hidden="true" />
          </button>
          <p aria-live="polite" data-testid="calendar-range" className="ml-1 font-display text-base font-semibold first-letter:uppercase text-yx-fg">
            {label}
          </p>
        </div>
        <div role="group" aria-label="Período exibido" className="inline-flex rounded-lg border border-yx-line-strong bg-yx-surface-2 p-0.5">
          {(['month', 'week'] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => onViewChange(option)}
              className={cn(
                'min-h-10 rounded-md px-3.5 text-[13px] font-semibold sm:min-h-8',
                portalFocusRing,
                view === option ? 'bg-yx-surface text-yx-blue shadow-sm' : 'text-yx-fg-2 hover:text-yx-fg',
              )}
            >
              {option === 'month' ? 'Mês' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Canal" allLabel="Todos os canais" value={filters.channel} options={channelOptions} onChange={value => onFilterChange('channel', value)} />
        <FilterSelect label="Status" allLabel="Todos os status" value={filters.status} options={statusOptions} onChange={value => onFilterChange('status', value)} />
        {hasActiveFilters ? (
          <button type="button" onClick={onClearFilters} className={portalButtonClasses('ghost')}>
            Limpar filtros
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string
  allLabel: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] font-medium text-yx-fg-2">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={cn(
          'min-h-10 rounded-lg border border-yx-line-strong bg-yx-surface px-2.5 text-[13px] text-yx-fg sm:min-h-[34px]',
          portalFocusRing,
        )}
      >
        <option value="">{allLabel}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

/** Um item do calendário: horário, título, canal e status. */
function CalendarEntry({ item, compact = false }: { item: MarketingCalendarItem; compact?: boolean }) {
  const date = parseEntryDate(item)
  return (
    <div
      data-testid="calendar-entry"
      className={cn('min-w-0 rounded-md border border-yx-line bg-yx-surface-2', compact ? 'px-1.5 py-1' : 'px-2.5 py-2')}
    >
      <p className={cn('truncate font-semibold text-yx-fg', compact ? 'text-xs' : 'text-[13.5px]')} title={item.title}>
        {date ? <span className="mr-1 font-mono font-medium tabular-nums text-yx-fg-3">{formatTime(date)}</span> : null}
        {item.title}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-[11px] text-yx-fg-3">{channelLabel(item.channel)}</span>
        <StatusChip variant={calendarStatusVariant(item.status)} className="px-1.5 py-0 text-[10.5px]">
          {calendarStatusLabel(item.status)}
        </StatusChip>
      </div>
    </div>
  )
}

function DayNumber({ day, today }: { day: Date; today: Date }) {
  const isToday = dayKey(day) === dayKey(today)
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-xs font-medium tabular-nums',
        isToday ? 'bg-yx-blue text-white' : 'text-yx-fg-2',
      )}
      aria-label={isToday ? `${day.getDate()} (hoje)` : undefined}
    >
      {day.getDate()}
    </span>
  )
}

function WeekdayHeader() {
  return (
    <div aria-hidden="true" className="grid grid-cols-7 border-b border-yx-line bg-yx-surface-2">
      {WEEKDAY_LABELS.map(label => (
        <div key={label} className="px-2 py-2 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">
          {label}
        </div>
      ))}
    </div>
  )
}

function MonthGrid({
  anchor,
  today,
  itemsByDay,
  onOpenWeek,
}: {
  anchor: Date
  today: Date
  itemsByDay: Map<string, MarketingCalendarItem[]>
  onOpenWeek: (day: Date) => void
}) {
  const days = getMonthGridDays(anchor)
  return (
    <div data-testid="month-grid" className="overflow-hidden rounded-lg border border-yx-line">
      <WeekdayHeader />
      <ol className="m-0 grid list-none grid-cols-7 p-0">
        {days.map(day => {
          const key = dayKey(day)
          const items = itemsByDay.get(key) ?? []
          const outside = day.getMonth() !== anchor.getMonth()
          const hidden = items.length - MAX_ITEMS_PER_MONTH_CELL
          return (
            <li
              key={key}
              data-day={key}
              className={cn(
                'min-h-[112px] min-w-0 border-b border-r border-yx-line p-1.5 [&:nth-child(7n)]:border-r-0',
                outside && 'bg-yx-surface-2/60 opacity-70',
              )}
            >
              <DayNumber day={day} today={today} />
              <div className="mt-1 grid gap-1">
                {items.slice(0, MAX_ITEMS_PER_MONTH_CELL).map(item => <CalendarEntry key={item.id} item={item} compact />)}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenWeek(day)}
                    className={cn('rounded text-left text-[11.5px] font-semibold text-yx-blue hover:text-yx-blue-ink', portalFocusRing)}
                  >
                    +{hidden} {hidden === 1 ? 'item' : 'itens'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function WeekGrid({
  anchor,
  today,
  itemsByDay,
}: {
  anchor: Date
  today: Date
  itemsByDay: Map<string, MarketingCalendarItem[]>
}) {
  const days = getWeekDays(anchor)
  return (
    <div data-testid="week-grid" className="overflow-hidden rounded-lg border border-yx-line">
      <WeekdayHeader />
      <ol className="m-0 grid list-none grid-cols-7 p-0">
        {days.map(day => {
          const key = dayKey(day)
          const items = itemsByDay.get(key) ?? []
          return (
            <li key={key} data-day={key} className="min-h-[220px] min-w-0 border-r border-yx-line p-2 last:border-r-0">
              <DayNumber day={day} today={today} />
              <div className="mt-2 grid gap-1.5">
                {items.map(item => <CalendarEntry key={item.id} item={item} />)}
                {items.length === 0 ? <p className="text-[11.5px] text-yx-fg-3">Nada neste dia</p> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Agenda em lista (celular e tablet): os itens do período agrupados por dia. */
function AgendaList({ items, view }: { items: MarketingCalendarItem[]; view: CalendarView }) {
  const groups = Array.from(groupEntriesByDay(items))
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={view === 'month' ? 'Nada programado neste mês' : 'Nada programado nesta semana'}
        description="Use as setas para ver outros períodos."
      />
    )
  }
  return (
    <ol data-testid="agenda-list" aria-label="Agenda do período" className="m-0 grid list-none gap-4 p-0">
      {groups.map(([key, dayItems]) => {
        const date = parseEntryDate(dayItems[0])
        return (
          <li key={key} data-day={key}>
            <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">
              {date ? formatDayHeading(date) : key}
            </h3>
            <div className="grid gap-2">
              {dayItems.map(item => <CalendarEntry key={item.id} item={item} />)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
