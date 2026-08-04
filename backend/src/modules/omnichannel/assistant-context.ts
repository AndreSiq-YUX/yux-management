import type pg from 'pg'

type Queryable = Pick<pg.Pool, 'query'>

export type OmnichannelAssistantContext = {
  assistantId?: string
  clientId?: string
  contractId?: string
  profileKey: string
  brandRules: {
    vocabularyDont: string[]
    forbiddenTopics: string[]
  }
}

type ContextRow = {
  assistant_id: string | null
  client_id: string | null
  contract_id: string | null
  profile_key: string | null
  vocabulary_dont: string[] | null
  forbidden_topics: string[] | null
}

export async function resolveOmnichannelAssistantContext(
  pool: Queryable,
  organizationId: string,
): Promise<OmnichannelAssistantContext> {
  const result = await pool.query<ContextRow>(
    `SELECT assistant.id AS assistant_id,
            COALESCE(assistant.client_id, organization.client_id) AS client_id,
            COALESCE(assistant.contract_id, active_contract.id) AS contract_id,
            strategy.profile_key,
            brand.vocabulary_dont,
            brand.forbidden_topics
       FROM public.organizations organization
       LEFT JOIN LATERAL (
         SELECT item.*
           FROM public.ai_assistants item
          WHERE item.organization_id = organization.id
            AND item.status = 'active'
            AND (item.assistant_role = 'sdr' OR item.assistant_role IS NULL)
          ORDER BY (item.assistant_role = 'sdr') DESC, item.routing_priority ASC, item.updated_at DESC
          LIMIT 1
       ) assistant ON TRUE
       LEFT JOIN public.yux_strategy_agent_profiles strategy ON strategy.id = assistant.strategy_profile_id
       LEFT JOIN LATERAL (
         SELECT contract.id
           FROM public.contracts contract
          WHERE contract.client_id = organization.client_id
            AND contract.status = 'active'
          ORDER BY contract.starts_at DESC NULLS LAST, contract.created_at DESC
          LIMIT 1
       ) active_contract ON TRUE
       LEFT JOIN LATERAL (
         SELECT profile.vocabulary_dont, profile.forbidden_topics
           FROM public.marketing_brand_profiles profile
          WHERE profile.organization_id = organization.id AND profile.status = 'active'
          ORDER BY (profile.contract_id = COALESCE(assistant.contract_id, active_contract.id)) DESC,
                   profile.updated_at DESC
          LIMIT 1
       ) brand ON TRUE
      WHERE organization.id = $1
      LIMIT 1`,
    [organizationId],
  )
  const row = result.rows[0]
  return {
    assistantId: row?.assistant_id || undefined,
    clientId: row?.client_id || undefined,
    contractId: row?.contract_id || undefined,
    profileKey: row?.profile_key || 'ai_sdr_comercial_1',
    brandRules: {
      vocabularyDont: normalizeRules(row?.vocabulary_dont),
      forbiddenTopics: normalizeRules(row?.forbidden_topics),
    },
  }
}

export function evaluateBrandGuardrails(
  text: string,
  rules: OmnichannelAssistantContext['brandRules'],
) {
  const normalizedText = normalizeText(text)
  const matched = [...rules.vocabularyDont, ...rules.forbiddenTopics]
    .filter((rule, index, all) => all.indexOf(rule) === index)
    .filter(rule => normalizedText.includes(normalizeText(rule)))
  return { blocked: matched.length > 0, matchedRules: matched }
}

function normalizeRules(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : []
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}
