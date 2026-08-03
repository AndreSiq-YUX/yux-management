import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'

const DEFAULT_FIELDS = [
  { fieldName: 'name', crmFieldKey: 'name', required: true },
  { fieldName: 'email', crmFieldKey: 'email', required: true },
  { fieldName: 'phone', crmFieldKey: 'phone', required: false },
  { fieldName: 'company', crmFieldKey: 'company', required: false },
  { fieldName: 'profile', crmFieldKey: 'profile', required: false },
  { fieldName: 'country', crmFieldKey: 'country', required: false },
  { fieldName: 'fit_score', crmFieldKey: 'fit_score', required: false },
  { fieldName: 'intent_score', crmFieldKey: 'intent_score', required: false },
  { fieldName: 'crm_contact_id', crmFieldKey: 'crm_contact_id', required: false },
]

const STRUCTURED_LEAD_FIELDS = new Set([
  'name', 'email', 'phone', 'company', 'notes', 'profile', 'country',
  'fit_score', 'intent_score', 'crm_contact_id', 'consent_lgpd',
  'consentAccepted', 'consent',
])

export type LeadFormFieldInput = {
  fieldName: string
  crmFieldKey: string
  required?: boolean
}

export type LeadFormCreateInput = {
  landingPageId?: string
  contractId?: string
  name: string
  submitLabel?: string
  successMessage?: string
  allowedOrigins?: string[]
  fields?: LeadFormFieldInput[]
  consentCode?: string
  consentVersion?: string
  privacyPolicyVersion?: string
}

export type LeadFormPatchInput = {
  isActive?: boolean
  allowedOrigins?: string[]
}

type LandingPageRow = {
  id: string
  organization_id: string
  contract_id: string
  pipeline_id: string | null
  initial_stage_id: string | null
  status: string
}

type FormRow = {
  id: string
  landing_page_id: string | null
  organization_id: string
  contract_id: string
  pipeline_id: string | null
  initial_stage_id: string | null
  name: string
  submit_label: string
  success_message: string
  metadata: Record<string, unknown> | null
  public_token_hash: string | null
  is_active: boolean
  allowed_origins: string[] | null
  public_token_rotated_at: string | null
  submission_count: number
  last_submission_at: string | null
  created_at: string
  updated_at: string
}

type FormMappingRow = {
  id: string
  form_id: string
  field_name: string
  crm_field_key: string
  required: boolean
  created_at: string
  updated_at: string
}

type PublicFormRow = FormRow & LandingPageRow & {
  landing_page_name: string | null
  landing_page_slug: string | null
  crm_source_id: string | null
}

type RecentSubmissionRow = {
  id: string
  form_id: string
  lead_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  status: string
  source: string | null
  page_url: string | null
  language: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  consent_code: string | null
  consent_version: string | null
  privacy_policy_version: string | null
  profile: string | null
  country: string | null
  fit_score: number | null
  intent_score: number | null
  crm_contact_id: string | null
  created_at: string
}

type PublicFormSubmission = {
  payload: Record<string, unknown>
  idempotencyKey: string
  externalSubmissionId?: string
  origin?: string
  language?: string
  referrer?: string
}

export function generateLeadFormToken() {
  return randomBytes(32).toString('base64url')
}

export function hashLeadFormToken(token: string) {
  return createHash('sha256').update(token.trim()).digest('hex')
}

export function buildLeadFormEndpoint(baseUrl: string | undefined, token: string) {
  const path = `/api/public/lead-forms/${encodeURIComponent(token)}/submissions`
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path
}

export async function createLeadForm(pool: pg.Pool, user: AuthUser, input: LeadFormCreateInput, publicBaseUrl?: string) {
  const scope = input.landingPageId
    ? await getLandingPageForAccess(pool, user, input.landingPageId)
    : await getContractForAccess(pool, user, input.contractId || '')
  const token = generateLeadFormToken()
  const fields = normalizeFieldMappings(input.fields?.length ? input.fields : DEFAULT_FIELDS)
  requireIdentityMappings(fields)
  const result = await pool.query<FormRow>(
    `INSERT INTO public.landing_page_forms (
       landing_page_id, organization_id, contract_id, pipeline_id, initial_stage_id,
       name, submit_label, success_message, metadata,
       public_token_hash, is_active, allowed_origins, public_token_rotated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, NOW())
     RETURNING *`,
    [
      input.landingPageId ? scope.id : null,
      scope.organization_id,
      scope.contract_id,
      scope.pipeline_id,
      scope.initial_stage_id,
      input.name.trim(),
      input.submitLabel?.trim() || 'Enviar',
      input.successMessage?.trim() || 'Recebemos seus dados.',
      {
        requiresConsent: true,
        consentCode: input.consentCode?.trim() || 'lead_capture',
        consentVersion: input.consentVersion?.trim() || '1.0',
        privacyPolicyVersion: input.privacyPolicyVersion?.trim() || '1.0',
      },
      hashLeadFormToken(token),
      normalizeOrigins(input.allowedOrigins),
    ],
  )
  const form = result.rows[0]
  if (!form) throw new Error('lead_form_creation_failed')

  for (const field of fields) {
    await pool.query(
      `INSERT INTO public.landing_page_field_mappings (form_id, field_name, crm_field_key, required)
       VALUES ($1, $2, $3, $4)`,
      [form.id, field.fieldName, field.crmFieldKey, field.required],
    )
  }

  return mapLeadForm(form, await listFormMappings(pool, form.id), publicBaseUrl, token)
}

