import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'

type ProposalItemInput = {
  itemKey: string
  label: string
  description?: string
  quantity: number
  unitValue: number
  orderIndex: number
}

export type ProposalDraftInput = {
  organizationId: string
  leadId: string
  packageId: string
  crmInstanceId?: string
  recommendedPackageId?: string
  blueprintId?: string
  title: string
  billingCycle?: string
  selectedModuleKeys?: string[]
}

export type ProposalPatch = Partial<{
  title: string
  scope: string
  whatsappMessage: string
  emailSubject: string
  emailBody: string
  packageId: string
  blueprintId: string | null
  billingCycle: string
  selectedModuleKeys: string[]
  finalValue: number
  overrideReason: string | null
}>

type ProposalRow = {
  id: string
  organization_id: string
  lead_id: string
  crm_instance_id: string | null
  client_id: string | null
  package_id: string
  recommended_package_id: string | null
  blueprint_id: string | null
  assigned_to: string | null
  status: string
  title: string
  scope: string
  whatsapp_message: string | null
  email_subject: string | null
  email_body: string | null
  billing_cycle: string
  selected_module_keys: string[] | null
  final_value: string | number | null
  override_reason: string | null
  current_version_id: string | null
  converted_client_id: string | null
  contract_id: string | null
  project_id: string | null
  proposal_items?: ProposalItemRow[]
}

type ProposalItemRow = {
  id: string
  proposal_id: string
  item_key: string
  label: string
  description: string | null
  quantity: string | number
  unit_value: string | number
  total_value: string | number
  order_index: number
}

type ProposalVersionRow = {
  id: string
  proposal_id: string
  version_number: number
  snapshot: Record<string, unknown>
  status: string
  sent_at: string
  decided_at: string | null
}

type ProposalDecisionRow = {
  id: string
  proposal_version_id: string
  decision: string
  source: string
  comment: string | null
  decided_by: string | null
  created_at: string
}

