import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckSquare, Download, Megaphone, Play, Save, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SmartSegmentDraft, SmartSegmentFilter, SmartSegmentFilterKey } from '@/types/growthWorkspace'

interface SmartSegmentBuilderProps {
  stages?: Array<{ id: string; name: string }>
  sources?: string[]
  campaigns?: Array<{ id: string; name: string }>
  owners?: Array<{ id: string; name: string }>
  estimatedSize?: number
  compact?: boolean
  onSaveSegment?: (segment: SmartSegmentDraft) => void
  onCreateTask?: (segment: SmartSegmentDraft) => void
  onStartAutomation?: (segment: SmartSegmentDraft) => void
  onCreateCampaign?: (segment: SmartSegmentDraft) => void
  onExport?: (segment: SmartSegmentDraft) => void
}

const defaultValue = '__none__'

const filterLabels: Record<SmartSegmentFilterKey, string> = {
  source: 'Origem',
  stage: 'Etapa',
  status: 'Status',
  owner: 'Responsavel',
  last_activity: 'Ultima atividade',
  campaign: 'Campanha',
  score: 'Score',
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
  onSaveSegment,
  onCreateTask,
  onStartAutomation,
  onCreateCampaign,
  onExport,
}: SmartSegmentBuilderProps) {
  const [name, setName] = useState('Segmento inteligente')
  const [filters, setFilters] = useState<SmartSegmentFilter[]>([
    { key: 'source', value: sources[0] || 'Manual' },
    { key: 'stage', value: stages[0]?.id || 'todos' },
    { key: 'last_activity', value: 'mais de 15 dias' },
  ])

  const draft = useMemo<SmartSegmentDraft>(() => ({
    name: name.trim() || 'Segmento inteligente',
    filters: filters.filter(filter => filter.value && filter.value !== defaultValue),
    estimatedSize: estimatedSize ?? estimateSegmentSize(filters),
    status: 'draft',
  }), [estimatedSize, filters, name])

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
            <p className="mt-1 text-sm text-slate-600">Monte publicos por origem, etapa, status, responsavel, atividade, campanha, score e proposta.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-950">{draft.estimatedSize}</p>
          <p className="text-xs text-slate-500">leads estimados</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Nome do segmento" />
        <Button type="button" onClick={() => onSaveSegment?.(draft)}>
          <Save className="mr-2 h-4 w-4" />
          Salvar segmento
        </Button>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-4'}`}>
        <SegmentSelect label={filterLabels.source} value={getValue('source')} options={sources.length ? sources : ['Manual', 'Google Ads', 'Meta Ads', 'WhatsApp']} onChange={value => updateFilter('source', value)} />
        <SegmentSelect label={filterLabels.stage} value={getValue('stage')} options={stages.map(stage => ({ value: stage.id, label: stage.name }))} fallbackOptions={['todos']} onChange={value => updateFilter('stage', value)} />
        <SegmentSelect label={filterLabels.status} value={getValue('status')} options={statusOptions} onChange={value => updateFilter('status', value)} />
        <SegmentSelect label={filterLabels.owner} value={getValue('owner')} options={owners.map(owner => ({ value: owner.id, label: owner.name }))} fallbackOptions={['Sem responsavel']} onChange={value => updateFilter('owner', value)} />
        <SegmentSelect label={filterLabels.last_activity} value={getValue('last_activity')} options={lastActivityOptions} onChange={value => updateFilter('last_activity', value)} />
        <SegmentSelect label={filterLabels.campaign} value={getValue('campaign')} options={campaigns.map(campaign => ({ value: campaign.id, label: campaign.name }))} fallbackOptions={['Todas campanhas']} onChange={value => updateFilter('campaign', value)} />
        <SegmentSelect label={filterLabels.score} value={getValue('score')} options={scoreOptions} onChange={value => updateFilter('score', value)} />
        <SegmentSelect label={filterLabels.proposal_status} value={getValue('proposal_status')} options={proposalOptions} onChange={value => updateFilter('proposal_status', value)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {draft.filters.map(filter => (
          <Badge key={`${filter.key}:${filter.value}`} variant="secondary">
            {filterLabels[filter.key]}: {filter.value}
          </Badge>
        ))}
        {draft.filters.length === 0 && <span className="text-sm text-slate-500">Nenhum filtro aplicado.</span>}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <ActionButton icon={<CheckSquare className="h-4 w-4" />} label="Criar tarefa" onClick={() => onCreateTask?.(draft)} />
        <ActionButton icon={<Play className="h-4 w-4" />} label="Iniciar automacao" onClick={() => onStartAutomation?.(draft)} />
        <ActionButton icon={<Megaphone className="h-4 w-4" />} label="Criar campanha" onClick={() => onCreateCampaign?.(draft)} />
        <ActionButton icon={<Download className="h-4 w-4" />} label="Exportar" onClick={() => onExport?.(draft)} />
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

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {icon}
      <span className="ml-2">{label}</span>
    </Button>
  )
}

function estimateSegmentSize(filters: SmartSegmentFilter[]) {
  const base = 240
  const weight = filters.reduce((total, filter) => {
    if (filter.key === 'score' || filter.key === 'proposal_status') return total + 36
    if (filter.key === 'last_activity' || filter.key === 'campaign') return total + 28
    return total + 18
  }, 0)
  return Math.max(8, base - weight)
}
