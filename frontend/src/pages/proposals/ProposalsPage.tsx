import { useCallback, useEffect, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { ProposalEditor } from '@/components/proposals/ProposalEditor'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { proposalService } from '@/services/proposalService'
import { usePlatformStore } from '@/stores/platformStore'
import type { ProposalDraft } from '@/types/proposal'

export function ProposalsPage() {
  const organization = usePlatformStore(state => state.organization)
  const packages = usePlatformStore(state => state.packages)
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [leadId, setLeadId] = useState('')
  const [packageId, setPackageId] = useState('')
  const load = useCallback(async () => { if (organization) setProposals(await proposalService.getQueue(organization.id)) }, [organization])
  useEffect(() => { load().catch(() => toast.error('Erro ao carregar propostas')) }, [load])
  const selected = proposals.find(item => item.id === selectedId) || proposals[0]
  const create = async () => {
    if (!organization || !leadId || !packageId) return
    const proposal = await proposalService.createDraft({ organizationId: organization.id, leadId, packageId, title: 'Nova proposta comercial' })
    setSelectedId(proposal.id); await load()
  }
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Propostas</h1><p className="text-gray-600">Diagnostico, negociacao, envio e conversao comercial.</p></div>
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-3">
        <Card><CardContent className="space-y-2 p-3">
          <Input value={leadId} placeholder="ID do lead" onChange={event => setLeadId(event.target.value)} />
          <Select value={packageId} onValueChange={setPackageId}><SelectTrigger><SelectValue placeholder="Pacote" /></SelectTrigger><SelectContent>{packages.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Button className="w-full" disabled={!leadId || !packageId} onClick={create}><Plus className="mr-1 h-4 w-4" />Nova proposta</Button>
        </CardContent></Card>
        {proposals.map(item => <button key={item.id} className={`w-full rounded-md border p-3 text-left ${selected?.id === item.id ? 'border-yux-500 bg-yux-50' : 'bg-white'}`} onClick={() => setSelectedId(item.id)}>
          <span className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4" />{item.title}</span><span className="mt-1 block text-xs text-gray-500">{item.status} - R$ {item.finalValue.toLocaleString('pt-BR')}</span>
        </button>)}
      </aside>
      <Card><CardContent className="p-5">{selected ? <ProposalEditor proposal={selected} onRefresh={load} /> : <p className="text-sm text-gray-500">Selecione ou crie uma proposta.</p>}</CardContent></Card>
    </div>
  </div>
}
