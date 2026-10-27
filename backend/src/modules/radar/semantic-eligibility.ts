type Qualification={targetStatus?:string;reasons?:string[];claims?:Array<{reason:string;evidenceId:string;excerpt:string}>;evidenceSources?:Array<{id:string;sourceUrl:string}>}
type Evidence={text?:string;url?:string;limitation?:string}
function sourceKey(value:unknown){if(typeof value!=='string')return;try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;url.hash='';url.searchParams.sort();return url.toString()}catch{return}}
/** Categorical, cited business qualification; never an uncalibrated probability. */
export function resolveRadarSemanticEligibility(input:{qualification?:Qualification;identityBinding:boolean;evidence:Evidence[]}):'compatible'|'outside_profile'|'needs_evidence'{
 const {qualification:q,evidence}=input
 if(!input.identityBinding||!q||!['confirmed','not_target'].includes(q.targetStatus??''))return'needs_evidence'
 if(!Array.isArray(q.reasons)||!q.reasons.length||!Array.isArray(q.claims)||!q.claims.length||!q.reasons.every(reason=>q.claims!.some(claim=>{
  if(typeof reason!=='string'||!claim||typeof claim.evidenceId!=='string'||typeof claim.excerpt!=='string')return false
  const match=/^page-(\d+)$/.exec(claim.evidenceId),page=match?evidence[Number(match[1])]:undefined
  const sources=Array.isArray(q.evidenceSources)?q.evidenceSources:[]
  const bound=sources.find(source=>source?.id===claim.evidenceId),key=sourceKey(bound?.sourceUrl)
  const pages=sources.length?(key?evidence.filter(item=>sourceKey(item?.url)===key):[]):[page]
  return claim.reason===reason&&!!claim.excerpt.trim()&&pages.some(item=>typeof item?.text==='string'&&!item.limitation&&item.text.includes(claim.excerpt))
 })))return'needs_evidence'
 return q.targetStatus==='not_target'?'outside_profile':'compatible'
}
export function isRadarSemanticallyOutside(output:Record<string,unknown>|null|undefined){
 return !!output&&resolveRadarSemanticEligibility({qualification:output.qualification as Qualification|undefined,identityBinding:output.siteAssociation==='confirmed'&&(output.presenceResolution as {scope?:string}|undefined)?.scope!=='group',evidence:Array.isArray(output.qualificationEvidence)?output.qualificationEvidence:Array.isArray(output.pages)?output.pages:[]})==='outside_profile'
}
