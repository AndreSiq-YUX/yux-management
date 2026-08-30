import { missionArtifactHash } from './mission-command.js'

type RecordValue = Record<string, unknown>

export type MissionArtifactProjection = {
  key: string
  kind: 'funnel' | 'email' | 'sequence' | 'automation'
  title: string
  status: 'proposed' | 'draft' | 'published'
  contentHash: string
  entityId?: string
  versionId?: string
  approvalSubjectHash?: string
  staleApproval: boolean
  proposedVersion: { status: 'proposed'; contentHash: string }
  currentVersion?: { status: 'draft' | 'published'; contentHash: string; entityId?: string; versionId?: string }
  data: RecordValue
  citations: Array<{ id: string; label: string; category: string }>
  complianceWarnings: string[]
}

export function buildMissionArtifactProjections(input: {
  plan: RecordValue
  actions: RecordValue[]
  approvals: RecordValue[]
  sources: Array<{ id: string; title: string; category: string }>
}): MissionArtifactProjection[] {
  const parameters = record(input.plan.parameters)
  const bundle = record(parameters.funnelNurtureArtifacts)
  if (!Object.keys(bundle).length) return []

  const approval = input.approvals.find(item => item.planId === input.plan.id && ['pending', 'approved'].includes(String(item.status)))
  const approvalPayload = record(approval?.requestedPayload)
  const approvalPlanHash = String(approvalPayload.planHash ?? '')
  const staleApproval = Boolean(approval && approvalPlanHash && approvalPlanHash !== String(input.plan.planHash ?? ''))
  const citations = citationList(bundle, input.sources)
  const compliance = record(bundle.brandCompliance)
  const warnings = uniqueStrings([...(strings(compliance.findings)), ...(strings(bundle.risks))])
  const artifacts: MissionArtifactProjection[] = []

  const funnel = record(bundle.funnel)
  if (Object.keys(funnel).length) artifacts.push(project({ key: 'funnel', kind: 'funnel', title: String(funnel.name ?? 'Funil comercial'), data: funnel, stepPrefix: 'pack.', draftStep: 'pack.draft_funnel', publishStep: 'pack.publish_funnel', input, citations, warnings, approval, staleApproval }))

  records(bundle.emails).forEach((item, index) => {
    const email = record(item)
    if (!Object.keys(email).length) return
    const position = index + 1
    artifacts.push(project({ key: String(email.key ?? `email_${position}`), kind: 'email', title: String(email.name ?? `E-mail ${position}`), data: email, stepPrefix: 'pack.', draftStep: `pack.draft_email_${position}`, publishStep: `pack.publish_email_${position}`, input, citations: citationList(email, input.sources), warnings: uniqueStrings([...warnings, ...strings(email.complianceNotes)]), approval, staleApproval }))
  })

  const sequence = record(bundle.sequence)
  if (Object.keys(sequence).length) artifacts.push(project({ key: 'sequence', kind: 'sequence', title: String(sequence.name ?? 'Sequência de nutrição'), data: sequence, stepPrefix: 'pack.', draftStep: 'pack.draft_sequence', publishStep: 'pack.publish_sequence', input, citations, warnings, approval, staleApproval }))

  const automation = record(bundle.automation)
  if (Object.keys(automation).length) artifacts.push(project({ key: 'automation', kind: 'automation', title: String(automation.name ?? 'Automação de entrada'), data: automation, stepPrefix: 'pack.', draftStep: 'pack.draft_flow', publishStep: 'pack.publish_flow', input, citations, warnings, approval, staleApproval }))
  return artifacts
}

function project(config: {
  key: string; kind: MissionArtifactProjection['kind']; title: string; data: RecordValue; stepPrefix: string;
  draftStep: string; publishStep: string; input: { plan: RecordValue; actions: RecordValue[] };
  citations: MissionArtifactProjection['citations']; warnings: string[]; approval?: RecordValue; staleApproval: boolean
}): MissionArtifactProjection {
  const publication = latestAction(config.input.actions, config.publishStep)
  const draft = latestAction(config.input.actions, config.draftStep)
  const evidence = record(publication?.output ?? draft?.output)
  const status = publication?.status === 'succeeded' ? 'published' : draft?.status === 'succeeded' ? 'draft' : 'proposed'
  const proposedHash = artifactHash(config.kind, draft?.input ? record(draft.input) : config.data)
  const currentHash = typeof evidence.contentHash === 'string' ? evidence.contentHash : proposedHash
  return {
    key: config.key, kind: config.kind, title: config.title, status, contentHash: currentHash,
    ...(typeof evidence.entityId === 'string' ? { entityId: evidence.entityId } : {}),
    ...(typeof evidence.versionId === 'string' ? { versionId: evidence.versionId } : {}),
    ...(typeof config.approval?.subjectHash === 'string' ? { approvalSubjectHash: config.approval.subjectHash } : {}),
    staleApproval: config.staleApproval || currentHash !== proposedHash,
    proposedVersion: { status: 'proposed', contentHash: proposedHash },
    ...(status !== 'proposed' ? { currentVersion: {
      status, contentHash: currentHash,
      ...(typeof evidence.entityId === 'string' ? { entityId: evidence.entityId } : {}),
      ...(typeof evidence.versionId === 'string' ? { versionId: evidence.versionId } : {}),
    } } : {}),
    data: config.data, citations: config.citations, complianceWarnings: config.warnings,
  }
}

function artifactHash(kind: MissionArtifactProjection['kind'], data: RecordValue): string {
  if (kind === 'funnel') {
    const { reuseExistingFunnelId: _reuse, ...funnel } = data
    return missionArtifactHash(funnel)
  }
  if (kind !== 'email') return missionArtifactHash(data)
  const { key: _key, previewText, forbiddenTerms: _forbidden, ...copy } = data
  return missionArtifactHash({ ...copy, preheader: previewText })
}

function latestAction(actions: RecordValue[], stepKey: string): RecordValue | undefined {
  return [...actions].reverse().find(action => action.stepKey === stepKey)
}

function citationList(value: RecordValue, sources: Array<{ id: string; title: string; category: string }>) {
  const byId = new Map(sources.map(source => [source.id, source]))
  return uniqueStrings(strings(value.sourceIds)).map(id => {
    const source = byId.get(id)
    return { id, label: source?.title ?? 'Fonte aprovada da missão', category: source?.category ?? 'knowledge' }
  })
}

function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function records(value: unknown): RecordValue[] { return Array.isArray(value) ? value.map(record).filter(item => Object.keys(item).length > 0) : [] }
function uniqueStrings(values: string[]): string[] { return [...new Set(values.map(item => item.trim()).filter(Boolean))] }
