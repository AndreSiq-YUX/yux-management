import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LeadProfileFields } from './LeadProfileFields'
import { LeadProfilePanel } from './LeadProfilePanel'
import { CrmRecordConfiguration } from './CrmRecordConfiguration'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
import type { CrmCustomField, LeadProfile } from '@/types/crmRecordProfile'

vi.mock('@/services/crmRecordProfileService', () => ({ crmRecordProfileService: {
  getConfiguration: vi.fn(), getProfile: vi.fn(), saveProfile: vi.fn(),
  createRecordType: vi.fn(), patchRecordType: vi.fn(), createField: vi.fn(), patchField: vi.fn(),
} }))

const field = (stableKey: string, fieldType: CrmCustomField['fieldType'], recordTypeId: string | null): CrmCustomField => ({
  id: stableKey, stableKey, crmInstanceId: 'crm-1', label: stableKey, fieldType, recordTypeId,
  options: ['Pequeno', 'Grande'], required: true, isActive: true, orderIndex: 0,
})
const profile: LeadProfile = {
  canConfigure: true, maxFieldCount: 20, recordTypeId: 'kitchen', values: { kitchens: 2, stores: 5, delivery: false },
  recordTypes: [{ id: 'kitchen', crmInstanceId: 'crm-1', name: 'Cozinha industrial', isActive: true },
    { id: 'market', crmInstanceId: 'crm-1', name: 'Mercado', isActive: true }],
  fields: [field('kitchens', 'number', 'kitchen'), field('stores', 'number', 'market'), field('delivery', 'boolean', null)],
}
const mounted: Array<{ root: Root; container: HTMLDivElement }> = []
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
async function mount(element: React.ReactNode) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); mounted.push({ root, container })
  await act(async () => { root.render(element); await flush(); await flush() })
  return container
}
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    await flush()
  })
}
async function submit(form: HTMLFormElement) {
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); await flush() })
}
afterEach(() => { for (const { root, container } of mounted.splice(0)) { act(() => root.unmount()); container.remove() } })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(crmRecordProfileService.getProfile).mockResolvedValue(profile)
  vi.mocked(crmRecordProfileService.getConfiguration).mockResolvedValue(profile)
})

describe('Lead profile fields', () => {
  it('shows applicable fields and preserves zero and false when switching types', async () => {
    function Form() {
      const [type, setType] = useState<string | null>('kitchen')
      const [values, setValues] = useState({ kitchens: 0, delivery: false })
      return <LeadProfileFields configuration={profile} recordTypeId={type} values={values} onTypeChange={setType} onValuesChange={next => setValues(next as typeof values)} />
    }
    const container = await mount(<Form />)
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('0')
    expect(container.querySelectorAll('select')[1].value).toBe('false')
    const selector = container.querySelector('select')!
    await change(selector, 'market')
    expect(container.textContent).toContain('stores')
    expect(container.textContent).not.toContain('kitchens')
    await change(selector, 'kitchen')
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('0')
  })

  it('retains an archived current type without allowing new selections of it', async () => {
    const configuration = { ...profile, recordTypes: profile.recordTypes.map(type => ({ ...type, isActive: type.id !== 'kitchen' })) }
    const container = await mount(<LeadProfileFields configuration={configuration} recordTypeId="kitchen" values={profile.values} onTypeChange={() => {}} onValuesChange={() => {}} />)
    expect(container.querySelector<HTMLOptionElement>('option[value="kitchen"]')!.disabled).toBe(true)
    expect(container.textContent).toContain('Cozinha industrial (arquivado)')
  })
})

describe('Lead profile editing', () => {
  it('saves only applicable answers and shows confirmation', async () => {
    vi.mocked(crmRecordProfileService.saveProfile).mockResolvedValue({ recordTypeId: 'market', values: { ...profile.values, stores: 8 } })
    const container = await mount(<LeadProfilePanel leadId="lead-1" />)
    await change(container.querySelector('select')!, 'market')
    await change(container.querySelector<HTMLInputElement>('input[type="number"]')!, '8')
    await submit(container.querySelector('form')!)
    expect(crmRecordProfileService.saveProfile).toHaveBeenCalledWith('lead-1', { recordTypeId: 'market', values: { stores: 8, delivery: false } })
    expect(container.textContent).toContain('Perfil salvo.')
  })

  it('keeps edited answers when saving fails', async () => {
    vi.mocked(crmRecordProfileService.saveProfile).mockRejectedValue(new Error('Sem conexão'))
    const container = await mount(<LeadProfilePanel leadId="lead-1" />)
    await change(container.querySelector<HTMLInputElement>('input[type="number"]')!, '12')
    await submit(container.querySelector('form')!)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Sem conexão')
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('12')
  })

  it('offers retry after loading fails', async () => {
    vi.mocked(crmRecordProfileService.getProfile).mockRejectedValueOnce(new Error('Falha temporária')).mockResolvedValueOnce(profile)
    const container = await mount(<LeadProfilePanel leadId="lead-1" />)
    expect(container.textContent).toContain('Falha temporária')
    await act(async () => { container.querySelector('button')!.click(); await flush(); await flush() })
    expect(container.textContent).toContain('Tipo de cliente')
  })
})

describe('CRM type and field configuration', () => {
  it('creates numeric fields scoped to a selected customer type', async () => {
    vi.mocked(crmRecordProfileService.createField).mockResolvedValue(field('new-field', 'number', 'kitchen'))
    const container = await mount(<CrmRecordConfiguration crmInstanceId="crm-1" />)
    await change(container.querySelector<HTMLSelectElement>('#crm-field-scope')!, 'kitchen')
    await change(container.querySelector<HTMLInputElement>('#crm-field-label')!, 'Refeições diárias')
    await change(container.querySelector<HTMLSelectElement>('#crm-field-type')!, 'number')
    await submit(container.querySelectorAll('form')[1])
    expect(crmRecordProfileService.createField).toHaveBeenCalledWith({ crmInstanceId: 'crm-1', recordTypeId: 'kitchen', label: 'Refeições diárias', fieldType: 'number', required: false, options: [], orderIndex: 3 })
  })

  it('hides configuration actions for members without permission', async () => {
    vi.mocked(crmRecordProfileService.getConfiguration).mockResolvedValue({ ...profile, canConfigure: false })
    const container = await mount(<CrmRecordConfiguration crmInstanceId="crm-1" />)
    expect(container.textContent).toContain('administradores autorizados')
    expect(container.querySelectorAll('form')).toHaveLength(0)
  })
})
