import { Link } from 'react-router-dom'
import { CheckCircle2, Clock3, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { pickNextOnboardingSteps, summarizeOnboardingProgress } from '@/lib/growth-workspace/onboardingRules'
import type { GrowthOnboardingChecklist, GrowthOnboardingStep } from '@/types/growthWorkspace'

interface SectorOnboardingChecklistProps {
  checklist: GrowthOnboardingChecklist
  title?: string
  description?: string
  hrefPrefix?: string
  maxSteps?: number
  showActions?: boolean
  onCompleteStep?: (step: GrowthOnboardingStep) => void
}

export function SectorOnboardingChecklist({
  checklist,
  title = 'Onboarding setorial',
  description = 'Sequencia recomendada para ativar o cliente com base no Modelo Setorial aplicado.',
  hrefPrefix = '',
  maxSteps,
  showActions = true,
  onCompleteStep,
}: SectorOnboardingChecklistProps) {
  const progress = summarizeOnboardingProgress(checklist)
  const visibleSteps = maxSteps ? pickNextOnboardingSteps(checklist, maxSteps) : checklist.steps

  if (checklist.steps.length === 0) return null

  const buildHref = (href: string) => `${hrefPrefix}${href}`

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-yux-700" />
            <h2 className="font-semibold text-slate-950">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <Badge variant={progress.percentage === 100 ? 'default' : 'secondary'}>
          {progress.percentage}% pronto
        </Badge>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-yux-600" style={{ width: `${progress.percentage}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {progress.completed}/{progress.total} etapas concluidas
      </p>

      <div className="mt-4 grid gap-2">
        {visibleSteps.map(step => {
          const isDone = step.status === 'completed' || step.status === 'skipped'
          return (
            <article key={step.id} className="flex flex-col gap-3 rounded-md border bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                {isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <Clock3 className="mt-0.5 h-4 w-4 text-slate-500" />}
                <div>
                  <h3 className="text-sm font-medium text-slate-950">{step.label}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {step.moduleKey} - {step.estimatedMinutes} min - {isDone ? 'Concluido' : 'Pendente'}
                  </p>
                </div>
              </div>

              {showActions && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={buildHref(step.href)}>Abrir</Link>
                  </Button>
                  {!isDone && onCompleteStep && (
                    <Button size="sm" variant="outline" onClick={() => onCompleteStep(step)}>
                      Concluir
                    </Button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
