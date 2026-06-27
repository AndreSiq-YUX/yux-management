import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SmartSegmentBuilder } from '@/components/growth-workspace/SmartSegmentBuilder'
import type { CrmPipelineStage } from '@/types/crm'
import type { CrmCockpitFilterState, CrmLeadTemperature } from '@/types/crmCockpit'
import type { SmartSegmentDraft } from '@/types/growthWorkspace'

interface LeadAdvancedFiltersProps {
  filters: CrmCockpitFilterState
  stages: CrmPipelineStage[]
  sources: string[]
  onChange: (filters: CrmCockpitFilterState) => void
  showSmartSegmentBuilder?: boolean
  onSaveSmartSegment?: (segment: SmartSegmentDraft) => void
  onCreateSegmentTask?: (segment: SmartSegmentDraft) => void
  onStartSegmentAutomation?: (segment: SmartSegmentDraft) => void
  onCreateSegmentCampaign?: (segment: SmartSegmentDraft) => void
  onExportSegment?: (segment: SmartSegmentDraft) => void
}

const temperatures: Array<{ value: CrmLeadTemperature; label: string }> = [
  { value: 'hot', label: 'Quente' },
  { value: 'warm', label: 'Morno' },
  { value: 'cold', label: 'Frio' },
  { value: 'unqualified', label: 'Sem fit' },
]

const emptyValue = '__all__'

export function LeadAdvancedFilters({
  filters,
  stages,
  sources,
  onChange,
  showSmartSegmentBuilder,
  onSaveSmartSegment,
  onCreateSegmentTask,
  onStartSegmentAutomation,
  onCreateSegmentCampaign,
  onExportSegment,
}: LeadAdvancedFiltersProps) {
  return (
    <section className="space-y-3">
      <div className="grid gap-3 rounded-lg border bg-white p-3 md:grid-cols-5">
        <Input
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
          onSaveSegment={onSaveSmartSegment}
          onCreateTask={onCreateSegmentTask}
          onStartAutomation={onStartSegmentAutomation}
          onCreateCampaign={onCreateSegmentCampaign}
          onExport={onExportSegment}
        />
      )}
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
