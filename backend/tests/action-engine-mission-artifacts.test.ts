import { describe, expect, it } from 'vitest'
import { missionArtifactHash } from '../src/modules/action-engine/mission-command.js'
import { buildMissionArtifactProjections } from '../src/modules/action-engine/mission-artifacts.js'

describe('mission artifact projections', () => {
  it('projects safe cited artifacts and detects an execution hash outside the approved proposal', () => {
    const funnel = { name: 'Comercial', stages: [{ key: 'new', name: 'Novo' }, { key: 'won', name: 'Ganho', isWon: true }] }
    const planHash = 'a'.repeat(64)
    const artifacts = buildMissionArtifactProjections({
      plan: { id: 'plan-1', planHash, parameters: { funnelNurtureArtifacts: { funnel, emails: [], sourceIds: ['source-1'], risks: ['Revisar SLA'], brandCompliance: { findings: ['Sem promessas absolutas'] } } } },
      actions: [{ stepKey: 'pack.draft_funnel', status: 'succeeded', output: { entityId: 'entity-1', versionId: 'version-1', contentHash: 'b'.repeat(64) } }],
      approvals: [{ planId: 'plan-1', status: 'approved', subjectHash: 'c'.repeat(64), requestedPayload: { planHash } }],
      sources: [{ id: 'source-1', title: 'Base de conhecimento publicada', category: 'knowledge' }],
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ kind: 'funnel', status: 'draft', entityId: 'entity-1', staleApproval: true })
    expect(artifacts[0]?.contentHash).not.toBe(missionArtifactHash(funnel))
    expect(artifacts[0]?.citations).toEqual([{ id: 'source-1', label: 'Base de conhecimento publicada', category: 'knowledge' }])
    expect(JSON.stringify(artifacts)).not.toContain('excerpt')
  })

  it('keeps every proposed email and trusts the resolved executable input hash', () => {
    const email = { key: 'education_1', name: 'Educação', subject: 'Diagnóstico', previewText: 'Roteiro', bodyHtml: '<p>Olá</p>{{unsubscribe_url}}', bodyText: 'Olá {{unsubscribe_url}}', sourceIds: ['source-1'], complianceNotes: ['Sem promessa'] }
    const executable = { name: email.name, subject: email.subject, previewText: email.previewText, bodyHtml: email.bodyHtml, bodyText: email.bodyText, sourceIds: email.sourceIds, complianceNotes: email.complianceNotes, forbiddenTerms: [] }
    const normalized = { name: email.name, subject: email.subject, preheader: email.previewText, bodyHtml: email.bodyHtml, bodyText: email.bodyText, sourceIds: email.sourceIds, complianceNotes: email.complianceNotes }
    const contentHash = missionArtifactHash(normalized)
    const artifacts = buildMissionArtifactProjections({
      plan: { id: 'plan-1', planHash: 'a'.repeat(64), parameters: { funnelNurtureArtifacts: { emails: [email], sourceIds: ['source-1'], brandCompliance: {} } } },
      actions: [{ stepKey: 'pack.draft_email_1', status: 'succeeded', input: executable, output: { contentHash } }], approvals: [], sources: [],
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ kind: 'email', staleApproval: false, proposedVersion: { contentHash } })
  })
})