type DiagnosticRow = {
  id: string
  organization_id: string
  lead_id: string
  summary: string
  pain_points: string[]
  goals: string[]
  budget_range: string | null
  timeline: string | null
  decision_process: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type PriceRuleRow = {
  id: string
  organization_id: string
  package_id: string
  item_key: string
  label: string
  minimum_value: string | number
  recommended_value: string | number
  maximum_value: string | number
}

type TemplateRow = {
  scope: string | null
  default_items: ProposalItemInput[] | null
  whatsapp_message: string | null
  email_subject: string | null
  email_body: string | null
}

type GenerationRunRow = {
  id: string
  proposal_id: string
  status: string
  input_summary: Record<string, unknown> | null
  result_metadata: Record<string, unknown> | null
  error: string | null
  created_at: string
  completed_at: string | null
}

type ConversionRunRow = {
  id: string
  proposal_id: string
  attempt_number: number
  status: string
  client_id: string | null
  contract_id: string | null
  project_id: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export async function listProposals(
  pool: pg.Pool,
  user: AuthUser,
  filters: { organizationId?: string; status?: string; leadId?: string; packageId?: string; assignedTo?: string },
) {
  const result = await pool.query<ProposalRow>(
    `SELECT *
     FROM public.proposals p
     WHERE ($2::uuid IS NULL OR p.organization_id = $2)
       AND ($3::text IS NULL OR p.status = $3)
       AND ($4::uuid IS NULL OR p.lead_id = $4)
       AND ($5::uuid IS NULL OR p.package_id = $5)
       AND ($6::uuid IS NULL OR p.assigned_to = $6)
       AND (
         $7::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = p.organization_id
         )
       )
     ORDER BY p.updated_at DESC`,
    [
      user.id,
      filters.organizationId ?? null,
      filters.status ?? null,
      filters.leadId ?? null,
      filters.packageId ?? null,
      filters.assignedTo ?? null,
      isInternal(user),
    ],
  )

  return hydrateProposals(pool, result.rows)
}

export async function getProposalById(pool: pg.Pool, user: AuthUser, proposalId: string) {
  return mapProposal(await getProposalForAccess(pool, user, proposalId, true))
}

export async function listProposalVersions(pool: pg.Pool, user: AuthUser, proposalId: string) {
  await getProposalForAccess(pool, user, proposalId)
  const result = await pool.query<ProposalVersionRow>(
    `SELECT id, proposal_id, version_number, snapshot, status, sent_at, decided_at
     FROM public.proposal_versions
     WHERE proposal_id = $1
     ORDER BY version_number DESC`,
    [proposalId],
  )
  return result.rows.map(mapVersion)
}

export async function listDecisions(pool: pg.Pool, user: AuthUser, versionIds: string[]) {
  if (versionIds.length === 0) return []
  const result = await pool.query<ProposalDecisionRow>(
    `SELECT d.id, d.proposal_version_id, d.decision, d.source, d.comment, d.decided_by, d.created_at
     FROM public.proposal_decisions d
     JOIN public.proposal_versions v ON v.id = d.proposal_version_id
     JOIN public.proposals p ON p.id = v.proposal_id
     WHERE d.proposal_version_id = ANY($2::uuid[])
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = p.organization_id
         )
       )
     ORDER BY d.created_at DESC`,
    [user.id, versionIds, isInternal(user)],
  )
  return result.rows.map(mapDecision)
}

export async function getDiagnostic(pool: pg.Pool, user: AuthUser, leadId: string) {
  await requireLeadAccess(pool, user, leadId)
  const result = await pool.query<DiagnosticRow>(
    `SELECT *
     FROM public.commercial_diagnostics
     WHERE lead_id = $1
     LIMIT 1`,
    [leadId],
  )
  return result.rows[0] ? mapDiagnostic(result.rows[0]) : null
}

export async function saveDiagnostic(pool: pg.Pool, user: AuthUser, input: {
  organizationId: string
  leadId: string
  summary: string
  painPoints?: string[]
  goals?: string[]
  budgetRange?: string
  timeline?: string
  decisionProcess?: string
  notes?: string
  createdBy?: string
}) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  await requireLeadAccess(pool, user, input.leadId)
  const result = await pool.query<DiagnosticRow>(
    `INSERT INTO public.commercial_diagnostics (
       organization_id, lead_id, summary, pain_points, goals, budget_range, timeline, decision_process, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (lead_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       pain_points = EXCLUDED.pain_points,
       goals = EXCLUDED.goals,
       budget_range = EXCLUDED.budget_range,
       timeline = EXCLUDED.timeline,
       decision_process = EXCLUDED.decision_process,
       notes = EXCLUDED.notes,
       created_by = EXCLUDED.created_by,
       updated_at = NOW()
     RETURNING *`,
    [
      input.organizationId,
      input.leadId,
      input.summary,
      input.painPoints ?? [],
      input.goals ?? [],
      input.budgetRange ?? null,
      input.timeline ?? null,
      input.decisionProcess ?? null,
      input.notes ?? null,
      input.createdBy ?? user.id,
    ],
  )
  return mapDiagnostic(result.rows[0])
}

export async function listPriceRules(pool: pg.Pool, user: AuthUser, organizationId: string, packageId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query<PriceRuleRow>(
    `SELECT id, organization_id, package_id, item_key, label, minimum_value, recommended_value, maximum_value
     FROM public.proposal_price_rules
     WHERE organization_id = $1 AND package_id = $2
     ORDER BY item_key ASC`,
    [organizationId, packageId],
  )
  return result.rows.map(mapPriceRule)
}

export async function createDraft(pool: pg.Pool, user: AuthUser, input: ProposalDraftInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  await requireLeadAccess(pool, user, input.leadId)
  const result = await pool.query<ProposalRow>(
    `INSERT INTO public.proposals (
       organization_id, lead_id, crm_instance_id, package_id, recommended_package_id, blueprint_id, title, billing_cycle, selected_module_keys
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.organizationId,
      input.leadId,
      input.crmInstanceId ?? null,
      input.packageId,
      input.recommendedPackageId ?? null,
      input.blueprintId ?? null,
      input.title,
      input.billingCycle ?? 'monthly',
      input.selectedModuleKeys ?? [],
    ],
  )
  return mapProposal({ ...result.rows[0], proposal_items: [] })
}

export async function updateDraft(pool: pg.Pool, user: AuthUser, proposalId: string, patch: ProposalPatch) {
  const existing = await getProposalForAccess(pool, user, proposalId)
  const update = buildProposalUpdate(patch)
  if (update.values.length === 0) return mapProposal({ ...existing, proposal_items: await listItems(pool, proposalId) })

  const assignments = update.columns.map((column, index) => `${column} = $${index + 2}`)
  const result = await pool.query<ProposalRow>(
    `UPDATE public.proposals
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [proposalId, ...update.values],
  )
  return mapProposal({ ...result.rows[0], proposal_items: await listItems(pool, proposalId) })
}

export async function replaceItems(pool: pg.Pool, user: AuthUser, proposalId: string, items: ProposalItemInput[]) {
  await getProposalForAccess(pool, user, proposalId)
  await pool.query('DELETE FROM public.proposal_items WHERE proposal_id = $1', [proposalId])
  if (items.length === 0) return []

  const values: unknown[] = []
  const rows = items.map((item, index) => {
    values.push(
      proposalId,
      item.itemKey,
      item.label,
      item.description ?? null,
      item.quantity,
      item.unitValue,
      item.orderIndex ?? index,
    )
    const offset = index * 7
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
  })
  const result = await pool.query<ProposalItemRow>(
    `INSERT INTO public.proposal_items (proposal_id, item_key, label, description, quantity, unit_value, order_index)
     VALUES ${rows.join(', ')}
     RETURNING id, proposal_id, item_key, label, description, quantity, unit_value, total_value, order_index`,
    values,
  )
  return result.rows.map(mapItem)
}

export async function submitPortalDecision(pool: pg.Pool, user: AuthUser, input: {
  proposalVersionId: string
  decision: string
  comment?: string
  decidedBy?: string
}) {
  await getVersionForAccess(pool, user, input.proposalVersionId)
  const result = await pool.query<ProposalDecisionRow>(
    `INSERT INTO public.proposal_decisions (proposal_version_id, decision, source, comment, decided_by)
     VALUES ($1, $2, 'portal', $3, $4)
     RETURNING id, proposal_version_id, decision, source, comment, decided_by, created_at`,
    [input.proposalVersionId, input.decision, input.comment?.trim() || null, input.decidedBy ?? user.id],
  )
  return mapDecision(result.rows[0])
}

export async function listGenerationRuns(pool: pg.Pool, user: AuthUser, proposalId: string) {
  await getProposalForAccess(pool, user, proposalId)
  const result = await pool.query<GenerationRunRow>(
    `SELECT id, proposal_id, status, input_summary, result_metadata, error, created_at, completed_at
     FROM public.ai_generation_runs
     WHERE proposal_id = $1
     ORDER BY created_at DESC`,
    [proposalId],
  )
  return result.rows.map(mapGenerationRun)
}

export async function listConversionRuns(pool: pg.Pool, user: AuthUser, proposalId: string) {
  await getProposalForAccess(pool, user, proposalId)
  const result = await pool.query<ConversionRunRow>(
    `SELECT id, proposal_id, attempt_number, status, client_id, contract_id, project_id, error, created_at, completed_at
     FROM public.proposal_conversion_runs
     WHERE proposal_id = $1
     ORDER BY created_at DESC`,
    [proposalId],
  )
  return result.rows.map(mapConversionRun)
}

export async function generateDraft(pool: pg.Pool, user: AuthUser, proposalId: string) {
  const proposal = await getProposalForAccess(pool, user, proposalId)
  const [diagnostic, template, rules] = await Promise.all([
    getDiagnosticRow(pool, proposal.lead_id),
    getTemplate(pool, proposal.organization_id, proposal.package_id),
    getPriceRuleRows(pool, proposal.organization_id, proposal.package_id),
  ])

  const draft = buildFallbackDraft(template, diagnostic)
  const items = normalizeSuggestedItems(draft.items, rules)
  await replaceItems(pool, user, proposalId, items)
  const finalValue = items.reduce((total, item) => total + item.quantity * item.unitValue, 0)
  await pool.query(
    `UPDATE public.proposals
     SET scope = $2, whatsapp_message = $3, email_subject = $4, email_body = $5, final_value = $6, updated_at = NOW()
     WHERE id = $1`,
    [proposalId, draft.scope, draft.whatsappMessage, draft.emailSubject, draft.emailBody, finalValue],
  )
  await pool.query(
    `INSERT INTO public.ai_generation_runs (proposal_id, status, input_summary, result_metadata, created_by, completed_at)
     VALUES ($1, 'fallback', $2, $3, $4, NOW())`,
    [proposalId, { leadId: proposal.lead_id, packageId: proposal.package_id }, { source: 'template' }, user.id],
  )

  return { success: true, status: 'fallback', draft: { ...draft, items, finalValue } }
}

export async function sendProposal(pool: pg.Pool, user: AuthUser, proposalId: string, publicBaseUrl: string) {
  const proposal = await getProposalForAccess(pool, user, proposalId, true)
  const rules = await getPriceRuleRows(pool, proposal.organization_id, proposal.package_id)
  const outsideRange = (proposal.proposal_items ?? []).some((item) => {
    const rule = rules.find((candidate) => candidate.item_key === item.item_key)
    const unitValue = Number(item.unit_value)
    return rule && (unitValue < Number(rule.minimum_value) || unitValue > Number(rule.maximum_value))
  })
  if (outsideRange && !proposal.override_reason?.trim()) {
    throw Object.assign(new Error('override_reason_required'), { statusCode: 400 })
  }

  const prior = await pool.query<{ version_number: number }>(
    `SELECT version_number
     FROM public.proposal_versions
     WHERE proposal_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [proposalId],
  )
  const snapshot = { ...proposal, proposal_items: undefined, items: proposal.proposal_items ?? [] }
  const version = await pool.query<ProposalVersionRow>(
    `INSERT INTO public.proposal_versions (proposal_id, version_number, snapshot)
     VALUES ($1, $2, $3)
     RETURNING id, proposal_id, version_number, snapshot, status, sent_at, decided_at`,
    [proposalId, (prior.rows[0]?.version_number ?? 0) + 1, snapshot],
  )

  await pool.query(
    `UPDATE public.proposal_access_tokens
     SET revoked_at = NOW()
     WHERE revoked_at IS NULL
       AND proposal_version_id IN (SELECT id FROM public.proposal_versions WHERE proposal_id = $1)`,
    [proposalId],
  )

  const token = createPublicToken()
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  await pool.query(
    `INSERT INTO public.proposal_access_tokens (proposal_version_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [version.rows[0].id, hashToken(token), expiresAt],
  )

  return {
    success: true,
    versionId: version.rows[0].id,
    versionNumber: version.rows[0].version_number,
    expiresAt,
    publicUrl: `${publicBaseUrl.replace(/\/$/, '')}/proposal/review/${token}`,
  }
}

export async function getPublicReview(pool: pg.Pool, token: string) {
  const access = await getActiveAccessToken(pool, token)
  return {
    versionId: access.id,
    versionNumber: access.version_number,
    snapshot: access.snapshot,
    status: access.status,
    expiresAt: access.expires_at,
  }
}

export async function submitPublicDecision(pool: pg.Pool, token: string, input: { decision: string; comment?: string }) {
  const access = await getActiveAccessToken(pool, token)
  const result = await pool.query<ProposalDecisionRow>(
    `INSERT INTO public.proposal_decisions (proposal_version_id, decision, source, comment)
     VALUES ($1, $2, 'public_token', $3)
     RETURNING id, proposal_version_id, decision, source, comment, decided_by, created_at`,
    [access.id, input.decision, input.comment?.trim() || null],
  )
  return { decision: mapDecision(result.rows[0]), proposalId: access.proposal_id }
}

async function getProposalForAccess(pool: pg.Pool, user: AuthUser, proposalId: string, includeItems = false) {
  const result = await pool.query<ProposalRow>(
    `SELECT *
     FROM public.proposals p
     WHERE p.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = p.organization_id
         )
       )
     LIMIT 1`,
    [user.id, proposalId, isInternal(user)],
  )
  const proposal = result.rows[0]
  if (!proposal) throw Object.assign(new Error('proposal_not_found'), { statusCode: 404 })
  return includeItems ? { ...proposal, proposal_items: await listItems(pool, proposalId) } : proposal
}

async function getVersionForAccess(pool: pg.Pool, user: AuthUser, versionId: string) {
  const result = await pool.query<ProposalVersionRow>(
    `SELECT v.id, v.proposal_id, v.version_number, v.snapshot, v.status, v.sent_at, v.decided_at
     FROM public.proposal_versions v
     JOIN public.proposals p ON p.id = v.proposal_id
     WHERE v.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = p.organization_id
         )
       )
     LIMIT 1`,
    [user.id, versionId, isInternal(user)],
  )
  const version = result.rows[0]
  if (!version) throw Object.assign(new Error('proposal_version_not_found'), { statusCode: 404 })
  return version
}

async function getActiveAccessToken(pool: pg.Pool, token: string) {
  const result = await pool.query<ProposalVersionRow & { expires_at: string; current_version_id: string | null }>(
    `SELECT v.id, v.proposal_id, v.version_number, v.snapshot, v.status, v.sent_at, v.decided_at, a.expires_at, p.current_version_id
     FROM public.proposal_access_tokens a
     JOIN public.proposal_versions v ON v.id = a.proposal_version_id
     JOIN public.proposals p ON p.id = v.proposal_id
     WHERE a.token_hash = $1
       AND a.revoked_at IS NULL
       AND a.expires_at > NOW()
       AND p.current_version_id = v.id
       AND v.status = 'pending'
     LIMIT 1`,
    [hashToken(token)],
  )
  const access = result.rows[0]
  if (!access) throw Object.assign(new Error('public_proposal_link_invalid'), { statusCode: 404 })
  return access
}

async function hydrateProposals(pool: pg.Pool, proposals: ProposalRow[]) {
  if (proposals.length === 0) return []
  const items = await pool.query<ProposalItemRow>(
    `SELECT id, proposal_id, item_key, label, description, quantity, unit_value, total_value, order_index
     FROM public.proposal_items
     WHERE proposal_id = ANY($1::uuid[])
     ORDER BY order_index ASC`,
    [proposals.map((proposal) => proposal.id)],
  )
  const byProposal = groupRows(items.rows, 'proposal_id')
  return proposals.map((proposal) => mapProposal({ ...proposal, proposal_items: byProposal.get(proposal.id) ?? [] }))
}

async function listItems(pool: pg.Pool, proposalId: string) {
  const result = await pool.query<ProposalItemRow>(
    `SELECT id, proposal_id, item_key, label, description, quantity, unit_value, total_value, order_index
     FROM public.proposal_items
     WHERE proposal_id = $1
     ORDER BY order_index ASC`,
    [proposalId],
  )
  return result.rows
}

async function requireOrganizationAccess(pool: pg.Pool, user: AuthUser, organizationId: string) {
  if (isInternal(user)) return
  const result = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM public.memberships
     WHERE user_id = $1 AND organization_id = $2
     LIMIT 1`,
    [user.id, organizationId],
  )
  if (!result.rows[0]) throw Object.assign(new Error('organization_forbidden'), { statusCode: 403 })
}

async function requireLeadAccess(pool: pg.Pool, user: AuthUser, leadId: string) {
  const result = await pool.query<{ organization_id: string }>(
    `SELECT l.organization_id
     FROM public.leads l
     WHERE l.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = l.organization_id
         )
       )
     LIMIT 1`,
    [user.id, leadId, isInternal(user)],
  )
  if (!result.rows[0]) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })
}

async function getDiagnosticRow(pool: pg.Pool, leadId: string) {
  const result = await pool.query<DiagnosticRow>('SELECT * FROM public.commercial_diagnostics WHERE lead_id = $1 LIMIT 1', [leadId])
  return result.rows[0] ?? null
}

async function getTemplate(pool: pg.Pool, organizationId: string, packageId: string) {
  const result = await pool.query<TemplateRow>(
    `SELECT scope, default_items, whatsapp_message, email_subject, email_body
     FROM public.proposal_templates
     WHERE organization_id = $1 AND package_id = $2 AND is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
    [organizationId, packageId],
  )
  return result.rows[0] ?? null
}

