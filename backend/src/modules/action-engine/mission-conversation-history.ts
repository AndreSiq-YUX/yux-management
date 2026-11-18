import type { MissionSourceRefWire } from './generated/mission-wire.js'
import { verifyMissionKnowledgeContext } from './mission-source-verifier.js'
import { hashCanonical, type Queryable } from './repository.js'
import type { MissionConversation } from './types.js'

type Audience = 'client_user' | 'internal_operator'

export type MissionConversationTurnContext = {
  audience: Audience
  historyAfterSequence: number
  inputSources: MissionSourceRefWire[]
}

export function missionIntakeSourceScope(conversation: MissionConversation, audience: Audience) {
  return {
    organizationId: conversation.organizationId,
    contractId: conversation.contractId,
    audience,
    agentProfileKey: 'growth_strategist',
    moduleKey: 'marketing_studio',
    workflowKey: 'mission_intake_conversation',
  }
}

export function missionSourceFingerprint(source: MissionSourceRefWire) {
  return hashCanonical([
    source.ref, source.kind, source.id, source.version, source.contentHash,
    source.publicationId ?? null, source.itemId ?? null, source.knowledgePolicyVersion ?? null,
    source.useMode ?? null, source.bindingFingerprint ?? null,
  ])
}

export async function resolveMissionTurnHistory(pool: Queryable, conversation: MissionConversation, audience?: Audience) {
  const latestSequence = conversation.messages.at(-1)?.sequence ?? 0
  if (!conversation.messages.some(message => message.actorType === 'agent')) {
    return { messages: conversation.messages, currentBrief: conversation.currentBrief, historyAfterSequence: 0,
      sources: [], audience: audience ?? 'client_user', reset: false }
  }

  const { rows } = await pool.query<{
    message_sequence: number
    history_after_sequence: number
    audience: Audience
    input_sources: MissionSourceRefWire[]
  }>(
    `SELECT message_sequence, history_after_sequence, audience, input_sources
     FROM private.mission_conversation_turn_context
     WHERE organization_id=$1 AND conversation_id=$2 AND message_sequence <= $3
     ORDER BY message_sequence DESC`,
    [conversation.organizationId, conversation.id, latestSequence],
  )
  const historyAfterSequence = rows[0]?.history_after_sequence ?? 0
  const retainedTurns = rows.filter(turn => turn.message_sequence > historyAfterSequence)
  const messages = conversation.messages.filter(message => message.actorType === 'user' || message.sequence > historyAfterSequence)
  const citedSources = messages.filter(message => message.actorType !== 'user')
    .flatMap(message => message.sourceRefs ?? []) as unknown as MissionSourceRefWire[]
  const currentAudience = audience ?? rows[0]?.audience ?? (citedSources.some(source =>
    (source.kind.startsWith('knowledge_') || source.kind === 'company_strategy') && source.visibility === 'internal',
  ) ? 'internal_operator' : 'client_user')
  const sources = new Map<string, MissionSourceRefWire>()
  let reset = currentAudience === 'client_user' && retainedTurns.some(turn => turn.audience === 'internal_operator')
  for (const source of [...retainedTurns.flatMap(turn => turn.input_sources), ...citedSources]) {
    const previous = sources.get(source.ref)
    if (previous && missionSourceFingerprint(previous) !== missionSourceFingerprint(source)) reset = true
    sources.set(source.ref, source)
  }
  const refs = [...sources.values()]
  if (!reset && refs.length) {
    try {
      await verifyMissionKnowledgeContext(pool, { ...missionIntakeSourceScope(conversation, currentAudience), sourceRefs: refs })
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('mission_source_verification_failed:')) throw error
      reset = true
    }
  }
  if (reset) {
    // Derived text and the accumulated brief can repeat a revoked fact without citing it.
    return {
      messages: conversation.messages.filter(message => message.actorType === 'user'),
      currentBrief: {},
      historyAfterSequence: latestSequence,
      sources: [],
      audience: currentAudience,
      reset,
    }
  }
  return { messages, currentBrief: conversation.currentBrief, historyAfterSequence, sources: refs, audience: currentAudience, reset }
}
