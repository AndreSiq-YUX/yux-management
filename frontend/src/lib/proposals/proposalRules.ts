import type {
  BlueprintProjectPreset,
  PackageProjectPreset,
  ProposalDecisionValue,
  ProposalDraft,
  ProposalItem,
  ProposalPriceRule,
  ProposalSnapshot,
  ProposalVersion,
  ProjectPreset,
} from '@/types/proposal'

export interface ProposalRuleResult {
  valid: boolean
  errors: string[]
}

export function calculateProposalTotal(items: ProposalItem[]) {
  return items.reduce((total, item) => total + item.quantity * item.unitValue, 0)
}

export function validateProposalPricing(items: ProposalItem[], rules: ProposalPriceRule[], overrideReason?: string): ProposalRuleResult {
  const rulesByItem = new Map(rules.map(rule => [rule.itemKey, rule]))
  const outsideRange = items.some(item => {
    const rule = rulesByItem.get(item.itemKey)
    return rule && (item.unitValue < rule.minimumValue || item.unitValue > rule.maximumValue)
  })

  if (outsideRange && !overrideReason?.trim()) {
    return { valid: false, errors: ['Informe o motivo para usar valores fora da faixa cadastrada.'] }
  }

  return { valid: true, errors: [] }
}

export function validateProposalDecision(decision: ProposalDecisionValue, comment?: string) {
  if (decision === 'adjustments_requested' && !comment?.trim()) {
    return 'Descreva os ajustes solicitados.'
  }
}

export function canDecideProposalVersion(version: ProposalVersion, currentVersionId?: string) {
  return version.id === currentVersionId && version.status === 'pending'
}

export function selectProjectPreset(
  blueprintPreset?: BlueprintProjectPreset,
  packagePreset?: PackageProjectPreset,
): ProjectPreset | undefined {
  return blueprintPreset || packagePreset
}

export function snapshotProposalDraft(draft: ProposalDraft): ProposalSnapshot {
  const {
    currentVersionId: _currentVersionId,
    convertedClientId: _convertedClientId,
    contractId: _contractId,
    projectId: _projectId,
    ...snapshot
  } = draft

  return structuredClone(snapshot)
}
