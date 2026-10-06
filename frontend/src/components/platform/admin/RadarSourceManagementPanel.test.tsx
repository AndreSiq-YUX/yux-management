import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { radarService } from '@/services/radarService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'
import { RadarSourceManagementPanel } from './RadarSourceManagementPanel'

vi.mock('@/services/radarService', () => ({ radarService: { getAdminDataSources: vi.fn(), updateDataSource: vi.fn() } }))
type Source = Awaited<ReturnType<typeof radarService.getAdminDataSources>>[number]
const source = (patch: Partial<Source> = {}): Source => ({ id: 'cnpja', sourceKey: 'cnpja_advanced_search',
  sourceType: 'cnpja_advanced_search', displayName: 'CNPJá pesquisa', enabled: false, isPaid: true,
  requiresSecret: true, defaultCostPerUnit: 0.025, rateLimitPerDay: 50, createdAt: '', updatedAt: '', ...patch })
const provider = (patch: Partial<PlatformProviderConnection> = {}): PlatformProviderConnection => ({
  id: 'provider', providerType: 'internal_service', providerKey: 'cnpja', displayName: 'CNPJá',
  environment: 'production', status: 'active', secretReference: 'existing-key', publicConfig: {}, isDefault: true, ...patch,
})
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(radarService.getAdminDataSources).mockResolvedValue([source()])
  vi.mocked(radarService.updateDataSource).mockImplementation(async (_id, patch) => source(patch))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function render(providers = [provider()]) {
  await act(async () => root.render(<RadarSourceManagementPanel providers={providers} />))
}
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === name)
  expect(button).toBeTruthy()
  await act(async () => button!.click())
}
async function change(label: string, value: string) {
  const input = [...container.querySelectorAll('label')].find(element => element.textContent?.includes(label))!.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('central Radar source management', () => {
  it('loads the catalog without a campaign and activates only the selected source with existing values', async () => {
    await render()
    expect(container.textContent).toContain('Todas as organizações com Radar liberado')
    expect(container.textContent).toContain('Credencial cadastrada')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
    await click('Ativar fonte')
    expect(radarService.updateDataSource).toHaveBeenCalledExactlyOnceWith('cnpja', { enabled: true })
    expect(container.textContent).toContain('Fonte ativada. Nenhuma consulta foi executada.')
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('0.025')
  })

  it('saves edited costs and per-organization limits without activation or provider calls', async () => {
    await render()
    await change('Custo estimado por consulta', '0.03')
    await change('Máximo de consultas', '10')
    await click('Ativar fonte')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
    await click('Salvar custo e limites')
    expect(radarService.updateDataSource).toHaveBeenCalledExactlyOnceWith('cnpja', { defaultCostPerUnit: 0.03, rateLimitPerDay: 10 })
    expect(container.textContent).toContain('Custo e limites salvos. Nenhuma consulta foi executada.')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('blocks paid activation until a cost is saved, but permits entering that cost', async () => {
    vi.mocked(radarService.getAdminDataSources).mockResolvedValue([source({ defaultCostPerUnit: 0 })])
    await render()
    await click('Ativar fonte')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Custo por consulta ainda não definido')
    await change('Custo estimado por consulta', '0.025')
    await click('Salvar custo e limites')
    expect(radarService.updateDataSource).toHaveBeenCalledOnce()
  })

  it('rejects invalid daily limits and keeps activation off when the provider is not configured', async () => {
    await render([])
    await click('Ativar fonte')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
    await change('Máximo de consultas', '1.5')
    await click('Salvar custo e limites')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Provedor não configurado')
  })

  it('allows deactivation even when the provider is unavailable', async () => {
    vi.mocked(radarService.getAdminDataSources).mockResolvedValue([source({ enabled: true })])
    await render([])
    await click('Desativar fonte')
    expect(radarService.updateDataSource).toHaveBeenCalledExactlyOnceWith('cnpja', { enabled: false })
  })

  it('does not activate when the administrator cancels the credit-consumption warning', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    await render()
    await click('Ativar fonte')
    expect(radarService.updateDataSource).not.toHaveBeenCalled()
  })

  it('preserves unsaved edits on update failure and permits retry', async () => {
    vi.mocked(radarService.updateDataSource).mockRejectedValueOnce(new Error('temporary'))
    await render()
    await change('Máximo de consultas', '15')
    await click('Salvar custo e limites')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível salvar')
    expect([...container.querySelectorAll<HTMLInputElement>('input')].some(input => input.value === '15')).toBe(true)
    await click('Salvar custo e limites')
    expect(radarService.updateDataSource).toHaveBeenCalledTimes(2)
  })

  it('keeps organization-specific sources distinct from global sources and Brave permissions visible', async () => {
    vi.mocked(radarService.getAdminDataSources).mockResolvedValue([source(), source({ id: 'client-source',
      organizationId: 'client-org', organizationName: 'Cliente Alfa', sourceType: 'brave_place_search' })])
    await render([provider(), provider({ providerKey: 'brave_place', publicConfig: {
      retentionLicensed: true, clientDeliveryLicensed: true, credentialPurpose: 'licensed_retention',
    } })])
    expect(container.textContent).toContain('Cliente Alfa')
    expect(container.textContent).toContain('Retenção confirmada')
    expect(container.textContent).toContain('Entrega ao cliente confirmada')
    expect(container.querySelectorAll('article')).toHaveLength(2)
  })

  it('shows load failures and retries without silently falling back to a default catalog', async () => {
    vi.mocked(radarService.getAdminDataSources).mockRejectedValueOnce(new Error('network'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar')
    await click('Atualizar fontes')
    expect(container.querySelectorAll('article')).toHaveLength(1)
  })
})
