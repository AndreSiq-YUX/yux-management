import { afterEach, describe, expect, it, vi } from 'vitest'
import { automationSequenceService, buildSequencePayload, mapAutomationSequence } from './automationSequenceService'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('automationSequenceService helpers', () => {
  it('builds sequence payloads with defaults', () => {
    expect(buildSequencePayload({
      organizationId: 'org-1',
      name: ' Reativacao ',
      conversionGoal: 'meeting_booked',
    })).toEqual({
      organization_id: 'org-1',
      name: 'Reativacao',
      description: null,
      channel: 'whatsapp',
      sector_template_key: null,
      conversion_goal: 'meeting_booked',
      is_active: true,
    })
  })

  it('maps sequence rows with multichannel steps', () => {
    expect(mapAutomationSequence({
      id: 'sequence-1',
      organization_id: 'org-1',
      name: 'Clinica',
      is_active: true,
      channel: 'mixed',
      sector_template_key: 'clinic',
      active_enrollment_count: 10,
      converted_enrollment_count: 3,
      crm_sequence_steps: [{
        id: 'step-1',
        sequence_id: 'sequence-1',
        order_index: 1,
        step_kind: 'message',
        channel: 'email',
        delay_minutes: 15,
        body: 'Ola',
        requires_human_approval: false,
        is_active: true,
      }],
    })).toMatchObject({
      channel: 'mixed',
      status: 'active',
      activeEnrollmentCount: 10,
      convertedEnrollmentCount: 3,
      steps: [{ channel: 'email', stepKind: 'message' }],
    })
  })
})

describe('automationSequenceService backend API methods', () => {
  it('loads sequences from the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'sequence-1', name: 'Reativacao' }]))

    await expect(automationSequenceService.getSequences('org-1')).resolves.toEqual([
      { id: 'sequence-1', name: 'Reativacao' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/automations/sequences?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('creates sequences and steps through the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'sequence-1', name: 'Reativacao' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'step-1', stepKind: 'message' }, { status: 201 }))

    await expect(automationSequenceService.createSequence({
      organizationId: 'org-1',
      name: 'Reativacao',
    })).resolves.toEqual({ id: 'sequence-1', name: 'Reativacao' })
    await expect(automationSequenceService.addStep('sequence-1', {
      stepKind: 'message',
      channel: 'whatsapp',
      body: 'Ola',
    })).resolves.toEqual({ id: 'step-1', stepKind: 'message' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/automations/sequences', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ organizationId: 'org-1', name: 'Reativacao' }),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/automations/sequences/sequence-1/steps', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ stepKind: 'message', channel: 'whatsapp', body: 'Ola' }),
      credentials: 'include',
    })
  })
})
