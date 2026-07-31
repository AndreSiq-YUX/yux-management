import { SendHorizonal, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { canSendTemplate } from '@/lib/crm/conversationRules'
import type { CrmLead } from '@/types/crm'
import type { CrmMessageTemplate, CrmQuickReply, LeadResponseSuggestion } from '@/types/crmAi'

interface LeadResponseComposerProps {
  lead: CrmLead
  suggestions: LeadResponseSuggestion[]
  quickReplies?: CrmQuickReply[]
  templates?: CrmMessageTemplate[]
  onSendSuggestion?: (suggestionId: string) => void
}

export function LeadResponseComposer({
  lead,
  suggestions,
  quickReplies = [],
  templates = [],
  onSendSuggestion,
}: LeadResponseComposerProps) {
  const [draft, setDraft] = useState(suggestions[0]?.body || '')
  const whatsappAllowed = canSendTemplate({
    channel: 'whatsapp',
    requiresOptIn: true,
    whatsappOptIn: lead.whatsappOptIn,
  })
  const pendingSuggestions = useMemo(() => suggestions.filter(item => item.status === 'draft' || item.status === 'approved'), [suggestions])

  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <SendHorizonal className="h-4 w-4 text-slate-500" />
          <h3 className="font-medium text-slate-950">Resposta assistida</h3>
        </div>
        <Badge variant={whatsappAllowed ? 'secondary' : 'destructive'}>{whatsappAllowed ? 'Envio permitido' : 'Opt-in pendente'}</Badge>
      </div>
      <div className="space-y-3 p-3">
        {!whatsappAllowed && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Este lead ainda nao possui opt-in de WhatsApp. Use apenas canais permitidos ou confirme consentimento antes do envio.
          </div>
        )}
        <Textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escreva ou ajuste a resposta sugerida" />
        <div className="flex flex-wrap gap-2">
          {quickReplies.slice(0, 6).map(reply => (
            <Button key={reply.id} type="button" variant="outline" size="sm" onClick={() => setDraft(reply.body)}>
              {reply.label}
            </Button>
          ))}
        </div>
        {templates.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {templates.slice(0, 4).map(template => (
              <button
                key={template.id}
                type="button"
                className="rounded-md border p-2 text-left text-sm hover:bg-slate-50"
                onClick={() => setDraft(template.body)}
              >
                <span className="block font-medium text-slate-950">{template.name}</span>
                <span className="line-clamp-2 text-xs text-slate-500">{template.body}</span>
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {pendingSuggestions.map(suggestion => (
            <div key={suggestion.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{suggestion.body}</span>
              <Button size="sm" disabled={!whatsappAllowed} onClick={() => onSendSuggestion?.(suggestion.id)}>
                <ShieldCheck className="mr-1 h-3 w-3" />
                Enviar
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
