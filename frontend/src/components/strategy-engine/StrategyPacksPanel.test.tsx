import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StrategyIngestionCapabilities, StrategyIngestionJob, StrategyIngestionUploadInput, StrategyPack, StrategyPackItem } from '@/types/strategyEngine'
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

const capabilities = {
  maxBytes: 150 * 1024 * 1024,
  maxMb: 150,
  acceptedMimeTypes: ['application/pdf', 'text/plain'],
  structuredIngestion: {
    curationEnabled: true,
    runtimeConfigured: true,
    embeddingConfigured: true,
    ready: true,
  },
} satisfies StrategyIngestionCapabilities

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

  it('usa o limite informado pelo backend e bloqueia o arquivo antes da transmissão', async () => {
    const onCreateJob = vi.fn(async () => undefined)
    await renderPanel(onCreateJob)
    expect(container.textContent).toContain('até 150 MB')
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const oversized = new File(['x'], 'livro.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { configurable: true, value: 151 * 1024 * 1024 })

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [oversized] })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('excede o limite de 150 MB')
    expect(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar e processar'))?.disabled).toBe(true)
    expect(onCreateJob).not.toHaveBeenCalled()
  })

  it('explica que upload legado sem documento precisa de reenvio', async () => {
    const legacyJob: StrategyIngestionJob = {
      id: 'legacy-1', packId: pack.id, sourceName: 'The Black Book', sourceKind: 'private_book', fileName: 'The Black Book.pdf',
      status: 'uploaded', currentStep: 'upload', attempt: 0, proposedCounts: {}, metadata: {},
      createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    await renderPanel(vi.fn(), [], vi.fn(), undefined, [legacyJob])
    expect(container.textContent).toContain('Reenvio necessário: este registro antigo guardou somente o nome do arquivo.')
  })

  it('não permite iniciar curadoria estruturada quando os provedores não estão configurados', async () => {
    await renderPanel(vi.fn(), [], vi.fn(), undefined, [], {
      ...capabilities,
      structuredIngestion: { ...capabilities.structuredIngestion, embeddingConfigured: false, ready: false },
    })
    expect(container.textContent).toContain('Embeddings OpenRouter não configurados')
    expect(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar e processar'))?.disabled).toBe(true)
  })

  it('retoma um job falho sem pedir novo upload quando o documento está preservado', async () => {
    const onRetryJob = vi.fn(async () => undefined)
    const failedJob: StrategyIngestionJob = {
      id: 'failed-1', packId: pack.id, documentId: 'document-1', sha256: 'a'.repeat(64), sourceName: 'The Black Book',
      sourceKind: 'private_book', fileName: 'The Black Book.pdf', status: 'failed', currentStep: 'curation', attempt: 2,
      proposedCounts: { chunks: 379, curationBatchesCompleted: 21, curationBatchesTotal: 61 }, metadata: {},
      recoverableError: { message: 'curation_transport_interrupted', recoverable: true },
      createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    await renderPanel(vi.fn(), [], vi.fn(), undefined, [failedJob], capabilities, onRetryJob)
    expect(container.textContent).toContain('Lotes de curadoria: 21 de 61')
    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Retomar processamento'))!
    await act(async () => retry.click())
    expect(onRetryJob).toHaveBeenCalledWith('failed-1')
  })

  it('explica a recarga necessária sem pedir novo upload do documento', async () => {
    const creditJob: StrategyIngestionJob = {
      id: 'credit-1', packId: pack.id, documentId: 'document-1', sha256: 'a'.repeat(64), sourceName: 'The Black Book',
      sourceKind: 'private_book', fileName: 'The Black Book.pdf', status: 'failed', currentStep: 'curation', attempt: 3,
      proposedCounts: { chunks: 379, curationBatchesCompleted: 0, curationBatchesTotal: 68 }, metadata: {},
      recoverableError: { message: 'agent_runtime_402:openrouter_credit_required', recoverable: false },
      createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    await renderPanel(vi.fn(), [], vi.fn(), undefined, [creditJob])
    expect(container.textContent).toContain('O saldo da OpenRouter é insuficiente')
    expect(container.textContent).toContain('o arquivo e os trechos extraídos estão preservados')
  })

  it('não apresenta conclusão vazia como sucesso e oferece reprocessamento com os avisos', async () => {
    const onRetryJob = vi.fn(async () => undefined)
    const emptyJob: StrategyIngestionJob = {
      id: 'empty-1', packId: pack.id, documentId: 'document-1', sha256: 'a'.repeat(64), sourceName: 'The Black Book',
      sourceKind: 'private_book', fileName: 'The Black Book.pdf', status: 'completed', currentStep: 'review', attempt: 2,
      proposedCounts: {
        chunks: 379, items: 0, curationBatchesCompleted: 68, curationBatchesTotal: 68, curationWarningCount: 84,
        curationWarnings: ['Conteúdo tratado como específico demais para generalização.'],
      },
      metadata: {}, createdAt: pack.createdAt, updatedAt: pack.updatedAt,
    }
    await renderPanel(vi.fn(), [], vi.fn(), undefined, [emptyJob], capabilities, onRetryJob)

    expect(container.textContent).toContain('Curadoria concluída sem artefatos — reprocessamento necessário')
    expect(container.textContent).toContain('Artefatos propostos: 0')
    expect(container.textContent).toContain('84 avisos da curadoria')
    expect(container.textContent).toContain('Conteúdo tratado como específico demais para generalização.')
    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Reprocessar curadoria'))!
    await act(async () => retry.click())
    expect(onRetryJob).toHaveBeenCalledWith('empty-1')
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

    expect(container.textContent).toContain('Aprovados com fonte0Elegíveis para publicação')
    expect(container.textContent).toContain('Packs publicados0Release atual elegível')
    expect(container.textContent).toContain('1 item(ns) aprovado(s) de exemplo não possuem documento e evidência verificável')
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

  it('permite revisar todos os itens pendentes sem limitar a lista aos oito primeiros', async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      packId: pack.id,
      itemType: 'concept_card',
      id: `10000000-0000-4000-8000-0000000000${30 + index}`,
      title: `Item pendente ${index + 1}`,
      summary: 'Resumo',
      body: 'Regra',
      profileKeys: [],
      stageTags: [],
      retrievalTags: [],
      status: 'proposed',
      priority: 100,
      payload: { evidence: [{ locator: `page:${index + 1}`, excerpt: `evidência ${index + 1}` }] },
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    })) satisfies StrategyPackItem[]

    await renderPanel(vi.fn(), items)
    expect(container.textContent).toContain('Item pendente 8')
    expect(container.textContent).not.toContain('Item pendente 9')
    const showMore = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Mostrar mais'))!
    expect(showMore.textContent).toContain('2 restantes')

    await act(async () => showMore.click())

    expect(container.textContent).toContain('Item pendente 9')
    expect(container.textContent).toContain('Item pendente 10')
    expect(container.textContent).toContain('Todos os 10 itens estão visíveis.')
  })

  it('publica exatamente o público, os perfis e os itens confirmados no diálogo', async () => {
    const item: StrategyPackItem = {
      id: '10000000-0000-4000-8000-000000000015', packId: pack.id, itemType: 'concept_card', title: 'Princípio aprovado',
      summary: 'Problema', body: 'Regra', profileKeys: [], stageTags: [], retrievalTags: [], status: 'approved', priority: 100,
      sourceDocumentId: '30000000-0000-4000-8000-000000000001', sourceOrigin: 'document_extracted', contentHash: 'b'.repeat(64),
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
    jobs: StrategyIngestionJob[] = [],
    ingestionCapabilities: StrategyIngestionCapabilities = capabilities,
    onRetryJob = vi.fn(async () => undefined),
  ) {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StrategyPacksPanel
            packs={[pack]}
            items={items}
            jobs={jobs}
            ingestionCapabilities={ingestionCapabilities}
            bindings={[]}
            profiles={[]}
            organizations={[]}
            onSavePack={vi.fn()}
            onSaveItem={vi.fn()}
            onReviewItem={onReviewItem}
            onPublishPack={onPublishPack}
            onCreateJob={onCreateJob}
            onRefreshJobs={vi.fn(async () => undefined)}
            onRetryJob={onRetryJob}
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
