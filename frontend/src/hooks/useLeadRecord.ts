import { useCallback, useEffect, useRef, useState } from 'react'
import { crmService } from '@/services/crmService'
import { crmConversationService } from '@/services/crmConversationService'
import type {
  CrmInteraction,
  CrmTask,
  CrmSequence,
  CrmSequenceEnrollment,
  AutomationExecution,
} from '@/types/crm'
import type { LeadConversationView } from '@/components/crm/LeadConversationPanel'
import type {
  LeadAiInsight,
  LeadAiFieldSuggestion,
  LeadResponseSuggestion,
  LeadSlaEvent,
  CrmQuickReply,
  CrmMessageTemplate,
} from '@/types/crmAi'
const blank = {
  interactions: [] as CrmInteraction[],
  tasks: [] as CrmTask[],
  sequences: [] as CrmSequence[],
  enrollments: [] as CrmSequenceEnrollment[],
  executions: [] as AutomationExecution[],
  conversations: [] as LeadConversationView[],
  insights: [] as LeadAiInsight[],
  fieldSuggestions: [] as LeadAiFieldSuggestion[],
  responseSuggestions: [] as LeadResponseSuggestion[],
  slaEvents: [] as LeadSlaEvent[],
  quickReplies: [] as CrmQuickReply[],
  templates: [] as CrmMessageTemplate[],
}
const settled = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === 'fulfilled' ? (result.value ?? fallback) : fallback
export function useLeadRecord(leadId: string, organizationId: string) {
  const [data, setData] = useState(blank),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const token = ++generation.current
    setError('')
    const values = await Promise.allSettled([
      crmService.getInteractions(leadId),
      crmService.getTasks(leadId),
      crmService.getSequences(organizationId),
      crmService.getEnrollments(leadId),
      crmService.getExecutions(leadId),
      crmConversationService.getLeadWorkspace(leadId),
    ])
    if (token !== generation.current) return
    const ai = settled(values[5], {
      conversations: [],
      insights: [],
      fieldSuggestions: [],
      responseSuggestions: [],
      slaEvents: [],
      quickReplies: [],
      templates: [],
    })
    setData({
      interactions: settled(values[0], []),
      tasks: settled(values[1], []),
      sequences: settled(values[2], []),
      enrollments: settled(values[3], []),
      executions: settled(values[4], []),
      conversations: ai.conversations ?? [],
      insights: ai.insights ?? [],
      fieldSuggestions: ai.fieldSuggestions ?? [],
      responseSuggestions: ai.responseSuggestions ?? [],
      slaEvents: ai.slaEvents ?? [],
      quickReplies: ai.quickReplies ?? [],
      templates: ai.templates ?? [],
    })
    if (values.some((item) => item.status === 'rejected'))
      setError(
        'Algumas informações não puderam ser carregadas. Tente atualizar a ficha.',
      )
    setLoading(false)
  }, [leadId, organizationId])
  const invalidate = useCallback(() => {
    generation.current++
  }, [])
  useEffect(() => {
    setData(blank)
    setLoading(true)
    void refresh()
    return invalidate
  }, [refresh, invalidate])
  return { ...data, loading, error, refresh }
}
