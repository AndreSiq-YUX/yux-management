import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AdminHandoffRule {
  id: string
  name: string
  priority: number
  combinator: 'all' | 'any'
  conditions: string[]
  outcome: string
  isEnabled: boolean
}

interface HandoffRuleManagerProps {
  rules: AdminHandoffRule[]
  onSaveRule?: (ruleId: string) => void
}

export function HandoffRuleManager({ rules, onSaveRule }: HandoffRuleManagerProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Regras de handoff</h2>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr><th className="px-3 py-2">Regra</th><th>Prioridade</th><th>Condicoes</th><th>Outcome</th><th /></tr>
          </thead>
          <tbody className="divide-y">
            {rules.map(rule => (
              <tr key={rule.id}>
                <td className="px-3 py-2 font-medium text-gray-900">{rule.name} {rule.isEnabled ? '' : '(inativa)'}</td>
                <td>Prioridade {rule.priority}</td>
                <td>{rule.combinator}: {rule.conditions.join(', ')}</td>
                <td>{rule.outcome}</td>
                <td className="px-3 py-2 text-right"><Button type="button" size="sm" variant="outline" title="Salvar regra" onClick={() => onSaveRule?.(rule.id)}><Save className="mr-1 h-3 w-3" />Salvar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
