import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  LeadConversationPanel,
  type LeadConversationView,
} from './LeadConversationPanel'
import { omnichannelService } from '@/services/omnichannelService'
import type {
  CrmMessageTemplate,
  CrmQuickReply,
  LeadResponseSuggestion,
  LeadSlaEvent,
} from '@/types/crmAi'
export function LeadConversationWorkspace({
  conversations,
  quickReplies,
  templates,
  suggestions,
  slaEvents,
  onOpen,
  onChanged,
}: {
  conversations: LeadConversationView[]
  quickReplies: CrmQuickReply[]
  templates: CrmMessageTemplate[]
  suggestions: LeadResponseSuggestion[]
  slaEvents: LeadSlaEvent[]
  onOpen: (id: string) => void
  onChanged: () => Promise<void>
}) {
  const [selected, setSelected] = useState(''),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const pending = useRef(false),
    active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const available = conversations.filter(
    (c) =>
      c.status === 'linked' &&
      c.conversation?.status !== 'resolved' &&
      c.conversation?.status !== 'closed',
  )
  const target =
    available.find((c) => c.conversationId === selected) || available[0]
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!target || pending.current || !body.trim()) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await omnichannelService.sendHumanReply({
        conversationId: target.conversationId,
        body: body.trim(),
      })
      if (!active.current) return
      if (['failed', 'cancelled'].includes(result.deliveryStatus))
        throw new Error(
          'A mensagem não foi entregue. Confira a conversa no atendimento.',
        )
      setBody('')
      setMessage(
        result.deliveryStatus === 'delivered'
          ? 'Mensagem entregue.'
          : 'Mensagem registrada no atendimento. Acompanhe a entrega na conversa.',
      )
      await onChanged()
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível encaminhar a mensagem. Confira o canal no atendimento.',
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <LeadConversationPanel
        conversations={conversations}
        slaEvents={slaEvents}
        onOpen={onOpen}
      />
      {available.length ? (
        <form
          onSubmit={send}
          className="flex flex-col gap-3 rounded-md border p-4"
          aria-label="Responder conversa vinculada"
        >
          <h3 className="font-semibold">Responder pelo atendimento</h3>
          <label className="flex flex-col gap-1 text-sm">
            Conversa
            <select
              aria-label="Conversa de destino"
              disabled={busy}
              value={target?.conversationId || ''}
              onChange={(e) => {
                setSelected(e.target.value)
                setError('')
                setMessage('')
              }}
              className="h-10 rounded-md border bg-background px-3"
            >
              {available.map((c) => (
                <option key={c.id} value={c.conversationId}>
                  {c.channel} ·{' '}
                  {c.conversation?.subject || 'Conversa vinculada'}
                </option>
              ))}
            </select>
          </label>
          <Field>
            <FieldLabel htmlFor="lead-reply-body">Mensagem</FieldLabel>
            <Textarea
              id="lead-reply-body"
              disabled={busy}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {quickReplies
              .filter((r) => !r.channel || r.channel === target?.channel)
              .slice(0, 6)
              .map((r) => (
                <Button
                  type="button"
                  key={r.id}
                  disabled={busy}
                  size="sm"
                  variant="outline"
                  onClick={() => setBody(r.body)}
                >
                  {r.label}
                </Button>
              ))}
          </div>
          {(templates.length > 0 || suggestions.length > 0) && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Modelos e sugestões salvas
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {templates
                  .filter((t) => t.channel === target?.channel)
                  .map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setBody(t.body)}
                    >
                      {t.name}
                    </Button>
                  ))}
                {suggestions
                  .filter(
                    (s) =>
                      s.conversationId === target?.conversationId &&
                      ['draft', 'approved'].includes(s.status),
                  )
                  .map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setBody(s.body)}
                    >
                      Usar sugestão salva
                    </Button>
                  ))}
              </div>
            </details>
          )}
          <p className="text-xs text-muted-foreground">
            O canal verifica as permissões de envio. Revise o destinatário e a
            mensagem antes de confirmar.
          </p>
          <Button
            type="submit"
            disabled={busy || !body.trim()}
            className="self-start"
          >
            {busy ? 'Encaminhando...' : 'Confirmar envio da resposta'}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Abra uma conversa ativa no atendimento para responder por aqui.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  )
}
