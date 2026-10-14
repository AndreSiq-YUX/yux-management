import type { RadarSiteEvidence } from './site-evidence.js'
import type {RadarContactEvidence} from './contact-evidence.js'
import {isRadarInstitutionalSource} from './source-identity.js'
export function assessRadarBusinessActivity(evidence: RadarSiteEvidence[],contacts:RadarContactEvidence[]=[],presence?:{pages:RadarSiteEvidence[];scope?:'establishment'|'group'|'unresolved'}) {
  const presenceSignals:Array<{kind:'accessible_site'|'published_contact'|'contact_form'|'linked_profile';sourceUrl:string;observedAt:string;excerpt:string;association:'confirmed'|'review';scope:'establishment'|'group'|'unresolved'}>=[]
  for(const page of presence?.pages??evidence)if(!page.limitation&&!!page.text&&isRadarInstitutionalSource(page.url,{text:page.text})) {
    const confirmed=evidence.some(item=>item.url===page.url)
    presenceSignals.push({kind:'accessible_site',sourceUrl:page.url,observedAt:page.observedAt,excerpt:'Página institucional acessível na data da consulta.',association:confirmed?'confirmed':'review',scope:confirmed?presence?.scope??'establishment':'unresolved'})
  }
  for(const contact of contacts)if(contact.kind!=='business_person')presenceSignals.push({kind:contact.kind==='contact_form'?'contact_form':contact.kind==='social'?'linked_profile':'published_contact',sourceUrl:contact.sourceUrl,observedAt:contact.observedAt,excerpt:contact.value,association:contact.association,scope:contact.scope??'unresolved'})
  const signals: Array<{ kind: 'operation' | 'closure'; sourceUrl: string; observedAt: string; excerpt: string; publishedDate?: string }> = []
  for (const page of evidence) {
    const closure = /(?:encerramos (?:nossas )?atividades|permanentemente fechad[oa]|permanently closed|empresa encerrada)/i.exec(page.text)
    const operating = /(?:estamos atendendo|inauguramos|nova unidade|novos clientes|inscri[çc][õo]es abertas)/i.exec(page.text)
    const nearby=page.text.slice(Math.max(0,(operating??closure)?.index??0)-160,((operating??closure)?.index??0)+220)
    const dated = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(nearby)
    if (closure) signals.push({ kind: 'closure', sourceUrl: page.url, observedAt: page.observedAt,
      excerpt: page.text.slice(Math.max(0, closure.index - 50), closure.index + 180), publishedDate: dated?.[1] })
    if (operating && dated && Date.parse(dated[1]) <= Date.parse(page.observedAt)
      && Date.parse(page.observedAt) - Date.parse(dated[1]) < 366 * 86400000) signals.push({ kind: 'operation',
      sourceUrl: page.url, observedAt: page.observedAt, publishedDate: dated[1], excerpt: page.text.slice(Math.max(0, operating.index - 50), operating.index + 180) })
  }
  const closure = signals.some(item => item.kind === 'closure'), operating = signals.some(item => item.kind === 'operation')
  return { status: closure && operating ? 'conflicting' as const : closure ? 'possible_closure' as const : operating ? 'public_signals' as const : 'inconclusive' as const,
    signals,presenceSignals, limitation: 'Sinais públicos não comprovam funcionamento atual, telefone atendido ou disponibilidade comercial.' }
}
