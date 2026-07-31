import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLandingPageApprovalPayload, buildLandingPageInsertPayload } from './landingPageService'

describe('landingPageService payload builders', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds landing page insert payloads with routing and CTA fields', () => {
    expect(buildLandingPageInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      campaignId: 'campaign-1',
      pipelineId: 'pipeline-1',
      initialStageId: 'stage-1',
      name: '  Botox Junho  ',
      slug: ' botox-junho ',
      primaryCtaType: 'form',
      primaryCtaValue: ' Agendar avaliacao ',
      internalNotes: '  Revisar imagem  ',
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      campaign_id: 'campaign-1',
      pipeline_id: 'pipeline-1',
      initial_stage_id: 'stage-1',
      name: 'Botox Junho',
      slug: 'botox-junho',
      primary_cta_type: 'form',
      primary_cta_value: 'Agendar avaliacao',
      internal_notes: 'Revisar imagem',
    }))
  })

  it('builds approval payloads with decision timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))

    expect(buildLandingPageApprovalPayload({
      landingPageId: 'lp-1',
      versionId: 'version-1',
      status: 'approved',
      comment: ' aprovado ',
    })).toEqual({
      landing_page_id: 'lp-1',
      version_id: 'version-1',
      status: 'approved',
      comment: 'aprovado',
      decided_at: '2026-06-03T12:00:00.000Z',
    })
  })
})
