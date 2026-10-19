import type { RadarResearchPolicy } from './search-configuration.js'
import type { RadarScaleSignal } from './company-profile.js'
import {normalizeRadarCnpjIdentifier} from './cnpj-identifier.js'
export type RadarSizeFact=Omit<RadarScaleSignal,'scope'>&{scope:'establishment'|'group'|'unresolved'}
export function registryRadarSizeFacts(payload:Record<string,unknown>,now=new Date()):RadarSizeFact[] {
  const cnpj=normalizeRadarCnpjIdentifier(payload.cnpj)
  if(!cnpj)return []
  const sourceUrl=`https://cnpja.com/office/${cnpj}`,facts:RadarSizeFact[]=[]
  const opening=typeof payload.openingDate==='string'?payload.openingDate:''
  if(/^\d{4}-\d{2}-\d{2}$/.test(opening)&&Number.isFinite(Date.parse(opening))&&Date.parse(opening)<=now.getTime()) {
    const start=new Date(opening),years=now.getUTCFullYear()-start.getUTCFullYear()
      -(now.getUTCMonth()<start.getUTCMonth()||now.getUTCMonth()===start.getUTCMonth()&&now.getUTCDate()<start.getUTCDate()?1:0)
    facts.push({metric:'yearsActive',amount:years,referenceDate:now.toISOString().slice(0,10),scope:'establishment',
      value:`${years} anos desde a abertura cadastral do estabelecimento`,excerpt:`Data de abertura cadastral: ${opening}`,
      evidenceId:'registry-opening',sourceUrl,observedAt:typeof payload.registryUpdatedAt==='string'?payload.registryUpdatedAt:opening})
  }
  if(typeof payload.capital==='number'&&Number.isFinite(payload.capital)&&payload.capital>=0)facts.push({metric:'capital',amount:payload.capital,
    referenceDate:typeof payload.registryUpdatedAt==='string'?payload.registryUpdatedAt.slice(0,10):undefined,
    scope:cnpj.slice(8,12)==='0001'?'establishment':'group',currency:'BRL',value:'Capital social cadastral; não é faturamento.',
    excerpt:`Capital social declarado: R$ ${payload.capital}`,evidenceId:'registry-capital',sourceUrl,
    observedAt:typeof payload.registryUpdatedAt==='string'?payload.registryUpdatedAt:''})
  return facts
}
export function assessRadarCompanySize(policy:RadarResearchPolicy['sizeAssessment'],facts:RadarSizeFact[],now=new Date()) {
  const contributions:Array<{metric:string;amount:number;points:number;weight:number;sourceUrl:string;referenceDate?:string}>=[]
  const limitations:string[]=[]
  const total=policy.criteria.reduce((sum,criterion)=>sum+criterion.weight,0)
  if(policy.enabled)for(const criterion of policy.criteria) {
    const available=facts.filter(fact=>fact.metric===criterion.metric&&fact.scope==='establishment'&&Number.isFinite(fact.amount)
      &&fact.referenceDate&&Number.isFinite(Date.parse(fact.referenceDate))&&Date.parse(fact.referenceDate)<=now.getTime()
      &&now.getTime()-Date.parse(fact.referenceDate)<=criterion.maxAgeDays*86400000
      &&(!['capital','annualRevenue'].includes(fact.metric)||fact.currency==='BRL'))
      .sort((a,b)=>Date.parse(b.referenceDate!)-Date.parse(a.referenceDate!))
    const fact=available[0]
    if(!fact){limitations.push(`Sem evidência comparável e recente: ${criterion.metric}.`);continue}
    if(available.some(other=>other.referenceDate===fact.referenceDate&&other.amount!==fact.amount)) {
      limitations.push(`Evidências contraditórias: ${criterion.metric}.`);continue
    }
    const band=[...criterion.bands].reverse().find(item=>fact.amount>=item.min)
    if(!band){limitations.push(`Valor fora das faixas configuradas: ${criterion.metric}.`);continue}
    contributions.push({metric:criterion.metric,amount:fact.amount,points:policy.direction==='smaller'?100-band.points:band.points,
      weight:criterion.weight,sourceUrl:fact.sourceUrl,referenceDate:fact.referenceDate})
  }
  const known=contributions.reduce((sum,item)=>sum+item.weight,0)
  if(policy.enabled&&!total)limitations.push('Configure os critérios de porte nesta campanha.')
  return {score:known?Math.round(contributions.reduce((sum,item)=>sum+item.points*item.weight,0)/known):null,
    evidenceCoverage:total?Math.round(100*known/total):0,direction:policy.direction,contributions,limitations}
}
