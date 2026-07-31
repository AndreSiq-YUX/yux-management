import { describe, expect, it } from 'vitest'
import { getDuplicateMatchForRows, normalizeRadarDomain, normalizeRadarPhone } from '../src/modules/radar/dedupe.js'
import type { RadarCompanyRecordRow } from '../src/modules/radar/types.js'

const base = {
  id: 'company-a',
  organization_id: 'org',
  cnpj: null,
  legal_name: null,
  trade_name: 'Clinica Boa Vida',
  cnae_main: null,
  city: 'Londrina',
  state: 'PR',
  address: null,
  phone_raw: null,
  email_raw: null,
  website_url: null,
  source_type: 'manual',
  source_url: null,
  source_collected_at: '2026-07-02T00:00:00.000Z',
  dedupe_key: 'name_city:clinica-boa-vida:londrina:pr',
  dedupe_status: 'unique',
  record_status: 'active',
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
} satisfies RadarCompanyRecordRow

describe('radar dedupe', () => {
  it('normalizes domains and phones', () => {
    expect(normalizeRadarDomain('https://www.Exemplo.com.br/contato')).toBe('exemplo.com.br')
    expect(normalizeRadarPhone('(43) 99999-0000')).toBe('43999990000')
  })

  it('detects domain duplicates before weaker name matches', () => {
    const match = getDuplicateMatchForRows(
      { ...base, website_url: 'https://boavida.com.br' },
      { ...base, id: 'company-b', website_url: 'https://www.boavida.com.br/contato' },
    )

    expect(match).toEqual({ duplicateCompanyRecordId: 'company-b', matchType: 'domain', confidenceScore: 92 })
  })

  it('detects same name in the same city and state', () => {
    const match = getDuplicateMatchForRows(
      base,
      { ...base, id: 'company-b', trade_name: 'Boa Vida Clinica', city: 'Londrina', state: 'PR' },
    )

    expect(match).toEqual({ duplicateCompanyRecordId: 'company-b', matchType: 'name_city', confidenceScore: 78 })
  })
})

