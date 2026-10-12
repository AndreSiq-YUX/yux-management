import type { RadarSiteEvidence } from './site-evidence.js'
import { radarHtmlLinks } from './site-evidence.js'
import { isRadarSocialUrl } from './site-discovery.js'
import sanitizeHtml from 'sanitize-html'
export type RadarContactPurpose='general'|'suppliers'|'sales'|'finance'|'recruitment'|'unknown'
export type RadarContactEvidence = { kind: 'phone' | 'email' | 'whatsapp' | 'social' | 'business_person'; value: string;
  sourceUrl: string; observedAt: string; association: 'confirmed' | 'review'; note?: string; preferred?:boolean;
  purpose?:RadarContactPurpose;purposeEvidence?:string;scope?:'establishment'|'group'|'unresolved' }
function contactContext(text:string,value:string) {
  const index=text.toLowerCase().indexOf(value.toLowerCase())
  return index>=0?text.slice(Math.max(0,index-180),index):''
}
function purposeFromContext(context:string):RadarContactPurpose {
  context=context.replace(/(?:https?:\/\/|mailto:|tel:)[^\s]+/gi,'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'')
  const indicators:Array<[RadarContactPurpose,RegExp]>=[['suppliers',/fornecedor(?:es)?|suprimentos|oferecer (?:meus|seus|nossos) produtos/gi],
    ['sales',/comercial|proposta|vendas/gi],['finance',/financeiro|fiscal|faturamento/gi],
    ['recruitment',/vagas|recrutamento|curr[ií]culo|carreiras/gi],['general',/fale conosco|contato geral|entre em contato/gi],
    ['unknown',/\bCEP\b|endere[çc]o|canal de [ée]tica|pol[ií]tica de privacidade|\bCNPJ\b/gi]]
  let purpose:RadarContactPurpose='unknown',last=-1
  for(const [kind,pattern]of indicators)for(const match of context.matchAll(pattern))if(match.index>last){purpose=kind;last=match.index}
  return purpose
}
export function normalizeRadarPhone(value: string): string | undefined {
  let digits = value.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  if (!/^[1-9]\d[2-9]\d{7,8}$/.test(digits)) return
  return `+55${digits}`
}
export function extractRadarContacts(page: RadarSiteEvidence, association: 'confirmed' | 'review' = 'confirmed'): RadarContactEvidence[] {
  const contacts: RadarContactEvidence[] = []
  // Preserve a link's published position, including mailto contacts absent from visible text.
  // Never use text AFTER a contact: that often belongs to the next department.
  const contextualText=page.html?sanitizeHtml(page.html,{allowedTags:['span'],allowedAttributes:{},nonTextTags:['script','style','noscript'],
    transformTags:{a:(_tag,attributes)=>({tagName:'span',attribs:{},text:` ${attributes.href??''} `})}}).replace(/<\/?span>/g,' ').replace(/\s+/g,' '):page.text
  const add = (kind: RadarContactEvidence['kind'], value: string | undefined, note?: string, contextValue?:string) => {
    const context=contactContext(contextualText,contextValue??value??'')
    if(/desenvolvido por|created by|powered by/i.test(context.slice(-100)))return
    const purpose=purposeFromContext(context)
    const existing=contacts.find(item=>item.kind===kind&&item.value===value)
    if(existing){if(existing.purpose==='unknown'&&purpose!=='unknown'){existing.purpose=purpose;existing.purposeEvidence=context.trim()}return}
    if (value) contacts.push({ kind, value, sourceUrl: page.url, observedAt: page.observedAt, association, note,
      purpose,purposeEvidence:purpose!=='unknown'?context.trim():undefined,scope:association==='confirmed'?'establishment':'unresolved' })
  }
  const email = (value: string) => { for (const match of value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) add('email', match[0].toLowerCase()) }
  email(page.text)
  for (const match of page.text.matchAll(/(?<!\d)(?:\+?55[\s.-]*)?\(?[1-9]\d\)?[\s.-]*[2-9]\d{3,4}[\s.-]?\d{4}(?!\d)/g)) add('phone', normalizeRadarPhone(match[0]),undefined,match[0])
  for (const link of radarHtmlLinks(page.html ?? '')) {
    if (/^mailto:/i.test(link)) { try { email(decodeURIComponent(link.split('?')[0].slice(7))) } catch { /* malformed link */ } }
    if (/^tel:/i.test(link)) add('phone', normalizeRadarPhone(link.slice(4)))
    try {
      const url = new URL(link, page.url)
      if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com' && url.pathname === '/send') {
        const phone = normalizeRadarPhone(url.hostname === 'wa.me' ? url.pathname : url.searchParams.get('phone') ?? '')
        if (phone) add('whatsapp', phone, 'Link público observado; conta e consentimento não verificados.',link)
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
