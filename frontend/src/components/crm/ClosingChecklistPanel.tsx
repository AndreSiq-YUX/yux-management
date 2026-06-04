import { CheckCircle2, RotateCw, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CrmProposalConversionRun, ProposalClosingChecklist } from '@/types/crmClosing'
import type { ProposalDraft } from '@/types/proposal'

interface ClosingChecklistPanelProps {
  proposals: ProposalDraft[]
  checklists: ProposalClosingChecklist[]
  conversionRuns: CrmProposalConversionRun[]
  onConvert?: (proposalId: string) => void
}

export function ClosingChecklistPanel({ proposals, checklists, conversionRuns, onConvert }: ClosingChecklistPanelProps) {
  const approved = proposals.filter(item => item.status === 'approved' || item.status === 'converted')
  const checklistByProposal = new Map(checklists.map(item => [item.proposalId, item]))
  const runsByProposal = new Map(conversionRuns.map(item => [item.proposalId, item]))

  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <h3 className="font-medium text-slate-950">Fechamento e onboarding</h3>
      </div>
      <div className="space-y-3 p-3">
        {approved.map(proposal => {
          const checklist = checklistByProposal.get(proposal.id)
          const run = runsByProposal.get(proposal.id)
          return (
            <div key={proposal.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-950">{proposal.title}</span>
                <Badge variant={proposal.status === 'converted' ? 'secondary' : 'outline'}>{proposal.status}</Badge>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-5">
                {(checklist?.steps || []).map(step => (
                  <span key={step.key} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {step.completed ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <ShieldAlert className="h-3 w-3 text-amber-600" />}
                    {step.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{run ? `Conversao: ${run.status}` : 'Conversao ainda nao executada'}</span>
                <Button size="sm" disabled={proposal.status === 'converted'} onClick={() => onConvert?.(proposal.id)}>
                  <RotateCw className="mr-1 h-3 w-3" />
                  Converter
                </Button>
              </div>
            </div>
          )
        })}
        {approved.length === 0 && <p className="text-sm text-slate-500">Nenhuma proposta aprovada aguardando fechamento.</p>}
      </div>
    </section>
  )
}
