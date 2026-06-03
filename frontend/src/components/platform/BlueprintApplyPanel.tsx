import { CheckCircle2, Layers3, MessageSquare, PlayCircle, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildPipelineFromBlueprint, summarizeBlueprintApplication } from '@/lib/platform/blueprintApplicationRules'
import type { Blueprint, ContractDetails } from '@/types/platform'

interface BlueprintApplyPanelProps {
  blueprint: Blueprint
  contracts: ContractDetails[]
  selectedContractId?: string
  applying: boolean
  onContractChange: (contractId: string) => void
  onApply: () => void
}

export function BlueprintApplyPanel({
  blueprint,
  contracts,
  selectedContractId,
  applying,
  onContractChange,
  onApply,
}: BlueprintApplyPanelProps) {
  const pipeline = buildPipelineFromBlueprint(blueprint)
  const summary = summarizeBlueprintApplication(blueprint)
  const latestRun = blueprint.applicationRuns?.[0]

  return (
    <div className="space-y-4 rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">{blueprint.name}</h2>
            <Badge variant="secondary">{blueprint.sector}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{blueprint.description}</p>
        </div>
        {latestRun && (
          <Badge variant={latestRun.status === 'succeeded' ? 'default' : latestRun.status === 'failed' ? 'destructive' : 'secondary'}>
            {latestRun.status === 'succeeded' ? 'Aplicado' : latestRun.status}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {blueprint.moduleKeys.map(moduleKey => (
          <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Layers3} label="Etapas" value={summary.stageCount.toString()} />
        <Metric icon={SlidersHorizontal} label="Campos" value={summary.customFieldCount.toString()} />
        <Metric icon={MessageSquare} label="Mensagens" value={summary.messageTemplateCount.toString()} />
        <Metric icon={PlayCircle} label="Automações" value={summary.automationTemplateCount.toString()} />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">Funil padrão</p>
        <div className="flex flex-wrap gap-2">
          {pipeline.stages.map(stage => (
            <span key={stage.key} className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Select value={selectedContractId} onValueChange={onContractChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar contrato" />
          </SelectTrigger>
          <SelectContent>
            {contracts.map(contract => (
              <SelectItem key={contract.id} value={contract.id}>
                {contract.name || contract.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button title="Aplicar blueprint ao contrato" disabled={!selectedContractId || applying} onClick={onApply}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {applying ? 'Aplicando' : 'Aplicar ao contrato'}
        </Button>
      </div>

      {latestRun?.error && <p className="text-sm text-red-600">{latestRun.error}</p>}
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-slate-500" />
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}
