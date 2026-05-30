import { createClient } from '@supabase/supabase-js'
import { getNextActiveSequenceStep } from '../_shared/crmAutomation.ts'

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

    ;({ executionId } = await req.json())
    if (!executionId) return response({ error: 'executionId is required' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const adminClient = createClient(url, serviceRoleKey)

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
        const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await adminClient.from('automation_executions').update({ status: 'failed', last_error: message }).eq('id', executionId)
      } catch {
        // The original failure remains the relevant response.
      }
    }
    return response({ error: message }, 500)
  }
})

async function enqueueNextStep(adminClient: ReturnType<typeof createClient>, execution: any) {
  if (!execution.enrollment_id || !execution.crm_sequence_steps) return

  const currentStep = execution.crm_sequence_steps
  const { data: steps, error: stepsError } = await adminClient
    .from('crm_sequence_steps')
    .select('*')
    .eq('sequence_id', currentStep.sequence_id)
  if (stepsError) throw stepsError

  const nextStep = getNextActiveSequenceStep(steps || [], currentStep.order_index)
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
