import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { crmPriorityService } from '@/services/crmPriorityService'
import type { LeadPriority, PrioritySummary, PriorityTransition } from '@/types/crmPriority'

export function PriorityBadge({ priority }: { priority: PrioritySummary }) {
  const label =
    priority.state === 'pending'
      ? 'Calculando'
      : priority.state === 'excluded'
        ? 'Fora da fila'
        : (priority.queueLabel ?? 'Qualificar dados')
  return (
    <Badge
      variant={priority.state === 'ranked' ? 'outline' : 'secondary'}
      className="max-w-full whitespace-normal"
    >
      {label}
      {priority.priorityScore !== null && ` · ${priority.priorityScore}/100`}
    </Badge>
  )
}

export function LeadPriorityDetails({
  leadId,
  summary,
}: {
  leadId: string
  summary: PrioritySummary
}) {
  const [detail, setDetail] = useState<LeadPriority | null>(null)
  const [error, setError] = useState('')
  const { activationId, state, priorityScore, temperatureScore, evaluatedAt } = summary
  useEffect(() => {
    let active = true
    const load = () =>
      void crmPriorityService
        .lead(leadId)
        .then((result) => {
          if (active) {
            setDetail(result)
            setError('')
          }
        })
        .catch(() => {
          if (active) setError('Não foi possível carregar a explicação.')
        })
    load()
    return () => {
      active = false
    }
  }, [leadId, activationId, state, priorityScore, temperatureScore, evaluatedAt])
  const priority =
    detail?.activationId === activationId &&
    detail.state === state &&
    detail.priorityScore === priorityScore &&
    detail.temperatureScore === temperatureScore && detail.evaluatedAt === evaluatedAt
      ? detail
      : summary
  const reasons = 'reasons' in priority ? (priority as LeadPriority).reasons : []
  return (
    <section aria-label="Prioridade comercial" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Prioridade comercial</h3>
        <PriorityBadge priority={priority} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Potencial</dt>
          <dd>
            {priority.fitScore === null ? '—' : `${priority.fitScore}/100`}
            {priority.fitBandLabel && ` · ${priority.fitBandLabel}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Temperatura</dt>
          <dd>
            {priority.temperatureScore === null ? '—' : `${priority.temperatureScore}/100`}
            {priority.temperatureBandLabel && ` · ${priority.temperatureBandLabel}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cobertura</dt>
          <dd>{priority.coveragePercent === null ? '—' : `${priority.coveragePercent}%`}</dd>
        </div>
      </dl>
      {priority.recommendation && (
        <p className="text-sm">
          <strong>Próxima ação</strong> · {priority.recommendation}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {reasons.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Entender prioridade</summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {reasons.map((reason, i) => (
              <li key={i}>
                {reason.label}
                {reason.kind === 'missing_data'
                  ? reason.archivedFieldKeys?.length
                    ? ' · campo arquivado'
                    : ' · dados pendentes'
                  : reason.kind === 'expired_signal'
                    ? ' · sinal expirado'
                    : reason.points !== undefined
                      ? ` · ${reason.points} pontos${reason.estimated ? ' (estimativa)' : ''}`
                      : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      <PriorityHistory leadId={leadId} evaluatedAt={evaluatedAt} />
    </section>
  )
}

const causeLabel = {baseline:'Avaliação do modelo',change:'Mudança nos dados ou sinais',time:'Passagem do tempo'}
function PriorityHistory({leadId,evaluatedAt}:{leadId:string;evaluatedAt?:string|null}) {
  const [open,setOpen] = useState(false)
  const [items,setItems] = useState<PriorityTransition[]>([])
  const [status,setStatus] = useState('')
  useEffect(()=>{
    if (!open) return
    let active=true
    crmPriorityService.history(leadId).then(result=>{
      if (active) {setItems(result.items);setStatus(result.items.length?'':'Nenhuma mudança registrada.')}
    }).catch(()=>{if(active)setStatus('Não foi possível consultar o histórico.')})
    return ()=>{active=false}
  },[leadId,open,evaluatedAt])
  return <details onToggle={event=>{setOpen(event.currentTarget.open)}}>
    <summary className="cursor-pointer text-sm font-medium">Últimas mudanças de prioridade</summary>
    {status&&<p className="mt-2 text-xs text-muted-foreground" role="status">{status}</p>}
    <ul className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
      {items.map(item=><li key={item.id}>
        <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</time>
        <p>{causeLabel[item.cause]} · {item.before?.priorityScore ?? '—'} → {item.after?.priorityScore ?? '—'}</p>
      </li>)}
    </ul>
  </details>
}
