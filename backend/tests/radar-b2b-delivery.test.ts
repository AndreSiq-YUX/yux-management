import { describe, expect, it } from 'vitest'
import { assertB2bDeliveryRights, formatB2bProspectCsv } from '../src/modules/radar/b2b-delivery.js'
import { approveRadarB2bProspect } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'
import { radarCompanyExportFields } from '../src/modules/radar/research-export.js'

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
  it('retains genuine company emails and sourced descriptions matching a supplier name',()=>{
    const csv=formatB2bProspectCsv([{name:'Brave Transportes',cnpj:'1128426000198',email:'compras@brave.com.br',supplierEmails:'compras@brave.com.br',companySummary:'Brave Transportes atende fabricantes [https://brave.com.br/]',contactSources:'email: https://brave.com.br/contato (2026-10-15)',reviewNote:'brave_web_search aguardando'}],['email','supplierEmails','companySummary','contactSources','reviewNote'])
    expect(csv).toContain('compras@brave.com.br');expect(csv).toContain('Brave Transportes atende fabricantes');expect(csv).toContain('https://brave.com.br/contato');expect(csv).not.toContain('brave_web_search')
    expect(formatB2bProspectCsv([{name:'Brave Transportes',cnpj:'1128426000198',companySummary:'BRAVE TRANSPORTES atende fabricantes'}],['companySummary'])).toContain('BRAVE TRANSPORTES atende fabricantes')
  })
  it('does not publish operational provider notes or API URLs in customer CSV',()=>{
    const csv=formatB2bProspectCsv([{name:'Brave Transportes',cnpj:'1128426000198',reviewNote:'OpenRouter model secret-model',verificationMethod:'brave_web_search',evidenceUrl:'https://api.search.brave.com/res/v1/web/search?token=secret'}],['name','cnpj','reviewNote','verificationMethod','evidenceUrl'])
    expect(csv).toContain('Brave Transportes');expect(csv).toContain('1128426000198')
    expect(csv).not.toMatch(/OpenRouter|secret-model|brave_web|api.search|token=/)
  })
  it('requires separate Serper web delivery permission only when those facts were used',()=>{
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,{},true)).toThrow('radar_serper_client_delivery_not_approved')
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,{webSearchLicensed:true,clientDeliveryLicensed:true},true)).not.toThrow()
  })
  it('checks Search, Agent and Places origin permissions independently of discovery admission',()=>{
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,undefined,false,{},true)).toThrow('radar_perplexity_client_delivery_not_approved')
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,undefined,false,{retentionLicensed:true,clientDeliveryLicensed:true},true)).not.toThrow()
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,{clientDeliveryLicensed:true},false,undefined,false,true)).toThrow('radar_serper_places_client_delivery_not_approved')
    expect(()=>assertB2bDeliveryRights({clientDeliveryLicensed:true},undefined,false,{placesRetentionLicensed:true,clientDeliveryLicensed:true},false,undefined,false,true)).not.toThrow()
  })
  it('exports sourced profile and supplier contacts without turning unknown size into zero',()=>{
    const fields=radarCompanyExportFields({companyProfile:{summary:{value:'Soluções B2B',sourceUrl:'https://alfa.example'},services:[],customerSegments:[],operatingRegions:[]},
      sizeAssessment:{score:null,evidenceCoverage:0,contributions:[]}},[{kind:'email',value:'compras@alfa.example',purpose:'suppliers',sourceUrl:'https://alfa.example',observedAt:'2026-10-12',association:'confirmed'}])
    expect(fields.sizeScore).toBe('');expect(fields.supplierEmails).toBe('compras@alfa.example')
    const csv=formatB2bProspectCsv([{name:'Alfa',cnpj:'12345678000190',...fields}],['companySummary','supplierEmails','sizeScore'])
    expect(csv).toContain('Soluções B2B [https://alfa.example]');expect(csv).toContain('compras@alfa.example')
  })
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
