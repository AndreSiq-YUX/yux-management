import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanyProfileForm } from './CompanyProfileForm'
import type { CompanyProfile } from '@/types/companyIntelligence'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profile: CompanyProfile = {
  id: 'profile-1',
  organizationId: 'organization-1',
  legalName: 'Empresa A Ltda.',
  tradeName: 'Empresa A',
  description: 'Descrição institucional.',
  industry: 'Serviços',
  positioning: 'Consultoria especializada.',
  differentiators: ['Atendimento consultivo'],
  emails: ['contato@example.com'],
  phones: ['+5511000000000'],
  address: { city: 'São Paulo', state: 'SP' },
  businessHours: {},
  serviceRegions: ['São Paulo'],
  socialLinks: {},
  updatedAt: '2026-09-05T12:00:00.000Z',
}

afterEach(() => { document.body.innerHTML = '' })

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function mount(node: JSX.Element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (next: JSX.Element) => act(() => root.render(<MemoryRouter>{next}</MemoryRouter>))
  render(node)
  return { container, root, render }
}

const saveButton = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Salvar alterações'))

describe('CompanyProfileForm', () => {
  it('mostra a barra de salvar só com alterações e preserva a edição quando o mesmo perfil é renderizado de novo', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { container, root, render } = mount(<CompanyProfileForm profile={profile} onSave={onSave} />)

    expect(saveButton(container)).toBeUndefined()
    const tradeName = container.querySelector<HTMLInputElement>('#trade-name')!
    act(() => setValue(tradeName, 'Empresa A em edição'))

    expect(container.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull()
    expect(saveButton(container)!.disabled).toBe(false)

    render(<CompanyProfileForm profile={{ ...profile }} onSave={onSave} />)

    expect(container.querySelector<HTMLInputElement>('#trade-name')!.value).toBe('Empresa A em edição')
    expect(saveButton(container)).toBeDefined()
    act(() => root.unmount())
  })

  it('volta ao estado sem alterações ao descartar', () => {
    const { container, root } = mount(<CompanyProfileForm profile={profile} onSave={vi.fn()} />)
    act(() => setValue(container.querySelector<HTMLInputElement>('#industry')!, 'Outro'))
    const discard = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Descartar')!
    act(() => discard.click())
    expect(container.querySelector<HTMLInputElement>('#industry')!.value).toBe('Serviços')
    expect(saveButton(container)).toBeUndefined()
    act(() => root.unmount())
  })

  it('mostra "Perfil X% completo" com os campos que faltam como atalhos que focam o campo', () => {
    const { container, root } = mount(<CompanyProfileForm profile={profile} onSave={vi.fn()} />)
    const meter = container.querySelector('[aria-label="Preenchimento do perfil"]')!
    expect(meter.textContent).toMatch(/Perfil \d+% completo/)
    expect(meter.textContent).not.toContain('Perfil 100% completo')

    const siteLink = Array.from(meter.querySelectorAll('button')).find(button => button.textContent === 'Site')!
    expect(siteLink).toBeDefined()
    act(() => siteLink.click())
    expect(document.activeElement?.id).toBe('website')
    act(() => root.unmount())
  })

  it('tem seções, horário de atendimento e endereço completo, e renomeia as observações para a equipe YUX', () => {
    const { container, root } = mount(<CompanyProfileForm profile={profile} onSave={vi.fn()} />)
    for (const title of ['Identificação', 'Contato', 'Presença online', 'Posicionamento', 'Atendimento']) {
      expect(Array.from(container.querySelectorAll('h2')).some(h2 => h2.textContent === title)).toBe(true)
    }
    for (const id of ['address-street', 'address-number', 'address-district', 'address-city', 'address-state', 'address-zip', 'hours-monday-enabled']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.textContent).toContain('Observações para a equipe YUX')
    expect(container.textContent).not.toContain('Observações internas')
    expect(container.textContent).not.toContain('Valor contratado')
    act(() => root.unmount())
  })

  it('salva horário e endereço estruturados', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { container, root } = mount(<CompanyProfileForm profile={profile} onSave={onSave} />)
    act(() => container.querySelector<HTMLInputElement>('#hours-monday-enabled')!.click())
    act(() => setValue(container.querySelector<HTMLInputElement>('#address-zip')!, '01310100'))
    await act(async () => { saveButton(container)!.click() })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      businessHours: { monday: { open: '09:00', close: '18:00' } },
      address: expect.objectContaining({ city: 'São Paulo', zip: '01310-100' }),
    }))
    act(() => root.unmount())
  })

  it('mostra a pré-visualização do logo da marca quando existe', () => {
    const { container, root } = mount(<CompanyProfileForm profile={profile} onSave={vi.fn()} logoUrl="https://example.com/logo.svg" />)
    expect(container.querySelector('img[alt="Logo da empresa"]')?.getAttribute('src')).toBe('https://example.com/logo.svg')
    act(() => root.unmount())
  })
})

it('keeps business roles read-only for members',()=>{
 const {container,root}=mount(<CompanyProfileForm profile={profile} readOnly onSave={vi.fn()}/>)
 expect(container.querySelector('input[type="checkbox"]')?.closest('fieldset[disabled]')).not.toBeNull()
 act(()=>root.unmount())
})
