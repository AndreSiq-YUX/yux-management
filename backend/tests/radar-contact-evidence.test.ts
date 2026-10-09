import { expect, it } from 'vitest'
import { extractRadarContacts, normalizeRadarPhone } from '../src/modules/radar/contact-evidence.js'
it('extracts_href_only_contacts_with_sources_and_no_whatsapp_guess', () => {
  const page = { url: 'https://alfa.example/contato', observedAt: '2026-10-08', text: '', html: '<a href="mailto:comercial@alfa.example">Escreva</a><a href="tel:+554133334444">Ligue</a><a href="https://wa.me/5541999998888">WhatsApp</a><a href="https://instagram.com/alfa">Instagram</a>' }
  const contacts = extractRadarContacts(page)
  expect(contacts.map(item => item.kind)).toEqual(expect.arrayContaining(['phone','email','whatsapp','social']))
  expect(contacts.every(item => item.sourceUrl === page.url && item.observedAt === page.observedAt)).toBe(true)
  expect(contacts.filter(item => item.kind === 'whatsapp')).toHaveLength(1)
})
it('normalizes_brazilian_phones_without_inventing_digits', () => {
  expect(normalizeRadarPhone('(41) 3333-4444')).toBe('+554133334444')
  expect(normalizeRadarPhone('99999-8888')).toBeUndefined()
  expect(normalizeRadarPhone('+55 41 99999-8888')).toBe('+5541999998888')
})
