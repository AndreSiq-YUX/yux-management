import type { Queryable } from './repository.js'

type RecordValue = Record<string, unknown>

export type MissionActivityItem = {
  id: string
  kind: 'request' | 'context' | 'planning' | 'decision' | 'artifact' | 'action' | 'mission'
  state: 'info' | 'active' | 'waiting' | 'success' | 'warning' | 'error'
  title: string
  description: string
  occurredAt: string
  decision?: { approvalId: string; status: string; reason?: string }
  artifact?: { kind: string; title: string; status: string; entityId?: string; versionId?: string }
  technicalEvidence?: RecordValue
}

type EventRow = { id: string; event_type: string; payload: RecordValue; occurred_at: string | Date }
type PlanRow = { id: string; revision: number; status: string; created_at: string | Date; updated_at: string | Date }
type ApprovalRow = { id: string; plan_id: string | null; approval_type: string; status: string; decision_reason: string | null; created_at: string | Date; updated_at: string | Date; revision: number | null }
type RunRow = { id: string; status: string; output: RecordValue; last_error: string | null; created_at: string | Date; updated_at: string | Date; completed_at: string | Date | null; step_key: string; capability_key: string }

export async function listMissionActivity(client: Queryable, input: {
  organizationId: string
  missionId: string
  includeTechnicalEvidence?: boolean
}): Promise<MissionActivityItem[]> {
  const mission = await client.query<{ id: string }>(
    `SELECT id FROM public.action_missions WHERE id = $1 AND organization_id = $2`,
    [input.missionId, input.organizationId],
  )
  if (!mission.rows[0]) throw new Error('mission_not_found')

  const [events, plans, approvals, runs] = await Promise.all([
    client.query<EventRow>(
      `SELECT id,event_type,payload,occurred_at FROM public.domain_events
       WHERE organization_id = $1 AND aggregate_type = 'mission' AND aggregate_id = $2
       ORDER BY occurred_at ASC,id ASC`,
      [input.organizationId, input.missionId],
    ),
    client.query<PlanRow>(
      `SELECT id,revision,status,created_at,updated_at FROM public.action_plans
       WHERE organization_id = $1 AND mission_id = $2 ORDER BY created_at ASC,id ASC`,
      [input.organizationId, input.missionId],
    ),
    client.query<ApprovalRow>(
      `SELECT approval.id,approval.plan_id,approval.approval_type,approval.status,approval.decision_reason,
              approval.created_at,approval.updated_at,plan.revision
       FROM public.action_approvals approval
       LEFT JOIN public.action_plans plan ON plan.id = approval.plan_id
       WHERE approval.organization_id = $1 AND approval.mission_id = $2
       ORDER BY approval.created_at ASC,approval.id ASC`,
      [input.organizationId, input.missionId],
    ),
    client.query<RunRow>(
      `SELECT run.id,run.status,run.output,run.last_error,run.created_at,run.updated_at,run.completed_at,
              step.step_key,step.capability_key
       FROM public.action_runs run
       JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.organization_id = $1 AND run.mission_id = $2
       ORDER BY run.created_at ASC,run.id ASC`,
      [input.organizationId, input.missionId],
    ),
  ])

  const items = [
    ...events.rows.flatMap(row => eventActivity(row, input.includeTechnicalEvidence === true)),
    ...plans.rows.flatMap(row => planActivity(row, input.includeTechnicalEvidence === true)),
    ...approvals.rows.flatMap(row => approvalActivity(row, input.includeTechnicalEvidence === true)),
    ...runs.rows.flatMap(row => runActivity(row, input.includeTechnicalEvidence === true)),
  ]
  return items.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
}

