import { describe, expect, it } from 'vitest'
import { composeSampleMessage, fontFamilyFor, isValidHex, normalizeHex, toColorInputValue } from './brandPreview'
import { describeValue, isFlatRecord } from './describeValue'
import { computeProfileCompleteness, isProfileEmpty } from './profileCompleteness'

const emptyProfile = {
  legalName: '', tradeName: '', description: '', industry: '', positioning: '', differentiators: [],
  emails: [], phones: [], address: {}, businessHours: {}, serviceRegions: [], socialLinks: {},
}

describe('profileCompleteness', () => {
  it('perfil vazio: 0% e todos os itens faltando, com o id do campo', () => {
    const result = computeProfileCompleteness(emptyProfile)
    expect(result.percent).toBe(0)
    expect(result.missing).toHaveLength(result.items.length)
    expect(result.missing.map(item => item.fieldId)).toContain('trade-name')
    expect(isProfileEmpty(emptyProfile)).toBe(true)
  })

  it('conta endereço e horário só quando completos e aponta o primeiro campo faltante', () => {
    const partial = computeProfileCompleteness({ ...emptyProfile, address: { street: 'Rua A', city: 'São Paulo' } })
    expect(partial.items.find(item => item.key === 'address')).toMatchObject({ complete: false, fieldId: 'address-state' })

    const done = computeProfileCompleteness({
      ...emptyProfile,
      tradeName: 'Empresa', address: { street: 'Rua A', city: 'São Paulo', state: 'SP' },
      businessHours: { monday: { open: '09:00', close: '18:00' }, sunday: { closed: true } },
    })
    expect(done.items.find(item => item.key === 'address')?.complete).toBe(true)
    expect(done.items.find(item => item.key === 'businessHours')?.complete).toBe(true)
    expect(done.percent).toBeGreaterThan(0)
  })
})

describe('describeValue', () => {
  it('descreve objetos em texto legível, sem JSON', () => {
    const text = describeValue({ monday: { open: '09:00', close: '18:00' }, sunday: { closed: true } })
    expect(text).toBe('Segunda: 09:00 às 18:00; Domingo: Fechado')
    expect(text).not.toContain('{')
    expect(describeValue(['a', 'b'])).toBe('a · b')
  })

  it('reconhece objetos de uma camada como editáveis campo a campo', () => {
    expect(isFlatRecord({ city: 'SP', number: 10 })).toBe(true)
    expect(isFlatRecord({ monday: { open: '09:00' } })).toBe(false)
    expect(isFlatRecord({})).toBe(false)
  })
})

describe('brandPreview', () => {
  it('valida e normaliza cores hexadecimais', () => {
    expect(isValidHex('#5519FF')).toBe(true)
    expect(isValidHex('5519ff')).toBe(true)
    expect(isValidHex('#fff')).toBe(true)
    expect(isValidHex('#12345')).toBe(false)
    expect(isValidHex('azul')).toBe(false)
    expect(normalizeHex(' #ABC ')).toBe('#abc')
    expect(toColorInputValue('#abc')).toBe('#aabbcc')
    expect(toColorInputValue('inválida')).toBe('#000000')
  })

  it('monta a mensagem de exemplo a partir do tom e protege o nome da fonte', () => {
    expect(composeSampleMessage({})).toBeNull()
    const message = composeSampleMessage({ brandName: 'YUX', toneOfVoice: 'Consultivo e direto', vocabularyDo: ['diagnóstico', 'próximo passo'] })
    expect(message).toContain('Aqui é a YUX')
    expect(message).toContain('consultivo e direto')
    expect(message).toContain('diagnóstico e próximo passo')
    expect(fontFamilyFor('Sora"; color:red')).not.toContain(';')
  })
})
