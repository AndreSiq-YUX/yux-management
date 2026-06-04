import { GitBranch, Play, Workflow } from 'lucide-react'

const steps = [
  { title: 'Quando', value: 'um evento do cliente acontecer', icon: GitBranch },
  { title: 'Se', value: 'as condicoes forem verdadeiras', icon: Workflow },
  { title: 'Entao', value: 'executar acoes com controle', icon: Play },
]

export function AutomationGuidedBuilder() {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Automacao guiada</h2>
          <p className="text-sm text-slate-600">Fluxos comerciais montados por evento, condicao e acao.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {steps.map(step => {
          const Icon = step.icon
          return (
            <div key={step.title} className="rounded-md border bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                {step.title}
              </div>
              <p className="mt-2 text-sm font-medium text-slate-950">{step.value}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
