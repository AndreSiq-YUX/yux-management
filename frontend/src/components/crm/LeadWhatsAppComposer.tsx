import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { CrmLead } from '@/types/crm'

type Capability = {
  canSend: boolean
  mode: 'text' | 'template' | null
  message: string
  phone: string | null
  connections: Array<{ id: string; name: string; displayPhoneNumber: string | null }>
  conversationId: string | null
  insideWindow: boolean
  templates: Array<{ name: string; body: string }>
}

export function LeadWhatsAppComposer({
  lead,
  onSent,
  onOpenConversation,
}: {
  lead: CrmLead
  onSent: () => void | Promise<void>
  onOpenConversation?: (conversationId: string) => void
}) {
  const [data, setData] = useState<Capability | null>(null),
    [connectionId, setConnectionId] = useState(''),
    [body, setBody] = useState(''),
    [templateName, setTemplateName] = useState(''),
    [parameters, setParameters] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const active = useRef(true),
    pending = useRef(false),
    requestId = useRef(crypto.randomUUID())

  const load = useCallback(async () => {
    try {
      const value = await apiRequest<Capability>(`/crm/leads/${lead.id}/whatsapp`)
      if (!active.current) return
      setData(value)
      setConnectionId((current) => current || value.connections[0]?.id || '')
    } catch {
      if (active.current) setError('Não foi possível consultar o envio pelo WhatsApp.')
    }
  }, [lead.id])

  useEffect(() => {
    active.current = true
    void load()
    return () => {
      active.current = false
    }
  }, [load])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!data?.canSend || pending.current) return
    const template = data.mode === 'template'
    if (template ? !templateName.trim() : !body.trim()) {
      setError(template ? 'Informe o nome do modelo aprovado.' : 'Escreva a mensagem.')
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest<{ conversationId: string }>(`/crm/leads/${lead.id}/whatsapp`, {
        method: 'POST',
        body: {
          requestId: requestId.current,
          connectionId: connectionId || undefined,
          ...(template
            ? {
                templateName: templateName.trim(),
                bodyParameters: parameters
                  .split('\n')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : { body: body.trim() }),
        },
      })
      if (!active.current) return
      requestId.current = crypto.randomUUID()
      setBody('')
      setParameters('')
      setNotice('Mensagem registrada. A entrega aparece na conversa do lead.')
      await load()
      await onSent()
    } catch (reason) {
      if (active.current)
        setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o envio.')
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <form
      onSubmit={send}
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-label="Enviar WhatsApp para o lead"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">WhatsApp para {lead.name}</h3>
        {data?.conversationId && onOpenConversation && (
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenConversation(data.conversationId!)}>
            Abrir conversa
          </Button>
        )}
      </div>
      <p className="text-sm">Para: {data?.phone || 'Sem WhatsApp cadastrado'}</p>
      <p className="text-sm text-muted-foreground">{data?.message || 'Consultando disponibilidade...'}</p>
      {data?.canSend && (
        <FieldGroup>
          {data.connections.length > 1 && (
            <Field>
              <FieldLabel htmlFor="lead-whatsapp-connection">Enviar pelo número</FieldLabel>
              <select
                id="lead-whatsapp-connection"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={connectionId}
                disabled={busy}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                {data.connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                    {connection.displayPhoneNumber ? ` · ${connection.displayPhoneNumber}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {data.mode === 'text' ? (
            <Field>
              <FieldLabel htmlFor="lead-whatsapp-body">Mensagem</FieldLabel>
              <Textarea
                id="lead-whatsapp-body"
                rows={4}
                value={body}
                disabled={busy}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="lead-whatsapp-template">Modelo aprovado na Meta</FieldLabel>
                <Input
                  id="lead-whatsapp-template"
                  list="lead-whatsapp-templates"
                  placeholder="ex.: primeiro_contato"
                  value={templateName}
                  disabled={busy}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
                <datalist id="lead-whatsapp-templates">
                  {data.templates.map((template) => (
                    <option key={template.name} value={template.name} />
                  ))}
                </datalist>
              </Field>
              <Field>
                <FieldLabel htmlFor="lead-whatsapp-parameters">Variáveis do modelo (uma por linha, na ordem)</FieldLabel>
                <Textarea
                  id="lead-whatsapp-parameters"
                  rows={2}
                  value={parameters}
                  disabled={busy}
                  onChange={(event) => setParameters(event.target.value)}
                />
              </Field>
            </>
          )}
        </FieldGroup>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {data?.canSend && (
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar pelo WhatsApp'}
          </Button>
        </div>
      )}
    </form>
  )
}