async function getPriceRuleRows(pool: pg.Pool, organizationId: string, packageId: string) {
  const result = await pool.query<PriceRuleRow>(
    `SELECT id, organization_id, package_id, item_key, label, minimum_value, recommended_value, maximum_value
     FROM public.proposal_price_rules
     WHERE organization_id = $1 AND package_id = $2
     ORDER BY item_key ASC`,
    [organizationId, packageId],
  )
  return result.rows
}

function buildProposalUpdate(patch: ProposalPatch) {
  const fields: Array<[string, unknown]> = [
    ['title', patch.title],
    ['scope', patch.scope],
    ['whatsapp_message', patch.whatsappMessage],
    ['email_subject', patch.emailSubject],
    ['email_body', patch.emailBody],
    ['package_id', patch.packageId],
    ['blueprint_id', patch.blueprintId],
    ['billing_cycle', patch.billingCycle],
    ['selected_module_keys', patch.selectedModuleKeys],
    ['final_value', patch.finalValue],
    ['override_reason', patch.overrideReason],
  ]
  const columns: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }
  return { columns, values }
}

function buildFallbackDraft(template: TemplateRow | null, diagnostic: DiagnosticRow | null) {
  const diagnosticSuffix = diagnostic?.summary ? `\n\nContexto do diagnostico: ${diagnostic.summary}` : ''
  return {
    scope: `${template?.scope || 'Implantacao conforme diagnostico comercial.'}${diagnosticSuffix}`,
    whatsappMessage: template?.whatsapp_message || 'Preparamos uma proposta para sua revisao.',
    emailSubject: template?.email_subject || 'Proposta comercial YUX',
    emailBody: template?.email_body || 'Segue a proposta comercial para revisao.',
    items: template?.default_items || [],
  }
}

