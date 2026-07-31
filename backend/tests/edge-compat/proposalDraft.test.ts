import { expect, it } from 'vitest'

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}

function assertStringIncludes(actual: string, expected: string) {
  expect(actual).toContain(expected)
}
import { buildFallbackDraft, normalizeSuggestedItems } from '../../src/lib/edge-compat/proposalDraft.js'

it('buildFallbackDraft builds an editable fallback from a template', () => {
  const draft = buildFallbackDraft({
    template: { scope: 'Escopo padrao', default_items: [{ itemKey: 'base', label: 'Pacote', quantity: 1, unitValue: 5000 }], whatsapp_message: 'Mensagem', email_subject: 'Assunto', email_body: 'Corpo' },
    diagnostic: { summary: 'Cliente precisa organizar vendas.' },
  })
  assertStringIncludes(draft.scope, 'Escopo padrao')
  assertStringIncludes(draft.scope, 'Cliente precisa organizar vendas.')
  assertEquals(draft.items[0].unitValue, 5000)
})

it('normalizeSuggestedItems clamps provider prices to registered ranges', () => {
  assertEquals(normalizeSuggestedItems(
    [{ itemKey: 'base', label: 'Pacote', quantity: 1, unitValue: 9000 }],
    [{ item_key: 'base', minimum_value: 3000, recommended_value: 5000, maximum_value: 7000 }],
  )[0].unitValue, 7000)
})
