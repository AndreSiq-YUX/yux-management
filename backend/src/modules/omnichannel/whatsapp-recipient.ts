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

/**
 * Digit-only identities that may represent the same WhatsApp sender, used to
 * link an inbound message to a contact/lead registered by phone. Numbers
 * without a country code are treated as Brazilian (CRM leads are stored as
 * typed: "(47) 99999-8888").
 */
export function whatsAppPhoneCandidates(...values: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>()
  for (const value of values) {
    const digits = (value ?? '').replace(/\D/g, '')
    if (!digits) continue
    const international = /^[1-9]\d9?[6-9]\d{7}$/.test(digits) || /^[1-9]\d[2-5]\d{7}$/.test(digits)
      ? `55${digits}`
      : digits
    for (const identity of whatsAppRecipientIdentities(international)) candidates.add(identity)
  }
  return [...candidates]
}

export function resolveWhatsAppTestRecipient(confirmed: unknown, contactPhone: string): string {
  if (typeof confirmed !== 'string') throw new Error('whatsapp_test_recipient_mismatch')
  const identities = whatsAppRecipientIdentities(confirmed)
  const contact = whatsAppRecipientIdentities(contactPhone)[0]
  if (!contact || !identities.includes(contact)) throw new Error('whatsapp_test_recipient_mismatch')
  return identities[0]!
}
