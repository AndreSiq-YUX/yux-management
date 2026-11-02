import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crmService } from '@/services/crmService'
import type {
  CrmLead,
  CrmSequence,
  CrmSequenceEnrollment,
  AutomationExecution,
} from '@/types/crm'
const labels: Record<string, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  manual: 'Atendimento manual',
  completed: 'Concluída',
  pending: 'Pendente',
  processing: 'Em execução',
  failed: 'Falhou',
  cancelled: 'Cancelada',
}
export function LeadAutomationsPanel({
  lead,
  sequences,
  enrollments,
  executions,
  onChanged,
}: {
  lead: CrmLead
  sequences: CrmSequence[]
  enrollments: CrmSequenceEnrollment[]
  executions: AutomationExecution[]
  onChanged: () => Promise<void>
}) {
  const [sequenceId, setSequenceId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dates, setDates] = useState<Record<string, string>>({})
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
      await onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível atualizar a automação.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Sequências de acompanhamento</h3>
        {sequences.length ? (
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              Sequência
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={sequenceId}
                disabled={busy}
                onChange={(e) => setSequenceId(e.target.value)}
              >
                <option value="">Escolha uma sequência</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="self-end"
              disabled={!sequenceId || busy}
              onClick={() =>
                void run(() =>
                  crmService.enrollLead(
                    lead.organizationId,
                    lead.id,
                    sequenceId,
                  ),
                )
              }
            >
              Iniciar sequência
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma sequência configurada para esta conta.
          </p>
        )}
        {enrollments.map((e) => (
          <article
            key={e.id}
            className="flex flex-col gap-3 rounded-md border p-3"
          >
            <p className="text-sm font-medium">
              {sequences.find((s) => s.id === e.sequenceId)?.name ||
                'Acompanhamento'}{' '}
              · {labels[e.status] || e.status}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['paused', 'active', 'manual'] as const).map((status) => (
                <Button
                  key={status}
                  disabled={busy || e.status === 'completed'}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void run(() =>
                      crmService.updateEnrollment(e.id, { status }),
                    )
                  }
                >
                  {status === 'paused'
                    ? 'Pausar'
                    : status === 'active'
                      ? 'Retomar'
                      : 'Assumir'}
                </Button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Próximo envio
              <Input
                type="datetime-local"
                value={dates[e.id] || ''}
                onChange={(event) =>
                  setDates((d) => ({ ...d, [e.id]: event.target.value }))
                }
              />
            </label>
            <Button
              variant="outline"
              disabled={busy || !dates[e.id]}
              onClick={() =>
                void run(() =>
                  crmService.updateEnrollment(e.id, {
                    status: 'active',
                    nextExecutionAt: new Date(dates[e.id]).toISOString(),
                  }),
                )
              }
            >
              Reagendar
            </Button>
          </article>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Execuções</h3>
        {executions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma execução registrada.
          </p>
        )}
        {executions.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <div>
              <p>
                {(
                  {
                    email: 'E-mail',
                    whatsapp: 'WhatsApp',
                    internal_task: 'Tarefa',
                  } as Record<string, string>
                )[e.actionType] || 'Acompanhamento'}{' '}
                · {labels[e.status] || e.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.scheduledAt).toLocaleString('pt-BR')}
              </p>
            </div>
            {e.status === 'failed' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => crmService.retryExecution(e.id))}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        ))}
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
