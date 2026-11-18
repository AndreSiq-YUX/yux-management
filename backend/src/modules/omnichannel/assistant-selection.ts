import type pg from 'pg'
import { selectStrategyAssistantForConversation } from '../../lib/edge-compat/strategy.js'
import { normalizeBrandRules, type OmnichannelAssistantContext } from './assistant-context.js'

const profiles = {
  sdr: 'ai_sdr_comercial_1', closer: 'ai_closer', support: 'support_assistant', retention: 'customer_growth_comercial_2',
} as const
type AssistantRole = keyof typeof profiles
type Reason = 'channel_binding' | 'locked_role' | 'routing_rule' | 'default_sdr'
type WaitReason = 'contract_unavailable' | 'channel_assistant_unavailable' | 'human_in_control'

type RoutingScope = {
  client_id: string | null; contract_id: string | null; bound_assistant_id: string | null
  status: string | null; response_mode: string | null; classification: string | null
  conversation_stage: string | null; conversation_current_role: string | null; role_locked_until: Date | null
  vocabulary_dont: string[] | null; forbidden_topics: string[] | null
}
type Rule = {
  id: string; assistant_id: string; status: string; channel: string | null; required_role: string | null
  stage_keys: string[]; intent_keys: string[]; keyword_patterns: string[]; default_rule: boolean
  lock_role_minutes: number; score_weight: number
}
type Assistant = {
  id: string; name: string; status: string; assistant_role: AssistantRole | null; contract_id: string | null
  profile_key: string | null; routing_priority: number; updated_at: Date; rules: Rule[]
}
type Selection = { reason: Reason; role: AssistantRole; assistantName: string | null; ruleId: string | null }

export function usesOmnichannelAssistantSelection(config: string | undefined, connectionId: string) {
  return config?.split(',').some(value => value.trim().toLowerCase() === connectionId.toLowerCase()) ?? false
}

