import { describe, expect, it } from 'vitest'
import { buildFallbackDraft, normalizeSuggestedItems } from './proposalDraft'

describe('proposal draft fallback', () => {
  it('builds an editable fallback from a template', () => {
    const draft = buildFallbackDraft({
      template: { scope: 'Escopo padrao', default_items: [{ itemKey: 'base', label: 'Pacote', quantity: 1, unitValue: 5000 }], whatsapp_message: 'Mensagem', email_subject: 'Assunto', email_body: 'Corpo' },
      diagnostic: { summary: 'Cliente precisa organizar vendas.' },
    })
    expect(draft.scope).toContain('Escopo padrao')
    expect(draft.scope).toContain('Cliente precisa organizar vendas.')
    expect(draft.items[0].unitValue).toBe(5000)
  })

  it('clamps provider prices to registered ranges', () => {
    expect(normalizeSuggestedItems(
      [{ itemKey: 'base', label: 'Pacote', quantity: 1, unitValue: 9000 }],
      [{ item_key: 'base', minimum_value: 3000, recommended_value: 5000, maximum_value: 7000 }],
    )[0].unitValue).toBe(7000)
  })
})
