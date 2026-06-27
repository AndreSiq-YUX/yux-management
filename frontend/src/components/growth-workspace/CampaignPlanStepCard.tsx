import { AlertTriangle, CheckCircle2, CircleDashed, Link2, Lock, PlayCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CampaignPlanStep } from '@/types/growthWorkspace'

interface CampaignPlanStepCardProps {
  step: CampaignPlanStep
  onPrimaryAction?: (step: CampaignPlanStep) => void
}

const statusLabel: Record<CampaignPlanStep['status'], string> = {
  not_started: 'Nao iniciado',
  blocked: 'Bloqueado',
  in_progress: 'Em andamento',
  linked: 'Vinculado',
  completed: 'Concluido',
  skipped: 'Ignorado',
}

const iconByStatus: Record<CampaignPlanStep['status'], typeof CircleDashed> = {
  not_started: CircleDashed,
  blocked: Lock,
  in_progress: PlayCircle,
  linked: Link2,
  completed: CheckCircle2,
  skipped: AlertTriangle,
}

export function CampaignPlanStepCard({ step, onPrimaryAction }: CampaignPlanStepCardProps) {
  const Icon = iconByStatus[step.status]
  const isBlocked = step.status === 'blocked'

  return (
    <article className="rounded-md border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-950">{step.sortOrder}. {step.label}</h4>
              <Badge variant={step.isRequired ? 'secondary' : 'outline'}>{step.isRequired ? 'Obrigatorio' : 'Opcional'}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{step.description}</p>
            {step.blockedReason && <p className="mt-2 text-xs text-amber-700">{step.blockedReason}</p>}
            {step.linkedEntityId && <p className="mt-2 text-xs text-slate-500">Vinculado: {step.linkedEntityType || 'item'} / {step.linkedEntityId}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={isBlocked ? 'outline' : step.status === 'completed' || step.status === 'linked' ? 'secondary' : 'default'}>
            {statusLabel[step.status]}
          </Badge>
          <Button
            title={`Acao da etapa ${step.label}`}
            size="sm"
            variant="outline"
            disabled={isBlocked}
            onClick={() => onPrimaryAction?.(step)}
          >
            {step.actionLabel}
          </Button>
        </div>
      </div>
    </article>
  )
}
