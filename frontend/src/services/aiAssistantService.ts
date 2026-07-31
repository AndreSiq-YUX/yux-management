import { aiAssistantDataClient } from '@/lib/aiAssistantDataClient'
import type {
  AiAssistantInput,
  AiAssistantRequiredField,
  AiAssistantSettings,
} from '@/types/aiAssistant'

type JsonRecord = Record<string, unknown>

const optional = <T>(value: T | null | undefined) => value === null || value === undefined || value === '' ? undefined : value

export const buildAssistantPayload = (input: AiAssistantInput) => ({
  organization_id: input.organizationId,
  client_id: input.clientId || null,
  contract_id: input.contractId || null,
  name: input.name.trim(),
  tone: input.tone.trim(),
  status: input.status || 'active',
  assistant_role: input.assistantRole || 'sdr',
  strategy_profile_id: input.strategyProfileId || null,
  routing_priority: input.routingPriority ?? 100,
  routing_metadata: input.routingMetadata || {},
  summary_enabled: input.summaryEnabled ?? true,
  classification_enabled: input.classificationEnabled ?? true,
})

export const buildRequiredFieldPayload = (
  assistantId: string,
  input: Pick<AiAssistantRequiredField, 'fieldKey' | 'label' | 'source' | 'isRequired' | 'orderIndex'>,
) => ({
  assistant_id: assistantId,
  field_key: input.fieldKey.trim(),
  label: input.label.trim(),
  source: input.source || 'contact',
  is_required: input.isRequired ?? true,
  order_index: input.orderIndex ?? 0,
})

