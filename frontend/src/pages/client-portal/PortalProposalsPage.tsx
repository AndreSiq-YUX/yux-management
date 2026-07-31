import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { validateProposalDecision } from '@/lib/proposals/proposalRules'
import { proposalService } from '@/services/proposalService'
import { useAuthStore } from '@/stores/authStore'
import type { ProposalDecisionValue, ProposalDraft, ProposalVersion } from '@/types/proposal'

export function PortalProposalsPage() {
  const user = useAuthStore(state => state.user)
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [version, setVersion] = useState<ProposalVersion>()
  const [comment, setComment] = useState('')
  useEffect(() => { proposalService.getPortalProposals().then(setProposals).catch(() => toast.error('Erro ao carregar propostas')) }, [])
  const select = async (proposal: ProposalDraft) => setVersion((await proposalService.getVersions(proposal.id))[0])
  const decide = async (decision: ProposalDecisionValue) => {
    if (!version) return
    const error = validateProposalDecision(decision, comment)
    if (error) return toast.error(error)
    await proposalService.submitPortalDecision(version.id, decision, comment, user?.id)
    toast.success('Decisao registrada')
  }
  return <div className="space-y-4"><div><h1 className="text-2xl font-bold">Propostas</h1><p className="text-gray-600">Revise escopos enviados e registre sua decisao.</p></div>
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]"><div className="space-y-2">{proposals.map(item => <button className="w-full rounded-md border bg-white p-3 text-left text-sm" key={item.id} onClick={() => select(item)}><b>{item.title}</b><span className="block text-gray-500">{item.status}</span></button>)}</div>
    <div className="rounded-md border bg-white p-4">{version ? <div className="space-y-3"><h2 className="font-semibold">{version.snapshot.title}</h2><p className="whitespace-pre-wrap text-sm text-gray-700">{version.snapshot.scope}</p><p className="font-medium">R$ {version.snapshot.finalValue.toLocaleString('pt-BR')}</p><Textarea placeholder="Comentario" value={comment} onChange={event => setComment(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={() => decide('approved')}>Aprovar</Button><Button variant="outline" onClick={() => decide('adjustments_requested')}>Solicitar ajustes</Button><Button variant="outline" onClick={() => decide('rejected')}>Recusar</Button></div></div> : <p className="text-sm text-gray-500">Selecione uma proposta.</p>}</div></div>
  </div>
}
