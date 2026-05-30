import { useEffect, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { proposalService } from '@/services/proposalService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead } from '@/types/crm'
import type { ProposalDraft } from '@/types/proposal'

export function LeadCommercialPanel({ lead }: { lead: CrmLead }) {
  const packages = usePlatformStore(state => state.packages)
  const [packageId, setPackageId] = useState('')
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  useEffect(() => { proposalService.getByLead(lead.id).then(setProposals) }, [lead.id])
  const create = async () => {
    if (!packageId) return
    const proposal = await proposalService.createDraft({ organizationId: lead.organizationId, leadId: lead.id, packageId, title: `Proposta - ${lead.name}` })
    window.location.assign(`/proposals?proposal=${proposal.id}`)
  }
  return <div className="space-y-3">
    <div className="flex gap-2"><Select value={packageId} onValueChange={setPackageId}><SelectTrigger><SelectValue placeholder="Pacote comercial" /></SelectTrigger><SelectContent>{packages.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select><Button disabled={!packageId} onClick={create}><FilePlus2 className="mr-1 h-4 w-4" />Criar proposta</Button></div>
    {proposals.length === 0 && <p className="text-sm text-gray-500">Nenhuma proposta vinculada.</p>}
    {proposals.map(item => <div key={item.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{item.title}</p><p className="text-gray-500">{item.status} - R$ {item.finalValue.toLocaleString('pt-BR')}</p></div>)}
  </div>
}
