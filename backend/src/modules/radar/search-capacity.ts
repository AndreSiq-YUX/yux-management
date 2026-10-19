export const RADAR_SEARCH_SOURCES=['brave_place_search','brave_web_search','serper_web_search'] as const
export type RadarSearchSource=typeof RADAR_SEARCH_SOURCES[number]
export type RadarWebSearchSource=Exclude<RadarSearchSource,'brave_place_search'>
export type RadarSearchLimits={maxSearchQueriesPerCandidate:number;maxSearchQueriesBySource?:Partial<Record<RadarSearchSource,number>>;maxSearchQueriesTotalPerCandidate?:number|null}
export type RadarSearchCapacity={bySource:Record<string,{used:number;remaining:number}>;totalRemaining:number|null}
export function radarSearchSourceLimit(policy:RadarSearchLimits,source:string):number{
  return policy.maxSearchQueriesBySource?.[source as RadarSearchSource]??policy.maxSearchQueriesPerCandidate
}
export function resolveRadarSearchCapacity(input:{calls:Record<string,{source:string;status:string}>;policy:RadarSearchLimits}):RadarSearchCapacity{
  const bySource:RadarSearchCapacity['bySource']={}
  let total=0
  for(const source of RADAR_SEARCH_SOURCES){
    const used=Object.values(input.calls).filter(call=>call.source===source&&call.status!=='rejected_before_provider').length
    total+=used
    bySource[source]={used,remaining:Math.max(0,radarSearchSourceLimit(input.policy,source)-used)}
  }
  const cap=input.policy.maxSearchQueriesTotalPerCandidate
  return{bySource,totalRemaining:cap==null?null:Math.max(0,cap-total)}
}
export function hasRadarSearchCapacity(capacity:RadarSearchCapacity,source:string):boolean{
  return(capacity.bySource[source]?.remaining??0)>0&&(capacity.totalRemaining===null||capacity.totalRemaining>0)
}
export function estimateRadarSearchCapacity(estimates:Array<{sourceType:string;maximumQueries:number;costPerQuery:number;available:boolean}>,totalCap?:number|null){
  const eligible=estimates.filter(item=>item.available&&item.maximumQueries>0)
  let remaining=totalCap??Number.MAX_SAFE_INTEGER,cost=0,queries=0
  // The most expensive eligible requests form the conservative aggregate estimate.
  for(const item of [...eligible].sort((a,b)=>b.costPerQuery-a.costPerQuery)){
    const count=Math.min(remaining,item.maximumQueries)
    queries+=count;cost+=count*item.costPerQuery;remaining-=count
  }
  return{maxQueriesPerCandidate:queries,maximumCostPerCandidate:cost}
}
