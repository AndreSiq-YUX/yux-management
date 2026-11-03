import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { crmPriorityService } from '@/services/crmPriorityService'
import {
  priorityChannelLabels,
  prioritySignalLabels,
  type LeadPrioritySignal,
  type ManualPriorityKind,
  type PriorityChannel,
} from '@/types/crmPriority'

const manual = [
  'buyer_reply',
  'quote_requested',
  'meeting_booked',
  'meeting_completed',
  'purchase_window',
  'not_interested',
] as const
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
const localDateTime = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const describe = (signal: LeadPrioritySignal) =>
  `${prioritySignalLabels[signal.kind]} · ${priorityChannelLabels[signal.channel]} · ${new Date(signal.occurredAt).toLocaleString('pt-BR')}`

export function LeadPrioritySignals({
  leadId,
  onChanged,
}: {
  leadId: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Sinais comerciais</h3>
          <p className="text-xs text-muted-foreground">
            Registre fatos que ajudam a avaliar a temperatura.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Recolher sinais' : 'Registrar ou consultar sinais'}
        </Button>
      </div>
      {open && <SignalForm key={leadId} leadId={leadId} onChanged={onChanged} />}
    </section>
  )
}

function SignalForm({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const [items, setItems] = useState<LeadPrioritySignal[]>([])
  const [kind, setKind] = useState<ManualPriorityKind>('quote_requested')
  const [channel, setChannel] = useState<PriorityChannel>('crm')
  const [occurredAt, setOccurredAt] = useState(localDateTime)
  const [sameAs, setSameAs] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [revoke, setRevoke] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let active = true
    crmPriorityService
      .signals(leadId)
      .then((result) => {
        if (active) setItems(result.items)
      })
      .catch(() => {
        if (active) setError('Não foi possível consultar os sinais.')
      })
    return () => {
      active = false
    }
  }, [leadId])

  const run = async (operation: () => Promise<LeadPrioritySignal>, message: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const result = await operation()
      setItems((current) =>
        [result, ...current.filter((item) => item.id !== result.id)].sort(
          (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
        ),
      )
      setRequestId(crypto.randomUUID())
      setRevoke('')
      setReason('')
      setSameAs('')
      setStatus(message)
      onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar o sinal.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const date = new Date(occurredAt)
    if (!Number.isFinite(date.getTime())) {
      setError('Informe a data e a hora do sinal.')
      return
    }
    void run(
      () =>
        crmPriorityService.addSignal(leadId, {
          requestId,
          kind,
          channel,
          occurredAt: date.toISOString(),
          ...(sameAs ? { sameAsSignalId: sameAs } : {}),
          ...(kind === 'purchase_window' ? { targetDate } : {}),
        }),
      'Sinal registrado. A prioridade será recalculada.',
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset disabled={busy}>
          <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="priority-signal-kind">Tipo de sinal</FieldLabel>
              <select
                id="priority-signal-kind"
                className={selectClass}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as ManualPriorityKind)
                  setRequestId(crypto.randomUUID())
                }}
              >
                {manual.map((key) => (
                  <option key={key} value={key}>
                    {prioritySignalLabels[key]}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="priority-signal-channel">Canal</FieldLabel>
              <select
                id="priority-signal-channel"
                className={selectClass}
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value as PriorityChannel)
                  setRequestId(crypto.randomUUID())
                }}
              >
                {Object.entries(priorityChannelLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="priority-signal-date">Data e hora do sinal</FieldLabel>
              <Input
                id="priority-signal-date"
                required
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => {
                  setOccurredAt(event.target.value)
                  setRequestId(crypto.randomUUID())
                }}
              />
            </Field>
            {kind === 'purchase_window' && (
              <Field>
                <FieldLabel htmlFor="priority-signal-target">Data prevista de compra</FieldLabel>
                <Input
                  id="priority-signal-target"
                  required
                  type="date"
                  value={targetDate}
                  onChange={(event) => {
                    setTargetDate(event.target.value)
                    setRequestId(crypto.randomUUID())
                  }}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="priority-signal-link">
                Mesmo fato de um sinal anterior
              </FieldLabel>
              <select
                id="priority-signal-link"
                className={selectClass}
                value={sameAs}
                onChange={(event) => {
                  setSameAs(event.target.value)
                  setRequestId(crypto.randomUUID())
                }}
              >
                <option value="">É um sinal novo</option>
                {items
                  .filter((item) => !item.revokedAt)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {describe(item)}
                    </option>
                  ))}
              </select>
            </Field>
          </FieldGroup>
        </fieldset>
        <Button size="sm" className="self-start" disabled={busy}>
          Salvar sinal
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-md border p-2 text-sm">
              <span>{describe(item)}</span>
              {item.targetDate && <span>Previsão · {item.targetDate}</span>}
              {item.revokedAt ? (
                <span className="text-muted-foreground">Revogado · {item.revokeReason}</span>
              ) : revoke === item.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (reason.trim())
                      void run(
                        () =>
                          crmPriorityService.revokeSignal(leadId, item.id, {
                            requestId,
                            reason: reason.trim(),
                          }),
                        'Sinal revogado.',
                      )
                  }}
                >
                  <Field>
                    <FieldLabel htmlFor="priority-revoke-reason">Motivo da revogação</FieldLabel>
                    <Input
                      id="priority-revoke-reason"
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value)
                        setRequestId(crypto.randomUUID())
                      }}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy}>
                      Confirmar revogação
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => setRevoke('')}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setRevoke(item.id)
                    setReason('')
                    setRequestId(crypto.randomUUID())
                  }}
                >
                  Revogar sinal
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
