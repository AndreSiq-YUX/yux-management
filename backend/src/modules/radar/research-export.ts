import type { RadarCompanyProfile } from './company-profile.js'
import type { RadarContactEvidence } from './contact-evidence.js'
import type { assessRadarCompanySize } from './company-size.js'
export function radarCompanyExportFields(payload:Record<string,unknown>,contacts:RadarContactEvidence[]) {
  const profile=payload.companyProfile as RadarCompanyProfile|undefined,size=payload.sizeAssessment as ReturnType<typeof assessRadarCompanySize>|undefined
  const listed=(items?:RadarCompanyProfile['services'])=>items?.map(item=>`${item.value} [${item.sourceUrl}]`).join(' | ')??''
  return {companySummary:profile?.summary?`${profile.summary.value} [${profile.summary.sourceUrl}]`:'',services:listed(profile?.services),
    customerSegments:listed(profile?.customerSegments),operatingRegions:listed(profile?.operatingRegions),
    supplierEmails:contacts.filter(item=>item.association==='confirmed'&&item.kind==='email'&&item.purpose==='suppliers').map(item=>item.value).join(' | '),
    sizeScore:size?.score===null||size?.score===undefined?'':String(size.score),sizeCoverage:size?String(size.evidenceCoverage):'',
    sizeEvidence:size?.contributions.map(item=>`${item.metric}: ${item.amount}; referência ${item.referenceDate??'desconhecida'}; ${item.sourceUrl}`).join(' | ')??''}
}
