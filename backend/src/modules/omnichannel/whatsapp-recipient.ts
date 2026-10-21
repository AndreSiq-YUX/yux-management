// Meta may return a Brazilian mobile wa_id without the ninth digit even when
// its sandbox allowlist contains the current telephone number. Match only this
// specific mobile-number equivalence; never rewrite the stored inbound identity.
export function whatsAppRecipientIdentities(value: string): string[] {
  const phone = value.replace(/[\s()+-]/g, '')
  if (!/^[1-9]\d{7,14}$/.test(phone)) return []
  if (/^55[1-9]\d9[6-9]\d{7}$/.test(phone)) return [phone, phone.slice(0, 4) + phone.slice(5)]
  if (/^55[1-9]\d[6-9]\d{7}$/.test(phone)) return [phone, phone.slice(0, 4) + '9' + phone.slice(4)]
  return [phone]
}

export function resolveWhatsAppTestRecipient(confirmed: unknown, contactPhone: string): string {
  if (typeof confirmed !== 'string') throw new Error('whatsapp_test_recipient_mismatch')
  const identities = whatsAppRecipientIdentities(confirmed)
  const contact = whatsAppRecipientIdentities(contactPhone)[0]
  if (!contact || !identities.includes(contact)) throw new Error('whatsapp_test_recipient_mismatch')
  return identities[0]!
}
