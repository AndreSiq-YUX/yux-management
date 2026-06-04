import { createClient } from '@supabase/supabase-js'
import { getNextActiveSequenceStep } from '../_shared/crmAutomation.ts'
import { dispatchOutboundMessage } from '../dispatch-outbound-message/index.ts'

type SupabaseAny = any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let executionId: string | undefined
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return response({ error: 'Missing authorization header' }, 401)

    const body = await req.json()
    ;({ executionId } = body)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } }) as SupabaseAny
    const adminClient = createClient(url, serviceRoleKey) as SupabaseAny

    if (body.event) {
      if (!body.event.organizationId) return response({ error: 'event.organizationId is required' }, 400)
      const { data: visibleFlow, error: flowAccessError } = await userClient
        .from('automation_flows')
        .select('id')
        .eq('organization_id', body.event.organizationId)
        .limit(1)
      if (flowAccessError) return response({ error: 'Automation access denied' }, 403)
      if (!visibleFlow?.length) return response({ error: 'Automation access denied' }, 403)

      return response({ success: true, flows: await dispatchFlowEvent(adminClient, body.event) })
    }

    if (!executionId) return response({ error: 'executionId is required' }, 400)

    const { data: visibleExecution, error: accessError } = await userClient
      .from('automation_executions')
      .select('*, leads(name,email,phone), crm_sequence_steps(sequence_id,order_index,subject,body)')
      .eq('id', executionId)
      .single()

    if (accessError || !visibleExecution) return response({ error: 'Execution not found' }, 404)
    if (visibleExecution.status === 'completed') return response({ success: true, duplicate: true })

    const { error: processingError } = await adminClient.from('automation_executions').update({
      status: 'processing',
      attempt_count: visibleExecution.attempt_count + 1,
      last_error: null,
    }).eq('id', executionId)
    if (processingError) throw processingError

    if (visibleExecution.action_type === 'internal_task') {
      const { error } = await adminClient.from('crm_tasks').insert({
        organization_id: visibleExecution.organization_id,
        lead_id: visibleExecution.lead_id,
        enrollment_id: visibleExecution.enrollment_id,
        title: visibleExecution.payload?.subject || 'Follow-up comercial',
        description: visibleExecution.payload?.body,
        due_at: new Date().toISOString(),
      })
      if (error) throw error
    } else {
      const webhookUrl = Deno.env.get('N8N_CRM_WEBHOOK_URL')
      if (!webhookUrl) throw new Error('N8N_CRM_WEBHOOK_URL is not configured')
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionId,
          actionType: visibleExecution.action_type,
          lead: visibleExecution.leads,
          payload: visibleExecution.payload,
        }),
      })
      if (!webhookResponse.ok) throw new Error(`n8n webhook returned ${webhookResponse.status}`)
    }

    await adminClient.from('automation_executions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', executionId)
    await enqueueNextStep(adminClient, visibleExecution)
    return response({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automation error'
    if (executionId) {
      try {
        const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as SupabaseAny
        await adminClient.from('automation_executions').update({ status: 'failed', last_error: message }).eq('id', executionId)
      } catch {
        // The original failure remains the relevant response.
      }
    }
    return response({ error: message }, 500)
  }
})