function eventActivity(row: EventRow, technical: boolean): MissionActivityItem[] {
  const evidence = technical ? { source: 'domain_event', recordId: row.id, eventType: row.event_type } : undefined
  const base = { id: `event:${row.id}`, occurredAt: iso(row.occurred_at), ...(evidence ? { technicalEvidence: evidence } : {}) }
  if (row.event_type === 'mission.conversation_brief_confirmed') return [{ ...base, kind: 'request', state: 'success', title: 'Pedido confirmado', description: 'O briefing foi confirmado e transformado em uma missão governada.' }]
  if (row.event_type === 'mission.created') return [{ ...base, kind: 'request', state: 'info', title: 'Missão criada', description: 'O pedido entrou no Action Engine.' }]
  if (row.event_type === 'mission.clarification_answered') return [{ ...base, kind: 'context', state: 'success', title: 'Contexto atualizado', description: 'As respostas foram incorporadas ao contexto usado pelo agente.' }]
  if (row.event_type === 'mission.clarification_requested') return [{ ...base, kind: 'context', state: 'waiting', title: 'Informações necessárias', description: 'O agente encontrou pontos que precisam ser confirmados antes do plano.' }]
  if (row.event_type === 'mission.started') return [{ ...base, kind: 'mission', state: 'active', title: 'Execução iniciada', description: 'As ações autorizadas começaram a ser executadas.' }]
  if (row.event_type === 'mission.paused') return [{ ...base, kind: 'mission', state: 'warning', title: 'Missão pausada', description: 'Nenhuma nova ação será iniciada enquanto a missão estiver pausada.' }]
  if (row.event_type !== 'mission.status_changed') return []
  const status = string(row.payload.toStatus ?? row.payload.status)
  if (status === 'planning') return [{ ...base, kind: 'planning', state: 'active', title: 'Plano em preparação', description: 'O agente está combinando estratégia, contexto da empresa e capacidades disponíveis.' }]
  if (status === 'succeeded') return [{ ...base, kind: 'mission', state: 'success', title: 'Missão concluída', description: 'A execução terminou e os resultados já podem ser avaliados.' }]
  if (status === 'paused') return [{ ...base, kind: 'mission', state: 'warning', title: 'Missão pausada', description: 'A execução foi interrompida com segurança.' }]
  if (status === 'blocked' || status === 'failed') return [{ ...base, kind: 'mission', state: 'error', title: status === 'failed' ? 'Missão falhou' : 'Missão bloqueada', description: 'A missão precisa de atenção antes de continuar.' }]
  if (status === 'cancelled' || status === 'expired') return [{ ...base, kind: 'mission', state: 'warning', title: status === 'cancelled' ? 'Missão cancelada' : 'Missão expirada', description: 'Esta missão não iniciará novas ações.' }]
  return []
}

function planActivity(row: PlanRow, technical: boolean): MissionActivityItem[] {
  if (!['proposed', 'validating', 'invalid'].includes(row.status)) return []
  const invalid = row.status === 'invalid'
  return [{
    id: `plan:${row.id}:${row.status}`, kind: 'planning', state: invalid ? 'error' : 'active',
    title: invalid ? `Plano ${row.revision} precisa de correção` : `Plano ${row.revision} preparado`,
    description: invalid ? 'O plano não passou pelas validações de segurança.' : 'Uma versão verificável do plano foi criada.',
    occurredAt: iso(row.updated_at ?? row.created_at),
    ...(technical ? { technicalEvidence: { source: 'action_plan', recordId: row.id, planRevision: row.revision, status: row.status } } : {}),
  }]
}

function approvalActivity(row: ApprovalRow, technical: boolean): MissionActivityItem[] {
  const planSubject = row.revision ? ` sobre o plano ${row.revision}` : ''
  const planLabel = row.revision ? `Plano ${row.revision}` : 'Plano'
  const technicalEvidence = technical ? { source: 'action_approval', recordId: row.id, planId: row.plan_id, approvalType: row.approval_type } : undefined
  const pending: MissionActivityItem = {
    id: `approval:${row.id}:pending`, kind: 'decision', state: 'waiting', title: `Decisão necessária${planSubject}`,
    description: 'Revise os impactos, custos e aprovações antes de continuar.', occurredAt: iso(row.created_at),
    decision: { approvalId: row.id, status: 'pending' }, ...(technicalEvidence ? { technicalEvidence } : {}),
  }
  if (row.status === 'pending') return [pending]
  const copy = row.status === 'approved'
      ? { state: 'success' as const, title: `${planLabel} aprovado`, description: 'A decisão foi registrada e a missão pode avançar dentro das regras definidas.' }
      : row.status === 'changes_requested'
        ? { state: 'warning' as const, title: `Alterações solicitadas${planSubject}`, description: row.decision_reason || 'O agente deverá preparar uma nova versão.' }
        : { state: 'error' as const, title: row.status === 'rejected' ? `${planLabel} recusado` : `Decisão encerrada${planSubject}`, description: row.decision_reason || 'Esta autorização não está mais ativa.' }
  return [pending, {
    id: `approval:${row.id}:${row.status}`, kind: 'decision', ...copy,
    occurredAt: iso(row.updated_at),
    decision: { approvalId: row.id, status: row.status, ...(row.decision_reason ? { reason: row.decision_reason } : {}) },
    ...(technicalEvidence ? { technicalEvidence } : {}),
  }]
}

