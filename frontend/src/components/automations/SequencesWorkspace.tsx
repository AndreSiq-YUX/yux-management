import { ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { calculateSequenceConversionRate } from '@/lib/automations/sequenceRules'
import type { AutomationSequence } from '@/types/automationSequence'

export function SequencesWorkspace({ sequences = [] }: { sequences?: AutomationSequence[] }) {
  return (
    <section className="rounded-md border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ListChecks className="h-4 w-4" />
          Sequencias
        </div>
        <Badge variant="secondary">{sequences.length} configuradas</Badge>
      </header>
      <div className="divide-y">
        {sequences.length ? sequences.map(sequence => (
          <article key={sequence.id} className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_120px_120px]">
            <div>
              <p className="font-medium text-gray-900">{sequence.name}</p>
              <p className="text-gray-500">{sequence.description || sequence.conversionGoal || 'Sem meta definida'}</p>
            </div>
            <Badge variant="outline">{sequence.channel}</Badge>
            <span className="text-gray-600">
              {calculateSequenceConversionRate({
                enrolled: sequence.activeEnrollmentCount + sequence.convertedEnrollmentCount,
                converted: sequence.convertedEnrollmentCount,
              })}% conversao
            </span>
          </article>
        )) : (
          <div className="grid gap-3 p-3 text-sm text-gray-600 md:grid-cols-3">
            <div className="rounded-md border bg-slate-50 p-3">Nutrir leads por email e WhatsApp</div>
            <div className="rounded-md border bg-slate-50 p-3">Criar tarefas para vendedores</div>
            <div className="rounded-md border bg-slate-50 p-3">Pausar por resposta, opt-out ou conversao</div>
          </div>
        )}
      </div>
    </section>
  )
}