async function enqueueNextStep(adminClient: SupabaseAny, execution: any) {
  if (!execution.enrollment_id || !execution.crm_sequence_steps) return

  const currentStep = execution.crm_sequence_steps
  const { data: steps, error: stepsError } = await adminClient
    .from('crm_sequence_steps')
    .select('*')
    .eq('sequence_id', currentStep.sequence_id)
  if (stepsError) throw stepsError

  const nextStep = getNextActiveSequenceStep((steps || []) as any[], currentStep.order_index) as any
  if (!nextStep) {
    const { error } = await adminClient
      .from('crm_sequence_enrollments')
      .update({ status: 'completed', next_execution_at: null })
      .eq('id', execution.enrollment_id)
    if (error) throw error
    return
  }

  const scheduledAt = new Date(Date.now() + nextStep.delay_minutes * 60_000).toISOString()
  const { error: enrollmentError } = await adminClient
    .from('crm_sequence_enrollments')
    .update({ current_step_index: nextStep.order_index, next_execution_at: scheduledAt })
    .eq('id', execution.enrollment_id)
  if (enrollmentError) throw enrollmentError

  const { error: executionError } = await adminClient.from('automation_executions').insert({
    organization_id: execution.organization_id,
    lead_id: execution.lead_id,
    enrollment_id: execution.enrollment_id,
    step_id: nextStep.id,
    action_type: nextStep.action_type,
    payload: { subject: nextStep.subject, body: nextStep.body },
    scheduled_at: scheduledAt,
  })
  if (executionError) throw executionError
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function graphMatchesEvent(flow: Record<string, any>, event: Record<string, any>): boolean {
  if (flow.builder_mode !== 'node' || !flow.graph || !Array.isArray(flow.graph.nodes)) return false
  const triggerNodes = flow.graph.nodes.filter((n: any) => n.type === 'trigger')
  return triggerNodes.some((node: any) => {
    const triggerType = node.data?.triggerType
    const config = node.data?.config || {}
    if (triggerType !== event.type) return false
    if (config.stageId && config.stageId !== event.stageId) return false
    if (config.status && config.status !== event.status) return false
    return true
  })
}

async function executeGraphNode(
  adminClient: SupabaseAny,
  runId: string,
  flow: Record<string, any>,
  nodeId: string,
  event: Record<string, any>,
  visited: Set<string>,
): Promise<void> {
  if (visited.has(nodeId)) return
  visited.add(nodeId)

  const graph = flow.graph
  if (!graph || !Array.isArray(graph.nodes)) return
  const nodesMap = new Map(graph.nodes.map((n: any) => [n.id, n]))
  const node = nodesMap.get(nodeId)
  if (!node) return

  if (node.type === 'action') {
    const actionType = node.data?.actionType
    const payload = node.data?.payload || {}
    const dummyAction = {
      id: node.id,
      action_type: actionType,
      payload,
      isNodeMode: true,
    }
    await executeActionStep(adminClient, runId, dummyAction, event, flow.organization_id)
  }

  let outgoingEdges = Array.isArray(graph.edges) ? graph.edges.filter((e: any) => e.source === nodeId) : []

  if (node.type === 'condition') {
    const field = node.data?.field
    const operator = node.data?.operator
    const value = node.data?.value

    const passed = evaluateConditions(
      [{ field, operator, value }],
      { ...event, ...(event.payload || {}) },
    )

    const targetHandle = passed ? 'true' : 'false'
    outgoingEdges = outgoingEdges.filter((e: any) => e.sourceHandle === targetHandle)
  }

  const promises = outgoingEdges.map((edge: any) =>
    executeGraphNode(adminClient, runId, flow, edge.target, event, new Set(visited)),
  )
  await Promise.all(promises)
}

async function dispatchFlowEvent(adminClient: SupabaseAny, event: Record<string, any>) {
  const { data: flows, error } = await adminClient
    .from('automation_flows')
    .select('*, automation_triggers(*), automation_conditions(*), automation_actions(*)')
    .eq('organization_id', event.organizationId)
    .eq('status', 'published')
    .eq('is_enabled', true)
  if (error) throw error

  const eligible = (flows || []).filter((flow: Record<string, any>) => {
    if (flow.builder_mode === 'node') {
      return graphMatchesEvent(flow, event)
    } else {
      return flow.automation_triggers?.some((trigger: Record<string, any>) => matchesTrigger(trigger, event))
        && evaluateConditions(flow.automation_conditions || [], { ...event, ...(event.payload || {}) })
    }
  })

  const results = []
  for (const flow of eligible) {
    results.push(await executeFlow(adminClient, flow, event))
  }
  return results
}

async function executeFlow(adminClient: SupabaseAny, flow: Record<string, any>, event: Record<string, any>) {
  const { data: run, error: runError } = await adminClient.from('automation_execution_runs').insert({
    organization_id: flow.organization_id,
    flow_id: flow.id,
    event_type: event.type,
    lead_id: event.leadId || null,
    conversation_id: event.conversationId || null,
    ticket_id: event.ticketId || null,
    status: 'processing',
    event_payload: sanitize(event),
  }).select().single()
  if (runError) throw runError

  try {
    const steps = []
    if (flow.builder_mode === 'node' && flow.graph) {
      const matchingTriggers = flow.graph.nodes.filter((n: any) => {
        if (n.type !== 'trigger') return false
        const triggerType = n.data?.triggerType
        const config = n.data?.config || {}
        if (triggerType !== event.type) return false
        if (config.stageId && config.stageId !== event.stageId) return false
        if (config.status && config.status !== event.status) return false
        return true
      })

      const promises = matchingTriggers.map((trigger: any) =>
        executeGraphNode(adminClient, run.id, flow, trigger.id, event, new Set<string>()),
      )
      await Promise.all(promises)
    } else {
      const actions = [...(flow.automation_actions || [])].sort((left, right) => left.order_index - right.order_index)
      for (const action of actions) {
        steps.push(await executeActionStep(adminClient, run.id, action, event, flow.organization_id))
      }
    }
    await adminClient.from('automation_execution_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    await adminClient.from('automation_flows').update({ last_error: null }).eq('id', flow.id)
    return { flowId: flow.id, runId: run.id, status: 'completed', steps }
  } catch (error) {
    const message = protectedError(error)
    await adminClient.from('automation_execution_runs').update({
      status: 'failed',
      last_error: message,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    await adminClient.from('automation_flows').update({
      status: 'failed',
      last_error: message,
    }).eq('id', flow.id)
    return { flowId: flow.id, runId: run.id, status: 'failed', error: message }
  }
}

async function executeActionStep(
  adminClient: SupabaseAny,
  runId: string,
  action: Record<string, any>,
  event: Record<string, any>,
  organizationId: string,
) {
  const payload = action.payload || {}
  const isNodeMode = action.isNodeMode || false
  const { data: step, error: stepError } = await adminClient.from('automation_execution_steps').insert({
    run_id: runId,
    action_id: isNodeMode ? null : action.id,
    action_type: action.action_type,
    status: 'processing',
    sanitized_payload: sanitize(payload),
  }).select().single()
  if (stepError) throw stepError

  try {
    const result = await executeAction(adminClient, action.action_type, payload, event, organizationId, runId, action.id)
    await adminClient.from('automation_execution_steps').update({
      status: 'completed',
      sanitized_result: sanitize(result),
      completed_at: new Date().toISOString(),
    }).eq('id', step.id)
    return { stepId: step.id, actionType: action.action_type, status: 'completed' }
  } catch (error) {
    const message = protectedError(error)
    await adminClient.from('automation_execution_steps').update({
      status: 'failed',
      protected_error: message,
      completed_at: new Date().toISOString(),
    }).eq('id', step.id)
    throw error
  }
}

async function executeAction(
  adminClient: SupabaseAny,
  actionType: string,
  payload: Record<string, any>,
  event: Record<string, any>,
  organizationId: string,
  runId?: string,
  actionId?: string,
) {
  if (actionType === 'create_task') {
    const leadId = required(event.leadId, 'leadId')
    const { data, error } = await adminClient.from('crm_tasks').insert({
      organization_id: organizationId,
      lead_id: leadId,
      title: payload.title || 'Follow-up comercial',
      description: payload.description || null,
      due_at: payload.dueAt || new Date().toISOString(),
      assigned_to: payload.assignedTo || null,
    }).select('id').single()
    if (error) throw error
    return { taskId: data.id }
  }

  if (actionType === 'change_stage') {
    const { data, error } = await adminClient.from('leads').update({
      stage_id: required(payload.stageId, 'stageId'),
    }).eq('id', required(event.leadId, 'leadId')).select('id').single()
    if (error) throw error
    return { leadId: data.id }
  }

  if (actionType === 'assign_owner') {
    const ownerId = required(payload.ownerId || payload.assignedTo, 'ownerId')
    const { data, error } = await adminClient.from('leads').update({
      owner_id: ownerId,
      assigned_to: ownerId,
    }).eq('id', required(event.leadId, 'leadId')).select('id').single()
    if (error) throw error
    return { leadId: data.id, ownerId }
  }

  if (actionType === 'send_whatsapp') {
    const contentType = payload.attachments && payload.attachments.length > 0 ? 'file' : 'text'
    const { data: message, error } = await adminClient.from('messages').insert({
      conversation_id: required(event.conversationId || payload.conversationId, 'conversationId'),
      direction: 'outbound',
      author_type: 'system',
      content_type: contentType,
      body: payload.body || payload.messageBody || '',
      delivery_status: 'queued',
      metadata: { source: 'automation_flow', runEvent: event.type },
    }).select('id').single()
    if (error) throw error

    if (payload.attachments && Array.isArray(payload.attachments)) {
      for (const attachment of payload.attachments) {
        await adminClient.from('message_attachments').insert({
          message_id: message.id,
          storage_path: attachment.fileUrl || attachment.storagePath || '',
          filename: attachment.name || attachment.filename || 'Arquivo',
          mime_type: attachment.fileType || attachment.mimeType || 'application/pdf',
          byte_size: attachment.byteSize || attachment.size || 0,
        })
      }
    }

    return dispatchOutboundMessage(adminClient as never, message.id)
  }

  if (actionType === 'send_email') {
    const recipientEmail = required(event.payload?.email || event.email || payload.recipientEmail, 'recipientEmail')
    const { data, error } = await adminClient.from('email_send_requests').insert({
      organization_id: organizationId,
      email_kind: payload.emailKind || 'operational',
      module_key: 'automations',
      recipient_email: recipientEmail,
      recipient_opt_in: true,
      subject: required(payload.subject, 'subject'),
      body_html: payload.body || null,
      idempotency_key: `automations_run_${runId}_action_${actionId || crypto.randomUUID()}`,
      metadata: {
        source: 'automation_flow',
        runId,
        attachments: payload.attachments || [],
      },
    }).select('id').single()
    if (error) throw error
    return { sendRequestId: data.id }
  }


  if (actionType === 'create_ticket') {
    const { data, error } = await adminClient.from('support_tickets').insert({
      organization_id: organizationId,
      client_id: required(payload.clientId, 'clientId'),
      contract_id: required(payload.contractId, 'contractId'),
      subject: payload.subject || 'Ticket criado por automacao',
      category: payload.category || 'request',
      priority: payload.priority || 'medium',
      internal_notes: payload.internalNotes || null,
    }).select('id').single()
    if (error) throw error
    return { ticketId: data.id }
  }

  if (actionType === 'update_field') {
    const field = required(payload.field, 'field')
    const allowed = new Set(['status', 'source_kind', 'score', 'notes', 'stage_id', 'owner_id', 'assigned_to'])
    if (!allowed.has(field)) throw new Error(`Unsupported lead field: ${field}`)
    const { data, error } = await adminClient.from('leads').update({
      [field]: payload.value,
    }).eq('id', required(event.leadId, 'leadId')).select('id').single()
    if (error) throw error
    return { leadId: data.id, field }
  }

  if (actionType === 'register_activity') {
    const { data, error } = await adminClient.from('interactions').insert({
      organization_id: organizationId,
      lead_id: required(event.leadId, 'leadId'),
      type: payload.type || 'note',
      title: payload.title || 'Atividade automatica',
      description: payload.description || `Evento ${event.type}`,
      date: new Date().toISOString(),
    }).select('id').single()
    if (error) throw error
    return { interactionId: data.id }
  }

  throw new Error(`Unsupported automation action: ${actionType}`)
}

function matchesTrigger(trigger: Record<string, any>, event: Record<string, any>) {
  if (trigger.trigger_type !== event.type) return false
  if (trigger.config?.stageId && trigger.config.stageId !== event.stageId) return false
  if (trigger.config?.status && trigger.config.status !== event.status) return false
  return true
}

function evaluateConditions(conditions: Array<Record<string, any>>, context: Record<string, any>) {
  return conditions.every(condition => {
    const current = valueAt(context, condition.field)
    const expected = condition.value
    if (condition.operator === 'exists') return current !== undefined && current !== null && current !== ''
    if (condition.operator === 'equals') return normalized(current) === normalized(expected)
    if (condition.operator === 'not_equals') return normalized(current) !== normalized(expected)
    if (condition.operator === 'contains') return normalized(current).includes(normalized(expected))
    if (condition.operator === 'greater_than') return Number(current) > Number(expected)
    if (condition.operator === 'less_than') return Number(current) < Number(expected)
    return false
  })
}

function valueAt(source: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, source)
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function required(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') ? '[redacted]' : sanitize(entry),
  ]))
}

function protectedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || 'Unknown automation error'))
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|secret|password|credential)\s+[^,\s]+/gi, '$1 [redacted]')
}
