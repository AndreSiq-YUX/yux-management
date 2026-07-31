import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import type { AutomationFlow } from '@/types/automation'

interface AutomationDryRunToggleProps {
  flow?: AutomationFlow
  onToggle?: (flowId: string, dryRun: boolean) => void
}

export function AutomationDryRunToggle({ flow, onToggle }: AutomationDryRunToggleProps) {
  if (!flow) return null

  const isDryRun = flow.riskLevel === 'test'

  return (
    <section className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-slate-600" />
          <h2 className="text-base font-semibold text-slate-950">Modo Teste</h2>
        </div>
        <Badge variant={isDryRun ? 'default' : 'outline'} className="text-xs">
          {isDryRun ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-slate-600">
          Quando ativado, o fluxo registrará o que faria sem executar as ações de verdade.
          Útil para testar a lógica antes de publicar.
        </p>

        <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">Ativar modo teste</p>
            <p className="text-xs text-slate-600">
              O fluxo será executado em modo "dry-run", registrando as ações que seriam tomadas.
            </p>
          </div>
          <Switch
            checked={isDryRun}
            onCheckedChange={checked => onToggle?.(flow.id, checked)}
          />
        </div>

        {isDryRun && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">
              <span className="font-semibold">Modo teste ativo.</span> As ações não serão executadas, apenas registradas.
              Verifique o histórico de execuções para ver o que o fluxo faria.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
