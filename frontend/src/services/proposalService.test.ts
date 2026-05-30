import { describe, expect, it } from 'vitest'
import { mapProposal, mapProposalVersion } from './proposalService'

describe('proposal service mappings', () => {
  it('maps snake case proposal rows and numeric values', () => {
    expect(mapProposal({
      id: 'proposal',
      organization_id: 'org',
      lead_id: 'lead',
      package_id: 'package',
      status: 'draft',
      title: 'Proposta',
      scope: 'Escopo',
      billing_cycle: 'monthly',
      selected_module_keys: ['crm'],
      final_value: '4500.00',
      proposal_items: [{
        id: 'item',
        proposal_id: 'proposal',
        item_key: 'base',
        label: 'Pacote',
        quantity: '2',
        unit_value: '2250',
        total_value: '4500',
        order_index: 0,
      }],
    })).toMatchObject({
      id: 'proposal',
      organizationId: 'org',
      billingCycle: 'monthly',
      finalValue: 4500,
      items: [{ quantity: 2, unitValue: 2250, totalValue: 4500 }],
    })
  })

  it('maps immutable version snapshots without sharing references', () => {
    const row = {
      id: 'version',
      proposal_id: 'proposal',
      version_number: 1,
      status: 'pending',
      sent_at: '2026-05-30T12:00:00Z',
      snapshot: {
        id: 'proposal',
        organizationId: 'org',
        leadId: 'lead',
        packageId: 'package',
        status: 'draft',
        title: 'Proposta',
        scope: 'Escopo',
        billingCycle: 'monthly',
        selectedModuleKeys: ['crm'],
        finalValue: 4500,
        items: [],
      },
    }
    const version = mapProposalVersion(row)
    row.snapshot.selectedModuleKeys.push('projects')
    expect(version.snapshot.selectedModuleKeys).toEqual(['crm'])
  })
})
