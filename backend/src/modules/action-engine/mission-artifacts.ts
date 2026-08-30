import { missionArtifactHash } from './mission-command.js'

type RecordValue = Record<string, unknown>

export type MissionArtifactProjection = {
  key: string
  kind: 'funnel' | 'email' | 'sequence' | 'automation'
    | 'campaign_brief' | 'campaign_audience' | 'campaign_creative'
    | 'campaign_landing_page' | 'campaign_lead_form' | 'campaign_tracking' | 'campaign_provider'
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
  const campaignBundle = record(parameters.campaignLaunchArtifacts)
  if (Object.keys(campaignBundle).length) return buildCampaignArtifacts(campaignBundle, input)
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

function buildCampaignArtifacts(
  bundle: RecordValue,
  input: {
    plan: RecordValue
    actions: RecordValue[]
    approvals: RecordValue[]
    sources: Array<{ id: string; title: string; category: string }>
  },
): MissionArtifactProjection[] {
  const citations = citationList(bundle, input.sources)
  const compliance = record(bundle.brandCompliance)
  const warnings = uniqueStrings([...strings(bundle.risks), ...strings(compliance.findings)])
  const planApproval = input.approvals.find(item => item.planId === input.plan.id && ['pending', 'approved'].includes(String(item.status)))
  const planApprovalPayload = record(planApproval?.requestedPayload)
  const staleApproval = Boolean(planApproval && planApprovalPayload.planHash && planApprovalPayload.planHash !== input.plan.planHash)
  const artifacts: MissionArtifactProjection[] = []
  const add = (config: {
    key: string; kind: MissionArtifactProjection['kind']; title: string; data: RecordValue;
    draftStep: string; publishStep?: string; itemCitations?: MissionArtifactProjection['citations']; itemWarnings?: string[];
  }) => artifacts.push(project({
    ...config,
    stepPrefix: 'pack.',
    publishStep: config.publishStep ?? '__never__',
    input,
    citations: config.itemCitations ?? citations,
    warnings: config.itemWarnings ?? warnings,
    approval: planApproval,
    staleApproval,
  }))

  const brief = record(bundle.brief)
  if (Object.keys(brief).length) add({ key: 'brief', kind: 'campaign_brief', title: String(brief.name ?? 'Brief da campanha'), data: brief, draftStep: 'pack.draft_campaign' })
  const audience = record(bundle.audience)
  if (Object.keys(audience).length) add({ key: 'audience', kind: 'campaign_audience', title: 'Público e segmentação', data: audience, draftStep: 'pack.draft_campaign' })
  records(record(bundle.creativeSet).creatives).forEach((creative, index) => add({
    key: `creative_${index + 1}`, kind: 'campaign_creative', title: String(creative.headline ?? `Criativo ${index + 1}`),
    data: creative, draftStep: 'pack.draft_creative', itemCitations: citationList(creative, input.sources),
  }))
  const acquisition = record(bundle.acquisition)
  const landingPage = record(acquisition.landingPage)
  if (Object.keys(landingPage).length) add({ key: 'landing_page', kind: 'campaign_landing_page', title: String(landingPage.name ?? 'Landing page'), data: landingPage, draftStep: 'pack.draft_landing_page' })
  const leadForm = record(acquisition.leadForm)
  if (Object.keys(leadForm).length) add({ key: 'lead_form', kind: 'campaign_lead_form', title: String(leadForm.name ?? 'Formulário'), data: leadForm, draftStep: 'pack.draft_lead_form' })
  const tracking = record(acquisition.trackingPlan)
  if (Object.keys(tracking).length) add({ key: 'tracking', kind: 'campaign_tracking', title: 'Mensuração e tracking', data: tracking, draftStep: 'pack.validate_tracking' })

  const providerAction = latestAction(input.actions, 'pack.create_provider_paused')
  const activationAction = latestAction(input.actions, 'pack.activate')
  const providerOutput = actionEvidence(activationAction ?? providerAction)
  if (providerAction || activationAction) {
    const activationApproval = input.approvals.find(item => item.runId === activationAction?.id && ['pending', 'approved'].includes(String(item.status)))
    const providerState = activationAction?.status === 'succeeded' ? 'active'
      : providerAction?.status === 'succeeded' ? 'provider_paused' : String(providerOutput.status ?? 'preparing')
    add({
      key: 'provider', kind: 'campaign_provider', title: 'Campanha no provedor', draftStep: 'pack.create_provider_paused', publishStep: 'pack.activate',
      data: {
        provider: brief.platform,
        providerState,
        providerReference: providerOutput.providerReference,
        dailyBudgetBrl: brief.dailyBudgetBrl,
        totalBudgetBrl: brief.totalBudgetBrl,
        startsAt: brief.startsAt,
        endsAt: brief.endsAt,
        activationApprovalStatus: activationApproval?.status ?? 'not_requested',
        activationSubjectHash: activationApproval?.subjectHash,
      },
    })
  }
  return artifacts
}

function project(config: {
  key: string; kind: MissionArtifactProjection['kind']; title: string; data: RecordValue; stepPrefix: string;
  draftStep: string; publishStep: string; input: { plan: RecordValue; actions: RecordValue[] };
  citations: MissionArtifactProjection['citations']; warnings: string[]; approval?: RecordValue; staleApproval: boolean
}): MissionArtifactProjection {
  const publication = latestAction(config.input.actions, config.publishStep)
  const draft = latestAction(config.input.actions, config.draftStep)
  const evidence = actionEvidence(publication ?? draft)
  const status = publication?.status === 'succeeded' ? 'published' : draft?.status === 'succeeded' ? 'draft' : 'proposed'
  const proposedHash = artifactHash(config.kind, draft?.input ? record(draft.input) : config.data)
  const comparableEvidence = !['campaign_brief','campaign_audience','campaign_tracking','campaign_provider'].includes(config.kind)
  const currentHash = comparableEvidence && typeof evidence.contentHash === 'string' ? evidence.contentHash : proposedHash
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

function actionEvidence(action?: RecordValue): RecordValue {
  const raw = record(action?.output)
  const nested = record(raw.output)
  return Object.keys(nested).length ? nested : raw
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
