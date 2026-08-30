import { describe, expect, it } from 'vitest'
import { collectPlanInputBindingSteps, resolvePlanInputBindings } from '../src/modules/action-engine/plan-input-bindings.js'

describe('Mission plan input bindings', () => {
  it('expands artifacts and resolves nested immutable-version dependencies', () => {
    expect(resolvePlanInputBindings({
      artifactRef: 'resolvedParameters.funnelNurtureArtifacts.sequence',
      steps: [{ templateVersionId: 'binding:pack.draft_email_1.versionId', delayMinutes: 0 }],
    }, {
      resolvedParameters: { funnelNurtureArtifacts: { sequence: { name: 'Nutrição', steps: [] } } },
      outputsByStep: { 'pack.draft_email_1': { versionId: '11111111-1111-4111-8111-111111111111' } },
    })).toEqual({ name: 'Nutrição', steps: [{ templateVersionId: '11111111-1111-4111-8111-111111111111', delayMinutes: 0 }] })
  })

  it('uses schema-shaped placeholders only during compilation and blocks unknown runtime effects', () => {
    expect(resolvePlanInputBindings({ expectedContentHash: 'binding:pack.draft.contentHash' }, { resolvedParameters: {}, outputsByStep: {}, validation: true })).toEqual({ expectedContentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(() => resolvePlanInputBindings({ expectedContentHash: 'binding:pack.draft.contentHash' }, { resolvedParameters: {}, outputsByStep: {} })).toThrowError('mission_plan_output_binding_unresolved')
  })

  it('discovers dependency step keys embedded in nested parameters', () => {
    expect(collectPlanInputBindingSteps({ steps: [{ templateVersionId: 'binding:pack.draft_email_1.versionId' }], expectedContentHash: 'binding:pack.draft_sequence.contentHash' })).toEqual(['pack.draft_email_1', 'pack.draft_sequence'])
  })
})
