import { useEffect, useState } from 'react'
import { Copy, RefreshCw, Save, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { proposalService } from '@/services/proposalService'
import type { ProposalDraft } from '@/types/proposal'

export function ProposalEditor({ proposal, onRefresh }: { proposal: ProposalDraft; onRefresh: () => Promise<void> }) {
  const [draft, setDraft] = useState(proposal)
  useEffect(() => setDraft(proposal), [proposal])

  const save = async () => {
    await proposalService.updateDraft(draft.id, {
      title: draft.title, scope: draft.scope, whatsappMessage: draft.whatsappMessage,
      emailSubject: draft.emailSubject, emailBody: draft.emailBody, finalValue: draft.finalValue,
      overrideReason: draft.overrideReason,
    })
    toast.success('Rascunho salvo')
    await onRefresh()
  }
  const generate = async () => { await proposalService.generateDraft(draft.id); toast.success('Rascunho gerado'); await onRefresh() }
  const send = async () => {
    const result = await proposalService.send(draft.id)
    await navigator.clipboard.writeText(result.publicUrl)
    toast.success('Proposta enviada e link copiado')
    await onRefresh()
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold">{draft.title}</h2><p className="text-sm text-gray-500">Status: {draft.status}</p></div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={generate}><RefreshCw className="mr-1 h-4 w-4" />Gerar</Button>
        <Button size="sm" variant="outline" onClick={save}><Save className="mr-1 h-4 w-4" />Salvar</Button>
        <Button size="sm" onClick={send}><Send className="mr-1 h-4 w-4" />Enviar</Button>
      </div>
    </div>
    <Input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
    <Textarea className="min-h-36" value={draft.scope} placeholder="Escopo" onChange={event => setDraft({ ...draft, scope: event.target.value })} />
    <div className="grid gap-3 md:grid-cols-2">
      <Input type="number" min="0" value={draft.finalValue} onChange={event => setDraft({ ...draft, finalValue: Number(event.target.value) })} />
      <Input value={draft.overrideReason || ''} placeholder="Motivo para valor fora da faixa, quando aplicavel" onChange={event => setDraft({ ...draft, overrideReason: event.target.value })} />
    </div>
    <Textarea value={draft.whatsappMessage || ''} placeholder="Mensagem de WhatsApp" onChange={event => setDraft({ ...draft, whatsappMessage: event.target.value })} />
    <Input value={draft.emailSubject || ''} placeholder="Assunto do email" onChange={event => setDraft({ ...draft, emailSubject: event.target.value })} />
    <Textarea value={draft.emailBody || ''} placeholder="Corpo do email" onChange={event => setDraft({ ...draft, emailBody: event.target.value })} />
    {draft.currentVersionId && <p className="flex items-center gap-2 text-sm text-gray-500"><Copy className="h-4 w-4" />Versao enviada registrada.</p>}
    {draft.contractId && <p className="text-sm text-green-700">Convertida em contrato {draft.contractId} e projeto {draft.projectId}.</p>}
  </section>
}
