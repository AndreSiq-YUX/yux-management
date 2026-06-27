import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapProposal, mapProposalVersion, proposalService } from './proposalService'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

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

  it('maps database-shaped immutable snapshots for portal rendering', () => {
    const version = mapProposalVersion({
      id: 'version',
      proposal_id: 'proposal',
      version_number: 1,
      status: 'pending',
      sent_at: '2026-05-30T12:00:00Z',
      snapshot: {
        id: 'proposal',
        organization_id: 'org',
        lead_id: 'lead',
        package_id: 'package',
        status: 'sent',
        title: 'Proposta',
        scope: 'Escopo',
        billing_cycle: 'monthly',
        selected_module_keys: ['crm'],
        final_value: '4500',
        items: [{ id: 'item', proposal_id: 'proposal', item_key: 'base', label: 'Pacote', quantity: '1', unit_value: '4500', total_value: '4500', order_index: 0 }],
      },
    })
    expect(version.snapshot).toMatchObject({
      organizationId: 'org',
      leadId: 'lead',
      packageId: 'package',
      billingCycle: 'monthly',
      selectedModuleKeys: ['crm'],
      finalValue: 4500,
      items: [{ itemKey: 'base', totalValue: 4500 }],
    })
  })
})

describe('proposalService backend API methods', () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('loads proposal queue through the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'proposal-1', title: 'Proposta' }]))

    await expect(proposalService.getQueue('org-1', { status: 'draft', leadId: 'lead-1' })).resolves.toEqual([
      { id: 'proposal-1', title: 'Proposta' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/proposals?organizationId=org-1&status=draft&leadId=lead-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('creates, updates, generates and sends proposals through backend endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'proposal-1', title: 'Nova' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'proposal-1', title: 'Atualizada' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, status: 'fallback' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, publicUrl: 'https://hub.yux.com.br/proposal/review/token' }))

    await proposalService.createDraft({ organizationId: 'org-1', leadId: 'lead-1', packageId: 'package-1', title: 'Nova' })
    await proposalService.updateDraft('proposal-1', { title: 'Atualizada' })
    await proposalService.generateDraft('proposal-1')
    await proposalService.send('proposal-1')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/proposals', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/proposals/proposal-1', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/proposals/proposal-1/generate-draft', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/proposals/proposal-1/send', expect.objectContaining({ method: 'POST' }))
  })

  it('uses backend public proposal decision endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ versionId: 'version-1', snapshot: { id: 'proposal-1', organizationId: 'org-1', selectedModuleKeys: [] } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, decision: 'approved' }))

    await expect(proposalService.getPublicReview('token-1')).resolves.toMatchObject({ versionId: 'version-1' })
    await expect(proposalService.submitPublicDecision('token-1', 'approved')).resolves.toEqual({ success: true, decision: 'approved' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/public/proposals/token-1/decision', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/public/proposals/token-1/decision', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ decision: 'approved' }),
      credentials: 'include',
    })
  })
})
