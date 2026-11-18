import { z } from 'zod'
import type { MissionSourceRefWire } from './generated/mission-wire.js'

const use = z.enum(['required', 'optional', 'forbidden'])
export const agentSourceRulesSchema = z.strictObject({
  methodology: use,
  company_strategy: use,
  company_documents: use,
  portfolio: use,
})
export type AgentSourceRules = z.infer<typeof agentSourceRulesSchema>
export type AgentSource = keyof AgentSourceRules
export const agentSources = agentSourceRulesSchema.keyof().options

export function excludedAgentSources(rules?: AgentSourceRules | null) {
  return agentSources.filter(key => rules?.[key] === 'forbidden')
}

export function agentSourceCategory(kind: MissionSourceRefWire['kind']): AgentSource {
  if (kind === 'company_strategy') return 'company_strategy'
  if (kind === 'strategy_card' || kind === 'strategy_chunk') return 'methodology'
  return 'company_documents'
}

export function agentSourceReport(rules: AgentSourceRules, counts: Record<AgentSource, number>) {
  return { rules, counts, missing: agentSources.filter(key => rules[key] === 'required' && counts[key] === 0) }
}

export const sourceRulesReportSchema = z.strictObject({
  rules: agentSourceRulesSchema,
  counts: z.record(agentSourceRulesSchema.keyof(), z.number().int().nonnegative()),
  missing: z.array(agentSourceRulesSchema.keyof()).max(agentSources.length),
})

export const requiredSourcesMessage = 'Faltam fontes obrigatórias para continuar. Confirme o contrato e a publicação dos materiais com o responsável pela conta.'
