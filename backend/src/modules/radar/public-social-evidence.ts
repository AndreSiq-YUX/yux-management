import {extractRadarContacts} from './contact-evidence.js'
import {inspectRadarBusinessSite} from './b2b-site-inspection.js'
import type {RadarSiteEvidence} from './site-evidence.js'
import {isRadarPublicProfile} from './social-profile.js'
export {isRadarPublicProfile} from './social-profile.js'

export async function collectRadarPublicSocialEvidence(input:{linkedPages:RadarSiteEvidence[];remainingPages:number;remainingAttempts:number;deadlineAt:number;existingPages?:RadarSiteEvidence[]},
  dependencies:{inspect?:typeof inspectRadarBusinessSite;signal?:AbortSignal;checkpoint?:(page:RadarSiteEvidence)=>Promise<void>}={}) {
  const pages:RadarSiteEvidence[]=[]
  const seen=new Set((input.existingPages??[]).map(page=>page.url))
  const links=input.linkedPages.filter(page=>!page.limitation).flatMap(page=>extractRadarContacts(page,'review')
    .filter(contact=>contact.kind==='social'&&isRadarPublicProfile(contact.value)).map(contact=>({url:contact.value,linkedFromUrl:page.url})))
  for(const link of links) {
    if(seen.has(link.url))continue
    if(pages.length>=input.remainingAttempts||pages.filter(page=>!page.limitation).length>=input.remainingPages||Date.now()>=input.deadlineAt)break
    dependencies.signal?.throwIfAborted();seen.add(link.url)
    // No website TLS exception, session, login, custom cookies or form submission is passed to social hosts.
    const result=await (dependencies.inspect??inspectRadarBusinessSite)(link.url)
    const url=result.finalUrl??link.url
    let limitation=result.status==='verified_present'?undefined:result.reason??'social_public_content_unavailable'
    const requested=new URL(link.url),final=new URL(url)
    if(final.hostname.replace(/^www\./,'')!==requested.hostname.replace(/^www\./,'')||final.pathname.replace(/\/$/,'')!==requested.pathname.replace(/\/$/,'')||!isRadarPublicProfile(url))limitation='social_profile_redirect_requires_review'
    if(/<input\b[^>]*type=["']password|captcha|log in to (?:facebook|instagram|linkedin)|fa[çc]a login para/i.test(`${result.html??''} ${result.text??''}`))limitation='social_public_content_unavailable'
    const page:RadarSiteEvidence={url:link.url,linkedFromUrl:link.linkedFromUrl,observedAt:result.checkedAt,
      text:limitation?'':result.text??'',html:limitation?undefined:result.html,limitation,diagnostic:result.diagnostic}
    pages.push(page);await dependencies.checkpoint?.(page)
  }
  return pages
}
