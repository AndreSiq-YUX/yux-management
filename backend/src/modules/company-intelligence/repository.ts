import type pg from 'pg'
import { createHash } from 'node:crypto'
import type { BrandProfileInput, CompanyContextPreview, CompanyProfileInput } from './types.js'
import type { ExtractedKnowledge } from './text-extraction.js'

type Row = Record<string, any>
type QueryExecutor = Pick<pg.Pool, 'query'>

export async function getCompanyProfile(pool: pg.Pool, organizationId: string, includeInternal = false) {
  const result = await pool.query<Row>(
    `SELECT organization.id AS organization_id,
            organization.name AS organization_name,
            organization.client_id,
            profile.*,
            client.company_name, client.website AS client_website, client.sector,
            client.phone AS client_phone, client.email AS client_email,
            client.address AS client_address, client.notes AS client_notes
       FROM public.organizations organization
       LEFT JOIN public.organization_company_profiles profile
         ON profile.organization_id = organization.id
       LEFT JOIN public.clients client ON client.id = organization.client_id
      WHERE organization.id = $1
      LIMIT 1`,
    [organizationId],
  )
  const row = result.rows[0]
  if (!row) throw domainError(404, 'organization_not_found')
  return mapCompanyProfile(row, includeInternal)
}

export async function upsertCompanyProfile(
  pool: pg.Pool,
  organizationId: string,
  input: CompanyProfileInput,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const organization = await client.query<{ client_id: string | null }>(
      'SELECT client_id FROM public.organizations WHERE id = $1 FOR UPDATE',
      [organizationId],
    )
    if (!organization.rows[0]) throw domainError(404, 'organization_not_found')

    await client.query(
      `INSERT INTO public.organization_company_profiles (
         organization_id, legal_name, trade_name, description, website_url, industry,
         positioning, differentiators, emails, phones, address, business_hours,
         service_regions, social_links, internal_notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15)
       ON CONFLICT (organization_id) DO UPDATE SET
         legal_name = EXCLUDED.legal_name,
         trade_name = EXCLUDED.trade_name,
         description = EXCLUDED.description,
         website_url = EXCLUDED.website_url,
         industry = EXCLUDED.industry,
         positioning = EXCLUDED.positioning,
         differentiators = EXCLUDED.differentiators,
         emails = EXCLUDED.emails,
         phones = EXCLUDED.phones,
         address = EXCLUDED.address,
         business_hours = EXCLUDED.business_hours,
         service_regions = EXCLUDED.service_regions,
         social_links = EXCLUDED.social_links,
         internal_notes = EXCLUDED.internal_notes,
         updated_at = NOW()`,
      [
        organizationId, input.legalName, input.tradeName, input.description,
        input.websiteUrl || null, input.industry, input.positioning, input.differentiators,
        input.emails, input.phones, JSON.stringify(input.address), JSON.stringify(input.businessHours),
        input.serviceRegions, JSON.stringify(input.socialLinks), input.internalNotes || null,
      ],
    )

    const clientId = organization.rows[0].client_id
    if (clientId) {
      await client.query(
        `UPDATE public.clients SET
           company_name = COALESCE(NULLIF($2, ''), NULLIF($3, ''), company_name),
           website = $4,
           sector = COALESCE(NULLIF($5, ''), sector),
           phone = COALESCE($6, phone),
           address = $7::jsonb,
           notes = COALESCE($8, notes),
           updated_at = NOW()
         WHERE id = $1`,
        [
          clientId, input.tradeName, input.legalName, input.websiteUrl || null,
          input.industry, input.phones[0] || null, JSON.stringify(input.address),
          input.internalNotes || input.description || null,
        ],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return getCompanyProfile(pool, organizationId, true)
}

export async function getBrandProfile(pool: pg.Pool, organizationId: string, includeCompliance = false) {
  const result = await pool.query<Row>(
    `SELECT profile.*
       FROM public.marketing_brand_profiles profile
      WHERE profile.organization_id = $1
      ORDER BY (profile.status = 'active') DESC, profile.updated_at DESC
      LIMIT 1`,
    [organizationId],
  )
  return result.rows[0] ? mapBrandProfile(result.rows[0], includeCompliance) : null
}

export async function upsertBrandProfile(pool: pg.Pool, organizationId: string, input: BrandProfileInput) {
  const scope = await resolveMarketingScope(pool, organizationId, input.contractId)
  const result = await pool.query<Row>(
    `INSERT INTO public.marketing_brand_profiles (
       organization_id, client_id, contract_id, tone_of_voice, persona, brand_voice_summary,
       vocabulary_do, vocabulary_dont, forbidden_topics, priority_topics,
       visual_identity, visual_guidelines, compliance_notes, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
     ON CONFLICT (contract_id) DO UPDATE SET
       tone_of_voice = EXCLUDED.tone_of_voice,
       persona = EXCLUDED.persona,
       brand_voice_summary = EXCLUDED.brand_voice_summary,
       vocabulary_do = EXCLUDED.vocabulary_do,
       vocabulary_dont = EXCLUDED.vocabulary_dont,
       forbidden_topics = EXCLUDED.forbidden_topics,
       priority_topics = EXCLUDED.priority_topics,
       visual_identity = EXCLUDED.visual_identity,
       visual_guidelines = EXCLUDED.visual_guidelines,
       compliance_notes = EXCLUDED.compliance_notes,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      organizationId, scope.clientId, scope.contractId, input.toneOfVoice, input.persona,
      input.brandVoiceSummary, input.vocabularyDo, input.vocabularyDont, input.forbiddenTopics,
      input.priorityTopics, JSON.stringify(input.visualIdentity || {}), input.visualGuidelines || null,
      input.complianceNotes || null, input.status,
    ],
  )
  return mapBrandProfile(result.rows[0], true)
}

export async function getCompanyContextPreview(
  pool: pg.Pool,
  organizationId: string,
  query: string,
  includeDrafts = false,
): Promise<CompanyContextPreview> {
  const [companyProfile, brandProfile, products, knowledge] = await Promise.all([
    getCompanyProfile(pool, organizationId, true),
    getBrandProfile(pool, organizationId, true),
    pool.query<Row>(
      `SELECT id, name, description, value_proposition
         FROM public.marketing_products_services
        WHERE organization_id = $1 AND status = 'active'
        ORDER BY updated_at DESC LIMIT 12`,
      [organizationId],
    ),
    pool.query<Row>(
      `SELECT entry.id, source.id AS source_id, entry.title, entry.body, entry.status
         FROM public.knowledge_entries entry
         LEFT JOIN public.knowledge_sources source ON source.id = entry.source_id
        WHERE entry.organization_id = $1
          AND ($3::boolean OR entry.status IN ('approved', 'published'))
          AND (
            BTRIM($2) = ''
            OR to_tsvector('portuguese', COALESCE(entry.title, '') || ' ' || entry.body)
               @@ plainto_tsquery('portuguese', $2)
            OR entry.title ILIKE '%' || $2 || '%'
            OR entry.body ILIKE '%' || $2 || '%'
          )
        ORDER BY entry.updated_at DESC
        LIMIT 8`,
      [organizationId, query.trim(), includeDrafts],
    ),
  ])
  return {
    organizationId,
    companyProfile,
    brandProfile,
    products: products.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      valueProposition: row.value_proposition || undefined,
    })),
    knowledge: knowledge.rows.map(row => ({
      id: row.id,
      sourceId: row.source_id || undefined,
      title: row.title,
      body: row.body,
      status: row.status,
    })),
  }
}

export async function resolveMarketingScope(pool: pg.Pool, organizationId: string, requestedContractId?: string) {
  const result = await pool.query<{ client_id: string; contract_id: string }>(
    `SELECT organization.client_id, contract.id AS contract_id
       FROM public.organizations organization
       JOIN public.contracts contract ON contract.client_id = organization.client_id
      WHERE organization.id = $1
        AND ($2::uuid IS NULL OR contract.id = $2)
        AND contract.status = 'active'
      ORDER BY contract.starts_at DESC, contract.updated_at DESC
      LIMIT 1`,
    [organizationId, requestedContractId || null],
  )
  const row = result.rows[0]
  if (!row?.client_id || !row.contract_id) throw domainError(409, 'active_company_contract_required')
  return { clientId: row.client_id, contractId: row.contract_id }
}

export async function createKnowledgeShell(pool: pg.Pool, input: {
  organizationId: string
  contractId?: string
  title: string
  sourceType: 'manual' | 'url' | 'file' | 'faq' | 'integration'
  sourceUrl?: string
  documentType: 'brand' | 'product' | 'service' | 'faq' | 'case' | 'campaign' | 'policy' | 'other'
  visibility: 'internal' | 'external' | 'both'
  allowedAgentProfileKeys?: string[]
  blockedAgentProfileKeys?: string[]
  mimeType?: string
  byteSize?: number
  checksumSha256?: string
  metadata?: Record<string, unknown>
}) {
  const scope = await resolveMarketingScope(pool, input.organizationId, input.contractId)
  if (input.checksumSha256) await assertUniqueKnowledgeChecksum(pool, input.organizationId, input.checksumSha256)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const source = await client.query<{ id: string }>(
      `INSERT INTO public.knowledge_sources (
         organization_id, source_type, name, source_url, status, visibility,
         allowed_agent_profile_keys, blocked_agent_profile_keys, mime_type, byte_size,
         checksum_sha256, metadata
       ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING id`,
      [
        input.organizationId, input.sourceType, input.title, input.sourceUrl || null, input.visibility,
        input.allowedAgentProfileKeys || [], input.blockedAgentProfileKeys || [], input.mimeType || null,
        input.byteSize ?? null, input.checksumSha256 || null, JSON.stringify(input.metadata || {}),
      ],
    )
    const document = await client.query<{ id: string }>(
      `INSERT INTO public.marketing_knowledge_documents (
         organization_id, client_id, contract_id, source_id, title, document_type,
         status, source_url, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,'indexing',$7,$8::jsonb)
       RETURNING id`,
      [
        input.organizationId, scope.clientId, scope.contractId, source.rows[0].id, input.title,
        input.documentType, input.sourceUrl || null, JSON.stringify(input.metadata || {}),
      ],
    )
    await client.query('COMMIT')
    return { sourceId: source.rows[0].id, documentId: document.rows[0].id, ...scope }
  } catch (error) {
    await client.query('ROLLBACK')
    if (isUniqueViolation(error)) throw domainError(409, 'knowledge_source_already_exists')
    throw error
  } finally {
    client.release()
  }
}

export async function findKnowledgeDocumentByChecksum(
  pool: pg.Pool,
  organizationId: string,
  checksumSha256: string,
) {
  const result = await pool.query<Row>(
    `SELECT document.*, source.status AS source_status, source.source_type,
            source.visibility, source.allowed_agent_profile_keys,
            source.blocked_agent_profile_keys, source.checksum_sha256,
            source.metadata AS source_metadata, source.mime_type, source.byte_size
       FROM public.knowledge_sources source
       JOIN public.marketing_knowledge_documents document ON document.source_id = source.id
      WHERE source.organization_id = $1
        AND source.checksum_sha256 = $2
        AND source.status <> 'archived'
      ORDER BY document.updated_at DESC
      LIMIT 1`,
    [organizationId, checksumSha256],
  )
  return result.rows[0] ? mapKnowledgeDocument(result.rows[0]) : null
}

export async function attachKnowledgeFile(pool: pg.Pool, input: {
  sourceId: string
  documentId: string
  storagePath: string
  checksumSha256: string
  byteSize: number
  mimeType: string
}) {
  const source = await pool.query<{ organization_id: string }>(
    'SELECT organization_id FROM public.knowledge_sources WHERE id = $1 LIMIT 1',
    [input.sourceId],
  )
  if (!source.rows[0]) throw domainError(404, 'knowledge_source_not_found')
  await assertUniqueKnowledgeChecksum(pool, source.rows[0].organization_id, input.checksumSha256, input.sourceId)
  await pool.query(
    `UPDATE public.knowledge_sources
        SET storage_path = $2, checksum_sha256 = $3, byte_size = $4, mime_type = $5,
            processing_error = NULL, updated_at = NOW()
      WHERE id = $1`,
    [input.sourceId, input.storagePath, input.checksumSha256, input.byteSize, input.mimeType],
  )
  await pool.query(
    `UPDATE public.marketing_knowledge_documents
        SET storage_path = $2, updated_at = NOW()
      WHERE id = $1 AND source_id = $3`,
    [input.documentId, input.storagePath, input.sourceId],
  )
}

export async function completeKnowledgeIngestion(
  pool: pg.Pool,
  input: { sourceId: string; documentId: string; extracted: ExtractedKnowledge },
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const scope = await client.query<{
      organization_id: string
      client_id: string
      contract_id: string
      source_id: string
    }>(
      `SELECT document.organization_id, document.client_id, document.contract_id, document.source_id
         FROM public.marketing_knowledge_documents document
        WHERE document.id = $1 AND document.source_id = $2
        FOR UPDATE`,
      [input.documentId, input.sourceId],
    )
    const row = scope.rows[0]
    if (!row) throw domainError(404, 'knowledge_document_not_found')
    const existingEntry = await client.query<{ id: string }>(
      'SELECT id FROM public.knowledge_entries WHERE source_id = $1 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE',
      [input.sourceId],
    )
    let entryId = existingEntry.rows[0]?.id
    if (entryId) {
      await client.query(
        `UPDATE public.knowledge_entries
            SET title = $2, body = $3, status = 'draft', reviewer_user_id = NULL,
                reviewed_at = NULL, updated_at = NOW()
          WHERE id = $1`,
        [entryId, input.extracted.title, input.extracted.body],
      )
    } else {
      const entry = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_entries (organization_id, source_id, title, body, status)
         VALUES ($1,$2,$3,$4,'draft') RETURNING id`,
        [row.organization_id, input.sourceId, input.extracted.title, input.extracted.body],
      )
      entryId = entry.rows[0].id
    }
    await client.query('DELETE FROM public.marketing_knowledge_chunks WHERE document_id = $1', [input.documentId])
    for (const [index, chunk] of input.extracted.chunks.entries()) {
      const contentHash = createHash('sha256').update(chunk.body).digest('hex')
      await client.query(
        `INSERT INTO public.marketing_knowledge_chunks (
           organization_id, client_id, contract_id, document_id, entry_id,
           chunk_index, title, body, token_count, metadata, chunk_kind,
           source_locator, curation_status, content_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb,'raw',$10,'not_required',$11)`,
        [
          row.organization_id, row.client_id, row.contract_id, input.documentId, entryId,
          index, chunk.title || null, chunk.body, chunk.tokenCount, chunk.sourceLocator, contentHash,
        ],
      )
    }
    await client.query(
      `UPDATE public.marketing_knowledge_documents
          SET title = $2, status = 'indexed', summary = $3, updated_at = NOW()
        WHERE id = $1`,
      [input.documentId, input.extracted.title, input.extracted.body.slice(0, 500)],
    )
    await client.query(
      `UPDATE public.knowledge_sources
          SET name = $2, processing_error = NULL, updated_at = NOW()
        WHERE id = $1`,
      [input.sourceId, input.extracted.title],
    )
    await client.query('COMMIT')
    return { entryId, documentId: input.documentId, chunkCount: input.extracted.chunks.length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type CuratedKnowledgeChunkInput = {
  title?: string
  body: string
  chunkKind: 'curated_fact' | 'curated_summary'
  sourceLocator?: string
  evidenceExcerpt?: string
  qualityScore?: number
  metadata?: Record<string, unknown>
}

export async function createKnowledgeIntelligenceRun(pool: pg.Pool, documentId: string) {
  const result = await pool.query<Row>(
    `INSERT INTO public.knowledge_intelligence_runs (
       organization_id, client_id, contract_id, source_id, document_id,
       run_kind, status, stage, progress, started_at
     )
     SELECT organization_id, client_id, contract_id, source_id, id,
            'document_curation', 'running', 'extracting', 5, NOW()
       FROM public.marketing_knowledge_documents
      WHERE id = $1
      RETURNING *`,
    [documentId],
  )
  if (!result.rows[0]) throw domainError(404, 'knowledge_document_not_found')
  return mapIntelligenceRun(result.rows[0])
}

export async function createWebsiteOnboardingRun(pool: pg.Pool, input: {
  organizationId: string
  contractId?: string
  websiteUrl: string
  maxPages: number
  createdBy: string
}) {
  const scope = await resolveMarketingScope(pool, input.organizationId, input.contractId)
  const result = await pool.query<Row>(
    `INSERT INTO public.knowledge_intelligence_runs (
       organization_id, client_id, contract_id, run_kind, status, stage, progress,
       output_payload, created_by
     ) VALUES ($1,$2,$3,'website_onboarding','queued','queued',0,$4::jsonb,$5)
     RETURNING *`,
    [input.organizationId, scope.clientId, scope.contractId, JSON.stringify({ websiteUrl: input.websiteUrl, maxPages: input.maxPages }), input.createdBy],
  )
  return mapIntelligenceRun(result.rows[0])
}

export async function getWebsiteOnboardingRun(pool: pg.Pool, organizationId: string, runId: string) {
  const [run, suggestions] = await Promise.all([
    pool.query<Row>("SELECT * FROM public.knowledge_intelligence_runs WHERE id = $1 AND organization_id = $2 AND run_kind = 'website_onboarding' LIMIT 1", [runId, organizationId]),
    pool.query<Row>('SELECT * FROM public.company_intelligence_suggestions WHERE run_id = $1 AND organization_id = $2 ORDER BY confidence DESC, created_at', [runId, organizationId]),
  ])
  if (!run.rows[0]) throw domainError(404, 'website_onboarding_run_not_found')
  return { run: mapIntelligenceRun(run.rows[0]), suggestions: suggestions.rows.map(mapCompanySuggestion) }
}

export async function replaceCompanyIntelligenceSuggestions(pool: pg.Pool, runId: string, suggestions: Array<{
  suggestionKind: 'profile' | 'brand' | 'product'
  fieldPath: string
  suggestedValue: unknown
  evidenceExcerpt: string
  sourceUrl: string
  confidence: number
}>) {
  const runScope = await pool.query<{ organization_id: string }>('SELECT organization_id FROM public.knowledge_intelligence_runs WHERE id = $1', [runId])
  if (!runScope.rows[0]) throw domainError(404, 'website_onboarding_run_not_found')
  const organizationId = runScope.rows[0].organization_id
  const [profile, brand] = await Promise.all([
    getCompanyProfile(pool, organizationId, true),
    getBrandProfile(pool, organizationId, true),
  ])
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const run = await client.query<{ organization_id: string }>('SELECT organization_id FROM public.knowledge_intelligence_runs WHERE id = $1 FOR UPDATE', [runId])
    if (!run.rows[0]) throw domainError(404, 'website_onboarding_run_not_found')
    await client.query('DELETE FROM public.company_intelligence_suggestions WHERE run_id = $1', [runId])
    for (const suggestion of suggestions) {
      await client.query(
        `INSERT INTO public.company_intelligence_suggestions (
           run_id, organization_id, suggestion_kind, field_path, current_value, suggested_value,
           evidence_excerpt, source_url, confidence
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
         ON CONFLICT (run_id, field_path, source_url) DO UPDATE SET
           suggested_value = EXCLUDED.suggested_value, evidence_excerpt = EXCLUDED.evidence_excerpt,
           confidence = EXCLUDED.confidence, updated_at = NOW()`,
        [runId, run.rows[0].organization_id, suggestion.suggestionKind, suggestion.fieldPath,
          JSON.stringify(currentSuggestionValue(profile, brand, suggestion.suggestionKind, suggestion.fieldPath)),
          JSON.stringify(suggestion.suggestedValue), suggestion.evidenceExcerpt, suggestion.sourceUrl, suggestion.confidence],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function applyCompanyIntelligenceSuggestions(pool: pg.Pool, input: {
  organizationId: string
  runId: string
  suggestionIds: string[]
  suggestionEdits?: Array<{ id: string; suggestedValue: unknown }>
  userId: string
}) {
  const run = await getWebsiteOnboardingRun(pool, input.organizationId, input.runId)
  const editedValues = new Map((input.suggestionEdits || []).map(edit => [edit.id, edit.suggestedValue]))
  const selected = selectSuggestionsForApplication(run.suggestions, input.suggestionIds, editedValues)
  if (run.run.status === 'applied' && selected.length && selected.every(item => item.status === 'applied')) return run
  if (!['ready_for_review', 'degraded', 'failed'].includes(run.run.status)) throw domainError(409, 'website_onboarding_not_ready')
  if (!selected.length) throw domainError(400, 'website_onboarding_suggestions_required')
  const profile = await getCompanyProfile(pool, input.organizationId, true)
  const brand = await getBrandProfile(pool, input.organizationId, true)
  const nextProfile: CompanyProfileInput = {
    legalName: profile.legalName, tradeName: profile.tradeName, description: profile.description,
    websiteUrl: profile.websiteUrl || null, industry: profile.industry, positioning: profile.positioning,
    differentiators: profile.differentiators, emails: profile.emails, phones: profile.phones,
    address: profile.address, businessHours: profile.businessHours, serviceRegions: profile.serviceRegions,
    socialLinks: profile.socialLinks, internalNotes: profile.internalNotes || null,
  }
  const nextBrand: BrandProfileInput = brand ? {
    contractId: brand.contractId, toneOfVoice: brand.toneOfVoice, persona: brand.persona,
    brandVoiceSummary: brand.brandVoiceSummary, vocabularyDo: brand.vocabularyDo,
    vocabularyDont: brand.vocabularyDont, forbiddenTopics: brand.forbiddenTopics,
    priorityTopics: brand.priorityTopics, visualIdentity: brand.visualIdentity || {},
    visualGuidelines: brand.visualGuidelines || null,
    complianceNotes: brand.complianceNotes || null, status: brand.status,
  } : {
    contractId: run.run.contractId, toneOfVoice: '', persona: '', brandVoiceSummary: '',
    vocabularyDo: [], vocabularyDont: [], forbiddenTopics: [], priorityTopics: [],
    visualIdentity: {}, visualGuidelines: null, complianceNotes: null, status: 'draft',
  }
  let profileChanged = false
  let brandChanged = false
  const products: Array<Record<string, unknown>> = []
  for (const suggestion of selected) {
    const value = normalizeSuggestedValue(suggestion.suggestionKind, suggestion.fieldPath, suggestion.suggestedValue)
    if (value === undefined) continue
    if (suggestion.suggestionKind === 'profile' && suggestion.fieldPath in nextProfile) {
      ;(nextProfile as unknown as Record<string, unknown>)[suggestion.fieldPath] = value
      profileChanged = true
    } else if (suggestion.suggestionKind === 'brand' && suggestion.fieldPath in nextBrand) {
      ;(nextBrand as unknown as Record<string, unknown>)[suggestion.fieldPath] = value
      brandChanged = true
    } else if (suggestion.suggestionKind === 'product' && suggestion.fieldPath === 'products' && Array.isArray(value)) {
      products.push(...value as Array<Record<string, unknown>>)
    }
  }
  if (profileChanged) await upsertCompanyProfile(pool, input.organizationId, nextProfile)
  if (brandChanged) await upsertBrandProfile(pool, input.organizationId, nextBrand)
  for (const product of products.slice(0, 50)) {
    const name = typeof product.name === 'string' ? product.name.trim() : ''
    if (!name) continue
    await pool.query(
      `INSERT INTO public.marketing_products_services (
         organization_id, client_id, contract_id, name, description, value_proposition, status, metadata
       ) SELECT $1,$2,$3,$4,$5,$6,'active',$7::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM public.marketing_products_services WHERE organization_id = $1 AND LOWER(name) = LOWER($4) AND status <> 'archived'
       )`,
      [input.organizationId, run.run.clientId, run.run.contractId, name,
        typeof product.description === 'string' ? product.description : '',
        typeof product.valueProposition === 'string' ? product.valueProposition : null,
        JSON.stringify({ source: 'website_onboarding', runId: input.runId })],
    )
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const suggestion of selected) {
      if (!editedValues.has(suggestion.id)) continue
      await client.query(
        `UPDATE public.company_intelligence_suggestions
            SET suggested_value = $3::jsonb, updated_at = NOW()
          WHERE run_id = $1 AND id = $2`,
        [input.runId, suggestion.id, JSON.stringify(suggestion.suggestedValue)],
      )
    }
    await client.query(
      `UPDATE public.company_intelligence_suggestions
          SET status = 'applied', selected = TRUE, applied_by = $3, applied_at = NOW(), updated_at = NOW()
        WHERE run_id = $1 AND id = ANY($2::uuid[])`,
      [input.runId, selected.map(item => item.id), input.userId],
    )
    await client.query(
      `UPDATE public.company_intelligence_suggestions
          SET status = 'rejected', selected = FALSE, updated_at = NOW()
        WHERE run_id = $1 AND status = 'suggested'`,
      [input.runId],
    )
    await updateKnowledgeIntelligenceRun(client, input.runId, { status: 'applied', stage: 'completed', progress: 100, completed: true })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return getWebsiteOnboardingRun(pool, input.organizationId, input.runId)
}

export function selectSuggestionsForApplication<T extends { id: string; suggestedValue: unknown }>(
  suggestions: T[],
  suggestionIds: string[],
  editedValues: Map<string, unknown>,
): T[] {
  const requestedIds = new Set(suggestionIds)
  return suggestions
    .filter(item => requestedIds.has(item.id))
    .map(item => editedValues.has(item.id) ? { ...item, suggestedValue: editedValues.get(item.id) } : item)
}

export async function updateKnowledgeIntelligenceRun(pool: QueryExecutor, runId: string, input: {
  status?: 'running' | 'ready_for_review' | 'degraded' | 'failed' | 'applied' | 'cancelled'
  stage?: 'queued' | 'discovering' | 'extracting' | 'cleaning' | 'curating' | 'embedding' | 'ready_for_review' | 'applying' | 'completed' | 'failed'
  progress?: number
  provider?: string
  model?: string
  metrics?: Record<string, unknown>
  outputPayload?: Record<string, unknown>
  errorMessage?: string | null
  completed?: boolean
  sourceId?: string
  documentId?: string
}) {
  await pool.query(
    `UPDATE public.knowledge_intelligence_runs SET
       status = COALESCE($2, status), stage = COALESCE($3, stage),
       progress = COALESCE($4, progress), provider = COALESCE($5, provider),
       model = COALESCE($6, model), metrics = metrics || $7::jsonb,
       output_payload = output_payload || $8::jsonb, error_message = $9,
       completed_at = CASE WHEN $10::boolean THEN NOW() ELSE completed_at END,
       source_id = COALESCE($11, source_id), document_id = COALESCE($12, document_id),
       updated_at = NOW()
     WHERE id = $1`,
    [runId, input.status || null, input.stage || null, input.progress ?? null, input.provider || null,
      input.model || null, JSON.stringify(input.metrics || {}), JSON.stringify(input.outputPayload || {}),
      input.errorMessage ?? null, Boolean(input.completed), input.sourceId || null, input.documentId || null],
  )
}

export async function replaceCuratedKnowledgeChunks(pool: pg.Pool, documentId: string, chunks: CuratedKnowledgeChunkInput[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const scope = await client.query<Row>(
      `SELECT organization_id, client_id, contract_id,
              (SELECT id FROM public.knowledge_entries WHERE source_id = document.source_id ORDER BY updated_at DESC LIMIT 1) AS entry_id
         FROM public.marketing_knowledge_documents document
        WHERE id = $1 FOR UPDATE`,
      [documentId],
    )
    const row = scope.rows[0]
    if (!row) throw domainError(404, 'knowledge_document_not_found')
    await client.query("DELETE FROM public.marketing_knowledge_chunks WHERE document_id = $1 AND chunk_kind <> 'raw'", [documentId])
    const indexResult = await client.query<{ next_index: number }>(
      'SELECT COALESCE(MAX(chunk_index), -1) + 1 AS next_index FROM public.marketing_knowledge_chunks WHERE document_id = $1',
      [documentId],
    )
    let index = Number(indexResult.rows[0]?.next_index || 0)
    const inserted: Array<{ id: string; body: string }> = []
    for (const chunk of chunks) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.marketing_knowledge_chunks (
           organization_id, client_id, contract_id, document_id, entry_id, chunk_index,
           title, body, token_count, metadata, chunk_kind, source_locator,
           evidence_excerpt, quality_score, curation_status, content_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,'pending',$15)
         RETURNING id`,
        [row.organization_id, row.client_id, row.contract_id, documentId, row.entry_id, index,
          chunk.title || null, chunk.body, Math.max(1, Math.ceil(chunk.body.length / 4)),
          JSON.stringify(chunk.metadata || {}), chunk.chunkKind, chunk.sourceLocator || null,
          chunk.evidenceExcerpt || null, chunk.qualityScore ?? null,
          createHash('sha256').update(chunk.body).digest('hex')],
      )
      inserted.push({ id: result.rows[0].id, body: chunk.body })
      index += 1
    }
    const summary = chunks.find(chunk => chunk.chunkKind === 'curated_summary')?.body
    if (summary) await client.query('UPDATE public.marketing_knowledge_documents SET summary = $2, updated_at = NOW() WHERE id = $1', [documentId, summary.slice(0, 2_000)])
    await client.query('COMMIT')
    return inserted
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function attachCuratedKnowledgeEmbeddings(pool: pg.Pool, input: {
  chunks: Array<{ id: string; vector: number[] }>
  model: string
  dimensions: number
}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const chunk of input.chunks) {
      await client.query(
        `UPDATE public.marketing_knowledge_chunks
            SET embedding = $2::jsonb, embedding_model = $3, embedding_dimensions = $4, updated_at = NOW()
          WHERE id = $1`,
        [chunk.id, JSON.stringify(chunk.vector), input.model, input.dimensions],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getKnowledgeProcessing(pool: pg.Pool, documentId: string) {
  const [run, chunks] = await Promise.all([
    pool.query<Row>('SELECT * FROM public.knowledge_intelligence_runs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1', [documentId]),
    pool.query<Row>(
      `SELECT id, chunk_kind, title, body, source_locator, evidence_excerpt,
              quality_score, curation_status, embedding_model, embedding_dimensions, metadata
         FROM public.marketing_knowledge_chunks
        WHERE document_id = $1 AND chunk_kind <> 'raw'
        ORDER BY chunk_index`,
      [documentId],
    ),
  ])
  return {
    run: run.rows[0] ? mapIntelligenceRun(run.rows[0]) : null,
    chunks: chunks.rows.map(row => ({
      id: row.id, chunkKind: row.chunk_kind, title: row.title || undefined, body: row.body,
      sourceLocator: row.source_locator || undefined, evidenceExcerpt: row.evidence_excerpt || undefined,
      qualityScore: row.quality_score == null ? undefined : Number(row.quality_score),
      curationStatus: row.curation_status, embeddingModel: row.embedding_model || undefined,
      embeddingDimensions: row.embedding_dimensions || undefined, metadata: row.metadata || {},
    })),
  }
}

export async function reviewCuratedKnowledgeChunk(pool: pg.Pool, documentId: string, chunkId: string, status: 'approved' | 'rejected') {
  const result = await pool.query<Row>(
    `UPDATE public.marketing_knowledge_chunks
        SET curation_status = $3, updated_at = NOW()
      WHERE id = $2 AND document_id = $1 AND chunk_kind <> 'raw'
      RETURNING id, chunk_kind, body, source_locator, evidence_excerpt, quality_score, curation_status, metadata`,
    [documentId, chunkId, status],
  )
  if (!result.rows[0]) throw domainError(404, 'knowledge_curated_chunk_not_found')
  return result.rows[0]
}

export async function markKnowledgeIngestionFailed(pool: pg.Pool, sourceId: string, documentId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
  await Promise.all([
    pool.query('UPDATE public.knowledge_sources SET processing_error = $2, updated_at = NOW() WHERE id = $1', [sourceId, message]),
    pool.query("UPDATE public.marketing_knowledge_documents SET status = 'draft', updated_at = NOW() WHERE id = $1", [documentId]),
  ])
}

export async function markKnowledgeProcessingState(pool: pg.Pool, documentId: string, status: 'indexing' | 'indexed') {
  await pool.query('UPDATE public.marketing_knowledge_documents SET status = $2, updated_at = NOW() WHERE id = $1', [documentId, status])
}

export async function listKnowledgeDocuments(pool: pg.Pool, organizationId: string) {
  const result = await pool.query<Row>(
    `SELECT document.*, source.source_type, source.name AS source_name,
            source.status AS source_status, source.visibility,
            source.allowed_agent_profile_keys, source.blocked_agent_profile_keys,
            source.mime_type, source.byte_size, source.checksum_sha256,
            source.processing_error, source.metadata AS source_metadata,
            entry.id AS entry_id, entry.status AS entry_status,
            LEFT(entry.body, 2000) AS body_preview
       FROM public.marketing_knowledge_documents document
       JOIN public.knowledge_sources source ON source.id = document.source_id
       LEFT JOIN LATERAL (
         SELECT id, status, body FROM public.knowledge_entries
          WHERE source_id = source.id ORDER BY updated_at DESC LIMIT 1
       ) entry ON TRUE
      WHERE document.organization_id = $1
      ORDER BY document.updated_at DESC`,
    [organizationId],
  )
  return result.rows.map(mapKnowledgeDocument)
}

export async function getKnowledgeDocument(pool: pg.Pool, documentId: string) {
  const result = await pool.query<Row>(
    `SELECT document.*, source.source_type, source.name AS source_name,
            source.status AS source_status, source.visibility,
            source.allowed_agent_profile_keys, source.blocked_agent_profile_keys,
            source.mime_type, source.byte_size, source.checksum_sha256,
            source.processing_error, source.metadata AS source_metadata,
            entry.id AS entry_id, entry.status AS entry_status,
            entry.body AS body_preview
       FROM public.marketing_knowledge_documents document
       JOIN public.knowledge_sources source ON source.id = document.source_id
       LEFT JOIN LATERAL (
         SELECT id, status, body FROM public.knowledge_entries
          WHERE source_id = source.id ORDER BY updated_at DESC LIMIT 1
       ) entry ON TRUE
      WHERE document.id = $1 LIMIT 1`,
    [documentId],
  )
  if (!result.rows[0]) throw domainError(404, 'knowledge_document_not_found')
  return mapKnowledgeDocument(result.rows[0])
}

export async function updateKnowledgeGovernance(pool: pg.Pool, documentId: string, input: {
  title?: string
  documentType?: string
  visibility?: 'internal' | 'external' | 'both'
  allowedAgentProfileKeys?: string[]
  blockedAgentProfileKeys?: string[]
}) {
  const current = await getKnowledgeDocument(pool, documentId)
  await Promise.all([
    pool.query(
      `UPDATE public.knowledge_sources SET
         name = COALESCE($2, name), visibility = COALESCE($3, visibility),
         allowed_agent_profile_keys = COALESCE($4, allowed_agent_profile_keys),
         blocked_agent_profile_keys = COALESCE($5, blocked_agent_profile_keys), updated_at = NOW()
       WHERE id = $1`,
      [current.sourceId, input.title || null, input.visibility || null, input.allowedAgentProfileKeys || null, input.blockedAgentProfileKeys || null],
    ),
    pool.query(
      `UPDATE public.marketing_knowledge_documents SET
         title = COALESCE($2, title), document_type = COALESCE($3, document_type), updated_at = NOW()
       WHERE id = $1`,
      [documentId, input.title || null, input.documentType || null],
    ),
  ])
  return getKnowledgeDocument(pool, documentId)
}

export async function publishKnowledgeDocument(pool: pg.Pool, documentId: string, reviewerUserId: string, allowDegradedRaw = false) {
  const current = await getKnowledgeDocument(pool, documentId)
  if (!current.entryId || current.status !== 'indexed') throw domainError(409, 'knowledge_document_not_ready')
  const review = await pool.query<{ pending: number; approved: number; curated: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE curation_status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE curation_status = 'approved')::int AS approved,
       COUNT(*)::int AS curated
     FROM public.marketing_knowledge_chunks
     WHERE document_id = $1 AND chunk_kind <> 'raw'`,
    [documentId],
  )
  const counts = review.rows[0]
  if (Number(counts.pending) > 0) throw domainError(409, 'knowledge_review_pending')
  if (Number(counts.approved) === 0 && !allowDegradedRaw) throw domainError(409, 'knowledge_degraded_confirmation_required')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (Number(counts.approved) > 0) {
      await client.query(
        `UPDATE public.knowledge_entries entry SET
           body = curated.body, updated_at = NOW()
         FROM (
           SELECT entry_id, STRING_AGG(body, E'\n\n' ORDER BY chunk_index) AS body
             FROM public.marketing_knowledge_chunks
            WHERE document_id = $1 AND chunk_kind <> 'raw' AND curation_status = 'approved'
            GROUP BY entry_id
         ) curated
         WHERE entry.id = curated.entry_id AND entry.id = $2`,
        [documentId, current.entryId],
      )
    }
    await client.query("UPDATE public.knowledge_sources SET status = 'published', updated_at = NOW() WHERE id = $1", [current.sourceId])
    await client.query(
      `UPDATE public.knowledge_entries SET status = 'published', reviewer_user_id = $2,
         reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [current.entryId, reviewerUserId],
    )
    await client.query("UPDATE public.marketing_knowledge_documents SET status = 'published', updated_at = NOW() WHERE id = $1", [documentId])
    await client.query(
      `INSERT INTO public.knowledge_publications (organization_id, entry_id, body_snapshot, publisher_user_id)
       SELECT organization_id, id, body, $2 FROM public.knowledge_entries WHERE id = $1`,
      [current.entryId, reviewerUserId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return getKnowledgeDocument(pool, documentId)
}

export async function archiveKnowledgeDocument(pool: pg.Pool, documentId: string) {
  const current = await getKnowledgeDocument(pool, documentId)
  await Promise.all([
    pool.query("UPDATE public.knowledge_sources SET status = 'archived', updated_at = NOW() WHERE id = $1", [current.sourceId]),
    pool.query("UPDATE public.knowledge_entries SET status = 'archived', updated_at = NOW() WHERE source_id = $1", [current.sourceId]),
    pool.query("UPDATE public.marketing_knowledge_documents SET status = 'archived', updated_at = NOW() WHERE id = $1", [documentId]),
  ])
  return getKnowledgeDocument(pool, documentId)
}

export async function getKnowledgeUploadLimitMb(pool: pg.Pool, organizationId: string) {
  const [global, organization] = await Promise.all([
    pool.query<{ value: any }>("SELECT value FROM public.system_config WHERE key = 'global_max_upload_size_mb' LIMIT 1"),
    pool.query<{ max_upload_size_mb: number | null }>('SELECT max_upload_size_mb FROM public.omnichannel_settings WHERE organization_id = $1 LIMIT 1', [organizationId]),
  ])
  const globalLimit = Number(global.rows[0]?.value?.limit || 10)
  return Number(organization.rows[0]?.max_upload_size_mb || globalLimit || 10)
}

async function assertUniqueKnowledgeChecksum(
  pool: pg.Pool,
  organizationId: string | undefined,
  checksum: string,
  excludeSourceId?: string,
) {
  const result = await pool.query(
    `SELECT id FROM public.knowledge_sources
      WHERE checksum_sha256 = $1 AND status <> 'archived'
        AND ($2::uuid IS NULL OR organization_id = $2)
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1`,
    [checksum, organizationId || null, excludeSourceId || null],
  )
  if (result.rows[0]) throw domainError(409, 'knowledge_file_already_exists')
}

function mapKnowledgeDocument(row: Row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    sourceId: row.source_id,
    entryId: row.entry_id || undefined,
    title: row.title,
    documentType: row.document_type,
    status: row.status,
    sourceType: row.source_type,
    sourceStatus: row.source_status,
    visibility: row.visibility || 'both',
    allowedAgentProfileKeys: row.allowed_agent_profile_keys || [],
    blockedAgentProfileKeys: row.blocked_agent_profile_keys || [],
    storagePath: row.storage_path || undefined,
    sourceUrl: row.source_url || undefined,
    mimeType: row.mime_type || undefined,
    byteSize: row.byte_size === null || row.byte_size === undefined ? undefined : Number(row.byte_size),
    checksumSha256: row.checksum_sha256 || undefined,
    summary: row.summary || undefined,
    bodyPreview: row.body_preview || undefined,
    processingError: row.processing_error || undefined,
    metadata: row.source_metadata || row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapIntelligenceRun(row: Row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id || undefined,
    contractId: row.contract_id || undefined,
    sourceId: row.source_id || undefined,
    documentId: row.document_id || undefined,
    runKind: row.run_kind,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress || 0),
    provider: row.provider || undefined,
    model: row.model || undefined,
    metrics: row.metrics || {},
    outputPayload: row.output_payload || {},
    errorMessage: row.error_message || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCompanySuggestion(row: Row) {
  return {
    id: row.id,
    runId: row.run_id,
    organizationId: row.organization_id,
    suggestionKind: row.suggestion_kind,
    fieldPath: row.field_path,
    currentValue: row.current_value,
    suggestedValue: row.suggested_value,
    evidenceExcerpt: row.evidence_excerpt,
    sourceUrl: row.source_url,
    confidence: Number(row.confidence || 0),
    selected: Boolean(row.selected),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeSuggestedValue(kind: string, field: string, value: unknown): unknown | undefined {
  const stringFields = new Set(['legalName', 'tradeName', 'description', 'websiteUrl', 'industry', 'positioning', 'toneOfVoice', 'persona', 'brandVoiceSummary', 'visualGuidelines'])
  const listFields = new Set(['differentiators', 'emails', 'phones', 'serviceRegions', 'vocabularyDo', 'vocabularyDont', 'priorityTopics'])
  const recordFields = new Set(['address', 'businessHours', 'socialLinks'])
  if (stringFields.has(field)) return typeof value === 'string' ? value.trim().slice(0, 20_000) : undefined
  if (listFields.has(field)) return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 100) : undefined
  if (field === 'visualIdentity') return normalizeVisualIdentity(value)
  if (recordFields.has(field)) return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  if (kind === 'product' && field === 'products') return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 50) : undefined
  return undefined
}

function normalizeVisualIdentity(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const strings = (field: string, limit = 20) => Array.isArray(input[field])
    ? input[field].filter(item => typeof item === 'string').map(item => item.trim().slice(0, 300)).filter(Boolean).slice(0, limit)
    : []
  const text = (field: string) => typeof input[field] === 'string' ? input[field].trim().slice(0, 5_000) : ''
  return {
    logoUrl: text('logoUrl'),
    colors: strings('colors'),
    typography: strings('typography'),
    designStyle: text('designStyle'),
    imageryStyle: text('imageryStyle'),
    graphicElements: strings('graphicElements'),
  }
}

function currentSuggestionValue(profile: Row, brand: Row | null, kind: string, field: string) {
  if (kind === 'profile') return profile[field] ?? null
  if (kind === 'brand') return brand?.[field] ?? null
  return null
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && Reflect.get(error, 'code') === '23505')
}

function mapCompanyProfile(row: Row, includeInternal: boolean) {
  return {
    id: row.id || undefined,
    organizationId: row.organization_id,
    clientId: row.client_id || undefined,
    legalName: row.legal_name || row.company_name || row.organization_name || '',
    tradeName: row.trade_name || row.company_name || row.organization_name || '',
    description: row.description || '',
    websiteUrl: row.website_url || row.client_website || undefined,
    industry: row.industry || row.sector || '',
    positioning: row.positioning || '',
    differentiators: row.differentiators || [],
    emails: row.emails?.length ? row.emails : row.client_email ? [row.client_email] : [],
    phones: row.phones?.length ? row.phones : row.client_phone ? [row.client_phone] : [],
    address: row.address || row.client_address || {},
    businessHours: row.business_hours || {},
    serviceRegions: row.service_regions || [],
    socialLinks: row.social_links || {},
    ...(includeInternal ? { internalNotes: row.internal_notes || row.client_notes || undefined } : {}),
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  }
}

function mapBrandProfile(row: Row, includeCompliance: boolean) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    toneOfVoice: row.tone_of_voice || '',
    persona: row.persona || '',
    brandVoiceSummary: row.brand_voice_summary || '',
    vocabularyDo: row.vocabulary_do || [],
    vocabularyDont: row.vocabulary_dont || [],
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    visualIdentity: row.visual_identity || {},
    visualGuidelines: row.visual_guidelines || undefined,
    ...(includeCompliance ? { complianceNotes: row.compliance_notes || undefined } : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
