import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { PortalProposalsPage } from './PortalProposalsPage'
import { proposalService } from '@/services/proposalService'
import type { ProposalDraft, ProposalVersion } from '@/types/proposal'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const proposal = (id = 'proposal-a'): ProposalDraft => ({
  id,
  title: `Proposta ${id}`,
  status: 'sent',
  scope: 'Escopo resumido',
  billingCycle: 'monthly',
  finalValue: 4500,
  currentVersionId: `version-${id}`,
} as ProposalDraft)

const version = (id = 'proposal-a'): ProposalVersion => ({
  id: `version-${id}`,
  proposalId: id,
  versionNumber: 1,
  status: 'pending',
  sentAt: '2026-10-10T12:00:00.000Z',
  snapshot: {
    title: `Proposta ${id}`,
    scope: 'Gestão de tráfego e conteúdo',
    billingCycle: 'monthly',
    finalValue: 4500,
  },
} as ProposalVersion)

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.spyOn(proposalService, 'getPortalProposals').mockResolvedValue([proposal()])
  vi.spyOn(proposalService, 'getVersions').mockResolvedValue([version()])
  vi.spyOn(proposalService, 'submitPortalDecision').mockResolvedValue({} as never)
  vi.spyOn(toast, 'error').mockImplementation(() => '')
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const mount = async (url = '/') => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PortalProposalsPage />
      </MemoryRouter>,
    )
    await flush()
    await flush()
  })
}

const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent === text)!
const dialogButton = (text: string) =>
  [...document.body.querySelectorAll('[role="dialog"] button')].find(item => item.textContent === text) as HTMLButtonElement
