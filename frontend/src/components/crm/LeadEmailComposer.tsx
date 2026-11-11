import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { CrmLead } from '@/types/crm'
type Capability = {
  canSend: boolean
  message: string
  sender?: { fromName: string; fromEmail: string }
  requests: Array<{
    id: string
    subject: string
    status: string
    createdAt: string
  }>
  replies?: Array<{
    id: string
    fromEmail: string
    fromName: string | null
    subject: string | null
    text: string | null
    isAutoReply: boolean
    receivedAt: string
    attachments: Array<{ filename: string | null; size: number | null }>
  }>
}

/** Shows the new part of a reply; the quoted history stays one click away. */
function splitQuoted(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const cut = lines.findIndex(
    (line) =>
      /^\s*>/.test(line) ||
      /^\s*(Em|On) .{4,200}(escreveu|wrote):\s*$/i.test(line) ||
      /^-{2,}\s*(Mensagem original|Original Message)/i.test(line),
  )
  if (cut <= 0) return { fresh: text.trim(), quoted: '' }
  return { fresh: lines.slice(0, cut).join('\n').trim(), quoted: lines.slice(cut).join('\n').trim() }
}
const statusLabels: Record<string, string> = {
  queued: 'Na fila',
  sending: 'Enviando',
  sent: 'Enviado',
  delivered: 'Entregue',
  failed: 'Falhou',
  suppressed: 'Bloqueado',
  bounced: 'Devolvido',
  cancelled: 'Cancelado',
}
export function LeadEmailComposer({
  lead,
  onSent,
  onCancel,
}: {
  lead: CrmLead
  onSent: () => void | Promise<void>
  onCancel: () => void
}) {
  const [data, setData] = useState<Capability | null>(null),
    [subject, setSubject] = useState(''),
    [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [replyTo, setReplyTo] = useState<{ id: string; subject: string } | null>(null)
  const active = useRef(true),
    pending = useRef(false),
    requestId = useRef(crypto.randomUUID())
  useEffect(() => {
    active.current = true
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const value = await apiRequest<Capability>(
          `/crm/leads/${lead.id}/email`,
        )
        if (active.current) {
          setData(value)
          setError('')
        }
      } catch {
        if (active.current)
          setError('Não foi possível consultar o envio de e-mail.')
      } finally {
        inFlight = false
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      active.current = false
      window.clearInterval(timer)
    }
  }, [lead.id])
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (pending.current || !data?.canSend) return
    if (!subject.trim() || !body.trim()) {
      setError('Preencha assunto e mensagem.')
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<{ status: string }>(
        `/crm/leads/${lead.id}/email`,
        {
          method: 'POST',
          body: {
            subject: subject.trim(),
            body: body.trim(),
            requestId: requestId.current,
            ...(replyTo ? { replyToInboundId: replyTo.id } : {}),
          },
        },
      )
      if (!active.current) return
      setMessage(
        result.status === 'sent'
          ? 'E-mail enviado.'
          : 'Mensagem registrada. Acompanhe o estado de entrega abaixo.',
      )
      setSubject('')
      setBody('')
      setReplyTo(null)
      requestId.current = crypto.randomUUID()
      const updated = await apiRequest<Capability>(
        `/crm/leads/${lead.id}/email`,
      )
      if (!active.current) return
      setData(updated)
      await onSent()
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível registrar o envio.',
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  const validEmail = !!lead.email && !/@(?:lead|yux)\.local$/i.test(lead.email)
  return (
    <form
      onSubmit={send}
      className="flex flex-col gap-4 rounded-lg border bg-background p-4"
      aria-label="Compor e-mail"
    >
      <h3 className="font-semibold">E-mail para {lead.name}</h3>
      {data?.sender && (
        <p className="break-words text-sm">
          De: {data.sender.fromName} &lt;{data.sender.fromEmail}&gt;
        </p>
      )}
      <p className="break-words text-sm">
        Para: {validEmail ? lead.email : 'Sem e-mail cadastrado'}
      </p>
      {replyTo && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Respondendo no mesmo assunto de "{replyTo.subject}".
          <button type="button" className="underline" onClick={() => setReplyTo(null)}>
            Escrever nova mensagem
          </button>
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {data?.message || 'Consultando disponibilidade...'}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="lead-email-subject">Assunto</FieldLabel>
          <Input
            id="lead-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
            maxLength={300}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-email-body">Mensagem</FieldLabel>
          <Textarea
            id="lead-email-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
            rows={6}
          />
        </Field>
      </FieldGroup>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !data?.canSend}>
          {busy ? 'Registrando...' : 'Confirmar envio'}
        </Button>
        {validEmail && (
          <Button asChild variant="outline">
            <a
              href={`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            >
              Abrir no aplicativo de e-mail
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Fechar
        </Button>
      </div>
      {!!data?.replies?.length && (
        <section className="flex flex-col gap-3" aria-label="Respostas recebidas">
          <h4 className="text-sm font-medium">Respostas recebidas</h4>
          {data.replies.map((r) => {
            const { fresh, quoted } = splitQuoted(r.text || '')
            return (
              <article key={r.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="break-words font-medium">
                    {r.fromName ? `${r.fromName} <${r.fromEmail}>` : r.fromEmail}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.receivedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  {r.subject || '(sem assunto)'}
                  {r.isAutoReply ? ' · resposta automática' : ''}
                </p>
                <p className="whitespace-pre-wrap break-words">{fresh || '(mensagem sem texto)'}</p>
                {quoted && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Mostrar mensagem anterior</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">{quoted}</p>
                  </details>
                )}
                {r.attachments.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Anexos (veja na caixa comercial): {r.attachments.map((a) => a.filename || 'arquivo').join(', ')}
                  </p>
                )}
                {!r.isAutoReply && (
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || !data.canSend}
                      onClick={() => {
                        const base = r.subject || 'Contato'
                        setReplyTo({ id: r.id, subject: base })
                        setSubject(/^re:/i.test(base) ? base : `Re: ${base}`)
                        setMessage('')
                        requestId.current = crypto.randomUUID()
                      }}
                    >
                      Responder
                    </Button>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      )}
      {!!data?.requests.length && (
        <section className="flex flex-col gap-2" aria-label="Estado dos envios">
          <h4 className="text-sm font-medium">Envios deste lead</h4>
          {data.requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"
            >
              <span className="break-words">{r.subject}</span>
              <span>{statusLabels[r.status] || 'Em acompanhamento'}</span>
            </div>
          ))}
        </section>
      )}
    </form>
  )
}
