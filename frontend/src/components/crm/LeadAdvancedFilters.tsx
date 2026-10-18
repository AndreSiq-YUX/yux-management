import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SmartSegmentBuilder } from '@/components/growth-workspace/SmartSegmentBuilder'
import { portalButtonClasses } from '@/components/portal-ui'
import type { CrmPipelineStage } from '@/types/crm'
import type { CrmCockpitFilterState, CrmLeadTemperature } from '@/types/crmCockpit'

interface LeadAdvancedFiltersProps {
  filters: CrmCockpitFilterState
  stages: CrmPipelineStage[]
  sources: string[]
  onChange: (filters: CrmCockpitFilterState) => void
  showSmartSegmentBuilder?: boolean
  /**
   * `portal`: busca sempre visível e filtros avançados recolhidos
   * (no celular abrem em painel inferior).
   */
  profile?: 'internal' | 'portal'
}

const temperatures: Array<{ value: CrmLeadTemperature; label: string }> = [
  { value: 'hot', label: 'Quente' },
  { value: 'warm', label: 'Morno' },
  { value: 'cold', label: 'Frio' },
  { value: 'unqualified', label: 'Sem fit' },
]

const portalTemperatureLabel: Record<CrmLeadTemperature, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
  unqualified: 'Fora do perfil',
}

const emptyValue = '__all__'

export function LeadAdvancedFilters({
  filters,
  stages,
  sources,
  onChange,
  showSmartSegmentBuilder,
  profile = 'internal',
}: LeadAdvancedFiltersProps) {
  if (profile === 'portal') {
    return (
      <PortalLeadFilters
        filters={filters}
        stages={stages}
        sources={sources}
        onChange={onChange}
        showSmartSegmentBuilder={showSmartSegmentBuilder}
      />
    )
  }

  return (
    <section className="space-y-3">
      <div className="grid gap-3 rounded-lg border bg-white p-3 md:grid-cols-5">
        <Input
          aria-label="Buscar lead"
          placeholder="Buscar lead"
          value={filters.search || ''}
          onChange={event => onChange({ ...filters, search: event.target.value || undefined })}
        />
        <Select
          value={filters.stageId || emptyValue}
          onValueChange={value => onChange({ ...filters, stageId: value === emptyValue ? undefined : value })}
        >
          <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={emptyValue}>Todas etapas</SelectItem>
            {stages.map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={filters.source || emptyValue}
          onValueChange={value => onChange({ ...filters, source: value === emptyValue ? undefined : value })}
        >
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={emptyValue}>Todas origens</SelectItem>
            {sources.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={filters.temperature || emptyValue}
          onValueChange={value => onChange({ ...filters, temperature: value === emptyValue ? undefined : value as CrmLeadTemperature })}
        >
          <SelectTrigger><SelectValue placeholder="Temperatura" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={emptyValue}>Todas temperaturas</SelectItem>
            {temperatures.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <ButtonLikeCheckbox checked={Boolean(filters.stalledOnly)} onClick={() => onChange({ ...filters, stalledOnly: !filters.stalledOnly })} />
      </div>
      {showSmartSegmentBuilder && (
        <SmartSegmentBuilder
          stages={stages}
          sources={sources}
        />
      )}
    </section>
  )
}

function activeAdvancedCount(filters: CrmCockpitFilterState) {
  return [filters.stageId, filters.source, filters.temperature, filters.stalledOnly].filter(Boolean).length
}

function PortalLeadFilters({
  filters,
  stages,
  sources,
  onChange,
  showSmartSegmentBuilder,
}: Omit<LeadAdvancedFiltersProps, 'profile'>) {
  const [open, setOpen] = useState(false)
  const activeCount = activeAdvancedCount(filters)
  const hasAnyFilter = activeCount > 0 || Boolean(filters.search)

  return (
    <section aria-label="Filtros de leads" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="lead-search" className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">
            Buscar lead
          </Label>
          <div className="relative mt-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
            <Input
              id="lead-search"
              className="h-10 pl-9"
              placeholder="Nome, e-mail, telefone ou empresa"
              value={filters.search || ''}
              onChange={event => onChange({ ...filters, search: event.target.value || undefined })}
            />
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="lead-advanced-filters"
          onClick={() => setOpen(current => !current)}
          className={portalButtonClasses('ghost')}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filtros e segmentos{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {hasAnyFilter && (
          <button type="button" onClick={() => onChange({})} className={portalButtonClasses('ghost')}>
            Limpar filtros
          </button>
        )}
      </div>

      {open && <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink-900/60 md:hidden" onClick={() => setOpen(false)} />}
      <div
        id="lead-advanced-filters"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] space-y-4 overflow-y-auto rounded-t-2xl border-t border-yx-line bg-yx-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg md:static md:z-auto md:max-h-none md:rounded-lg md:border md:pb-4 md:shadow-none"
      >
        <div className="flex items-center justify-between md:hidden">
          <h2 className="font-display text-base font-semibold text-yx-fg">Filtros e segmentos</h2>
          <button
            type="button"
            aria-label="Fechar filtros"
            onClick={() => setOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-lg text-yx-fg-3 hover:bg-yx-surface-2"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="lead-filter-stage" className="text-[13px] text-yx-fg-2">Etapa</Label>
            <Select
              value={filters.stageId || emptyValue}
              onValueChange={value => onChange({ ...filters, stageId: value === emptyValue ? undefined : value })}
            >
              <SelectTrigger id="lead-filter-stage" className="mt-1 h-10"><SelectValue placeholder="Etapa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={emptyValue}>Todas as etapas</SelectItem>
                {stages.map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lead-filter-source" className="text-[13px] text-yx-fg-2">Origem</Label>
            <Select
              value={filters.source || emptyValue}
              onValueChange={value => onChange({ ...filters, source: value === emptyValue ? undefined : value })}
            >
              <SelectTrigger id="lead-filter-source" className="mt-1 h-10"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={emptyValue}>Todas as origens</SelectItem>
                {sources.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lead-filter-temperature" className="text-[13px] text-yx-fg-2">Temperatura</Label>
            <Select
              value={filters.temperature || emptyValue}
              onValueChange={value => onChange({ ...filters, temperature: value === emptyValue ? undefined : value as CrmLeadTemperature })}
            >
              <SelectTrigger id="lead-filter-temperature" className="mt-1 h-10"><SelectValue placeholder="Temperatura" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={emptyValue}>Todas as temperaturas</SelectItem>
                {temperatures.map(item => <SelectItem key={item.value} value={item.value}>{portalTemperatureLabel[item.value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              aria-pressed={Boolean(filters.stalledOnly)}
              onClick={() => onChange({ ...filters, stalledOnly: !filters.stalledOnly })}
              className={`min-h-10 w-full rounded-md border px-3 text-left text-sm ${filters.stalledOnly ? 'border-yx-warn-line bg-yx-warn-soft text-yx-warn' : 'border-yx-line-strong bg-yx-surface text-yx-fg-2'}`}
            >
              Só leads parados
            </button>
          </div>
        </div>
        {showSmartSegmentBuilder && <SmartSegmentBuilder stages={stages} sources={sources} />}
        <button type="button" onClick={() => setOpen(false)} className={portalButtonClasses('primary', 'w-full md:hidden')}>
          Ver resultados
        </button>
      </div>
    </section>
  )
}

function ButtonLikeCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-2 text-left text-sm ${checked ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-white text-gray-700'}`}
      onClick={onClick}
    >
      Travados
    </button>
  )
}
