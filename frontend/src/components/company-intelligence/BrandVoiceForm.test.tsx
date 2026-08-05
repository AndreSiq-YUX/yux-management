import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrandVoiceForm } from './BrandVoiceForm'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('BrandVoiceForm', () => {
  it('submits tone, vocabulary, forbidden topics and compliance as an active profile', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSave = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      root.render(<BrandVoiceForm profile={{
        contractId: 'contract-1', toneOfVoice: '', persona: '', brandVoiceSummary: '',
        vocabularyDo: [], vocabularyDont: [], forbiddenTopics: [], priorityTopics: [],
        visualIdentity: { logoUrl: '', colors: [], typography: [], designStyle: '', imageryStyle: '', graphicElements: [] },
        visualGuidelines: '', complianceNotes: '', status: 'draft',
      }} onSave={onSave} />)
      await flush()
    })

    await change('#tone-of-voice', 'consultivo e direto')
    await change('#persona', 'gestores de PMEs')
    await change('#brand-summary', 'Clara, prática e sem promessas exageradas.')
    await change('#vocabulary-do', 'diagnóstico, próximo passo')
    await change('#vocabulary-dont', 'garantido, desconto automático')
    await change('#forbidden-topics', 'resultado garantido')
    await change('#priority-topics', 'crescimento, eficiência')
    await change('#compliance-notes', 'Não prometer prazo ou resultado sem aprovação.')
    await change('#logo-url', 'https://yux.com.br/logo.svg')
    await change('#brand-colors', '#5519ff, #eef0ff')

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
    })

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      toneOfVoice: 'consultivo e direto',
      vocabularyDo: ['diagnóstico', 'próximo passo'],
      vocabularyDont: ['garantido', 'desconto automático'],
      forbiddenTopics: ['resultado garantido'],
      complianceNotes: 'Não prometer prazo ou resultado sem aprovação.',
      visualIdentity: expect.objectContaining({ logoUrl: 'https://yux.com.br/logo.svg', colors: ['#5519ff', '#eef0ff'] }),
      status: 'active',
    }))
    act(() => root.unmount())
  })
})

async function change(selector: string, value: string) {
  const element = document.body.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
  expect(element).not.toBeNull()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
    setter?.call(element, value)
    element?.dispatchEvent(new Event('input', { bubbles: true }))
    element?.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}
