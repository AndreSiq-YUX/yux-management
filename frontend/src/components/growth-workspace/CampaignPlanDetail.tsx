import { ArrowRight, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignPlanStepCard } from '@/components/growth-workspace/CampaignPlanStepCard'
import { calculateCampaignPlanProgress, pickCampaignPlanNextAction, updateCampaignPlanStepStatuses } from '@/lib/growth-workspace/campaignPlanRules'
import type { CampaignPlan, CampaignPlanStep } from '@/types/growthWorkspace'

interface CampaignPlanDetailProps {
  plan: CampaignPlan
  onStepAction?: (step: CampaignPlanStep) => void
}

const objectiveLabel: Record<CampaignPlan['objective'], string> = {
  lead_generation: 'Geracao de leads',
  whatsapp_capture: 'Captura via WhatsApp',
  offer_promotion: 'Promocao de oferta',
  reactivation: 'Reativacao',
  appointment_booking: 'Agendamento',
  service_launch: 'Lancamento de servico',
  remarketing: 'Remarketing',
}

export function CampaignPlanDetail({ plan, onStepAction }: CampaignPlanDetailProps) {
  const normalizedPlan = updateCampaignPlanStepStatuses(plan)
  const progress = calculateCampaignPlanProgress(normalizedPlan)
  const nextAction = pickCampaignPlanNextAction(normalizedPlan)

  return (
    <section className="rounded-md border bg-slate-50">
      <div className="border-b bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950">Campanha 360</h2>
              <Badge variant="secondary">{objectiveLabel[plan.objective]}</Badge>
              <Badge variant="outline">{plan.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{plan.name}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-950">{progress.percentage}%</p>
            <p className="text-xs text-slate-500">{progress.completed}/{progress.total} etapas prontas</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-slate-950" style={{ width: `${progress.percentage}%` }} />
        </div>
        {nextAction && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white p-3">
            <div className="flex items-start gap-2">
              <BarChart3 className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-950">Proxima acao: {nextAction.label}</p>
                <p className="text-sm text-slate-600">{nextAction.reason || nextAction.description}</p>
              </div>
            </div>
            <Button title="Executar proxima acao" size="sm" variant="outline" disabled={nextAction.status === 'blocked'}>
              Abrir etapa
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        {normalizedPlan.steps.map(step => (
          <CampaignPlanStepCard key={step.id} step={step} onPrimaryAction={onStepAction} />
        ))}
      </div>
    </section>
  )
}
