import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StrategyIngestionUploadInput, StrategyPack } from '@/types/strategyEngine'
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

  async function renderPanel(onCreateJob: (input: StrategyIngestionUploadInput) => Promise<unknown>) {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StrategyPacksPanel
            packs={[pack]}
            items={[]}
            jobs={[]}
            bindings={[]}
            profiles={[]}
            organizations={[]}
            onSavePack={vi.fn()}
            onSaveItem={vi.fn()}
            onUpdateItemStatus={vi.fn()}
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
