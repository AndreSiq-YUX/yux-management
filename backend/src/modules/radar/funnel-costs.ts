import {addRadarDecimal,estimateRadarCostBrl,radarReportedCostAmount,type RadarCostPolicy} from './cost-conversion.js';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function summarizeRadarFunnelCosts(rows:Array<{id:string;calls:unknown}>){
 const unique=new Map<string,{id:string;source:string;status:string;estimatedBrl:string|null;actualBrl:string|null;actualUsd:string|null}>();
 for(const row of rows)for(const [key,value] of Object.entries(object(row.calls))){
  const root=object(value),previous=Array.isArray(root.previous)?root.previous:root.previous?[root.previous]:[];
  for(const version of [root,...previous.map(object)]){
   const call=version===root?root:{source:root.source,context:root.context,...version},status=String(call.status??'unknown');if(status==='rejected_before_provider')continue;
   const source=String(call.source??key),estimate=object(call.costEstimate),result=object(call.result),usage=object(result.usage);
   const id=typeof call.requestId==='string'?call.requestId:typeof call.evidenceHash==='string'?`${row.id}:${key==='presence'?'presence:':''}${call.evidenceHash}`:`${row.id}:${key}`;
   const actualUsd=status==='completed'?radarReportedCostAmount(call.actualUsd??usage.costUsd):null;
   const explicitActual=radarReportedCostAmount(call.actualBrl);
   const actualBrl=explicitActual??(actualUsd!==null?estimateRadarCostBrl({amount:actualUsd,currency:'USD',rateSnapshot:(call.costPolicy??estimate.rateSnapshot??null) as RadarCostPolicy|null}).amountBrl:null);
   const item={id,source:source==='openrouter_decision'?String(object(call.context).task??object(call.result).task??source):source,status,estimatedBrl:radarReportedCostAmount(call.reservedBrl??estimate.amountBrl),actualBrl,actualUsd};
   const prior=unique.get(id);if(!prior||prior.actualBrl===null&&item.actualBrl!==null||prior.status!=='completed'&&item.status==='completed')unique.set(id,item);
  }
 }
 const effects=[...unique.values()],sources=[...new Set(effects.map(item=>item.source))];
 const sum=(values:Array<string|null>)=>values.reduce<string>((total,value)=>value===null?total:addRadarDecimal(total,value),'0');
 return{effects,knownActualBrl:sum(effects.map(item=>item.actualBrl)),unknownActual:effects.filter(item=>item.actualBrl===null).length,
  sources:sources.map(source=>{const selected=effects.filter(item=>item.source===source);return{source,calls:selected.length,estimatedKnownBrl:sum(selected.map(item=>item.estimatedBrl)),actualKnownBrl:sum(selected.map(item=>item.actualBrl)),unknownActual:selected.filter(item=>item.actualBrl===null).length}})};
}
