import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { validateProposalDecision } from '@/lib/proposals/proposalRules'
import { proposalService } from '@/services/proposalService'
import type { ProposalDecisionValue, ProposalSnapshot } from '@/types/proposal'

export function PublicProposalPage() {
  const { token = '' } = useParams()
  const [snapshot, setSnapshot] = useState<ProposalSnapshot>()
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { proposalService.getPublicReview(token).then(data => setSnapshot(data.snapshot)).catch(error => setMessage(error.message)) }, [token])
  const decide = async (decision: ProposalDecisionValue) => {
    const error = validateProposalDecision(decision, comment)
    if (error) return setMessage(error)
    try { await proposalService.submitPublicDecision(token, decision, comment); setMessage('Decisao registrada. Obrigado.'); setSnapshot(undefined) } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Nao foi possivel registrar a decisao.') }
  }
  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-white p-6 md:p-10"><header><p className="text-sm font-medium text-yux-700">YUX Solucoes em IA</p><h1 className="mt-1 text-2xl font-bold">Proposta comercial</h1></header>{message && <p className="rounded-md border p-3 text-sm">{message}</p>}{snapshot && <section className="space-y-4"><h2 className="text-xl font-semibold">{snapshot.title}</h2><p className="whitespace-pre-wrap text-gray-700">{snapshot.scope}</p><div>{snapshot.items.map(item => <div className="flex justify-between border-b py-2 text-sm" key={item.itemKey}><span>{item.label}</span><b>R$ {item.totalValue.toLocaleString('pt-BR')}</b></div>)}</div><p className="text-lg font-semibold">Total: R$ {snapshot.finalValue.toLocaleString('pt-BR')}</p><Textarea placeholder="Comentario" value={comment} onChange={event => setComment(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={() => decide('approved')}>Aprovar</Button><Button variant="outline" onClick={() => decide('adjustments_requested')}>Solicitar ajustes</Button><Button variant="outline" onClick={() => decide('rejected')}>Recusar</Button></div></section>}</main>
}