const clickDialog = async (text: string) => {
  await act(async () => {
    dialogButton(text).click()
    await flush()
    await flush()
  })
}
const click = async (text: string) => {
  await act(async () => {
    button(text).click()
    await flush()
    await flush()
  })
}
const type = async (value: string) => {
  const textarea = document.body.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PortalProposalsPage', () => {
  it('mostra o carregamento enquanto busca as propostas', async () => {
    vi.spyOn(proposalService, 'getPortalProposals').mockReturnValue(new Promise(() => undefined))
    await mount()

    expect(container.textContent).toContain('Carregando propostas')
  })

  it('mostra o estado vazio', async () => {
    vi.spyOn(proposalService, 'getPortalProposals').mockResolvedValue([])
    await mount()

    expect(container.textContent).toContain('Nenhuma proposta enviada para você ainda.')
  })

  it('mostra erro com "Tentar novamente" e recarrega', async () => {
    const getProposals = vi.spyOn(proposalService, 'getPortalProposals').mockRejectedValueOnce(new Error('falha'))
    await mount()

    expect(container.textContent).toContain('Não foi possível carregar suas propostas.')
    await click('Tentar novamente')

    expect(getProposals).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Proposta proposal-a')
  })

  it('lista com status traduzido e valor, e destaca a proposta selecionada', async () => {
    await mount()

    expect(container.textContent).toContain('Enviado')
    expect(container.textContent).toContain('4.500,00')
    const item = [...container.querySelectorAll('aside button')][0]
    expect(item.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
    })

    expect(container.querySelector('aside button')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Gestão de tráfego e conteúdo')
    expect(container.textContent).toContain('Mensal')
  })

  it('pré-seleciona a proposta indicada em ?proposalId=', async () => {
    vi.spyOn(proposalService, 'getPortalProposals').mockResolvedValue([proposal('proposal-a'), proposal('proposal-b')])
    vi.spyOn(proposalService, 'getVersions').mockResolvedValue([version('proposal-b')])
    await mount('/?proposalId=proposal-b')

    const buttons = [...container.querySelectorAll('aside button')]
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    expect(proposalService.getVersions).toHaveBeenCalledWith('proposal-b')
  })

  it('exige comentário para solicitar ajustes e para recusar', async () => {
    await mount('/?proposalId=proposal-a')

    await click('Solicitar ajustes')
    expect(dialogButton('Enviar pedido de ajustes').disabled).toBe(true)
    await clickDialog('Enviar pedido de ajustes')
    await type('   ')
    expect(dialogButton('Enviar pedido de ajustes').disabled).toBe(true)
    expect(proposalService.submitPortalDecision).not.toHaveBeenCalled()
    await clickDialog('Cancelar')

    await click('Recusar')
    expect(dialogButton('Confirmar recusa').disabled).toBe(true)
    await clickDialog('Confirmar recusa')
    expect(proposalService.submitPortalDecision).not.toHaveBeenCalled()
  })

  it('pede confirmação antes de aprovar e não envia se a pessoa cancelar', async () => {
    await mount('/?proposalId=proposal-a')

    await click('Aprovar')
    expect(document.body.textContent).toContain('Aprovar esta proposta?')
    expect(proposalService.submitPortalDecision).not.toHaveBeenCalled()

    await clickDialog('Cancelar')
    expect(document.body.textContent).not.toContain('Aprovar esta proposta?')
    expect(proposalService.submitPortalDecision).not.toHaveBeenCalled()
  })

  it('aprova sem comentário, pois ele é opcional na aprovação', async () => {
    await mount('/?proposalId=proposal-a')

    await click('Aprovar')
    await clickDialog('Confirmar aprovação')

    expect(proposalService.submitPortalDecision).toHaveBeenCalledWith('version-proposal-a', 'approved', undefined, undefined)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('recusa com confirmação em tom de alerta e comentário obrigatório', async () => {
    await mount('/?proposalId=proposal-a')

    await click('Recusar')
    expect(document.body.querySelector('[role="dialog"]')!.getAttribute('data-tone')).toBe('danger')
    await type('Fora do orçamento')
    await clickDialog('Confirmar recusa')

    expect(proposalService.submitPortalDecision).toHaveBeenCalledWith('version-proposal-a', 'rejected', 'Fora do orçamento', undefined)
  })

  it('registra a decisão, mostra confirmação e recarrega os dados', async () => {
    await mount('/?proposalId=proposal-a')
    expect(proposalService.getPortalProposals).toHaveBeenCalledTimes(1)

    await click('Aprovar')
    await type('Pode seguir')
    await clickDialog('Confirmar aprovação')

    expect(proposalService.submitPortalDecision).toHaveBeenCalledWith('version-proposal-a', 'approved', 'Pode seguir', undefined)
    expect(toast.success).toHaveBeenCalledWith('Decisão registrada')
    expect(proposalService.getPortalProposals).toHaveBeenCalledTimes(2)
    expect(proposalService.getVersions).toHaveBeenCalledTimes(2)
  })

  it('mantém o comentário quando o envio falha e permite tentar de novo', async () => {
    vi.spyOn(proposalService, 'submitPortalDecision').mockRejectedValueOnce(new Error('falha'))
    await mount('/?proposalId=proposal-a')

    await click('Solicitar ajustes')
    await type('Preciso de ajustes no prazo')
    await clickDialog('Enviar pedido de ajustes')

    expect(toast.error).toHaveBeenCalledWith('Não foi possível registrar sua decisão. Tente novamente.')
    expect(toast.success).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"] [role="alert"]')!.textContent).toContain('Não foi possível registrar')
    expect(document.body.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!.value).toBe('Preciso de ajustes no prazo')
    expect(dialogButton('Enviar pedido de ajustes').disabled).toBe(false)

    await clickDialog('Enviar pedido de ajustes')
    expect(proposalService.submitPortalDecision).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('Decisão registrada')
  })

  it('trava o duplo envio enquanto a decisão está em andamento', async () => {
    let finish: () => void = () => undefined
    vi.spyOn(proposalService, 'submitPortalDecision').mockReturnValue(new Promise(resolve => {
      finish = () => resolve({} as never)
    }))
    await mount('/?proposalId=proposal-a')

    await click('Aprovar')
    await act(async () => {
      dialogButton('Confirmar aprovação').click()
      dialogButton('Confirmar aprovação').click()
      await flush()
    })

    expect(proposalService.submitPortalDecision).toHaveBeenCalledTimes(1)
    expect(button('Aprovar').disabled).toBe(true)
    expect(button('Solicitar ajustes').disabled).toBe(true)

    await act(async () => {
      finish()
      await flush()
      await flush()
    })
    expect(toast.success).toHaveBeenCalledWith('Decisão registrada')
  })

  it('no celular, o detalhe abre com "Voltar" e a lista volta ao tocar nele', async () => {
    await mount('/?proposalId=proposal-a')

    expect(container.querySelector('[data-testid="master-detail"]')!.textContent).toContain('Gestão de tráfego e conteúdo')
    expect(container.querySelector('[data-has-detail="true"]')).toBeTruthy()

    await click('Voltar')

    expect(container.querySelector('[data-has-detail="false"]')).toBeTruthy()
    expect(container.textContent).toContain('Selecione uma proposta')
    expect(container.querySelector('aside button')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('mostra as versões como linha do tempo quando há mais de uma', async () => {
    vi.spyOn(proposalService, 'getVersions').mockResolvedValue([
      version(),
      { ...version(), id: 'version-old', versionNumber: 0, status: 'superseded' } as ProposalVersion,
    ])
    await mount('/?proposalId=proposal-a')

    const items = container.querySelectorAll('ol[aria-label="Versões da proposta"] > li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Versão atual')
  })
})
