import type { MissionConversationMissingContext } from '@/types/actionEngine'
import type { CorrectionTargetV1 } from '@/types/generated/workspace'

export type ResolvedCorrectionTarget = {
  mode: 'inline' | 'navigate'
  path: string | null
  fields: Array<{ key: string; label: string }>
}

const fieldLabels: Record<string, string> = {
  targetAudience: 'Público-alvo',
  desiredChannels: 'Canais desejados',
  automationGoal: 'Objetivo da automação',
  offer: 'Oferta',
  budget: 'Orçamento',
  deadline: 'Prazo',
  brandVoice: 'Tom de voz',
}

const allowedFields: Record<CorrectionTargetV1['key'], ReadonlySet<string>> = {
  mission_brief: new Set(['targetAudience', 'desiredChannels', 'automationGoal', 'offer', 'budget', 'deadline', 'brandVoice']),
  company_profile: new Set(['targetAudience', 'offer', 'brandVoice']),
  knowledge: new Set(),
  channel_connection: new Set(['desiredChannels']),
  contract_modules: new Set(),
  provider_connection: new Set(['desiredChannels']),
}

const paths: Partial<Record<CorrectionTargetV1['key'], string>> = {
  company_profile: '/portal/empresa/perfil',
  knowledge: '/portal/empresa/conhecimento',
  channel_connection: '/portal/empresa/integracoes',
  contract_modules: '/contracts',
  provider_connection: '/portal/empresa/integracoes',
}

export function resolveCorrectionTarget(target: CorrectionTargetV1): ResolvedCorrectionTarget {
  const fields = [...new Set(target.fieldKeys)]
    .filter(key => allowedFields[target.key].has(key))
    .map(key => ({ key, label: fieldLabels[key] ?? key }))
  if (target.key === 'mission_brief') return { mode: 'inline', path: null, fields }
  const base = paths[target.key]
  if (!base) return { mode: 'navigate', path: null, fields }
  const query = new URLSearchParams()
  if (fields.length) query.set('fields', fields.map(item => item.key).join(','))
  query.set('returnToKind', target.returnTo.kind)
  query.set('returnToId', target.returnTo.id)
  return { mode: 'navigate', path: `${base}?${query.toString()}`, fields }
}

export function missionMissingCorrectionTarget(input: {
  missing: MissionConversationMissingContext
  organizationId: string
  conversationId: string
}): CorrectionTargetV1 {
  const { missing } = input
  const routeTarget = ['integration', 'permission', 'consent'].includes(missing.category)
    ? 'channel_connection'
    : 'mission_brief'
  return {
    key: routeTarget,
    organizationId: input.organizationId,
    entityId: routeTarget === 'mission_brief' ? input.conversationId : null,
    fieldKeys: [missionFieldKey(missing)],
    returnTo: { kind: 'conversation', id: input.conversationId },
  }
}

function missionFieldKey(missing: MissionConversationMissingContext) {
  if (missing.category === 'audience') return 'targetAudience'
  if (missing.category === 'integration') return 'desiredChannels'
  if (missing.category === 'offer') return 'offer'
  if (missing.category === 'budget') return 'budget'
  if (missing.category === 'deadline') return 'deadline'
  if (missing.category === 'brand') return 'brandVoice'
  if (missing.key === 'automationGoal') return 'automationGoal'
  return missing.key
}