function normalizeSuggestedItems(items: ProposalItemInput[], rules: PriceRuleRow[]) {
  const rulesByKey = new Map(rules.map((rule) => [rule.item_key, rule]))
  return items.map((item, orderIndex) => {
    const rule = rulesByKey.get(item.itemKey)
    const value = Number(item.unitValue ?? rule?.recommended_value ?? 0)
    const unitValue = rule
      ? Math.min(Number(rule.maximum_value), Math.max(Number(rule.minimum_value), value))
      : Math.max(0, value)
    return {
      ...item,
      quantity: Number(item.quantity || 1),
      unitValue,
      orderIndex,
    }
  })
}

function mapProposal(row: ProposalRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    crmInstanceId: row.crm_instance_id ?? undefined,
    clientId: row.client_id ?? undefined,
    packageId: row.package_id,
    recommendedPackageId: row.recommended_package_id ?? undefined,
    blueprintId: row.blueprint_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    status: row.status,
    title: row.title,
    scope: row.scope || '',
    whatsappMessage: row.whatsapp_message ?? undefined,
    emailSubject: row.email_subject ?? undefined,
    emailBody: row.email_body ?? undefined,
    billingCycle: row.billing_cycle,
    selectedModuleKeys: row.selected_module_keys ?? [],
    finalValue: Number(row.final_value || 0),
    overrideReason: row.override_reason ?? undefined,
    currentVersionId: row.current_version_id ?? undefined,
    convertedClientId: row.converted_client_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    projectId: row.project_id ?? undefined,
    items: (row.proposal_items ?? []).map(mapItem),
  }
}

