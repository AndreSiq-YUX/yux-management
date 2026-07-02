import type pg from 'pg'
import type { RadarCompanyRecordRow } from './types.js'

type Queryable = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<pg.QueryResult<T>>
}

type DuplicateMatch = {
  duplicateCompanyRecordId: string
  matchType: 'cnpj' | 'domain' | 'phone' | 'name_city'
  confidenceScore: number
}

export function normalizeRadarDomain(value?: string | null) {
  if (!value) return ''
  try {
    const parsed = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`)
    return parsed.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return normalizeToken(value)
  }
}

export function normalizeRadarPhone(value?: string | null) {
  return value?.replace(/\D/g, '') ?? ''
}

export function normalizeRadarCompanyName(value?: string | null) {
  return normalizeToken(value ?? '')
}

export function getDuplicateMatchForRows(company: RadarCompanyRecordRow, other: RadarCompanyRecordRow): DuplicateMatch | null {
  if (company.id === other.id) return null
  if (company.cnpj && other.cnpj && normalizeRadarPhone(company.cnpj) === normalizeRadarPhone(other.cnpj)) {
    return { duplicateCompanyRecordId: other.id, matchType: 'cnpj', confidenceScore: 100 }
  }
  if (company.website_url && other.website_url && normalizeRadarDomain(company.website_url) === normalizeRadarDomain(other.website_url)) {
    return { duplicateCompanyRecordId: other.id, matchType: 'domain', confidenceScore: 92 }
  }
  if (company.phone_raw && other.phone_raw && normalizeRadarPhone(company.phone_raw) === normalizeRadarPhone(other.phone_raw)) {
    return { duplicateCompanyRecordId: other.id, matchType: 'phone', confidenceScore: 88 }
  }
  const sameCity = normalizeToken(company.city ?? '') === normalizeToken(other.city ?? '')
  const sameState = normalizeToken(company.state ?? '') === normalizeToken(other.state ?? '')
  const leftName = normalizeRadarCompanyName(company.trade_name || company.legal_name)
  const rightName = normalizeRadarCompanyName(other.trade_name || other.legal_name)
  if (sameCity && sameState && leftName && rightName && nameSimilarity(leftName, rightName) >= 0.78) {
    return { duplicateCompanyRecordId: other.id, matchType: 'name_city', confidenceScore: 78 }
  }
  return null
}

export async function createRadarDuplicateCandidates(queryable: Queryable, company: RadarCompanyRecordRow, campaignId: string) {
  const candidates = await queryable.query<RadarCompanyRecordRow>(
    `SELECT *
     FROM public.radar_company_records
     WHERE organization_id = $1
       AND id <> $2
       AND (
         ($3::TEXT IS NOT NULL AND cnpj = $3)
         OR ($4::TEXT IS NOT NULL AND website_url IS NOT NULL)
         OR ($5::TEXT IS NOT NULL AND phone_raw = $5)
         OR (LOWER(COALESCE(city,'')) = LOWER(COALESCE($6::TEXT,'')) AND LOWER(COALESCE(state,'')) = LOWER(COALESCE($7::TEXT,'')))
       )
     ORDER BY updated_at DESC
     LIMIT 20`,
    [
      company.organization_id,
      company.id,
      company.cnpj,
      company.website_url,
      company.phone_raw,
      company.city,
      company.state,
    ],
  )

  const inserted: DuplicateMatch[] = []
  for (const candidate of candidates.rows) {
    const match = getDuplicateMatchForRows(company, candidate)
    if (!match) continue
    await queryable.query(
      `INSERT INTO public.radar_duplicate_candidates (
         organization_id, campaign_id, company_record_id, duplicate_company_record_id, match_type, confidence_score, status
       )
       SELECT $1,$2,$3,$4,$5,$6,'pending'
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.radar_duplicate_candidates
         WHERE company_record_id = $3
           AND duplicate_company_record_id = $4
           AND status IN ('pending','confirmed','dismissed','merged')
       )`,
      [company.organization_id, campaignId, company.id, match.duplicateCompanyRecordId, match.matchType, match.confidenceScore],
    )
    inserted.push(match)
  }
  return inserted
}

function normalizeToken(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function nameSimilarity(left: string, right: string) {
  const leftWords = new Set(left.split(/\s+/).filter(Boolean))
  const rightWords = new Set(right.split(/\s+/).filter(Boolean))
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  const intersection = Array.from(leftWords).filter(word => rightWords.has(word)).length
  return intersection / Math.max(leftWords.size, rightWords.size)
}

