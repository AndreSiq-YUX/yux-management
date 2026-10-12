import { z } from 'zod'
import type { RadarSiteEvidence } from './site-evidence.js'
import { radarSizeMetrics } from './search-configuration.js'

const claimSchema=z.object({value:z.string().trim().min(1).max(1500),evidenceId:z.string().max(50),
  excerpt:z.string().trim().min(8).max(2000),scope:z.enum(['establishment','group','unresolved']).default('unresolved'),
  publishedAt:z.string().optional(),
})
const signalSchema=claimSchema.extend({metric:z.enum(radarSizeMetrics),amount:z.number().nonnegative(),
  referenceDate:z.iso.date().optional(),currency:z.enum(['BRL']).optional()})
const profileSchema=z.object({summary:claimSchema.optional(),services:z.array(claimSchema).max(20).default([]),
  customerSegments:z.array(claimSchema).max(20).default([]),operatingRegions:z.array(claimSchema).max(20).default([]),
  scaleSignals:z.array(signalSchema).max(20).default([])})
export type RadarProfileClaim=z.infer<typeof claimSchema>&{sourceUrl:string;observedAt:string}
export type RadarScaleSignal=z.infer<typeof signalSchema>&{sourceUrl:string;observedAt:string}
export type RadarCompanyProfile={summary?:RadarProfileClaim;services:RadarProfileClaim[];customerSegments:RadarProfileClaim[];
  operatingRegions:RadarProfileClaim[];scaleSignals:RadarScaleSignal[]}
const metricEvidence:Record<typeof radarSizeMetrics[number],RegExp>={employees:/funcion[aá]ri|colaborador|empregad|employees/i,
  units:/unidades|filiais|lojas|plantas|restaurantes|units/i,annualRevenue:/faturamento|receita|revenue/i,
  annualMeals:/refei[çc][õo]es|meals/i,capital:/capital social|capital declarado/i,yearsActive:/\b\d+\s+anos\b/i}

function hasAnnualPeriod(metric:string,excerpt:string) {
  if(metric!=='annualRevenue'&&metric!=='annualMeals')return true
  // A publication year does not turn a daily/monthly quantity into an annual one.
  return /\banual\b|\banuais\b|\bpor ano\b|\bao ano\b|\bannual(?:ly)?\b/i.test(excerpt)
    && !/\bdi[aá]ri[oa]s?\b|\bmensal\b|\bmensais\b|\bpor (?:dia|m[eê]s)\b|\b(?:daily|monthly)\b/i.test(excerpt)
}

// Locale-aware numbers; never interpret registered capital as turnover.
export function radarEvidenceNumbers(text:string) {
  return (text.match(/\d+(?:[.,]\d+)*/g)??[]).map(value=>Number(value.includes(',')?value.replaceAll('.','').replace(',','.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(value)?value.replaceAll('.',''):value))
}
export function validateRadarCompanyProfile(raw:unknown,evidence:RadarSiteEvidence[]):RadarCompanyProfile {
  const parsed=profileSchema.safeParse(raw)
  if(!parsed.success)throw new Error('radar_profile_unverifiable')
  function verify<T extends z.infer<typeof claimSchema>>(claim:T):T&{sourceUrl:string;observedAt:string} {
    const index=/^page-(\d+)$/.exec(claim.evidenceId),page=index?evidence[Number(index[1])]:undefined
    if(!page||page.limitation||!page.text.slice(0,12000).includes(claim.excerpt)
      ||radarEvidenceNumbers(claim.value).some(number=>!radarEvidenceNumbers(claim.excerpt).includes(number))
      ||claim.publishedAt&&!claim.excerpt.includes(claim.publishedAt))throw new Error('radar_profile_unverifiable')
    return {...claim,sourceUrl:page.url,observedAt:page.observedAt}
  }
  const profile=parsed.data
  return {summary:profile.summary?verify(profile.summary):undefined,services:profile.services.map(verify),
    customerSegments:profile.customerSegments.map(verify),operatingRegions:profile.operatingRegions.map(verify),
    scaleSignals:profile.scaleSignals.map(signal=>{
      const result=verify(signal)
      if(!radarEvidenceNumbers(signal.excerpt).includes(signal.amount)||!metricEvidence[signal.metric].test(signal.excerpt)||!hasAnnualPeriod(signal.metric,signal.excerpt)
        ||signal.referenceDate&&!signal.excerpt.includes(signal.referenceDate)&&!signal.excerpt.includes(signal.referenceDate.slice(0,4))
        ||signal.currency==='BRL'&&!/R\$|BRL|reais/i.test(signal.excerpt))throw new Error('radar_profile_unverifiable')
      return result
    })}
}
