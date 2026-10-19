// Offline evidence evaluator only: this script never invokes a provider.
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
type Cost={kind:'search'|'extraction'|'decision'|'registry'|'research';amount:string|null;currency:'BRL'|'USD';billingOutcome:'known'|'estimated'|'uncertain'}
type Company={identityKey:string;groupKey?:string;verifiedIdentity:boolean;reviewedFit:'compatible'|'outside_profile'|'investigate';existing:boolean;complete:boolean;usefulContact:boolean;latencyMs?:number}
export type DiscoverySourceSample={source:string;strategy:string;segment:string;region:string;queryPlanVersion:string;startedAt:string;status:'evaluated'|'unavailable'|'not_evaluated';reason?:string;
 rateSnapshot:{usdToBrl:string;asOf:string;source:string}|null;rawItems:Array<{id:string;kind:string;mentions?:unknown[]}>;companies:Company[];costs:Cost[]|null}
const scale=10n**18n
function decimal(value:string){
 if(!/^\d+(?:\.\d{1,18})?$/.test(value))throw Error('benchmark_cost_decimal_invalid')
 const [whole,fraction='']=value.split('.')
 return BigInt(whole)*scale+BigInt(fraction.padEnd(18,'0'))
}
const format=(value:bigint)=>`${value/scale}.${(value%scale).toString().padStart(18,'0')}`.replace(/\.?0+$/,'')||'0'
const divide=(value:bigint|null,count:number)=>value===null||!count?null:format((value+BigInt(count)/2n)/BigInt(count))
function costs(sample:DiscoverySourceSample,uncertain=false):bigint|null{
 if(sample.status!=='evaluated'||!sample.costs)return null
 let total=0n
 for(const cost of sample.costs.filter(cost=>(cost.billingOutcome==='uncertain')===uncertain)){
  if(cost.amount===null)return null
  const amount=decimal(cost.amount)
  if(cost.currency==='USD'){
   if(!sample.rateSnapshot)return null
   const rate=decimal(sample.rateSnapshot.usdToBrl)
   if(rate===0n)throw Error('benchmark_exchange_rate_invalid')
   total+=(amount*rate+scale/2n)/scale
  }else if(cost.currency==='BRL')total+=amount
  else throw Error('benchmark_currency_invalid')
 }
 return total
}
const percentile=(values:number[],p:number)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]:null
export function evaluateRadarDiscovery(samples:DiscoverySourceSample[]){
 // One evaluation compares a single segment/region/time/query-plan cohort.
 const cohorts=new Set(samples.map(sample=>JSON.stringify([sample.segment,sample.region,sample.queryPlanVersion,sample.startedAt.slice(0,10)])))
 if(cohorts.size>1)throw Error('benchmark_discovery_cohort_mismatch')
 if(new Set(samples.map(sample=>sample.source)).size!==samples.length)throw Error('benchmark_duplicate_source')
 const rates=new Set(samples.filter(sample=>sample.costs?.some(cost=>cost.currency==='USD')&&sample.rateSnapshot).map(sample=>JSON.stringify([decimal(sample.rateSnapshot!.usdToBrl).toString(),sample.rateSnapshot!.asOf])))
 if(rates.size>1)throw Error('benchmark_rate_snapshot_mismatch')
 const verified=samples.map(sample=>[...new Map(sample.companies.filter(company=>company.verifiedIdentity).map(company=>[company.identityKey,company])).values()])
 const existing=new Set(verified.flatMap(companies=>companies.filter(company=>company.existing).map(company=>company.identityKey)))
 const newKeys=verified.map((companies,index)=>new Set(samples[index].status==='evaluated'?companies.filter(company=>company.reviewedFit==='compatible'&&!existing.has(company.identityKey)).map(company=>company.identityKey):[]))
 const allNew=new Set(newKeys.flatMap(set=>[...set])),allReady=new Set<string>()
 let aggregate:bigint|null=0n,aggregateUncertain:bigint|null=0n
 const reports=samples.map((sample,index)=>{
  const amount=costs(sample),uncertain=costs(sample,true)
  const finalCost=sample.costs?.some(cost=>cost.billingOutcome==='uncertain')?null:amount
  aggregate=aggregate===null||amount===null?null:aggregate+amount
  aggregateUncertain=aggregateUncertain===null||uncertain===null?null:aggregateUncertain+uncertain
  const latency=sample.companies.map(company=>company.latencyMs).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0)
  const ready=verified[index].filter(company=>newKeys[index].has(company.identityKey)&&company.complete&&company.usefulContact)
  for(const company of ready)allReady.add(company.identityKey)
  const evaluated=sample.status==='evaluated'
  return{source:sample.source,strategy:sample.strategy,segment:sample.segment,region:sample.region,queryPlanVersion:sample.queryPlanVersion,startedAt:sample.startedAt,rateSnapshot:sample.rateSnapshot,status:sample.status,reason:sample.reason,
   rawCandidates:evaluated?sample.rawItems.length:null,mentionedCompanies:evaluated?sample.rawItems.reduce((sum,item)=>sum+(item.mentions?.length??0),0):null,
   uniqueVerified:evaluated?verified[index].length:null,compatibleReviewed:evaluated?verified[index].filter(company=>company.reviewedFit==='compatible').length:null,
   compatibleNew:evaluated?newKeys[index].size:null,exclusiveCompatibleNew:evaluated?[...newKeys[index]].filter(key=>!newKeys.some((set,other)=>other!==index&&set.has(key))).length:null,
   readyNew:evaluated?ready.length:null,usefulContactNew:evaluated?verified[index].filter(company=>newKeys[index].has(company.identityKey)&&company.usefulContact).length:null,
   latencyP50Ms:evaluated?percentile(latency,.5):null,latencyP95Ms:evaluated?percentile(latency,.95):null,
   costBrl:amount===null?null:format(amount),uncertainCostBrl:uncertain===null?null:format(uncertain),
   costPerCompatibleNewBrl:divide(finalCost,newKeys[index].size),costPerReadyNewBrl:divide(finalCost,ready.length),originalCosts:sample.costs}
 })
 const intersections=samples.flatMap((sample,index)=>samples.slice(index+1).map((other,offset)=>({sources:[sample.source,other.source].sort(),compatibleNew:[...newKeys[index]].filter(key=>newKeys[index+offset+1].has(key)).length})))
 const finalAggregate=samples.some(sample=>sample.costs?.some(cost=>cost.billingOutcome==='uncertain'))?null:aggregate
 return{schemaVersion:1,qualityStatus:'not_evaluated' as const,sources:reports,uniqueCompatibleNew:allNew.size,uniqueReadyNew:allReady.size,intersections,
  costBrl:aggregate===null?null:format(aggregate),uncertainCostBrl:aggregateUncertain===null?null:format(aggregateUncertain),costPerCompatibleNewBrl:divide(finalAggregate,allNew.size),costPerReadyNewBrl:divide(finalAggregate,allReady.size)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2]
 if(file){const data=JSON.parse(await readFile(file,'utf8'));process.stdout.write(`${JSON.stringify(evaluateRadarDiscovery(data.sources),null,2)}\n`)}
 else{
  const protocol=JSON.parse(await readFile(new URL('../../contracts/radar/benchmark/v1/discovery-scopes.json',import.meta.url),'utf8'))
  process.stdout.write(`${JSON.stringify({queryPlanVersion:protocol.queryPlanVersion,qualityStatus:'not_evaluated',sources:protocol.sources,externalCalls:0,note:'Informe observações offline verificadas; este comando não pesquisa fontes.'},null,2)}\n`)
 }
}
