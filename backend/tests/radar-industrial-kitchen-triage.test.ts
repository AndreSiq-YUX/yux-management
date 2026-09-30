import { describe, expect, it } from 'vitest'
import { triageIndustrialKitchen } from '../src/modules/radar/industrial-kitchen-triage.js'

describe('industrial kitchen triage', () => {
  it('confirms corporate meal production only when a matching site supports the CNAE', () => {
    const result = triageIndustrialKitchen({ name: 'Cozinha Central Alfa', cnaes: ['5620101'],
      products: ['massas', 'pães congelados'], website: { status: 'verified_present',
        finalUrl: 'https://alfa.example/', text: 'Cozinha Central Alfa. Nossa cozinha industrial fornece refeições corporativas para empresas e utiliza massas e pães.',
        checkedAt: '2026-09-30T00:00:00.000Z', emails: [], phones: [] } })
    expect(result.kitchenStatus).toBe('confirmed')
    expect(result.productFit).toBe('possible')
    expect(result.evidenceUrls).toContain('https://alfa.example/')
  })

  it('never treats a CNAE alone, a restaurant page or a missing site as confirmation', () => {
    const base = { name: 'Restaurante Alfa', cnaes: ['5620101'], products: ['massas'] }
    expect(triageIndustrialKitchen(base).kitchenStatus).toBe('review')
    expect(triageIndustrialKitchen({ ...base, website: { status: 'verified_present', checkedAt: '',
      finalUrl: 'https://alfa.example/', text: 'Restaurante Alfa. Nosso cardápio e delivery para consumidores.',
      emails: [], phones: [] } }).kitchenStatus).toBe('review')
    expect(triageIndustrialKitchen({ ...base, cnaes: ['5611201'] }).kitchenStatus).toBe('insufficient')
  })
})