export async function selectOmnichannelAssistant(pool: Pick<pg.Pool, 'query'>, input: {
  organizationId: string; connectionId: string; conversationId?: string
  message: string; intent?: string; stage?: string
}): Promise<{ selection: Selection; context: OmnichannelAssistantContext; lockUntil: Date | null }
  | { wait: WaitReason } | null> {
  const { rows: [scope] } = await pool.query<RoutingScope>(
    `SELECT org.client_id, contract.id AS contract_id, connection.assistant_id AS bound_assistant_id,
            conversation.status, conversation.response_mode, conversation.classification, conversation.conversation_stage,
            conversation.conversation_current_role, conversation.role_locked_until, brand.vocabulary_dont, brand.forbidden_topics
       FROM public.channel_connections connection
       JOIN public.organizations org ON org.id = connection.organization_id
       LEFT JOIN public.conversations conversation ON conversation.id = $3 AND conversation.organization_id = org.id
        AND conversation.connection_id = connection.id AND conversation.channel = connection.channel
       LEFT JOIN public.leads lead ON lead.id = conversation.lead_id AND lead.organization_id = org.id AND lead.deleted_at IS NULL
       LEFT JOIN public.crm_instances crm ON crm.id = lead.crm_instance_id AND crm.organization_id = org.id
       LEFT JOIN public.ai_assistants bound ON bound.id = connection.assistant_id AND bound.organization_id = org.id
        AND (bound.client_id IS NULL OR bound.client_id = org.client_id)
       LEFT JOIN LATERAL (
         SELECT (array_agg(item.id))[1] AS id FROM public.contracts item
          WHERE item.client_id = org.client_id AND item.status = 'active' HAVING count(*) = 1
       ) single_contract ON TRUE
       LEFT JOIN public.contracts contract ON contract.id = COALESCE(crm.contract_id, bound.contract_id, single_contract.id)
        AND contract.client_id = org.client_id AND contract.status = 'active'
        AND EXISTS (SELECT 1 FROM public.contract_modules module
                     WHERE module.contract_id = contract.id AND module.module_key = 'whatsapp_ai' AND module.enabled)
       LEFT JOIN LATERAL (
         SELECT profile.vocabulary_dont, profile.forbidden_topics FROM public.marketing_brand_profiles profile
          WHERE profile.organization_id = org.id AND profile.status = 'active'
            AND (profile.contract_id = contract.id OR profile.contract_id IS NULL)
          ORDER BY (profile.contract_id IS NOT NULL) DESC, profile.updated_at DESC, profile.id LIMIT 1
       ) brand ON TRUE
      WHERE org.id = $1 AND connection.id = $2 AND connection.channel = 'whatsapp' AND connection.is_active
        AND ($3::uuid IS NULL OR conversation.id IS NOT NULL)`,
    [input.organizationId, input.connectionId, input.conversationId ?? null],
  )
  if (!scope) return null
  if (scope.status === 'waiting_human' || scope.response_mode === 'manual') return { wait: 'human_in_control' }
  if (!scope.contract_id || !scope.client_id) return { wait: 'contract_unavailable' }

  const { rows } = await pool.query<Assistant>(
    `SELECT assistant.id, assistant.name, assistant.status, assistant.assistant_role, assistant.contract_id,
            profile.profile_key, assistant.routing_priority, assistant.updated_at,
            COALESCE((SELECT jsonb_agg(to_jsonb(rule) ORDER BY rule.id) FROM public.ai_assistant_routing_rules rule
              WHERE rule.assistant_id = assistant.id AND rule.status = 'active'
                AND (rule.channel IS NULL OR rule.channel = 'whatsapp')), '[]'::jsonb) AS rules
       FROM public.ai_assistants assistant
       LEFT JOIN public.yux_strategy_agent_profiles profile ON profile.id = assistant.strategy_profile_id AND profile.status = 'active'
      WHERE assistant.organization_id = $1 AND assistant.status = 'active'
        AND (assistant.client_id IS NULL OR assistant.client_id = $2)
        AND (assistant.contract_id IS NULL OR assistant.contract_id = $3)
        AND (assistant.strategy_profile_id IS NULL OR profile.id IS NOT NULL)
      ORDER BY assistant.contract_id NULLS LAST, assistant.routing_priority, assistant.updated_at DESC, assistant.id`,
    [input.organizationId, scope.client_id, scope.contract_id],
  )
  const eligible = rows.filter(item => {
    const role = item.assistant_role ?? 'sdr'
    return role === 'sdr' ? !item.profile_key || item.profile_key === profiles.sdr : profiles[role] === item.profile_key
  })
  const bound = eligible.find(item => item.id === scope.bound_assistant_id)
  if (scope.bound_assistant_id && !bound) return { wait: 'channel_assistant_unavailable' }

  const intent = input.intent ?? scope.classification
  const stage = input.stage ?? scope.conversation_stage
  const message = ` ${normalize(input.message)} `
  const rules = eligible.flatMap(assistant => assistant.rules
    .filter(rule => !rule.required_role || rule.required_role === (assistant.assistant_role ?? 'sdr'))
    .map(rule => ({
      ...rule,
      keyword_patterns: rule.keyword_patterns.map(normalize).filter(phrase => phrase && message.includes(` ${phrase} `)),
    }))
    .filter(rule => rule.keyword_patterns.length || (intent && rule.intent_keys.includes(intent)) || (stage && rule.stage_keys.includes(stage))))
  const lockActive = Boolean(scope.role_locked_until && scope.role_locked_until.getTime() > Date.now())
  const candidates = eligible.filter(item => rules.some(rule => rule.assistant_id === item.id)
    || (lockActive && item.assistant_role === scope.conversation_current_role))
  const routed = bound ? null : selectStrategyAssistantForConversation({
    conversation: { conversation_current_role: scope.conversation_current_role, role_locked_until: scope.role_locked_until?.toISOString() },
    assistants: candidates.map(item => ({ ...item, updated_at: item.updated_at.toISOString() })),
    routingRules: rules, messageText: message, intent, stage, channel: 'whatsapp',
  })
  const rule = rules.find(item => item.id === routed?.routingRuleId)
  const locked = lockActive && routed?.assistant?.assistant_role === scope.conversation_current_role
  const selected = bound ?? (rule || locked ? candidates.find(item => item.id === routed?.assistant?.id) : undefined)
  const reason = bound ? 'channel_binding' : rule ? 'routing_rule' : selected ? 'locked_role' : 'default_sdr'
  const assistant = selected ?? eligible.find(item => item.assistant_role === 'sdr' || item.assistant_role === null)
  const role = assistant?.assistant_role ?? 'sdr'
  const minutes = rule?.lock_role_minutes ?? 0
  return {
    selection: { role, reason, assistantName: assistant?.name ?? null, ruleId: rule?.id ?? null },
    lockUntil: reason === 'locked_role' ? scope.role_locked_until : minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null,
    context: {
      assistantId: assistant?.id, clientId: scope.client_id, contractId: scope.contract_id, profileKey: profiles[role],
      brandRules: { vocabularyDont: normalizeBrandRules(scope.vocabulary_dont), forbiddenTopics: normalizeBrandRules(scope.forbidden_topics) },
    },
  }
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