function runActivity(row: RunRow, technical: boolean): MissionActivityItem[] {
  if (['pending', 'ready', 'skipped', 'cancelled'].includes(row.status)) return []
  const evidence = actionEvidence(row.output)
  const entityId = optionalString(evidence.entityId)
  const versionId = optionalString(evidence.versionId)
  const technicalEvidence = technical ? { source: 'action_run', recordId: row.id, stepKey: row.step_key, capabilityKey: row.capability_key, status: row.status } : undefined
  if (row.status === 'succeeded' && (entityId || versionId)) {
    const artifactKind = artifactKindFromCapability(row.capability_key)
    return [{
      id: `artifact:${row.id}`, kind: 'artifact', state: 'success', title: `${artifactLabel(artifactKind)} ${artifactVerb(evidence)}`,
      description: 'O entregável está disponível na missão.', occurredAt: iso(row.completed_at ?? row.updated_at),
      artifact: { kind: artifactKind, title: artifactLabel(artifactKind), status: optionalString(evidence.status) ?? 'created', ...(entityId ? { entityId } : {}), ...(versionId ? { versionId } : {}) },
      ...(technicalEvidence ? { technicalEvidence } : {}),
    }]
  }
  const copy = row.status === 'waiting_approval'
    ? { state: 'waiting' as const, title: 'Ação aguardando aprovação', description: 'Uma decisão é necessária antes que esta ação produza efeitos.' }
    : row.status === 'retry_scheduled'
      ? { state: 'warning' as const, title: 'Nova tentativa programada', description: 'O sistema fará outra tentativa sem duplicar o efeito anterior.' }
      : row.status === 'failed' || row.status === 'blocked'
        ? { state: 'error' as const, title: row.status === 'failed' ? 'Ação falhou' : 'Ação bloqueada', description: safeRunError(row.last_error) }
        : row.status === 'succeeded'
          ? { state: 'success' as const, title: 'Ação concluída', description: 'A etapa terminou com sucesso.' }
          : { state: 'active' as const, title: 'Ação em andamento', description: 'O Action Engine está executando esta etapa.' }
  return [{ id: `run:${row.id}:${row.status}`, kind: 'action', ...copy, occurredAt: iso(row.completed_at ?? row.updated_at), ...(technicalEvidence ? { technicalEvidence } : {}) }]
}

function actionEvidence(output: RecordValue): RecordValue {
  const nested = record(output.output)
  return Object.keys(nested).length ? nested : record(output)
}
function artifactKindFromCapability(key: string) {
  if (key.startsWith('crm.funnel')) return 'funnel'
  if (key.startsWith('email.')) return 'email'
  if (key.startsWith('automation.')) return 'automation'
  if (key.startsWith('landing_page.')) return 'landing_page'
  if (key.startsWith('lead_form.')) return 'lead_form'
  if (key.startsWith('campaign.') || key.startsWith('provider.')) return 'campaign'
  return 'deliverable'
}
function artifactLabel(kind: string) { return ({ funnel: 'Funil', email: 'E-mail', automation: 'Automação', landing_page: 'Landing page', lead_form: 'Formulário', campaign: 'Campanha', deliverable: 'Entregável' } as Record<string, string>)[kind] ?? 'Entregável' }
function artifactVerb(evidence: RecordValue) { return evidence.activated === true ? 'ativada' : optionalString(evidence.status) === 'published' ? 'publicado' : 'criado' }
function safeRunError(error: string | null) { return error ? 'A etapa encontrou um problema e precisa de atenção.' : 'A etapa não pode continuar no estado atual.' }
function iso(value: string | Date) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString() }
function string(value: unknown) { return typeof value === 'string' ? value : '' }
function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value : undefined }
function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
