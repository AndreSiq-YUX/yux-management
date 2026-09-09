import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StrategyIngestionUploadInput, StrategyPack, StrategyPackItem } from '@/types/strategyEngine'
import { StrategyPacksPanel } from './StrategyPacksPanel'

const pack = {
  id: '880e8400-e29b-41d4-a716-44665544a001',
  packKey: 'test-pack',
  name: 'Pack de teste',
  description: 'Teste de upload público',
  scope: 'internal',
  visibility: 'internal_only',
  sourceKind: 'manual',
  sourceTitle: '',
  status: 'draft',
  version: 1,
  targetProfileKeys: [],
  targetModules: [],
  governanceVersion: 3,
  allowedAgentProfileKeys: ['growth_strategist'],
  blockedAgentProfileKeys: [],
  metadata: {},
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
} satisfies StrategyPack

describe('StrategyPacksPanel upload', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('envia o File real selecionado e preserva os metadados da fonte', async () => {
    const onCreateJob = vi.fn(async () => undefined)
    await renderPanel(onCreateJob)
    const source = container.querySelector<HTMLInputElement>('input[placeholder="Nome da fonte"]')!
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['Conteúdo público de teste'], 'guia.txt', { type: 'text/plain' })

    await act(async () => {
      setInputValue(source, 'Guia interno')
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      fileInput.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onCreateJob).toHaveBeenCalledWith({
      packId: pack.id,
      sourceName: 'Guia interno',
      sourceKind: 'private_book',
      file,
    })
  })

  it('mantém uma falha recuperável visível sem perder o arquivo selecionado', async () => {
    const onCreateJob = vi.fn(async () => { throw new Error('envio interrompido') })
    await renderPanel(onCreateJob)
    const source = container.querySelector<HTMLInputElement>('input[placeholder="Nome da fonte"]')!
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!

    await act(async () => {
      setInputValue(source, 'Guia interno')
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['texto'], 'guia.txt', { type: 'text/plain' })] })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      fileInput.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('envio interrompido')
    expect(fileInput.files?.[0]?.name).toBe('guia.txt')
  })

  it('mostra a evidência e exige motivo antes da aprovação humana', async () => {
    const onReviewItem = vi.fn(async () => undefined)
    const item: StrategyPackItem = {
      id: '10000000-0000-4000-8000-000000000013', packId: pack.id, itemType: 'concept_card',
      title: 'Diagnosticar antes da oferta', summary: 'Pitch prematuro', body: 'Qualifique primeiro.',
      profileKeys: [], stageTags: [], retrievalTags: [], status: 'proposed', priority: 100, confidence: 0.91,
      payload: { evidence: [{ locator: 'page:2', excerpt: 'qualifique o problema' }] },
      createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    }
    await renderPanel(vi.fn(), [item], onReviewItem)
    expect(container.textContent).toContain('page:2: “qualifique o problema”')
    const approve = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Aprovar'))!
    expect(approve.disabled).toBe(true)
    const reason = container.querySelector<HTMLInputElement>('input[placeholder="Motivo da decisão ou ajuste"]')!
    await act(async () => setInputValue(reason, 'Evidência conferida'))
    await act(async () => approve.click())
    expect(onReviewItem).toHaveBeenCalledWith(item.id, 'approved', 'Evidência conferida')
  })

  it('separa itens aprovados de packs efetivamente publicados no runtime', async () => {
    const item: StrategyPackItem = {
      id: '10000000-0000-4000-8000-000000000012', packId: pack.id, itemType: 'concept_card',
      title: 'Item aguardando publicação', summary: 'Resumo', body: 'Regra', profileKeys: [], stageTags: [],
      retrievalTags: [], status: 'approved', priority: 100, payload: {}, createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    await renderPanel(vi.fn(), [item])

    expect(container.textContent).toContain('Itens aprovados1Aguardam publicação')
    expect(container.textContent).toContain('Packs publicados0Release atual elegível')
    expect(container.textContent).not.toContain('Entram em runtime')
  })

  it('permite editar a proposta mantendo-a pendente de aprovação', async () => {
    const onReviewItem = vi.fn(async () => undefined)
    const item: StrategyPackItem = {
      id: '10000000-0000-4000-8000-000000000014', packId: pack.id, itemType: 'concept_card',
      title: 'Título inicial', summary: 'Problema', body: 'Princípio inicial.',
      profileKeys: [], stageTags: [], retrievalTags: [], status: 'proposed', priority: 100,
      payload: { evidence: [{ locator: 'section:1', excerpt: 'trecho literal' }] },
      createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    }
    await renderPanel(vi.fn(), [item], onReviewItem)
    await act(async () => container.querySelector('summary')!.click())
    const title = container.querySelector<HTMLInputElement>(`input[aria-label="Título da proposta ${item.title}"]`)!
    const principle = container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Princípio da proposta ${item.title}"]`)!
    const reason = container.querySelector<HTMLInputElement>('input[placeholder="Motivo da decisão ou ajuste"]')!
    await act(async () => {
      setInputValue(title, 'Título revisado')
      setTextareaValue(principle, 'Princípio revisado.')
      setInputValue(reason, 'Ajuste editorial com fonte preservada')
    })
    const save = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Salvar ajuste'))!
    await act(async () => save.click())
    expect(onReviewItem).toHaveBeenCalledWith(item.id, 'proposed', 'Ajuste editorial com fonte preservada', {
      title: 'Título revisado', principle: 'Princípio revisado.',
    })
  })

  it('filtra possíveis duplicados e conflitos sem esconder a evidência do grupo', async () => {
    const baseItem = {
      packId: pack.id, itemType: 'concept_card', summary: 'Resumo', body: 'Regra', profileKeys: [], stageTags: [],
      retrievalTags: [], status: 'proposed', priority: 100, createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    const duplicate = { ...baseItem, id: '10000000-0000-4000-8000-000000000021', title: 'Item duplicado', payload: { duplicateOf: 'item-anterior', evidence: [{ locator: 'p:1', excerpt: 'evidência duplicada' }] } } satisfies StrategyPackItem
    const conflict = { ...baseItem, id: '10000000-0000-4000-8000-000000000022', title: 'Item conflitante', payload: { flags: ['conflict'], evidence: [{ locator: 'p:2', excerpt: 'evidência conflitante' }] } } satisfies StrategyPackItem
    await renderPanel(vi.fn(), [duplicate, conflict])
    const filter = container.querySelector<HTMLSelectElement>('#strategy-review-group')!
    await act(async () => setSelectValue(filter, 'duplicates'))
    expect(container.textContent).toContain('Item duplicado')
    expect(container.textContent).not.toContain('Item conflitante')
    expect(container.textContent).toContain('evidência duplicada')
    await act(async () => setSelectValue(filter, 'conflicts'))
    expect(container.textContent).toContain('Item conflitante')
    expect(container.textContent).not.toContain('Item duplicado')
  })

  it('publica exatamente o público, os perfis e os itens confirmados no diálogo', async () => {
    const item: StrategyPackItem = {
      id: '10000000-0000-4000-8000-000000000015', packId: pack.id, itemType: 'concept_card', title: 'Princípio aprovado',
      summary: 'Problema', body: 'Regra', profileKeys: [], stageTags: [], retrievalTags: [], status: 'approved', priority: 100,
      payload: {}, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    }
    const onPublishPack = vi.fn(async () => ({ publicationId: '20000000-0000-4000-8000-000000000001', version: 4, contentHash: 'a'.repeat(64) }))
    await renderPanel(vi.fn(), [item], vi.fn(), onPublishPack)
    const open = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Publicar pack'))!
    await act(async () => open.click())
    const blocked = document.querySelector<HTMLInputElement>('#strategy-publication-blocked')!
    await act(async () => setInputValue(blocked, 'ai_sdr_comercial_1'))
    const publish = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Publicar versão confirmada'))!
    await act(async () => publish.click())
    expect(onPublishPack).toHaveBeenCalledWith(pack.id, {
      expectedVersion: 3,
      visibility: 'internal_only',
      allowedAgentProfileKeys: ['growth_strategist'],
      blockedAgentProfileKeys: ['ai_sdr_comercial_1'],
      approvedItemIds: [item.id],
    })
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Publicação v4 salva')
  })

  async function renderPanel(
    onCreateJob: (input: StrategyIngestionUploadInput) => Promise<unknown>,
    items: StrategyPackItem[] = [],
    onReviewItem = vi.fn(async () => undefined),
    onPublishPack = vi.fn(async () => ({ publicationId: '', version: 1, contentHash: 'a'.repeat(64) })),
  ) {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StrategyPacksPanel
            packs={[pack]}
            items={items}
            jobs={[]}
            bindings={[]}
            profiles={[]}
            organizations={[]}
            onSavePack={vi.fn()}
            onSaveItem={vi.fn()}
            onReviewItem={onReviewItem}
            onPublishPack={onPublishPack}
            onCreateJob={onCreateJob}
            onSaveBinding={vi.fn()}
          />
        </MemoryRouter>,
      )
    })
  }
})

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(input: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
