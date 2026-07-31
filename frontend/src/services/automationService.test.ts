import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFlowPayload,
  buildFlowVersionPayload,
  buildTriggerPayload,
  automationService,
  isAutomationBackendUnavailableError,
  mapAutomationFlow,
} from './automationService'

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

describe('automationService helpers', () => {
  it('builds flow payloads with draft and enabled defaults', () => {
    expect(buildFlowPayload({
      organizationId: 'org-1',
      name: ' Follow-up Instagram ',
      description: 'Fluxo comercial',
      sectorTemplateKey: 'clinic',
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      name: 'Follow-up Instagram',
      description: 'Fluxo comercial',
      sector_template_key: 'clinic',
      status: 'draft',
      is_enabled: true,
      automation_kind: 'flow',
      builder_mode: 'guided',
      daily_run_limit: 500,
      requires_human_approval: false,
      risk_level: 'low',
    }))
  })

  it('builds trigger payloads from flow events', () => {
    expect(buildTriggerPayload('flow-1', {
      triggerType: 'lead.stage_changed',
      config: { stageId: 'stage-2' },
    })).toEqual({
      flow_id: 'flow-1',
      trigger_type: 'lead.stage_changed',
      config: { stageId: 'stage-2' },
    })
  })

  it('builds published flow version snapshots', () => {
    expect(buildFlowVersionPayload({
      flowId: 'flow-1',
      versionNumber: 1,
      snapshot: { triggers: [], conditions: [], actions: [] },
      status: 'published',
    })).toEqual({
      flow_id: 'flow-1',
      version_number: 1,
      snapshot: { triggers: [], conditions: [], actions: [] },
      status: 'published',
      published_at: expect.any(String),
    })
  })

  it('detects unavailable automation backend errors', () => {
    expect(isAutomationBackendUnavailableError({
      code: 'PGRST205',
      message: "Could not find the table 'public.automation_flows' in the schema cache",
    })).toBe(true)
    expect(isAutomationBackendUnavailableError({ status: 500, message: 'network failed' })).toBe(false)
  })

  it('maps flows with blocks and execution history', () => {
    expect(mapAutomationFlow({
      id: 'flow-1',
      organization_id: 'org-1',
      name: 'Follow-up Instagram',
      description: 'Fluxo comercial',
      status: 'published',
      is_enabled: true,
      automation_kind: 'flow',
      builder_mode: 'technical',
      published_version: 2,
      active_version_id: 'version-2',
      daily_run_limit: 250,
      requires_human_approval: true,
      risk_level: 'medium',
      sector_template_key: 'clinic',
      last_error: 'provider failed',
      created_at: '2026-06-03T12:00:00.000Z',
      updated_at: '2026-06-03T13:00:00.000Z',
      automation_triggers: [{ id: 'trigger-1', trigger_type: 'lead.stage_changed', config: { stageId: 'stage-2' } }],
      automation_conditions: [{ id: 'condition-1', field: 'source', operator: 'equals', value: 'instagram' }],
      automation_actions: [{ id: 'action-1', action_type: 'create_task', order_index: 1, payload: { title: 'Ligar' } }],
      automation_execution_runs: [{ id: 'run-1', status: 'failed', last_error: 'provider failed', started_at: '2026-06-03T13:00:00.000Z' }],
    })).toMatchObject({
      id: 'flow-1',
      status: 'published',
      builderMode: 'technical',
      publishedVersion: 2,
      activeVersionId: 'version-2',
      dailyRunLimit: 250,
      requiresHumanApproval: true,
      riskLevel: 'medium',
      triggers: [{ triggerType: 'lead.stage_changed' }],
      conditions: [{ field: 'source' }],
      actions: [{ actionType: 'create_task' }],
      executionRuns: [{ status: 'failed' }],
    })
  })
})

describe('automationService backend API methods', () => {
  it('loads automation flows from the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'flow-1', name: 'Follow-up' }]))

    await expect(automationService.getFlows({ organizationId: 'org-1' })).resolves.toEqual([
      { id: 'flow-1', name: 'Follow-up' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/automations/flows?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('creates automation flows through the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'flow-1', name: 'Follow-up' }, { status: 201 }))

    await expect(automationService.createFlow({
      organizationId: 'org-1',
      name: 'Follow-up',
    })).resolves.toEqual({ id: 'flow-1', name: 'Follow-up' })
    expect(fetchMock).toHaveBeenCalledWith('/api/automations/flows', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ organizationId: 'org-1', name: 'Follow-up' }),
      credentials: 'include',
    })
  })

  it('dispatches automation events through the backend queue endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, jobId: 'job-1' }, { status: 202 }))

    await expect(automationService.dispatchEvent({
      type: 'lead.created',
      organizationId: 'org-1',
    })).resolves.toEqual({ ok: true, jobId: 'job-1' })
    expect(fetchMock).toHaveBeenCalledWith('/api/automations/dispatch', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ event: { type: 'lead.created', organizationId: 'org-1' } }),
      credentials: 'include',
    })
  })

  it('loads and uploads materials through the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ id: 'material-1', name: 'briefing.pdf' }]))
      .mockResolvedValueOnce(jsonResponse({ limitMb: 12 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'material-2', name: 'roteiro.txt' }, { status: 201 }))

    await expect(automationService.getMaterials('org-1')).resolves.toEqual([{ id: 'material-1', name: 'briefing.pdf' }])
    await expect(automationService.getUploadLimit('org-1')).resolves.toBe(12)
    await expect(automationService.uploadMaterial(
      'org-1',
      new File(['conteudo'], 'roteiro.txt', { type: 'text/plain' }),
    )).resolves.toEqual({ id: 'material-2', name: 'roteiro.txt' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/automations/materials?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/automations/materials/upload-limit?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/automations/materials', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.stringContaining('"contentBase64":"Y29udGV1ZG8="'),
      credentials: 'include',
    })
  })
})
