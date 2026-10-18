import { CheckCircle, FlaskConical, Play, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import { simulateAutomationFlow } from '@/lib/automations/automationSimulationRules'
import type { AutomationEvent, AutomationFlow } from '@/types/automation'

interface AutomationSimulationPanelProps {
  flow?: AutomationFlow
  onSimulate?: (result: {
    eventType: string
    samplePayload: Record<string, unknown>
    matched: boolean
    conditionResults: unknown[]
    plannedActions: unknown[]
    blockedReasons: string[]
  }) => void
}

export function AutomationSimulationPanel({ flow, onSimulate }: AutomationSimulationPanelProps) {
  const [eventType, setEventType] = useState('')
  const [payloadJson, setPayloadJson] = useState('{}')
  const [result, setResult] = useState<ReturnType<typeof simulateAutomationFlow> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSimulate = () => {
    if (!flow || !eventType) return

    try {
      const payload = JSON.parse(payloadJson || '{}')
      const event: AutomationEvent = {
        type: eventType,
        organizationId: flow.organizationId,
        payload,
        ...payload,
      }

      const simResult = simulateAutomationFlow(flow, event)
      setResult(simResult)
      setError(null)

      onSimulate?.({
        eventType,
        samplePayload: payload,
        matched: simResult.matched,
        conditionResults: simResult.conditionResults,
        plannedActions: simResult.plannedActions,
        blockedReasons: simResult.blockedReasons,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON inválido')
      setResult(null)
    }
  }

  return (
    <section className="rounded-md border bg-yx-surface p-4 space-y-4">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 text-yx-fg-2" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-yx-fg">Simulação</h2>
          <p className="text-sm text-yx-fg-2">
            {flow ? `Testar ${flow.name} sem executar de verdade` : 'Selecione um fluxo para simular'}
          </p>
        </div>
      </div>

      {flow && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-yx-fg-2">Evento de teste</label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {automationTriggerCatalog.map(trigger => (
                  <SelectItem key={trigger.key} value={trigger.key}>
                    {trigger.label} ({trigger.module})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-yx-fg-2">Dados do evento (JSON)</label>
            <Textarea
              className="min-h-[100px] font-mono text-xs"
              placeholder='{"leadId": "lead-123", "source": "instagram"}'
              value={payloadJson}
              onChange={e => setPayloadJson(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-yx-crit-line bg-yx-crit-soft p-2">
              <p className="text-xs text-yx-crit">{error}</p>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleSimulate}
            disabled={!eventType || !flow}
          >
            <Play className="mr-2 h-4 w-4" />
            Simular
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center gap-2">
            {result.matched ? (
              <>
                <CheckCircle className="h-5 w-5 text-yx-ok" />
                <span className="text-sm font-semibold text-yx-ok">Fluxo seria executado</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-yx-crit" />
                <span className="text-sm font-semibold text-yx-crit">Fluxo NÃO seria executado</span>
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs">
              <span className="font-semibold text-yx-fg-2">Trigger: </span>
              <span className={result.triggerMatched ? 'text-yx-ok' : 'text-yx-crit'}>
                {result.triggerDetails}
              </span>
            </div>

            {result.conditionResults.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-yx-fg-2">Condições:</p>
                {result.conditionResults.map((cr, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {cr.passed ? (
                      <CheckCircle className="h-3 w-3 text-yx-ok" />
                    ) : (
                      <XCircle className="h-3 w-3 text-yx-crit" />
                    )}
                    <span className={cr.passed ? 'text-yx-ok' : 'text-yx-crit'}>{cr.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {result.blockedReasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-yx-fg-2">Bloqueios:</p>
                <div className="flex flex-wrap gap-1">
                  {result.blockedReasons.map(reason => (
                    <Badge key={reason} variant="destructive" className="text-xs">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.plannedActions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-yx-fg-2">Ações que seriam executadas:</p>
                {result.plannedActions.map(action => (
                  <div key={action.id} className="rounded-md bg-yx-surface-2 px-2 py-1 text-xs">
                    <span className="font-semibold">{action.orderIndex}.</span> {action.actionType}
                    {Object.keys(action.payload).length > 0 && (
                      <span className="ml-2 text-yx-fg-2">
                        ({Object.entries(action.payload).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
