import { useMemo, useState } from 'react'
import { ArrowRight, Library, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { filterGrowthTemplates, growthTemplateCatalog } from '@/lib/growth-workspace/templateRules'
import type {
  GrowthTemplate,
  GrowthTemplateChannel,
  GrowthTemplateFilter,
  GrowthTemplateModule,
  GrowthTemplateObjective,
} from '@/types/growthWorkspace'

interface GrowthTemplateLibraryProps {
  templates?: GrowthTemplate[]
  initialFilters?: GrowthTemplateFilter
  title?: string
  description?: string
  compact?: boolean
  onSelectTemplate?: (template: GrowthTemplate) => void
}

const allValue = '__all__'

const sectors = [
  { value: 'clinic', label: 'Clinicas' },
  { value: 'real_estate', label: 'Imobiliario' },
  { value: 'dealer', label: 'Concessionarias' },
  { value: 'workshop', label: 'Oficinas' },
  { value: 'agency', label: 'Agencias' },
  { value: 'retail', label: 'Varejo' },
  { value: 'services', label: 'Servicos' },
  { value: 'education', label: 'Educacao' },
]

const objectives: Array<{ value: GrowthTemplateObjective; label: string }> = [
  { value: 'lead_generation', label: 'Gerar leads' },
  { value: 'whatsapp_capture', label: 'Capturar WhatsApp' },
  { value: 'offer_promotion', label: 'Promover oferta' },
  { value: 'reactivation', label: 'Reativar base' },
  { value: 'appointment_booking', label: 'Agendar atendimento' },
  { value: 'service_launch', label: 'Lancamento' },
  { value: 'remarketing', label: 'Remarketing' },
  { value: 'follow_up', label: 'Follow-up' },
]

const modules: Array<{ value: GrowthTemplateModule; label: string }> = [
  { value: 'crm', label: 'Comercial' },
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'landing_pages', label: 'Landing pages' },
  { value: 'marketing_studio', label: 'Marketing Studio' },
  { value: 'whatsapp_ai', label: 'Atendimento & IA' },
  { value: 'automations', label: 'Automacoes' },
  { value: 'bi_reports', label: 'Relatorios' },
]

const channels: Array<{ value: GrowthTemplateChannel; label: string }> = [
  { value: 'crm', label: 'CRM' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'dashboard', label: 'Dashboard' },
]

export function GrowthTemplateLibrary({
  templates = growthTemplateCatalog,
  initialFilters,
  title = 'Biblioteca de templates',
  description = 'Modelos por setor, objetivo, modulo e canal para acelerar campanhas, segmentos e automacoes.',
  compact,
  onSelectTemplate,
}: GrowthTemplateLibraryProps) {
  const [filters, setFilters] = useState<GrowthTemplateFilter>({
    portalVisibleOnly: true,
    ...initialFilters,
  })
  const visibleTemplates = useMemo(() => filterGrowthTemplates(templates, filters), [templates, filters])

  const setFilter = <Key extends keyof GrowthTemplateFilter>(key: Key, value: GrowthTemplateFilter[Key] | undefined) => {
    setFilters(current => ({ ...current, [key]: value }))
  }

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Library className="mt-0.5 h-4 w-4 text-slate-600" />
          <div>
            <h2 className="font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
        <Badge variant="secondary">{visibleTemplates.length} modelos</Badge>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <FilterSelect
          label="Setor"
          value={filters.sectorKey}
          options={sectors}
          onChange={value => setFilter('sectorKey', value)}
        />
        <FilterSelect
          label="Objetivo"
          value={filters.objectiveKey}
          options={objectives}
          onChange={value => setFilter('objectiveKey', value as GrowthTemplateObjective | undefined)}
        />
        <FilterSelect
          label="Modulo"
          value={filters.moduleKey}
          options={modules}
          onChange={value => setFilter('moduleKey', value as GrowthTemplateModule | undefined)}
        />
        <FilterSelect
          label="Canal"
          value={filters.channel}
          options={channels}
          onChange={value => setFilter('channel', value as GrowthTemplateChannel | undefined)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={filters.portalVisibleOnly ? 'secondary' : 'outline'}
          onClick={() => setFilter('portalVisibleOnly', !filters.portalVisibleOnly)}
        >
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
          Apenas portal
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setFilters({ portalVisibleOnly: true })}
        >
          Limpar filtros
        </Button>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {visibleTemplates.map(template => (
          <article key={template.id} className="flex min-h-[180px] flex-col rounded-md border bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-950">{template.label}</p>
                <p className="mt-1 text-xs uppercase text-slate-500">{template.kind} - {template.moduleKey}</p>
              </div>
              <Badge variant={template.portalVisible ? 'secondary' : 'outline'}>{template.portalVisible ? 'Portal' : 'Interno'}</Badge>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-600">{template.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {template.channels.slice(0, 3).map(channel => (
                <Badge key={channel} variant="outline" className="text-xs">{channel}</Badge>
              ))}
              {template.channels.length > 3 && <Badge variant="outline" className="text-xs">+{template.channels.length - 3}</Badge>}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => onSelectTemplate?.(template)}
            >
              Usar template
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </article>
        ))}
      </div>

      {visibleTemplates.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed p-6 text-center text-sm text-slate-500">
          Nenhum template encontrado para os filtros atuais.
        </div>
      )}
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value?: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string | undefined) => void
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <Select value={value || allValue} onValueChange={next => onChange(next === allValue ? undefined : next)}>
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allValue}>Todos</SelectItem>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