function mapItem(row: ProposalItemRow) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    itemKey: row.item_key,
    label: row.label,
    description: row.description ?? undefined,
    quantity: Number(row.quantity || 0),
    unitValue: Number(row.unit_value || 0),
    totalValue: Number(row.total_value || 0),
    orderIndex: row.order_index,
  }
}

function mapVersion(row: ProposalVersionRow) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    versionNumber: row.version_number,
    snapshot: row.snapshot,
    status: row.status,
    sentAt: row.sent_at,
    decidedAt: row.decided_at ?? undefined,
  }
}

function mapDecision(row: ProposalDecisionRow) {
  return {
    id: row.id,
    proposalVersionId: row.proposal_version_id,
    decision: row.decision,
    source: row.source,
    comment: row.comment ?? undefined,
    decidedBy: row.decided_by ?? undefined,
    createdAt: row.created_at,
  }
}

function mapDiagnostic(row: DiagnosticRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    summary: row.summary || '',
    painPoints: row.pain_points || [],
    goals: row.goals || [],
    budgetRange: row.budget_range ?? undefined,
    timeline: row.timeline ?? undefined,
    decisionProcess: row.decision_process ?? undefined,
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPriceRule(row: PriceRuleRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    packageId: row.package_id,
    itemKey: row.item_key,
    label: row.label,
    minimumValue: Number(row.minimum_value || 0),
    recommendedValue: Number(row.recommended_value || 0),
    maximumValue: Number(row.maximum_value || 0),
  }
}

function mapGenerationRun(row: GenerationRunRow) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    status: row.status,
    inputSummary: row.input_summary ?? {},
    resultMetadata: row.result_metadata ?? {},
    error: row.error ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function mapConversionRun(row: ConversionRunRow) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    clientId: row.client_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    projectId: row.project_id ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function createPublicToken() {
  return randomBytes(32).toString('hex')
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

function groupRows<Row extends Record<Key, string>, Key extends keyof Row>(rows: Row[], key: Key) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const groupKey = row[key]
    const group = groups.get(groupKey) ?? []
    group.push(row)
    groups.set(groupKey, group)
  }
  return groups
}
