import type { RadarSiteEvidence } from './site-evidence.js'
import { radarHtmlLinks } from './site-evidence.js'
import { isRadarSocialUrl } from './site-discovery.js'
export type RadarContactEvidence = { kind: 'phone' | 'email' | 'whatsapp' | 'social' | 'business_person'; value: string;
  sourceUrl: string; observedAt: string; association: 'confirmed' | 'review'; note?: string }
export function normalizeRadarPhone(value: string): string | undefined {
  let digits = value.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  if (!/^[1-9]\d[2-9]\d{7,8}$/.test(digits)) return
  return `+55${digits}`
}
export function extractRadarContacts(page: RadarSiteEvidence, association: 'confirmed' | 'review' = 'confirmed'): RadarContactEvidence[] {
  const contacts: RadarContactEvidence[] = []
  const add = (kind: RadarContactEvidence['kind'], value: string | undefined, note?: string) => {
    if (value && !contacts.some(item => item.kind === kind && item.value === value)) contacts.push({ kind, value, sourceUrl: page.url, observedAt: page.observedAt, association, note })
  }
  const email = (value: string) => { for (const match of value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) add('email', match[0].toLowerCase()) }
  email(page.text)
  for (const match of page.text.matchAll(/(?:\+?55[\s.-]*)?\(?[1-9]\d\)?[\s.-]*[2-9]\d{3,4}[\s.-]?\d{4}(?!\d)/g)) add('phone', normalizeRadarPhone(match[0]))
  for (const link of radarHtmlLinks(page.html ?? '')) {
    if (/^mailto:/i.test(link)) { try { email(decodeURIComponent(link.split('?')[0].slice(7))) } catch { /* malformed link */ } }
    if (/^tel:/i.test(link)) add('phone', normalizeRadarPhone(link.slice(4)))
    try {
      const url = new URL(link, page.url)
      if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com' && url.pathname === '/send') {
        const phone = normalizeRadarPhone(url.hostname === 'wa.me' ? url.pathname : url.searchParams.get('phone') ?? '')
        if (phone) add('whatsapp', phone, 'Link público observado; conta e consentimento não verificados.')
      } else if (isRadarSocialUrl(url.toString()) && !/whatsapp/.test(url.hostname)) add('social', url.toString())
    } catch { /* Ignore non-URL href values. */ }
  }
  // Parse only public structured business fields. Never execute scripts or import owner/person registries.
  for (const match of (page.html ?? '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(match[1])
      const visit = (item: unknown, depth = 0) => {
        if (!item || typeof item !== 'object' || depth > 4) return
        if (Array.isArray(item)) { for (const entry of item.slice(0, 30)) visit(entry, depth + 1); return }
        const record = item as Record<string, unknown>
        if (typeof record.email === 'string') email(record.email)
        if (typeof record.telephone === 'string') add('phone', normalizeRadarPhone(record.telephone))
        if (record['@type'] === 'Person' && typeof record.name === 'string' && typeof record.jobTitle === 'string') add('business_person', `${record.name.slice(0,100)} — ${record.jobTitle.slice(0,100)}`)
        for (const key of ['@graph','contactPoint','employee']) visit(record[key], depth + 1)
      }
      visit(parsed)
    } catch { /* Invalid structured data is not evidence. */ }
  }
  return contacts.slice(0, 60)
}
