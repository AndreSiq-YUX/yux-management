import { useEffect, useRef, useState } from 'react'
import { crmQualificationService } from '@/services/crmQualificationService'
import {
  temperatureLabels,
  type QualificationSummary,
} from '@/types/crmQualification'
import { Button } from '@/components/ui/button'
export function LeadScoreSummary({
  leadId,
  compact = false,
  onTask,
  onProposal,
}: {
  leadId: string
  compact?: boolean
  onTask: () => void
  onProposal: () => void
}) {
  const [data, setData] = useState<QualificationSummary | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const lastScore = useRef<{ leadId: string; score: number } | null>(null)
  useEffect(() => {
    let active = true
    if (lastScore.current?.leadId !== leadId) {
      setData(null)
      lastScore.current = null
    }
    setError('')
    let pending = false
    const refreshScore = async () => {
      if (pending) return
      pending = true
      try {
        const value = await crmQualificationService.summary(leadId)
        if (!active) return
        setData(value)
        setError('')
        const changed =
          value &&
          lastScore.current?.leadId === leadId &&
          lastScore.current.score !== value.score
        lastScore.current = value ? { leadId, score: value.score } : null
        if (changed) window.dispatchEvent(new Event('crm-leads-changed'))
      } catch {
        if (active) {
          setData(null)
          setError('Não foi possível consultar a pontuação.')
        }
      } finally {
        pending = false
      }
    }
    void refreshScore()
    const timer = window.setInterval(() => void refreshScore(), 5000)
    const reload = () => setRevision((v) => v + 1)
    window.addEventListener('crm-leads-changed', reload)
    return () => {
      active = false
      window.clearInterval(timer)
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
  const content = (
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
  return compact ? <details className="rounded-md border bg-background p-3"><summary className="cursor-pointer text-sm font-medium">Entender pontuação · {data.score}/100</summary><div className="mt-3">{content}</div></details> : content

}
