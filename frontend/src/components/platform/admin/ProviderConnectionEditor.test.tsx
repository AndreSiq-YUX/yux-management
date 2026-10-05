import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderConnectionEditor } from './ProviderConnectionEditor'
import type { PlatformProviderConnection } from '@/types/adminPlatform'
import type { PlatformProviderConnectionInput } from '@/services/adminPlatformService'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function renderEditor(providerKey: 'cnpja' | 'brave_place', config: Record<string, unknown> = {}) {
  const provider: PlatformProviderConnection = {
    id: 'existing-provider', providerType: 'internal_service', providerKey,
    displayName: providerKey, environment: 'production', status: 'active',
    secretReference: 'stored-key-reference', publicConfig: config, isDefault: false,
  }
  const onSave = vi.fn(async (_input: PlatformProviderConnectionInput) => {})
  const onSaveCredential = vi.fn(async () => ({ ok: true, reference: 'replacement-key' }))
  await act(async () => root.render(<ProviderConnectionEditor title={providerKey} description="Integração"
    provider={provider} defaults={provider} onSave={onSave} onSaveCredential={onSaveCredential}
    showRetentionLicenseControls={providerKey === 'brave_place'}
    showClientDeliveryLicenseControls={providerKey === 'cnpja'} />))
  return { onSave, onSaveCredential }
}

async function toggle(label: string) {
  const input = [...container.querySelectorAll('label')]
    .find(element => element.textContent?.includes(label))?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  expect(input).toBeTruthy()
  await act(async () => input!.click())
}

async function save() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('provider permission confirmations', () => {
  it('saves CNPJa client delivery using only the checkbox and preserves the existing key', async () => {
    const { onSave, onSaveCredential } = await renderEditor('cnpja')
    await toggle('Confirmo permissão de entrega a cliente')
    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      secretReference: 'stored-key-reference', publicConfig: { clientDeliveryLicensed: true },
    }))
    expect(container.textContent).toContain('Provedor salvo.')
    expect(container.textContent).not.toContain('Referência dos termos ou contrato')
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('')
    expect(onSaveCredential).not.toHaveBeenCalled()
  })

  it('saves Brave retention and delivery without a reference or a replacement key', async () => {
    const { onSave, onSaveCredential } = await renderEditor('brave_place')
    await toggle('Confirmo licença de armazenamento dos resultados')
    await toggle('O contrato também permite entregar a lista ao cliente')
    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      secretReference: 'stored-key-reference', publicConfig: {
        retentionLicensed: true, clientDeliveryLicensed: true,
        credentialPurpose: 'licensed_retention', storagePolicy: 'licensed_persist',
      },
    }))
    expect(container.textContent).toContain('Provedor salvo.')
    expect(container.textContent).not.toContain('Referência do contrato/licença')
    expect(onSaveCredential).not.toHaveBeenCalled()
  })

  it('revokes Brave retention and delivery when unchecked, preserving unrelated and legacy data', async () => {
    const { onSave } = await renderEditor('brave_place', {
      retentionLicensed: true, clientDeliveryLicensed: true, credentialPurpose: 'licensed_retention',
      storagePolicy: 'licensed_persist', licenseReference: 'legacy-contract', country: 'BR',
    })
    await toggle('Confirmo licença de armazenamento dos resultados')
    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ publicConfig: {
      retentionLicensed: false, clientDeliveryLicensed: false, credentialPurpose: 'preview',
      storagePolicy: 'transient_only', licenseReference: 'legacy-contract', country: 'BR',
    } }))
  })

  it('does not grant CNPJa delivery by default', async () => {
    const { onSave } = await renderEditor('cnpja')
    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      publicConfig: { clientDeliveryLicensed: false },
    }))
  })

  it('allows revocation of an existing CNPJa confirmation', async () => {
    const { onSave } = await renderEditor('cnpja', { clientDeliveryLicensed: true })
    await toggle('Confirmo permissão de entrega a cliente')
    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      publicConfig: { clientDeliveryLicensed: false },
    }))
  })
})
