/** Identificadores fixos da cliente ficticia "Clinica Sorriso Pleno". */
export const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  organization: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333',
  contract: '44444444-4444-4444-8444-444444444444',
  package: '55555555-5555-4555-8555-555555555555',
}

export const CLIENT = {
  companyName: 'Clínica Sorriso Pleno',
  contactName: 'Mariana Costa',
  email: 'mariana.costa@sorrisopleno.example',
  phone: '(11) 98888-1234',
  site: 'https://sorrisopleno.example',
}

export const ALL_MODULE_KEYS = [
  'crm',
  'whatsapp_ai',
  'landing_pages',
  'campaigns',
  'marketing_studio',
  'bi_reports',
  'automations',
  'projects',
  'proposals',
  'support',
  'finance',
  'action_engine',
]

/** UUID deterministico (formato v4) a partir de um tipo e um numero. */
export function uid(kind: string, n = 0): string {
  let h1 = 0x811c9dc5
  let h2 = 0x1b873593
  const text = `${kind}:${n}`
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 + text.charCodeAt(i), 2654435761) >>> 0
  }
  const hex = (value: number) => value.toString(16).padStart(8, '0')
  const a = hex(h1)
  const b = hex(h2)
  const c = hex(Math.imul(h1, 31) >>> 0)
  const d = hex(Math.imul(h2, 17) >>> 0)
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c.slice(4)}${d}`
}
