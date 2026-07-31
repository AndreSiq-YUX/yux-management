import { describe, expect, it } from 'vitest'
import {
  calculateProposalTotal,
  canDecideProposalVersion,
  selectProjectPreset,
  snapshotProposalDraft,
  validateProposalDecision,
  validateProposalPricing,
} from './proposalRules'
import type { ProposalDraft, ProposalItem, ProposalPriceRule, ProposalVersion } from '@/types/proposal'

const items: ProposalItem[] = [
  { id: 'base', proposalId: 'proposal', itemKey: 'base', label: 'Pacote', quantity: 1, unitValue: 2500, totalValue: 2500, orderIndex: 0 },
  { id: 'extra', proposalId: 'proposal', itemKey: 'extra', label: 'Integracao', quantity: 2, unitValue: 500, totalValue: 1000, orderIndex: 1 },
]

const rules: ProposalPriceRule[] = [
  { id: 'rule-base', organizationId: 'org', packageId: 'package', itemKey: 'base', label: 'Pacote', minimumValue: 2000, recommendedValue: 2500, maximumValue: 3000 },
  { id: 'rule-extra', organizationId: 'org', packageId: 'package', itemKey: 'extra', label: 'Integracao', minimumValue: 400, recommendedValue: 500, maximumValue: 600 },
]

describe('proposal pricing rules', () => {
  it('calculates the editable proposal total', () => {
    expect(calculateProposalTotal(items)).toBe(3500)
  })

  it('accepts values inside registered ranges', () => {
    expect(validateProposalPricing(items, rules)).toEqual({ valid: true, errors: [] })
  })

  it('requires an override reason outside a registered range', () => {
    const changed = [{ ...items[0], unitValue: 3500, totalValue: 3500 }, items[1]]
    expect(validateProposalPricing(changed, rules)).toEqual({
      valid: false,
      errors: ['Informe o motivo para usar valores fora da faixa cadastrada.'],
    })
    expect(validateProposalPricing(changed, rules, ' Escopo especial aprovado. ')).toEqual({ valid: true, errors: [] })
  })
})

describe('proposal decision rules', () => {
  it('requires a comment when adjustments are requested', () => {
    expect(validateProposalDecision('adjustments_requested', '  ')).toBe('Descreva os ajustes solicitados.')
  })

  it('keeps rejection comments optional', () => {
    expect(validateProposalDecision('rejected', '')).toBeUndefined()
  })

  it('allows decisions only for the current pending sent version', () => {
    const version = { id: 'version', status: 'pending' } as ProposalVersion
    expect(canDecideProposalVersion(version, 'version')).toBe(true)
    expect(canDecideProposalVersion(version, 'other')).toBe(false)
    expect(canDecideProposalVersion({ ...version, status: 'superseded' }, 'version')).toBe(false)
  })
})

describe('proposal project and snapshot rules', () => {
  it('prefers a blueprint preset and falls back to the package preset', () => {
    const packagePreset = { id: 'package-preset', packageId: 'package', phases: [] }
    const blueprintPreset = { id: 'blueprint-preset', blueprintId: 'blueprint', phases: [] }
    expect(selectProjectPreset(blueprintPreset, packagePreset)).toBe(blueprintPreset)
    expect(selectProjectPreset(undefined, packagePreset)).toBe(packagePreset)
  })

  it('creates an immutable detached draft snapshot', () => {
    const draft = {
      id: 'proposal',
      organizationId: 'org',
      leadId: 'lead',
      packageId: 'package',
      status: 'draft',
      title: 'Proposta',
      scope: 'Escopo inicial',
      billingCycle: 'monthly',
      selectedModuleKeys: ['crm'],
      finalValue: 2500,
      items,
    } as ProposalDraft

    const snapshot = snapshotProposalDraft(draft)
    draft.items[0].label = 'Alterado'
    draft.selectedModuleKeys.push('projects')

    expect(snapshot.items[0].label).toBe('Pacote')
    expect(snapshot.selectedModuleKeys).toEqual(['crm'])
  })
})
