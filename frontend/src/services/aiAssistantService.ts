import { supabase } from '@/lib/supabase'
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

const assistantSelect = `
  *,
  ai_assistant_objectives(*),
  ai_assistant_required_fields(*),
  ai_assistant_handoff_rules(*),
  ai_assistant_safety_rules(*),
  ai_assistant_knowledge_links(*, knowledge_entries(id, title, status))
`

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export const aiAssistantService = {
  async getAssistants(filters: { organizationId: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('ai_assistants').select(assistantSelect).eq('organization_id', filters.organizationId).order('updated_at', { ascending: false })
    if (filters.clientId) query = query.eq('client_id', filters.clientId)
    if (filters.contractId) query = query.eq('contract_id', filters.contractId)
    const data = await requireData<any[]>(query)
    return (data || []).map(mapAiAssistant)
  },

  async getActiveAssistant(organizationId: string) {
    const data = await requireData<any>(
      supabase
        .from('ai_assistants')
        .select(assistantSelect)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    return data ? mapAiAssistant(data) : null
  },

  async upsertAssistant(input: AiAssistantInput) {
    const data = await requireData<any>(
      supabase
        .from('ai_assistants')
        .upsert(buildAssistantPayload(input), { onConflict: 'organization_id,client_id,contract_id,name' })
        .select(assistantSelect)
        .single(),
    )
    return mapAiAssistant(data)
  },

  async addObjective(assistantId: string, input: { objectiveType: string; label: string; instructions?: string; priority?: number }) {
    return requireData<any>(supabase.from('ai_assistant_objectives').insert({
      assistant_id: assistantId,
      objective_type: input.objectiveType,
      label: input.label.trim(),
      instructions: input.instructions || null,
      priority: input.priority ?? 100,
    }).select().single())
  },

  async addRequiredField(assistantId: string, input: Pick<AiAssistantRequiredField, 'fieldKey' | 'label' | 'source' | 'isRequired' | 'orderIndex'>) {
    return requireData<any>(supabase.from('ai_assistant_required_fields').insert(buildRequiredFieldPayload(assistantId, input)).select().single())
  },

  async addHandoffRule(assistantId: string, input: { name: string; ruleType: string; conditions: JsonRecord; minConfidence?: number; isEnabled?: boolean }) {
    return requireData<any>(supabase.from('ai_assistant_handoff_rules').insert({
      assistant_id: assistantId,
      name: input.name.trim(),
      rule_type: input.ruleType,
      conditions: input.conditions,
      min_confidence: input.minConfidence ?? null,
      is_enabled: input.isEnabled ?? true,
    }).select().single())
  },

  async addSafetyRule(assistantId: string, input: { name: string; ruleType: string; instructions: string; severity?: string; isEnabled?: boolean }) {
    return requireData<any>(supabase.from('ai_assistant_safety_rules').insert({
      assistant_id: assistantId,
      name: input.name.trim(),
      rule_type: input.ruleType,
      instructions: input.instructions.trim(),
      severity: input.severity || 'medium',
      is_enabled: input.isEnabled ?? true,
    }).select().single())
  },

  async linkKnowledgeEntry(assistantId: string, knowledgeEntryId: string) {
    return requireData<any>(supabase.from('ai_assistant_knowledge_links').insert({
      assistant_id: assistantId,
      knowledge_entry_id: knowledgeEntryId,
    }).select().single())
  },
}
