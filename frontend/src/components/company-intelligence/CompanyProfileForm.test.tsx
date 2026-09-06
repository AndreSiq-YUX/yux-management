import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { CompanyProfileForm } from './CompanyProfileForm'
import type { CompanyProfile } from '@/types/companyIntelligence'

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

describe('CompanyProfileForm', () => {
  it('preserves an in-progress edit when the same persisted profile is rendered again', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onSave = vi.fn().mockResolvedValue(undefined)
    const render = (nextProfile: CompanyProfile) => (
      <CompanyProfileForm profile={nextProfile} onSave={onSave} />
    )

    act(() => root.render(render(profile)))
    const tradeName = container.querySelector<HTMLInputElement>('#trade-name')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(tradeName, 'Empresa A em edição')
      tradeName.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(tradeName.value).toBe('Empresa A em edição')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)

    act(() => root.render(render({ ...profile })))

    expect(container.querySelector<HTMLInputElement>('#trade-name')!.value).toBe('Empresa A em edição')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)

    act(() => root.unmount())
  })
})