export function mapAiAssistant(row: any): AiAssistantSettings {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: optional(row.client_id),
    contractId: optional(row.contract_id),
    name: row.name,
    tone: row.tone,
    status: row.status,
    assistantRole: row.assistant_role || 'sdr',
    strategyProfileId: optional(row.strategy_profile_id),
    routingPriority: Number(row.routing_priority || 100),
    routingMetadata: row.routing_metadata || {},
    summaryEnabled: Boolean(row.summary_enabled),
    classificationEnabled: Boolean(row.classification_enabled),
    objectives: (row.ai_assistant_objectives || []).map((objective: any) => ({
      id: objective.id,
      objectiveType: objective.objective_type,
      label: objective.label,
      instructions: optional(objective.instructions),
      priority: objective.priority,
    })),
    requiredFields: (row.ai_assistant_required_fields || []).map((field: any) => ({
      id: field.id,
      fieldKey: field.field_key,
      label: field.label,
      source: optional(field.source),
      isRequired: field.is_required,
      orderIndex: field.order_index,
    })),
    handoffRules: (row.ai_assistant_handoff_rules || []).map((rule: any) => ({
      id: rule.id,
      name: rule.name,
      ruleType: rule.rule_type,
      conditions: rule.conditions || {},
      minConfidence: optional(rule.min_confidence),
      isEnabled: Boolean(rule.is_enabled),
    })),
    safetyRules: (row.ai_assistant_safety_rules || []).map((rule: any) => ({
      id: rule.id,
      name: rule.name,
      ruleType: rule.rule_type,
      instructions: rule.instructions,
      severity: rule.severity,
      isEnabled: Boolean(rule.is_enabled),
    })),
    knowledgeLinks: (row.ai_assistant_knowledge_links || []).map((link: any) => ({
      id: link.id,
      knowledgeEntryId: optional(link.knowledge_entry_id),
      title: link.knowledge_entries?.title || 'Conhecimento',
      status: link.knowledge_entries?.status || 'linked',
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const assistantSelect = '*'

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

async function attachAssistantRelations(rows: any[]) {
  const assistantIds = [...new Set(rows.map(row => row.id).filter(Boolean))]
  if (assistantIds.length === 0) return rows

  const [objectives, requiredFields, handoffRules, safetyRules, knowledgeLinks] = await Promise.all([
    requireData<any[]>(aiAssistantDataClient.from('ai_assistant_objectives').select('*').in('assistant_id', assistantIds).order('priority')),
    requireData<any[]>(aiAssistantDataClient.from('ai_assistant_required_fields').select('*').in('assistant_id', assistantIds).order('order_index')),
    requireData<any[]>(aiAssistantDataClient.from('ai_assistant_handoff_rules').select('*').in('assistant_id', assistantIds)),
    requireData<any[]>(aiAssistantDataClient.from('ai_assistant_safety_rules').select('*').in('assistant_id', assistantIds)),
    requireData<any[]>(aiAssistantDataClient.from('ai_assistant_knowledge_links').select('*').in('assistant_id', assistantIds)),
  ])

  const knowledgeIds = [...new Set((knowledgeLinks || []).map(link => link.knowledge_entry_id).filter(Boolean))]
  const knowledgeEntries = knowledgeIds.length
    ? await requireData<any[]>(aiAssistantDataClient.from('knowledge_entries').select('id, title, status').in('id', knowledgeIds))
    : []
  const knowledgeById = new Map((knowledgeEntries || []).map(entry => [entry.id, entry]))

  const groupByAssistant = (items: any[]) => {
    const grouped = new Map<string, any[]>()
    for (const item of items || []) {
      const assistantItems = grouped.get(item.assistant_id) || []
      assistantItems.push(item)
      grouped.set(item.assistant_id, assistantItems)
    }
    return grouped
  }

  const objectivesByAssistant = groupByAssistant(objectives)
  const fieldsByAssistant = groupByAssistant(requiredFields)
  const handoffByAssistant = groupByAssistant(handoffRules)
  const safetyByAssistant = groupByAssistant(safetyRules)
  const linksByAssistant = groupByAssistant(knowledgeLinks)

  return rows.map(row => ({
    ...row,
    ai_assistant_objectives: objectivesByAssistant.get(row.id) || [],
    ai_assistant_required_fields: fieldsByAssistant.get(row.id) || [],
    ai_assistant_handoff_rules: handoffByAssistant.get(row.id) || [],
    ai_assistant_safety_rules: safetyByAssistant.get(row.id) || [],
    ai_assistant_knowledge_links: (linksByAssistant.get(row.id) || []).map(link => ({
      ...link,
      knowledge_entries: knowledgeById.get(link.knowledge_entry_id),
    })),
  }))
}

export const aiAssistantService = {
  async getAssistants(filters: { organizationId: string; clientId?: string; contractId?: string }) {
    let query = aiAssistantDataClient.from('ai_assistants').select(assistantSelect).eq('organization_id', filters.organizationId).order('updated_at', { ascending: false })
    if (filters.clientId) query = query.eq('client_id', filters.clientId)
    if (filters.contractId) query = query.eq('contract_id', filters.contractId)
    const data = await requireData<any[]>(query)
    return (await attachAssistantRelations(data || [])).map(mapAiAssistant)
  },

  async getActiveAssistant(organizationId: string) {
    const data = await requireData<any>(
      aiAssistantDataClient
        .from('ai_assistants')
        .select(assistantSelect)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    const [assistant] = data ? await attachAssistantRelations([data]) : []
    return assistant ? mapAiAssistant(assistant) : null
  },

  async upsertAssistant(input: AiAssistantInput) {
    const data = await requireData<any>(
      aiAssistantDataClient
        .from('ai_assistants')
        .upsert(buildAssistantPayload(input), { onConflict: 'organization_id,client_id,contract_id,name' })
        .select(assistantSelect)
        .single(),
    )
    const [assistant] = await attachAssistantRelations(data ? [data] : [])
    return mapAiAssistant(assistant)
  },

  async addObjective(assistantId: string, input: { objectiveType: string; label: string; instructions?: string; priority?: number }) {
    return requireData<any>(aiAssistantDataClient.from('ai_assistant_objectives').insert({
      assistant_id: assistantId,
      objective_type: input.objectiveType,
      label: input.label.trim(),
      instructions: input.instructions || null,
      priority: input.priority ?? 100,
    }).select().single())
  },

  async addRequiredField(assistantId: string, input: Pick<AiAssistantRequiredField, 'fieldKey' | 'label' | 'source' | 'isRequired' | 'orderIndex'>) {
    return requireData<any>(aiAssistantDataClient.from('ai_assistant_required_fields').insert(buildRequiredFieldPayload(assistantId, input)).select().single())
  },

  async addHandoffRule(assistantId: string, input: { name: string; ruleType: string; conditions: JsonRecord; minConfidence?: number; isEnabled?: boolean }) {
    return requireData<any>(aiAssistantDataClient.from('ai_assistant_handoff_rules').insert({
      assistant_id: assistantId,
      name: input.name.trim(),
      rule_type: input.ruleType,
      conditions: input.conditions,
      min_confidence: input.minConfidence ?? null,
      is_enabled: input.isEnabled ?? true,
    }).select().single())
  },

  async addSafetyRule(assistantId: string, input: { name: string; ruleType: string; instructions: string; severity?: string; isEnabled?: boolean }) {
    return requireData<any>(aiAssistantDataClient.from('ai_assistant_safety_rules').insert({
      assistant_id: assistantId,
      name: input.name.trim(),
      rule_type: input.ruleType,
      instructions: input.instructions.trim(),
      severity: input.severity || 'medium',
      is_enabled: input.isEnabled ?? true,
    }).select().single())
  },

  async linkKnowledgeEntry(assistantId: string, knowledgeEntryId: string) {
    return requireData<any>(aiAssistantDataClient.from('ai_assistant_knowledge_links').insert({
      assistant_id: assistantId,
      knowledge_entry_id: knowledgeEntryId,
    }).select().single())
  },
}
