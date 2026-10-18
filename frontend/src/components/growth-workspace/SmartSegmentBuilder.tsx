import { useMemo, useState } from 'react'
import { CheckSquare, Download, Megaphone, Play, Save, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PendingAction } from '@/components/portal-ui'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SmartSegmentFilter, SmartSegmentFilterKey } from '@/types/growthWorkspace'

interface SmartSegmentBuilderProps {
  stages?: Array<{ id: string; name: string }>
  sources?: string[]
  campaigns?: Array<{ id: string; name: string }>
  owners?: Array<{ id: string; name: string }>
  estimatedSize?: number
  compact?: boolean
}

const defaultValue = '__none__'

const filterLabels: Record<SmartSegmentFilterKey, string> = {
  source: 'Origem',
  stage: 'Etapa',
  status: 'Status',
  owner: 'Responsável',
  last_activity: 'Última atividade',
  campaign: 'Campanha',
  score: 'Pontuação',
  proposal_status: 'Status da proposta',
}

const statusOptions = ['novo', 'ativo', 'ganho', 'perdido', 'parado']
const lastActivityOptions = ['sem atividade', 'mais de 7 dias', 'mais de 15 dias', 'mais de 30 dias']
const scoreOptions = ['0-25', '26-50', '51-75', '76-100']
const proposalOptions = ['sem proposta', 'rascunho', 'enviada', 'visualizada', 'aceita', 'perdida']

export function SmartSegmentBuilder({
  stages = [],
  sources = [],
  campaigns = [],
  owners = [],
  estimatedSize,
  compact,
}: SmartSegmentBuilderProps) {
  const [name, setName] = useState('Segmento inteligente')
  const [filters, setFilters] = useState<SmartSegmentFilter[]>([
    { key: 'source', value: sources[0] || 'Manual' },
    { key: 'stage', value: stages[0]?.id || 'todos' },
    { key: 'last_activity', value: 'mais de 15 dias' },
  ])

  const activeFilters = useMemo(() => filters.filter(filter => filter.value && filter.value !== defaultValue), [filters])

  const updateFilter = (key: SmartSegmentFilterKey, value: string) => {
    setFilters(current => {
      const next = current.filter(filter => filter.key !== key)
      if (!value || value === defaultValue) return next
      return [...next, { key, value }]
    })
  }

  const getValue = (key: SmartSegmentFilterKey) => filters.find(filter => filter.key === key)?.value || defaultValue

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <SlidersHorizontal className="mt-0.5 h-4 w-4 text-slate-600" />
          <div>
            <h2 className="font-semibold text-slate-950">Segmentos inteligentes</h2>
            <p className="mt-1 text-sm text-slate-600">Monte públicos por origem, etapa, status, responsável, atividade, campanha, pontuação e proposta.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-950">{estimatedSize ?? '—'}</p>
          <p className="text-xs text-slate-500">leads estimados</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Nome do segmento" />
        <PendingAction code="B9" variant="primary">
          <Save className="h-4 w-4" />
          Salvar segmento
        </PendingAction>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-4'}`}>
        <SegmentSelect label={filterLabels.source} value={getValue('source')} options={sources.length ? sources : ['Manual', 'Google Ads', 'Meta Ads', 'WhatsApp']} onChange={value => updateFilter('source', value)} />
        <SegmentSelect label={filterLabels.stage} value={getValue('stage')} options={stages.map(stage => ({ value: stage.id, label: stage.name }))} fallbackOptions={['todos']} onChange={value => updateFilter('stage', value)} />
        <SegmentSelect label={filterLabels.status} value={getValue('status')} options={statusOptions} onChange={value => updateFilter('status', value)} />
        <SegmentSelect label={filterLabels.owner} value={getValue('owner')} options={owners.map(owner => ({ value: owner.id, label: owner.name }))} fallbackOptions={['Sem responsável']} onChange={value => updateFilter('owner', value)} />
        <SegmentSelect label={filterLabels.last_activity} value={getValue('last_activity')} options={lastActivityOptions} onChange={value => updateFilter('last_activity', value)} />
        <SegmentSelect label={filterLabels.campaign} value={getValue('campaign')} options={campaigns.map(campaign => ({ value: campaign.id, label: campaign.name }))} fallbackOptions={['Todas campanhas']} onChange={value => updateFilter('campaign', value)} />
        <SegmentSelect label={filterLabels.score} value={getValue('score')} options={scoreOptions} onChange={value => updateFilter('score', value)} />
        <SegmentSelect label={filterLabels.proposal_status} value={getValue('proposal_status')} options={proposalOptions} onChange={value => updateFilter('proposal_status', value)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {activeFilters.map(filter => (
          <Badge key={`${filter.key}:${filter.value}`} variant="secondary">
            {filterLabels[filter.key]}: {filter.value}
          </Badge>
        ))}
        {activeFilters.length === 0 && <span className="text-sm text-slate-500">Nenhum filtro aplicado.</span>}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <PendingAction code="B9"><CheckSquare className="h-4 w-4" />Criar tarefa</PendingAction>
        <PendingAction code="B9"><Play className="h-4 w-4" />Iniciar automação</PendingAction>
        <PendingAction code="B9"><Megaphone className="h-4 w-4" />Criar campanha</PendingAction>
        <PendingAction code="B9"><Download className="h-4 w-4" />Exportar</PendingAction>
      </div>
    </section>
  )
}

function SegmentSelect({
  label,
  value,
  options,
  fallbackOptions = [],
  onChange,
}: {
  label: string
  value: string
  options: Array<string | { value: string; label: string }>
  fallbackOptions?: string[]
  onChange: (value: string) => void
}) {
  const normalized = options.length ? options : fallbackOptions

  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={defaultValue}>Qualquer</SelectItem>
          {normalized.map(option => {
            const item = typeof option === 'string' ? { value: option, label: option } : option
            return <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          })}
        </SelectContent>
      </Select>
    </label>
  )
}
