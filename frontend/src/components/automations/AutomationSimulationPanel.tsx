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
        matched: simResult.matched,
        conditionResults: simResult.conditionResults,
        plannedActions: simResult.plannedActions,
        blockedReasons: simResult.blockedReasons,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payload JSON invalido')
      setResult(null)
    }
  }

  return (
    <section className="rounded-md border bg-white p-4 space-y-4">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 text-slate-600" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-950">Simulacao</h2>
          <p className="text-sm text-slate-600">
            {flow ? `Testar ${flow.name} sem executar de verdade` : 'Selecione um fluxo para simular'}
          </p>
        </div>
      </div>

      {flow && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Evento de teste</label>
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
            <label className="text-xs font-medium text-slate-700">Payload (JSON)</label>
            <Textarea
              className="min-h-[100px] font-mono text-xs"
              placeholder='{"leadId": "lead-123", "source": "instagram"}'
              value={payloadJson}
              onChange={e => setPayloadJson(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-800">{error}</p>
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
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-semibold text-green-900">Fluxo seria executado</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-semibold text-red-900">Fluxo NAO seria executado</span>
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs">
              <span className="font-semibold text-slate-700">Trigger: </span>
              <span className={result.triggerMatched ? 'text-green-700' : 'text-red-700'}>
                {result.triggerDetails}
              </span>
            </div>

            {result.conditionResults.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">Condicoes:</p>
                {result.conditionResults.map((cr, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {cr.passed ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-600" />
                    )}
                    <span className={cr.passed ? 'text-green-700' : 'text-red-700'}>{cr.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {result.blockedReasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">Bloqueios:</p>
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
                <p className="text-xs font-semibold text-slate-700">Acoes que seriam executadas:</p>
                {result.plannedActions.map(action => (
                  <div key={action.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs">
                    <span className="font-semibold">{action.orderIndex}.</span> {action.actionType}
                    {Object.keys(action.payload).length > 0 && (
                      <span className="ml-2 text-slate-600">
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