export async function listLeadFormsForContract(pool: pg.Pool, user: AuthUser, contractId: string) {
  const scope = await getContractForAccess(pool, user, contractId)
  const formsResult = await pool.query<FormRow & { landing_page_name: string | null }>(
    `SELECT f.*, lp.name AS landing_page_name
     FROM public.landing_page_forms f
     LEFT JOIN public.landing_pages lp ON lp.id = f.landing_page_id
     WHERE f.contract_id = $1 AND f.organization_id = $2
     ORDER BY f.updated_at DESC`,
    [scope.contract_id, scope.organization_id],
  )
  const formIds = formsResult.rows.map(form => form.id)
  if (formIds.length === 0) return []

  const [mappingsResult, submissionsResult] = await Promise.all([
    pool.query<FormMappingRow>(
      `SELECT id, form_id, field_name, crm_field_key, required, created_at, updated_at
       FROM public.landing_page_field_mappings
       WHERE form_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [formIds],
    ),
    pool.query<RecentSubmissionRow>(
      `SELECT * FROM (
         SELECT s.id, s.form_id, s.lead_id, l.name, l.email, l.phone, s.status,
                s.source, s.page_url, s.language, s.referrer,
                s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term,
                s.consent_code, s.consent_version, s.privacy_policy_version,
                s.profile, s.country, s.fit_score, s.intent_score, s.crm_contact_id,
                s.created_at,
                ROW_NUMBER() OVER (PARTITION BY s.form_id ORDER BY s.created_at DESC) AS position
         FROM public.landing_page_form_submissions s
         LEFT JOIN public.leads l ON l.id = s.lead_id
         WHERE s.form_id = ANY($1::uuid[])
       ) recent
       WHERE recent.position <= 5
       ORDER BY recent.created_at DESC`,
      [formIds],
    ),
  ])

  return formsResult.rows.map(form => ({
    ...mapLeadForm(form, mappingsResult.rows.filter(mapping => mapping.form_id === form.id)),
    landingPageName: form.landing_page_name || undefined,
    recentSubmissions: submissionsResult.rows
      .filter(submission => submission.form_id === form.id)
      .map(mapRecentSubmission),
  }))
}

export async function rotateLeadFormToken(pool: pg.Pool, user: AuthUser, formId: string, publicBaseUrl?: string) {
  const form = await getLeadFormForAccess(pool, user, formId)
  const token = generateLeadFormToken()
  const result = await pool.query<FormRow>(
    `UPDATE public.landing_page_forms
     SET public_token_hash = $2, public_token_rotated_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [form.id, hashLeadFormToken(token)],
  )
  return mapLeadForm(result.rows[0], await listFormMappings(pool, form.id), publicBaseUrl, token)
}

export async function updateLeadForm(pool: pg.Pool, user: AuthUser, formId: string, input: LeadFormPatchInput) {
  const form = await getLeadFormForAccess(pool, user, formId)
  const columns: string[] = []
  const values: unknown[] = []
  if (input.isActive !== undefined) {
    columns.push('is_active')
    values.push(input.isActive)
  }
  if (input.allowedOrigins !== undefined) {
    columns.push('allowed_origins')
    values.push(normalizeOrigins(input.allowedOrigins))
  }
  if (columns.length > 0) {
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
    await pool.query(
      `UPDATE public.landing_page_forms SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1`,
      [form.id, ...values],
    )
  }
  const updated = await pool.query<FormRow>('SELECT * FROM public.landing_page_forms WHERE id = $1', [form.id])
  return mapLeadForm(updated.rows[0], await listFormMappings(pool, form.id))
}

export async function replaceLeadFormMappings(
  pool: pg.Pool,
  user: AuthUser,
  formId: string,
  fields: LeadFormFieldInput[],
) {
  const form = await getLeadFormForAccess(pool, user, formId)
  const normalizedFields = normalizeFieldMappings(fields)
  requireIdentityMappings(normalizedFields)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM public.landing_page_field_mappings WHERE form_id = $1', [form.id])
    for (const field of normalizedFields) {
      await client.query(
        `INSERT INTO public.landing_page_field_mappings (form_id, field_name, crm_field_key, required)
         VALUES ($1, $2, $3, $4)`,
        [form.id, field.fieldName, field.crmFieldKey, field.required],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query<FormRow>('SELECT * FROM public.landing_page_forms WHERE id = $1', [form.id])
  return mapLeadForm(updated.rows[0], await listFormMappings(pool, form.id))
}

export async function submitLeadForm(pool: pg.Pool, input: PublicFormSubmission, token: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const formResult = await client.query<PublicFormRow>(
      `SELECT f.id, f.landing_page_id, f.organization_id, f.contract_id,
              f.pipeline_id, f.initial_stage_id, f.name, f.submit_label,
              f.success_message, f.metadata, f.public_token_hash, f.is_active,
              f.allowed_origins, f.public_token_rotated_at, f.submission_count,
              f.last_submission_at, f.created_at, f.updated_at,
              COALESCE(lp.status, 'active') AS status,
              lp.name AS landing_page_name, lp.slug AS landing_page_slug,
              lp.crm_source_id
       FROM public.landing_page_forms f
       LEFT JOIN public.landing_pages lp ON lp.id = f.landing_page_id
       WHERE f.public_token_hash = $1
         AND f.is_active = TRUE
         AND (lp.id IS NULL OR lp.status = 'active')
       LIMIT 1
       FOR UPDATE OF f`,
      [hashLeadFormToken(token)],
    )
    const form = formResult.rows[0]
    if (!form) throw httpError(404, 'lead_form_not_found')
    if (!isOriginAllowed(form.allowed_origins, input.origin)) throw httpError(403, 'lead_form_origin_not_allowed')

    const existingSubmission = await client.query<{
      id: string
      lead_id: string | null
      status: string
      lead_name: string | null
      lead_email: string | null
      lead_phone: string | null
      lead_company: string | null
    }>(
      `SELECT s.id, s.lead_id, s.status,
              l.name AS lead_name, l.email AS lead_email,
              l.phone AS lead_phone, l.company AS lead_company
       FROM public.landing_page_form_submissions s
       LEFT JOIN public.leads l ON l.id = s.lead_id
       WHERE s.form_id = $1 AND s.idempotency_key = $2
       LIMIT 1`,
      [form.id, input.idempotencyKey],
    )
    const previousSubmission = existingSubmission.rows[0]
    if (previousSubmission) {
      await client.query('COMMIT')
      return {
        accepted: true,
        duplicate: true,
        leadId: previousSubmission.lead_id,
        formId: form.id,
        organizationId: form.organization_id,
        event: previousSubmission.status === 'processed' && previousSubmission.lead_id ? {
          type: 'lead.created',
          organizationId: form.organization_id,
          leadId: previousSubmission.lead_id,
          source: 'landing_page',
          payload: {
            leadId: previousSubmission.lead_id,
            formId: form.id,
            landingPageId: form.landing_page_id,
            source: 'landing_page',
            sourceKind: 'landing_page',
            name: previousSubmission.lead_name || undefined,
            email: previousSubmission.lead_email || undefined,
            phone: previousSubmission.lead_phone || undefined,
            company: previousSubmission.lead_company || undefined,
          },
        } : null,
      }
    }

    const mappings = await client.query<FormMappingRow>(
      `SELECT id, form_id, field_name, crm_field_key, required, created_at, updated_at
       FROM public.landing_page_field_mappings
       WHERE form_id = $1
       ORDER BY created_at ASC`,
      [form.id],
    )
    const mapped = mapSubmission(input.payload, mappings.rows)
    validateSubmission(form, mapped, mappings.rows)
    const snapshot = buildSubmissionSnapshot(form, input, mapped)

    const lockKey = `${form.organization_id}:${String(mapped.email || '').toLowerCase()}:${String(mapped.phone || '')}:${snapshot.crmContactId || ''}`
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey])

    const existingLead = await client.query<{ id: string }>(
      `SELECT id
       FROM public.leads
       WHERE organization_id = $1
         AND (
           LOWER(email) = LOWER($2)
           OR ($3 <> '' AND phone = $3)
           OR ($4 <> '' AND crm_contact_id = $4)
         )
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [form.organization_id, mapped.email, mapped.phone || '', snapshot.crmContactId || ''],
    )

    let leadId = existingLead.rows[0]?.id
    let created = false
    let sourceId: string | null = form.crm_source_id
    if (!sourceId) {
      const sourceResult = await client.query<{ id: string }>(
        `SELECT id FROM public.lead_sources
         WHERE organization_id = $1 AND landing_page_id IS NOT DISTINCT FROM $2 AND key = $3
         ORDER BY created_at ASC LIMIT 1`,
        [form.organization_id, form.landing_page_id, `form_${form.id}`],
      )
      sourceId = sourceResult.rows[0]?.id || null
      if (!sourceId) {
        const insertedSource = await client.query<{ id: string }>(
          `INSERT INTO public.lead_sources (organization_id, key, name, kind, landing_page_id, metadata)
           VALUES ($1, $2, $3, 'landing_page', $4, $5)
           RETURNING id`,
          [form.organization_id, `form_${form.id}`, `Formulário: ${form.name}`, form.landing_page_id, { formId: form.id }],
        )
        sourceId = insertedSource.rows[0]?.id || null
      }
    }

    const attributionContext = buildAttributionContext(form, mapped, input.externalSubmissionId, snapshot)
    if (!leadId) {
      const stage = await resolveInitialStage(client, form)
      if (!stage) throw httpError(409, 'lead_form_pipeline_not_configured')
      const leadResult = await client.query<{ id: string }>(
        `INSERT INTO public.leads (
           organization_id, crm_instance_id, pipeline_id, stage_id, name, email, phone, company,
           source, source_kind, status, score, notes, last_activity_at,
           attribution_context, stage, primary_source_id, source_confidence,
           consent_lgpd, profile, country, fit_score, intent_score, crm_contact_id,
           assignment_state, assignment_mode
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'landing_page', 'open', 0, $10,
                 NOW(), $11, 'NEW', $12, 'high', TRUE, $13, $14, $15, $16, $17,
                 'in_queue', $18)
         RETURNING id`,
        [
          form.organization_id,
          stage.crm_instance_id,
          stage.pipeline_id,
          stage.stage_id,
          mapped.name,
          mapped.email,
          mapped.phone || null,
          mapped.company || null,
          `Formulário externo: ${form.name}`,
          mapped.notes || null,
          attributionContext,
          sourceId,
          snapshot.profile,
          snapshot.country,
          snapshot.fitScore,
          snapshot.intentScore,
          snapshot.crmContactId,
          stage.assignment_mode,
        ],
      )
      leadId = leadResult.rows[0]?.id
      created = Boolean(leadId)
    } else {
      await client.query(
        `UPDATE public.leads
         SET phone = COALESCE(NULLIF(phone, ''), $2),
             company = COALESCE(NULLIF(company, ''), $3),
             profile = COALESCE($4, profile),
             country = COALESCE($5, country),
             fit_score = COALESCE($6, fit_score),
             intent_score = COALESCE($7, intent_score),
             crm_contact_id = COALESCE($8, crm_contact_id),
             last_activity_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [
          leadId,
          mapped.phone || null,
          mapped.company || null,
          snapshot.profile,
          snapshot.country,
          snapshot.fitScore,
          snapshot.intentScore,
          snapshot.crmContactId,
        ],
      )
    }

    if (!leadId) throw new Error('lead_creation_failed')
    await persistMappedCustomFieldValues(client, form.organization_id, leadId, mappings.rows, mapped)

    await client.query(
      `INSERT INTO public.landing_page_form_submissions (
         organization_id, landing_page_id, form_id, idempotency_key,
         external_submission_id, status, lead_id, payload, processed_at,
         source, page_url, language, referrer, request_origin,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         consent_code, consent_version, privacy_policy_version, consent_accepted_at,
         profile, country, fit_score, intent_score, crm_contact_id
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, NOW(),
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21, $22,
         $23, $24, $25, $26, $27
       )`,
      [
        form.organization_id,
        form.landing_page_id,
        form.id,
        input.idempotencyKey,
        input.externalSubmissionId || null,
        created ? 'processed' : 'duplicate',
        leadId,
        input.payload,
        snapshot.source,
        snapshot.pageUrl,
        snapshot.language,
        snapshot.referrer,
        snapshot.requestOrigin,
        snapshot.utmSource,
        snapshot.utmMedium,
        snapshot.utmCampaign,
        snapshot.utmContent,
        snapshot.utmTerm,
        snapshot.consentCode,
        snapshot.consentVersion,
        snapshot.privacyPolicyVersion,
        snapshot.consentAcceptedAt,
        snapshot.profile,
        snapshot.country,
        snapshot.fitScore,
        snapshot.intentScore,
        snapshot.crmContactId,
      ],
    )

    if (form.landing_page_id) {
      await client.query(
        `INSERT INTO public.landing_page_events (landing_page_id, event_type, lead_id, metadata)
         VALUES ($1, 'form_submit', $2, $3)`,
        [form.landing_page_id, leadId, { formId: form.id, duplicate: !created }],
      )
    }
    await client.query(
      `INSERT INTO public.lead_attribution_events (
         organization_id, lead_id, source_id, event_kind, landing_page_id,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term, metadata
       )
       VALUES ($1, $2, $3, 'landing_page_submit', $4, $5, $6, $7, $8, $9, $10)`,
      [
        form.organization_id,
        leadId,
        sourceId,
        form.landing_page_id,
        snapshot.utmSource,
        snapshot.utmMedium,
        snapshot.utmCampaign,
        snapshot.utmContent,
        snapshot.utmTerm,
        {
          formId: form.id,
          externalSubmissionId: input.externalSubmissionId || null,
          language: snapshot.language,
          referrer: snapshot.referrer,
          pageUrl: snapshot.pageUrl,
          consentCode: snapshot.consentCode,
          consentVersion: snapshot.consentVersion,
          privacyPolicyVersion: snapshot.privacyPolicyVersion,
        },
      ],
    )
    await client.query(
      `UPDATE public.landing_page_forms
       SET submission_count = submission_count + 1, last_submission_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [form.id],
    )
    if (form.landing_page_id) {
      await client.query(
        `UPDATE public.landing_pages
         SET leads = leads + CASE WHEN $2::boolean THEN 1 ELSE 0 END, updated_at = NOW()
         WHERE id = $1`,
        [form.landing_page_id, created],
      )
    }

    await client.query('COMMIT')
    return {
      accepted: true,
      duplicate: !created,
      leadId,
      formId: form.id,
      organizationId: form.organization_id,
      event: created ? {
        type: 'lead.created',
        organizationId: form.organization_id,
        leadId,
        source: 'landing_page',
        payload: {
          leadId,
          formId: form.id,
          landingPageId: form.landing_page_id,
          source: 'landing_page',
          sourceKind: 'landing_page',
          name: mapped.name,
          email: mapped.email,
          phone: mapped.phone || undefined,
          company: mapped.company || undefined,
          profile: snapshot.profile || undefined,
          country: snapshot.country || undefined,
          fitScore: snapshot.fitScore ?? undefined,
          intentScore: snapshot.intentScore ?? undefined,
          crmContactId: snapshot.crmContactId || undefined,
          consentCode: snapshot.consentCode,
          consentVersion: snapshot.consentVersion,
          privacyPolicyVersion: snapshot.privacyPolicyVersion,
          attributionContext,
        },
      } : null,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export function mapSubmission(payload: Record<string, unknown>, mappings: FormMappingRow[]) {
  const mapped: Record<string, unknown> = { ...payload }
  for (const mapping of mappings) {
    const value = payload[mapping.field_name]
    if (value !== undefined) mapped[mapping.crm_field_key] = value
  }
  mapped.name = firstValue(mapped, ['name', 'full_name', 'fullName', 'nome'])
  mapped.email = firstValue(mapped, ['email', 'e-mail', 'mail'])
  mapped.phone = firstValue(mapped, ['phone', 'telephone', 'telefone', 'whatsapp'])
  mapped.company = firstValue(mapped, ['company', 'empresa', 'organization'])
  mapped.notes = firstValue(mapped, ['notes', 'message', 'mensagem', 'observations'])
  mapped.profile = firstValue(mapped, ['profile', 'perfil', 'lead_profile', 'leadProfile'])
  mapped.country = firstValue(mapped, ['country', 'country_code', 'countryCode', 'pais', 'país'])
  mapped.fit_score = firstValue(mapped, ['fit_score', 'fitScore', 'score_fit'])
  mapped.intent_score = firstValue(mapped, ['intent_score', 'intentScore', 'score_intent'])
  mapped.crm_contact_id = firstValue(mapped, ['crm_contact_id', 'crmContactId', 'external_crm_id', 'externalCrmId'])
  return mapped
}

export function validateSubmission(
  form: Pick<PublicFormRow, 'metadata'>,
  mapped: Record<string, unknown>,
  mappings: FormMappingRow[] = [],
) {
  if (!valueAsString(mapped.name)) throw httpError(422, 'lead_form_name_required')
  if (!valueAsString(mapped.email)) throw httpError(422, 'lead_form_email_required')
  if (form.metadata?.requiresConsent !== false && !isTruthy(mapped.consent_lgpd ?? mapped.consentAccepted ?? mapped.consent)) {
    throw httpError(422, 'lead_form_consent_required')
  }
  const missingRequired = mappings.find(mapping => mapping.required && !hasSubmissionValue(mapped[mapping.crm_field_key]))
  if (missingRequired) throw httpError(422, `lead_form_field_required:${missingRequired.field_name}`)
  validateScore(mapped.fit_score, 'lead_form_fit_score_invalid')
  validateScore(mapped.intent_score, 'lead_form_intent_score_invalid')
}

function buildAttributionContext(
  form: PublicFormRow,
  mapped: Record<string, unknown>,
  externalSubmissionId: string | undefined,
  snapshot: ReturnType<typeof buildSubmissionSnapshot>,
) {
  return {
    source: 'external_form',
    formId: form.id,
    formName: form.name,
    landingPageId: form.landing_page_id,
    landingPageName: form.landing_page_name,
    landingPageSlug: form.landing_page_slug,
    externalSubmissionId: externalSubmissionId || null,
    utmSource: snapshot.utmSource,
    utmMedium: snapshot.utmMedium,
    utmCampaign: snapshot.utmCampaign,
    utmContent: snapshot.utmContent,
    utmTerm: snapshot.utmTerm,
    language: snapshot.language,
    referrer: snapshot.referrer,
    pageUrl: snapshot.pageUrl,
    profile: snapshot.profile,
    country: snapshot.country,
    fitScore: snapshot.fitScore,
    intentScore: snapshot.intentScore,
    crmContactId: snapshot.crmContactId,
    consentCode: snapshot.consentCode,
    consentVersion: snapshot.consentVersion,
    privacyPolicyVersion: snapshot.privacyPolicyVersion,
    customFields: Object.fromEntries(Object.entries(mapped).filter(([key]) => !STRUCTURED_LEAD_FIELDS.has(key))),
  }
}

function buildSubmissionSnapshot(form: PublicFormRow, input: PublicFormSubmission, mapped: Record<string, unknown>) {
  const payload = input.payload
  const metadata = form.metadata || {}
  const consentAccepted = isTruthy(mapped.consent_lgpd ?? mapped.consentAccepted ?? mapped.consent)
  return {
    source: firstValue(mapped, ['source', 'lead_source', 'leadSource', 'origin']) || 'external_form',
    pageUrl: firstValue(mapped, ['page_url', 'pageUrl', 'url']) || null,
    language: firstValue(mapped, ['language', 'lang', 'idioma']) || normalizeLanguage(input.language),
    referrer: firstValue(mapped, ['referrer', 'http_referrer', 'referer']) || input.referrer || null,
    requestOrigin: input.origin || null,
    utmSource: valueAsString(payload.utm_source || payload.utmSource) || null,
    utmMedium: valueAsString(payload.utm_medium || payload.utmMedium) || null,
    utmCampaign: valueAsString(payload.utm_campaign || payload.utmCampaign) || null,
    utmContent: valueAsString(payload.utm_content || payload.utmContent) || null,
    utmTerm: valueAsString(payload.utm_term || payload.utmTerm) || null,
    consentCode: firstValue(mapped, ['consent_code', 'consentCode'])
      || valueAsString(metadata.consentCode)
      || 'lead_capture',
    consentVersion: firstValue(mapped, ['consent_version', 'consentVersion'])
      || valueAsString(metadata.consentVersion)
      || '1.0',
    privacyPolicyVersion: firstValue(mapped, ['privacy_policy_version', 'privacyPolicyVersion'])
      || valueAsString(metadata.privacyPolicyVersion)
      || '1.0',
    consentAcceptedAt: consentAccepted ? new Date().toISOString() : null,
    profile: valueAsString(mapped.profile) || null,
    country: valueAsString(mapped.country) || null,
    fitScore: scoreValue(mapped.fit_score),
    intentScore: scoreValue(mapped.intent_score),
    crmContactId: valueAsString(mapped.crm_contact_id) || null,
  }
}

async function persistMappedCustomFieldValues(
  client: pg.PoolClient,
  organizationId: string,
  leadId: string,
  mappings: FormMappingRow[],
  mapped: Record<string, unknown>,
) {
  for (const mapping of mappings) {
    if (STRUCTURED_LEAD_FIELDS.has(mapping.crm_field_key)) continue
    const value = mapped[mapping.crm_field_key]
    if (!hasSubmissionValue(value)) continue
    await client.query(
      `INSERT INTO public.lead_custom_field_values (
         organization_id, lead_id, field_key, field_label, value
       )
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (lead_id, field_key) DO UPDATE
       SET field_label = EXCLUDED.field_label,
           value = EXCLUDED.value,
           updated_at = NOW()`,
      [
        organizationId,
        leadId,
        mapping.crm_field_key,
        mapping.field_name,
        JSON.stringify(value),
      ],
    )
  }
}

async function resolveInitialStage(client: pg.PoolClient, form: PublicFormRow) {
  if (form.pipeline_id) {
    const selected = await client.query<{
      pipeline_id: string
      stage_id: string
      crm_instance_id: string | null
      assignment_mode: string
    }>(
      `SELECT p.id AS pipeline_id, s.id AS stage_id,
              p.crm_instance_id,
              COALESCE(ci.default_assignment_mode, 'queue'::public.crm_assignment_mode) AS assignment_mode
       FROM public.crm_pipelines p
       JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
       LEFT JOIN public.crm_instances ci ON ci.id = p.crm_instance_id
       WHERE p.id = $1 AND p.organization_id = $2 AND p.is_active = TRUE
         AND s.is_active = TRUE AND ($3::uuid IS NULL OR s.id = $3)
       ORDER BY (s.id = $3) DESC, s.order_index ASC
       LIMIT 1`,
      [form.pipeline_id, form.organization_id, form.initial_stage_id],
    )
    if (selected.rows[0]) return selected.rows[0]
  }
  const fallback = await client.query<{
    pipeline_id: string
    stage_id: string
    crm_instance_id: string | null
    assignment_mode: string
  }>(
    `SELECT p.id AS pipeline_id, s.id AS stage_id,
            p.crm_instance_id,
            COALESCE(ci.default_assignment_mode, 'queue'::public.crm_assignment_mode) AS assignment_mode
     FROM public.crm_pipelines p
     JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
     LEFT JOIN public.crm_instances ci ON ci.id = p.crm_instance_id
     WHERE p.organization_id = $1 AND p.is_active = TRUE AND s.is_active = TRUE
     ORDER BY (ci.contract_id = $2) DESC NULLS LAST,
              (ci.status = 'active') DESC NULLS LAST,
              p.is_default DESC, p.created_at ASC, s.order_index ASC
     LIMIT 1`,
    [form.organization_id, form.contract_id],
  )
  return fallback.rows[0] || null
}

async function getLandingPageForAccess(pool: pg.Pool, user: AuthUser, landingPageId: string) {
  const result = await pool.query<LandingPageRow>(
    `SELECT id, organization_id, contract_id, pipeline_id, initial_stage_id, status
     FROM public.landing_pages lp
     WHERE lp.id = $2
       AND ($3::boolean = TRUE OR EXISTS (
         SELECT 1 FROM public.memberships m
         WHERE m.user_id = $1 AND m.organization_id = lp.organization_id
       ))
     LIMIT 1`,
    [user.id, landingPageId, isInternal(user)],
  )
  const page = result.rows[0]
  if (!page) throw httpError(404, 'landing_page_not_found')
  return page
}

async function getContractForAccess(pool: pg.Pool, user: AuthUser, contractId: string) {
  const result = await pool.query<LandingPageRow>(
    `SELECT c.id, o.id AS organization_id, c.id AS contract_id,
            NULL::uuid AS pipeline_id, NULL::uuid AS initial_stage_id, c.status
     FROM public.contracts c
     JOIN public.organizations o ON o.client_id = c.client_id
     WHERE c.id = $2
       AND ($3::boolean = TRUE OR EXISTS (
         SELECT 1 FROM public.memberships m
         WHERE m.user_id = $1 AND m.organization_id = o.id
       ))
     LIMIT 1`,
    [user.id, contractId, isInternal(user)],
  )
  const contract = result.rows[0]
  if (!contract) throw httpError(404, 'contract_not_found')
  return contract
}

async function getLeadFormForAccess(pool: pg.Pool, user: AuthUser, formId: string) {
  const result = await pool.query<FormRow & { organization_id: string }>(
    `SELECT f.*
     FROM public.landing_page_forms f
     WHERE f.id = $2
       AND ($3::boolean = TRUE OR EXISTS (
         SELECT 1 FROM public.memberships m
         WHERE m.user_id = $1 AND m.organization_id = f.organization_id
       ))
     LIMIT 1`,
    [user.id, formId, isInternal(user)],
  )
  const form = result.rows[0]
  if (!form) throw httpError(404, 'lead_form_not_found')
  return form
}

async function listFormMappings(pool: pg.Pool, formId: string) {
  const result = await pool.query<FormMappingRow>(
    `SELECT id, form_id, field_name, crm_field_key, required, created_at, updated_at
     FROM public.landing_page_field_mappings WHERE form_id = $1 ORDER BY created_at ASC`,
    [formId],
  )
  return result.rows
}

function mapLeadForm(form: FormRow, mappings: FormMappingRow[], publicBaseUrl?: string, token?: string) {
  return {
    id: form.id,
    landingPageId: form.landing_page_id || undefined,
    organizationId: form.organization_id,
    contractId: form.contract_id,
    name: form.name,
    submitLabel: form.submit_label,
    successMessage: form.success_message,
    metadata: form.metadata || {},
    isActive: form.is_active,
    allowedOrigins: form.allowed_origins || [],
    hasPublicToken: Boolean(form.public_token_hash),
    submissionCount: Number(form.submission_count || 0),
    lastSubmissionAt: form.last_submission_at || undefined,
    publicTokenRotatedAt: form.public_token_rotated_at || undefined,
    publicEndpoint: token ? buildLeadFormEndpoint(publicBaseUrl, token) : undefined,
    publicToken: token,
    mappings: mappings.map(mapping => ({
      id: mapping.id,
      formId: mapping.form_id,
      fieldName: mapping.field_name,
      crmFieldKey: mapping.crm_field_key,
      required: mapping.required,
      createdAt: mapping.created_at,
      updatedAt: mapping.updated_at,
    })),
    createdAt: form.created_at,
    updatedAt: form.updated_at,
  }
}

function mapRecentSubmission(submission: RecentSubmissionRow) {
  return {
    id: submission.id,
    leadId: submission.lead_id || undefined,
    name: submission.name || undefined,
    email: submission.email || undefined,
    phone: submission.phone || undefined,
    status: submission.status,
    source: submission.source || undefined,
    pageUrl: submission.page_url || undefined,
    language: submission.language || undefined,
    referrer: submission.referrer || undefined,
    utmSource: submission.utm_source || undefined,
    utmMedium: submission.utm_medium || undefined,
    utmCampaign: submission.utm_campaign || undefined,
    utmContent: submission.utm_content || undefined,
    utmTerm: submission.utm_term || undefined,
    consentCode: submission.consent_code || undefined,
    consentVersion: submission.consent_version || undefined,
    privacyPolicyVersion: submission.privacy_policy_version || undefined,
    profile: submission.profile || undefined,
    country: submission.country || undefined,
    fitScore: submission.fit_score == null ? undefined : Number(submission.fit_score),
    intentScore: submission.intent_score == null ? undefined : Number(submission.intent_score),
    crmContactId: submission.crm_contact_id || undefined,
    createdAt: submission.created_at,
  }
}

function firstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueAsString(source[key])
    if (value) return value
  }
  return ''
}

function valueAsString(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function hasSubmissionValue(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function scoreValue(value: unknown) {
  if (!hasSubmissionValue(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? Math.round(parsed) : null
}

function validateScore(value: unknown, error: string) {
  if (hasSubmissionValue(value) && scoreValue(value) === null) throw httpError(422, error)
}

function normalizeLanguage(value?: string) {
  const candidate = value?.split(',')[0]?.trim()
  return candidate ? candidate.slice(0, 35) : null
}

function isTruthy(value: unknown) {
  return value === true || ['true', '1', 'yes', 'sim', 'on'].includes(valueAsString(value).toLowerCase())
}

function normalizeOrigins(origins?: string[]) {
  return [...new Set((origins || []).map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean))].slice(0, 20)
}

function normalizeFieldMappings(fields: LeadFormFieldInput[]) {
  const normalized = fields.map(field => ({
    fieldName: field.fieldName.trim(),
    crmFieldKey: field.crmFieldKey.trim(),
    required: field.required === true,
  }))
  const fieldNames = new Set(normalized.map(field => field.fieldName.toLowerCase()))
  const crmKeys = new Set(normalized.map(field => field.crmFieldKey.toLowerCase()))
  if (fieldNames.size !== normalized.length || crmKeys.size !== normalized.length) {
    throw httpError(422, 'lead_form_mapping_keys_must_be_unique')
  }
  return normalized
}

function requireIdentityMappings(fields: LeadFormFieldInput[]) {
  const crmKeys = new Set(fields.map(field => field.crmFieldKey))
  if (!crmKeys.has('name') || !crmKeys.has('email')) {
    throw httpError(422, 'lead_form_name_and_email_mappings_required')
  }
}

function isOriginAllowed(allowedOrigins: string[] | null | undefined, origin?: string) {
  const configured = normalizeOrigins(allowedOrigins || [])
  if (configured.length === 0) return true
  const candidate = origin?.trim().replace(/\/$/, '')
  return Boolean(candidate && configured.some(item => item === '*' || item.toLowerCase() === candidate.toLowerCase()))
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
