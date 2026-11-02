import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { LeadContactDetails } from './LeadContactDetails'
import {safeLeadUrl} from '@/lib/crm/contactLinks'
import { LeadDeleteButton } from './LeadDeleteDialog'
import type { CrmLead } from '@/types/crm'
it('shows usable website, WhatsApp, social profiles and address and uses an accessible deletion icon', () => {
  const lead = {
    id: 'lead',
    name: 'Brave Alimentos',
    email: 'a@alfa.test',
    phone: '+551133334444',
    whatsappPhone: '+5511999998888',
    websiteUrl: 'https://alfa.test',
    address: 'Rua Um, 12',
    city: 'São Paulo',
    state: 'SP',
    canDelete: true,
    commercialProfile: {
      contacts: [
        {
          kind: 'social',
          value: 'https://instagram.com/alfa',
          association: 'confirmed',
        },
      ],
    },
  } as CrmLead
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    act(() =>
      root.render(
        <>
          <LeadContactDetails lead={lead} />
          <LeadDeleteButton lead={lead} />
        </>,
      ),
    )
    expect(host.querySelector('a[href="https://alfa.test/"]')).not.toBeNull()
    expect(
      host.querySelector('a[href="https://wa.me/5511999998888"]'),
    ).not.toBeNull()
    expect(host.textContent).toContain('Rua Um, 12 · São Paulo / SP')
    const remove = host.querySelector(
      'button[aria-label="Excluir Brave Alimentos"]',
    )!
    expect(remove.textContent).toBe('')
    expect(remove.querySelector('svg')).not.toBeNull()
    expect(safeLeadUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeLeadUrl('https://secret:password@alfa.test')).toBeUndefined()
  } finally {
    act(() => root.unmount())
  }
})
