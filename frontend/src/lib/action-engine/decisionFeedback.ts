import type { DecisionReasonKey } from '@/types/actionEngine'

export const decisionReasonOptions: Array<{ value: DecisionReasonKey; label: string }> = [
  { value: 'wrong_icp', label: 'Público ou ICP incorreto' },
  { value: 'wrong_tone', label: 'Tom de comunicação inadequado' },
  { value: 'cost_too_high', label: 'Custo acima do aceitável' },
  { value: 'scope_too_broad', label: 'Escopo amplo demais' },
  { value: 'scope_too_narrow', label: 'Escopo limitado demais' },
  { value: 'timing_wrong', label: 'Momento ou prazo inadequado' },
  { value: 'channel_wrong', label: 'Canal inadequado' },
  { value: 'compliance_risk', label: 'Risco jurídico ou de conformidade' },
  { value: 'outcome_wrong', label: 'Resultado esperado incorreto' },
  { value: 'other', label: 'Outro motivo' },
]
