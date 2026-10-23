type RecordValue=Record<string,unknown>
/** Only this projection may leave the API; internal budget is Admin-only. */
export function projectRadarApproval<T extends RecordValue>(approval:T,globalAdmin:boolean):T{
 const payload=approval.requestedPayload as RecordValue|undefined
 const raw=payload?.commercialPreview
 if(!raw||typeof raw!=='object')return approval
 const value=raw as RecordValue
 const preview:RecordValue={kind:'radar_research'}
 for(const key of ['campaignId','campaignName','requestedCount','configurationRevision','criteriaRevision']){
   if(typeof value[key]==='string'||typeof value[key]==='number')preview[key]=value[key]
 }
 if(Array.isArray(value.targetStates))preview.targetStates=value.targetStates.filter(v=>typeof v==='string')
 if(globalAdmin&&typeof value.maximumBudgetBrl==='string')preview.maximumBudgetBrl=value.maximumBudgetBrl
 return{...approval,requestedPayload:{...payload,commercialPreview:preview}}
}
