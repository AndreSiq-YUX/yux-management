import type pg from 'pg'
import type { BrandProfileInput, CompanyContextPreview, CompanyProfileInput } from './types.js'
import type { ExtractedKnowledge } from './text-extraction.js'

type Row = Record<string, any>

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
       visual_guidelines, compliance_notes, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (contract_id) DO UPDATE SET
       tone_of_voice = EXCLUDED.tone_of_voice,
       persona = EXCLUDED.persona,
       brand_voice_summary = EXCLUDED.brand_voice_summary,
       vocabulary_do = EXCLUDED.vocabulary_do,
       vocabulary_dont = EXCLUDED.vocabulary_dont,
       forbidden_topics = EXCLUDED.forbidden_topics,
       priority_topics = EXCLUDED.priority_topics,
       visual_guidelines = EXCLUDED.visual_guidelines,
       compliance_notes = EXCLUDED.compliance_notes,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      organizationId, scope.clientId, scope.contractId, input.toneOfVoice, input.persona,
      input.brandVoiceSummary, input.vocabularyDo, input.vocabularyDont, input.forbiddenTopics,
      input.priorityTopics, input.visualGuidelines || null, input.complianceNotes || null, input.status,
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
      await client.query(
        `INSERT INTO public.marketing_knowledge_chunks (
           organization_id, client_id, contract_id, document_id, entry_id,
           chunk_index, title, body, token_count, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb)`,
        [
          row.organization_id, row.client_id, row.contract_id, input.documentId, entryId,
          index, chunk.title || null, chunk.body, chunk.tokenCount,
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

export async function markKnowledgeIngestionFailed(pool: pg.Pool, sourceId: string, documentId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
  await Promise.all([
    pool.query('UPDATE public.knowledge_sources SET processing_error = $2, updated_at = NOW() WHERE id = $1', [sourceId, message]),
    pool.query("UPDATE public.marketing_knowledge_documents SET status = 'draft', updated_at = NOW() WHERE id = $1", [documentId]),
  ])
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

export async function publishKnowledgeDocument(pool: pg.Pool, documentId: string, reviewerUserId: string) {
  const current = await getKnowledgeDocument(pool, documentId)
  if (!current.entryId || current.status !== 'indexed') throw domainError(409, 'knowledge_document_not_ready')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
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
