import { useEffect, useState } from 'react'
import { crmQualificationService } from '@/services/crmQualificationService'
import {
  temperatureLabels,
  type QualificationSummary,
} from '@/types/crmQualification'
import { Button } from '@/components/ui/button'
export function LeadScoreSummary({
  leadId,
  onTask,
  onProposal,
}: {
  leadId: string
  onTask: () => void
  onProposal: () => void
}) {
  const [data, setData] = useState<QualificationSummary | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    crmQualificationService
      .summary(leadId)
      .then((v) => {
        if (active) setData(v)
      })
      .catch(() => {
        if (active) setError('Não foi possível consultar a pontuação.')
      })
    const reload = () => setRevision((v) => v + 1)
    window.addEventListener('crm-leads-changed', reload)
    return () => {
      active = false
      window.removeEventListener('crm-leads-changed', reload)
    }
  }, [leadId, revision])
  if (error)
    return (
      <p role="alert" className="text-sm">
        {error}
        <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
          Tentar novamente
        </Button>
      </p>
    )
  if (!data) return null
  return (
    <section
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-label="Qualificação do lead"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">Pontuação {data.score}/100</h3>
        <span>{temperatureLabels[data.temperature]}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Perfil {data.fitScore} · Interesse {data.intentScore}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {data.contributions.map((c) => (
          <li key={c.ruleId}>
            {c.name}: {c.points > 0 ? '+' : ''}
            {c.points}
          </li>
        ))}
      </ul>
      {!data.contributions.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra pontuou este lead ainda.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onTask}>
          {data.temperature === 'cold'
            ? 'Agendar qualificação'
            : 'Agendar contato prioritário'}
        </Button>
        {data.temperature === 'hot' && (
          <Button variant="outline" onClick={onProposal}>
            Preparar proposta
          </Button>
        )}
      </div>
    </section>
  )
}
