import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ClosingChecklistPanel } from '@/components/crm/ClosingChecklistPanel'
import { LeadProposalLauncher } from '@/components/crm/LeadProposalLauncher'
import { ProposalEventTimeline } from '@/components/crm/ProposalEventTimeline'
import { ProposalRecommendationPanel } from '@/components/crm/ProposalRecommendationPanel'
import { crmClosingService } from '@/services/crmClosingService'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { proposalService } from '@/services/proposalService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead } from '@/types/crm'
import type { CrmProposalConversionRun, LeadProposalRecommendation, ProposalClosingChecklist, ProposalFollowUpTask, ProposalObjection, ProposalViewEvent } from '@/types/crmClosing'
import type { ProposalDraft } from '@/types/proposal'

export function LeadCommercialPanel({ lead }: { lead: CrmLead }) {
  const packages = usePlatformStore(state => state.packages)
  const [packageId, setPackageId] = useState('')
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [recommendations, setRecommendations] = useState<LeadProposalRecommendation[]>([])
  const [events, setEvents] = useState<ProposalViewEvent[]>([])
  const [followUps, setFollowUps] = useState<ProposalFollowUpTask[]>([])
  const [objections, setObjections] = useState<ProposalObjection[]>([])
  const [checklists, setChecklists] = useState<ProposalClosingChecklist[]>([])
  const [conversionRuns, setConversionRuns] = useState<CrmProposalConversionRun[]>([])
  const refresh = async () => {
    try {
      const context = await crmClosingService.getLeadProposalContext(lead.id)
      setProposals(context.proposals)
      setRecommendations(context.recommendations)
      setEvents(context.events)
      setFollowUps(context.followUps)
      setObjections(context.objections)
      setChecklists(context.checklists)
      setConversionRuns(context.conversionRuns)
    } catch (error) {
      console.warn('CRM closing context unavailable:', error)
      proposalService.getByLead(lead.id).then(setProposals)
    }
  }
  useEffect(() => { refresh() }, [lead.id])
  const create = async () => {
    if (!packageId) return
    if (!lead.crmInstanceId) throw new Error('Instancia CRM nao encontrada para esta proposta.')
    const governance = await crmGovernanceService.getGovernanceContext(lead.crmInstanceId)
    const approvalConfirmed = window.confirm('Confirmar a criacao desta proposta comercial?')
    if (!approvalConfirmed) return
    const proposal = await crmClosingService.createProposalFromLead({
      lead,
      packages,
      packageId,
      currentMember: governance.currentMember,
      teamMemberships: governance.teamMemberships,
      approvalConfirmed,
    })
    toast.success('Proposta criada')
    window.location.assign(`/proposals?proposal=${proposal.id}`)
  }
  const convert = async (proposalId: string) => {
    await crmClosingService.runProposalConversion(proposalId)
    toast.success('Conversao executada')
    refresh()
  }
  return <div className="space-y-3">
    <LeadProposalLauncher lead={lead} packages={packages} packageId={packageId} onPackageChange={setPackageId} onCreate={create} />
    <ProposalRecommendationPanel recommendations={recommendations} packages={packages} />
    <ClosingChecklistPanel proposals={proposals} checklists={checklists} conversionRuns={conversionRuns} onConvert={convert} />
    <ProposalEventTimeline events={events} followUps={followUps} objections={objections} />
    {proposals.length === 0 && <p className="text-sm text-gray-500">Nenhuma proposta vinculada.</p>}
    {proposals.map(item => <div key={item.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{item.title}</p><p className="text-gray-500">{item.status} - R$ {item.finalValue.toLocaleString('pt-BR')}</p></div>)}
  </div>
}
