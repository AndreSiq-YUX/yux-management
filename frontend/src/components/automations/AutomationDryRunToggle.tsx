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
    <section className="rounded-md border bg-yx-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-yx-fg-2" />
          <h2 className="text-base font-semibold text-yx-fg">Modo de teste</h2>
        </div>
        <Badge variant={isDryRun ? 'default' : 'outline'} className="text-xs">
          {isDryRun ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-yx-fg-2">
          Quando ativado, o fluxo registrará o que faria sem executar as ações de verdade.
          Útil para testar a lógica antes de publicar.
        </p>

        <div className="flex items-center justify-between rounded-md bg-yx-surface-2 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-yx-fg">Ativar modo de teste</p>
            <p className="text-xs text-yx-fg-2">
              O fluxo será executado em modo de teste, registrando as ações que seriam tomadas.
            </p>
          </div>
          <Switch
            checked={isDryRun}
            onCheckedChange={checked => onToggle?.(flow.id, checked)}
          />
        </div>

        {isDryRun && (
          <div className="rounded-md border border-yx-warn-line bg-yx-warn-soft p-3">
            <p className="text-xs text-yx-warn">
              <span className="font-semibold">Modo de teste ativo.</span> As ações não serão executadas, apenas registradas.
              Verifique o histórico de execuções para ver o que o fluxo faria.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
