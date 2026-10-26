import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { companyStrategyContentSchema } from '../src/modules/company-strategy/schemas.js'

const content = () => ({ schemaVersion: 1, title: 'Captação para oficina', objective: 'Aumentar agendamentos de revisão', summary: 'Priorizar revisões preventivas e o atendimento da região.', sections: [], references: { productIds: [], documentIds: [] } })
describe('flexible company strategy content', () => {
  it('accepts unrelated business objectives without campaign budget or an action pack', () => {
    for (const title of ['Representante multimarcas', 'Sites para empresas', 'Revisões na oficina']) {
      expect(companyStrategyContentSchema.parse({ ...content(), title }).title).toBe(title)
    }
  })
  it('keeps custom section order and defaults its audience to internal', () => {
    const ids = [randomUUID(), randomUUID()]
    const value = companyStrategyContentSchema.parse({ ...content(), sections: ids.map((id, i) => ({ id, kind: 'custom', title: `Frente ${i}`, body: 'Uma decisão comercial específica.' })) })
    expect(value.sections.map(section => section.id)).toEqual(ids)
    expect(value.sections.map(section => section.agentUse)).toEqual(['internal', 'internal'])
  })
  it('rejects ambiguous duplicate section identities and oversized content', () => {
    const section = { id: randomUUID(), kind: 'constraints', title: 'Limites', body: 'Não oferecer fora da região.' }
    expect(companyStrategyContentSchema.safeParse({ ...content(), sections: [section, section] }).success).toBe(false)
    expect(companyStrategyContentSchema.safeParse({ ...content(), sections: [{ ...section, body: 'x'.repeat(12001) }] }).success).toBe(false)
  })
})
