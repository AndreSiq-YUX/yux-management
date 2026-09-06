import { describe, expect, it } from 'vitest'
import { missionMissingCorrectionTarget, resolveCorrectionTarget } from './correctionTargets'

const organizationId = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'

describe('workspace correction targets', () => {
  it('keeps mission briefing corrections inline with human labels', () => {
    const result = resolveCorrectionTarget({
      key: 'mission_brief', organizationId, entityId: conversationId,
      fieldKeys: ['targetAudience', 'desiredChannels', 'automationGoal'],
      returnTo: { kind: 'conversation', id: conversationId },
    })
    expect(result).toEqual({
      mode: 'inline', path: null,
      fields: [
        { key: 'targetAudience', label: 'Público-alvo' },
        { key: 'desiredChannels', label: 'Canais desejados' },
        { key: 'automationGoal', label: 'Objetivo da automação' },
      ],
    })
  })

  it('uses a closed route map and drops unrecognized fields', () => {
    const result = resolveCorrectionTarget({
      key: 'channel_connection', organizationId, entityId: null,
      fieldKeys: ['desiredChannels', 'https://evil.example'],
      returnTo: { kind: 'conversation', id: conversationId },
    })
    expect(result.mode).toBe('navigate')
    expect(result.path).toBe(`/portal/empresa/integracoes?fields=desiredChannels&returnToKind=conversation&returnToId=${conversationId}`)
    expect(result.path).not.toContain('evil')
  })

  it('maps audience answers to the mission brief instead of the company profile', () => {
    const target = missionMissingCorrectionTarget({
      organizationId, conversationId,
      missing: { key: 'icp', category: 'audience', reason: 'Defina o público', requiredFor: ['planning'] },
    })
    expect(target).toMatchObject({ key: 'mission_brief', entityId: conversationId, fieldKeys: ['targetAudience'] })
  })
})
