import { createHash } from 'node:crypto'
import type { CapabilityManifestEntry } from './capability-manifest.js'
import type { MissionDecisionSummary } from './types.js'

export type DecisionArtifact = {
  id: string
  entityType: string
  operation: string
  label: string
  quantity: number
  version: string | number
  providerTarget?: string
}

export function buildMissionDecisionSummary(input: {
  headline: string
  planRevision: number
  planHash: string
  manifestHash: string
  sourceIds: string[]
  artifacts: DecisionArtifact[]
  existingContacts: number
  futureEligibleContacts: boolean
  channels: string[]
  estimatedCostBrl: string
  maximumCostBrl: string
  estimatedHumanMinutes: number
  capabilityManifest: CapabilityManifestEntry[]
  assumptions: MissionDecisionSummary['assumptions']
  attributionPolicy?: { version: number; hash: string }
}): MissionDecisionSummary {
  if (!isDecimal(input.estimatedCostBrl) || !isDecimal(input.maximumCostBrl)) {
    throw new Error('mission_decision_economics_invalid')
  }
  if (input.artifacts.some(artifact => artifact.version === '' || artifact.version === null || artifact.version === undefined)) {
    throw new Error('mission_decision_artifact_unversioned')
  }
  const artifacts = [...input.artifacts].sort((left, right) => left.id.localeCompare(right.id))
  const capabilityManifest = [...input.capabilityManifest].sort((left, right) => `${left.key}@${left.version}`.localeCompare(`${right.key}@${right.version}`))
  const changes = artifacts.map(artifact => ({
    entityType: artifact.entityType, operation: artifact.operation,
    quantity: artifact.quantity, label: artifact.label,
  }))
  const irreversibleEffects = capabilityManifest
    .filter(capability => capability.recoveryKind === 'irreversible')
    .map(capability => ({ capabilityKey: capability.key, description: irreversibleDescription(capability.key) }))
  const technicalProof = {
    planRevision: input.planRevision, planHash: input.planHash,
    manifestHash: input.manifestHash, sourceCount: new Set(input.sourceIds).size,
  }
  const subject = {
    headline: input.headline.trim(), artifacts,
    contactImpact: { existingContacts: input.existingContacts, futureEligibleContacts: input.futureEligibleContacts, channels: [...new Set(input.channels)].sort() },
    economics: { estimatedCostBrl: input.estimatedCostBrl, maximumCostBrl: input.maximumCostBrl, estimatedHumanMinutes: input.estimatedHumanMinutes },
    capabilityManifest, assumptions: [...input.assumptions].sort((left, right) => left.key.localeCompare(right.key)),
    technicalProof, attributionPolicy: input.attributionPolicy ?? null,
  }
  const decisionSubjectHash = createHash('sha256').update(stableSerialize(subject)).digest('hex')
  return {
    headline: subject.headline, changes, contactImpact: subject.contactImpact,
    economics: subject.economics, irreversibleEffects, assumptions: subject.assumptions,
    technicalProof, decisionSubjectHash,
  }
}

function irreversibleDescription(capabilityKey: string): string {
  if (capabilityKey.includes('email')) return 'O envio de e-mail não pode ser desfeito após aceitação do provedor.'
  if (capabilityKey.includes('whatsapp')) return 'A mensagem de WhatsApp não pode ser recolhida após o envio.'
  return 'Este efeito não pode ser desfeito; falhas geram registro de incidente e contenção.'
}

function isDecimal(value: string) { return /^\d+(\.\d{1,6})?$/.test(value) }
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
