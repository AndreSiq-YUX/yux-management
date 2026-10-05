import { describe, expect, it } from 'vitest'
import { assertB2bDeliveryRights, formatB2bProspectCsv } from '../src/modules/radar/b2b-delivery.js'
import { approveRadarB2bProspect } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser

class ReviewPool {
  queries: string[] = []
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string) {
    this.queries.push(sql)
    if (sql.includes('FROM public.radar_campaigns campaign')) return { rows: [{ configuration_revision: 1 }] }
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: true }] }
    if (sql.includes('FROM public.radar_b2b_reviews review')) return { rows: [{
      candidate_id: 'candidate', target_status: 'review', normalized_payload: { websiteStatus: 'unknown' },
    }] }
    if (sql.includes('FROM public.radar_candidate_records') && sql.includes('FOR UPDATE')) {
      return { rows: [{ campaign_id: 'campaign' }] }
    }
    return { rows: [] }
  }
}

describe('B2B prospect delivery', () => {
  it('exports only the fields selected for the campaign in the selected order', () => {
    const csv = formatB2bProspectCsv([{ name: 'Empresa Alfa', cnpj: '12345678000190', phone: '123', email: 'a@example.test' }], ['phone','name'])
    expect(csv).toBe('\uFEFF"Telefone";"Empresa"\r\n"123";"Empresa Alfa"\r\n')
    expect(csv).not.toContain('12345678000190')
    expect(csv).not.toContain('a@example.test')
  })
  it('requires checkbox confirmations for CNPJa and, when used, Brave without contract references', () => {
    expect(() => assertB2bDeliveryRights({}, undefined, false)).toThrow('radar_cnpja_client_delivery_not_approved')
    const cnpja = { clientDeliveryLicensed: true }
    expect(() => assertB2bDeliveryRights(cnpja, undefined, false)).not.toThrow()
    expect(() => assertB2bDeliveryRights({ ...cnpja, licenseReference: '' }, undefined, false)).not.toThrow()
    expect(() => assertB2bDeliveryRights(cnpja, {}, true)).toThrow('radar_brave_client_delivery_not_approved')
    expect(() => assertB2bDeliveryRights(cnpja, { retentionLicensed: true, clientDeliveryLicensed: true,
      credentialPurpose: 'licensed_retention' }, true)).not.toThrow()
    for (const clientDeliveryLicensed of [false, undefined, 'true']) {
      expect(() => assertB2bDeliveryRights({ clientDeliveryLicensed, licenseReference: 'CNPJA-1' }, undefined, false))
        .toThrow('radar_cnpja_client_delivery_not_approved')
      expect(() => assertB2bDeliveryRights(cnpja, { retentionLicensed: true, clientDeliveryLicensed,
        credentialPurpose: 'licensed_retention', licenseReference: 'BRAVE-1' }, true))
        .toThrow('radar_brave_client_delivery_not_approved')
    }
    expect(() => assertB2bDeliveryRights(cnpja, { retentionLicensed: false, clientDeliveryLicensed: true,
      credentialPurpose: 'licensed_retention' }, true)).toThrow('radar_brave_client_delivery_not_approved')
  })

  it('exports verified facts and neutralizes spreadsheet formula injection', () => {
    const csv = formatB2bProspectCsv([{ name: '=HYPERLINK("https://bad.example")', cnpj: '12345678000190',
      city: 'Belo Horizonte', state: 'MG', websiteUrl: 'https://alfa.example', phone: '3133334444',
      email: 'contato@alfa.example', targetStatus: 'confirmed', productFit: 'possible',
      evidenceUrl: 'https://alfa.example/', checkedAt: '2026-09-30T00:00:00.000Z',
      verificationMethod: 'manual', reviewNote: 'Atividade confirmada pela fonte pública.' }])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain('12345678000190')
    expect(csv).not.toContain('\r\n=HYPERLINK')
  })

  it('requires a documented public source for a human-confirmed prospect without a website', async () => {
    const pool = new ReviewPool()
    await expect(approveRadarB2bProspect(pool as never, admin,
      { organizationId: 'org', candidateId: 'candidate' }))
      .rejects.toThrow('radar_b2b_manual_evidence_required')
    expect(pool.queries.some(sql => sql.includes('manual_confirmation'))).toBe(false)
    await approveRadarB2bProspect(pool as never, admin, { organizationId: 'org', candidateId: 'candidate',
      manualEvidenceUrl: 'https://directory.example/cozinhas/alfa',
      manualReviewNote: 'Fonte pública confirma que a empresa opera cozinha industrial.' })
    expect(pool.queries.some(sql => sql.includes('manual_confirmation'))).toBe(true)
    expect(pool.queries.some(sql => sql.includes("verification_method = 'manual'"))).toBe(true)
  })
})
