import {normalizeRadarText,type RadarSearchConfiguration} from './search-configuration.js'
export type RadarRegistryGateResult={outcome:'pass'|'block'|'doubt';rule?:string;matchedValue?:string;reasonPt?:string;flags:string[]}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function radarRegistryActivities(payload:unknown):Array<{code:string;text?:string;main:boolean}>{
 const row=object(payload),raw=row.registryActivities??row.activities
 if(Array.isArray(raw))return raw.flatMap(value=>{const activity=object(value),code=String(activity.code??activity.id??'').replace(/\D/g,'');return code?[{code,text:typeof activity.text==='string'?activity.text:undefined,main:activity.main===true}]:[]})
 return Array.isArray(row.cnaes)?row.cnaes.flatMap((value,index)=>typeof value==='string'&&/^\d[\d\/-]+$/.test(value)?[{code:value.replace(/\D/g,''),main:index===0}]:[]):[]
}
export function evaluateRadarRegistryRules(input:{payload:unknown;targetCnaes:string[];configuration:RadarSearchConfiguration}):RadarRegistryGateResult{
 const payload=object(input.payload),rules=input.configuration.qualification.registry
 const names=['tradeName','legalName','title'].map(key=>normalizeRadarText(typeof payload[key]==='string'?payload[key] as string:''))
 const terms=[...input.configuration.excludedNameTerms,...rules.blockedNameTerms]
 const term=terms.find(value=>{const normalized=normalizeRadarText(value);return !!normalized&&names.some(name=>` ${name} `.includes(` ${normalized} `))})
 if(term)return{outcome:'block',rule:'blocked_name_term',matchedValue:term,reasonPt:`Nome corresponde à exclusão configurada: ${term}.`,flags:[]}
 const activities=radarRegistryActivities(payload),main=activities.find(activity=>activity.main)
 const targets=input.targetCnaes.map(value=>value.replace(/\D/g,'')).filter(Boolean),matches=(code:string)=>targets.some(prefix=>code.startsWith(prefix))
 if(main&&matches(main.code))return{outcome:'pass',flags:[]}
 const excluded=main&&rules.blockedMainCnaes.find(prefix=>main.code.startsWith(prefix))
 if(excluded)return{outcome:'block',rule:'blocked_main_cnae',matchedValue:excluded,reasonPt:`Atividade principal corresponde à exclusão configurada: ${excluded}.`,flags:[]}
 const secondary=activities.some(activity=>!activity.main&&matches(activity.code))
 if(rules.mainActivityRule==='target_main_required'&&targets.length&&main)return{outcome:'block',rule:'target_main_required',matchedValue:main.code,reasonPt:'A atividade principal não corresponde aos códigos definidos para esta campanha.',flags:[]}
 if(rules.mainActivityRule!=='any'&&targets.length&&(!main||secondary))return{outcome:'doubt',flags:[main?'target_secondary_only':'registry_main_unknown']}
 return{outcome:'pass',flags:[]}
}
