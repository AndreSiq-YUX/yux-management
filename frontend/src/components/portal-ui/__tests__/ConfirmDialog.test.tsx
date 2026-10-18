import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { ConfirmDialog } from '../ConfirmDialog'
import { byText, click, render } from './render'

afterEach(() => {
  document.body.innerHTML = ''
})

const dialogButton = (label: string) => byText(document.body, 'button', label)

describe('ConfirmDialog', () => {
  it('closes after a successful confirm and disables the button while pending', async () => {
    let resolve!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>(r => {
          resolve = r
        }),
    )
    const onOpenChange = vi.fn()
    const { unmount } = await render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Excluir?" description="Não dá para desfazer." confirmLabel="Excluir" onConfirm={onConfirm} />,
    )
    expect(document.body.textContent).toContain('Excluir?')
    expect(dialogButton('Cancelar')).not.toBeNull()

    await click(dialogButton('Excluir'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect((dialogButton('Excluir') as HTMLButtonElement).disabled).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      resolve()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await unmount()
  })

  it('stays open and shows an inline error when onConfirm fails', async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn().mockRejectedValue(new Error('Falha ao excluir'))
    const { unmount } = await render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Excluir?" description="d" confirmLabel="Excluir" onConfirm={onConfirm} />,
    )
    await click(dialogButton('Excluir'))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe('Falha ao excluir')
    expect((dialogButton('Excluir') as HTMLButtonElement).disabled).toBe(false)
    await unmount()
  })

  it('uses a generic message when the error has no message', async () => {
    const onConfirm = vi.fn().mockRejectedValue('x')
    const { unmount } = await render(
      <ConfirmDialog open onOpenChange={() => {}} title="t" description="d" confirmLabel="Ok" onConfirm={onConfirm} />,
    )
    await click(dialogButton('Ok'))
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível concluir')
    await unmount()
  })

  it('applies the danger tone and honors confirmDisabled and custom cancel label', async () => {
    const { unmount } = await render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="t"
        description="d"
        confirmLabel="Apagar"
        cancelLabel="Voltar"
        tone="danger"
        confirmDisabled
        onConfirm={() => {}}
      >
        <textarea aria-label="Motivo" />
      </ConfirmDialog>,
    )
    const confirm = dialogButton('Apagar') as HTMLButtonElement
    expect(confirm.className).toContain('bg-yx-crit')
    expect(confirm.disabled).toBe(true)
    expect(dialogButton('Voltar')).not.toBeNull()
    expect(document.body.querySelector('textarea[aria-label="Motivo"]')).not.toBeNull()
    expect(document.body.querySelector('[data-tone="danger"]')).not.toBeNull()
    await unmount()
  })

  it('renders nothing when closed', async () => {
    const { unmount } = await render(
      <ConfirmDialog open={false} onOpenChange={() => {}} title="Oculto" description="d" confirmLabel="Ok" onConfirm={() => {}} />,
    )
    expect(document.body.textContent).not.toContain('Oculto')
    await unmount()
  })
})
