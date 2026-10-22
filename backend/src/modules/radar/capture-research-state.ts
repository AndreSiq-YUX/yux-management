export type RadarCaptureResearchStage='discovery'|'reading'|'presence'|'qualification'|'profile'
export type RadarFunnelOutcome='out_of_profile'|'completed'|'completed_with_gaps'|'technical_failure'
export type RadarCaptureResearchAssessment={status:'researching'|'completed'|'insufficient'|'blocked';reason?:string;stage?:RadarCaptureResearchStage}
type Child={status:string;stage?:string;error_code?:string|null;lease_until?:string|Date|null;output?:Record<string,unknown>|null;calls?:Record<string,{status:string;error?:string;source?:string}>|null}
/** Queue completion and commercial completion share the opt-in terminal contract. */
export function assessRadarResearchProgress(run:Child):RadarCaptureResearchAssessment{
 if(!run.output?.funnel)return assessRadarCaptureResearch(run)
 const result=assessRadarFunnelResearch(run)
 return{status:result.outcome===null?'researching':result.retryable?'blocked':'completed',...(result.reason?{reason:result.reason}:{})}
}
// Commercial outcome is independent of the durable queue/lease status. Keep
// those legacy statuses stable so in-flight jobs and old receipts still recover.
export function assessRadarFunnelResearch(run:Child):{outcome:RadarFunnelOutcome|null;retryable:boolean;reason?:string}{
 const assessment=assessRadarCaptureResearch(run.output?.funnel?{...run,calls:Object.fromEntries(Object.entries(run.calls??{}).filter(([,call])=>call.source!=='openrouter_decision'))}:run)
 if(assessment.status==='researching')return{outcome:null,retryable:false}
 if(assessment.status==='blocked')return{outcome:'technical_failure',retryable:true,reason:assessment.reason}
 if(run.output?.decisionExcluded===true)return{outcome:'out_of_profile',retryable:false}
 return{outcome:assessment.status==='completed'?'completed':'completed_with_gaps',retryable:false,...(assessment.reason?{reason:assessment.reason}:{})}
}
const searchFailures=new Set(['source_limit_exceeded','source_budget_exceeded','provider_inactive','provider_secret_missing','source_disabled','source_cost_required','retention_license_required','web_license_required','delivery_license_required','radar_research_query_limit','candidate_search_limit_reached'])
const analysisFailures=new Set(['radar_presence_service_unavailable','radar_qualification_service_unavailable','radar_qualification_failed','radar_presence_failed','radar_ai_wallet_missing','radar_ai_credits_insufficient','radar_llm_route_missing','radar_research_call_uncertain',
 'radar_presence_explicit_route_required','radar_presence_refresh_authorization_required','radar_presence_previous_request_uncertain',
 'radar_qualification_explicit_route_required','radar_qualification_refresh_authorization_required','radar_qualification_previous_request_uncertain','radar_qualification_invalid_json','radar_request_invalid','radar_analysis_legacy_material_missing','radar_analysis_evidence_binding_missing','radar_analysis_saved_citations_require_review',
 'radar_analysis_retry_policy_changed','radar_analysis_retry_authorization_invalid','radar_analysis_retry_scope_invalid','radar_analysis_retry_not_required'])
const safeCode=(value:unknown):value is string=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,159}$/.test(value)
// Legacy checkpoints embed the safe runtime code in these two exact wrappers.
// Never parse public excerpts (or arbitrary warning prose) as operational errors.
function limitationCode(value:string){
 const wrapped=/^(?:Qualificação semântica pendente|Identificação do site pendente) \(([a-z][a-z0-9_]+)\)\./.exec(value)
 return wrapped?.[1]??/^Pesquisa complementar: ([a-z][a-z0-9_]+)\.$/.exec(value)?.[1]??value
}
export function assessRadarCaptureResearch(run:Child):RadarCaptureResearchAssessment{
 const blocked=(reason:string,stage:RadarCaptureResearchStage):RadarCaptureResearchAssessment=>({status:'blocked',stage,reason})
 if(run.status==='queued'||run.status==='running')return run.status==='running'&&run.lease_until&&new Date(run.lease_until).getTime()<Date.now()
  ?blocked('radar_research_lease_expired','reading'):{status:'researching'}
 if(['blocked','failed'].includes(run.status))return blocked(safeCode(run.error_code)?run.error_code:'radar_capture_item_requires_review',run.stage&&['discovery','reading','presence','qualification','profile'].includes(run.stage)?run.stage as RadarCaptureResearchStage:'reading')
 for(const [key,call]of Object.entries(run.calls??{}))if(!['completed','failed'].includes(call.status))return blocked(['rejected_before_provider','received_invalid','received_pending_validation'].includes(call.status)&&safeCode(call.error)?call.error:'radar_research_call_uncertain',key==='presence'?'presence':key==='semantic'?'qualification':'discovery')
 const output=run.output??{},quality=output.quality as {readyForReview?:boolean}|undefined
 const limitations=Array.isArray(output.limitations)?output.limitations.filter((v):v is string=>typeof v==='string').map(limitationCode):[]
 const requiredPending=limitations.some(code=>analysisFailures.has(code)||/^agent_runtime_\d{3}(?:_[a-z0-9_]+)?$/.test(code)||/^radar_(?:presence|qualification|profile)_(?:waiting_|service_unavailable|failed|unverifiable)/.test(code))
 // Quality already applies the campaign's completion policy. A positive AI
 // verdict is neither required when disabled nor equivalent to research done.
 const complete=output.siteAssociation!=='review'&&quality?.readyForReview!==false&&!requiredPending&&
  (run.status==='succeeded'||quality?.readyForReview===true)
 if(complete)return{status:'completed'}
 if(Object.values(run.calls??{}).some(call=>call.status==='failed'))return blocked('radar_research_previous_request_failed','discovery')
 const discovery=output.discovery as {association?:string;limitations?:string[]}|undefined
 const searchFailure=[...limitations,...(discovery?.limitations??[])].find(code=>searchFailures.has(code))
 if(searchFailure)return blocked(searchFailure,'discovery')
 if(discovery?.association==='blocked')return blocked('radar_capture_research_unavailable','discovery')
 const pages=(output.pages??[]) as Array<{diagnostic?:{kind?:string};text?:string;limitation?:string}>
 if(pages.some(page=>page.diagnostic?.kind==='tls_expired'&&(!page.text||page.limitation)))return blocked('radar_tls_approval_required','reading')
 const operational=limitations.find(code=>analysisFailures.has(code)||/^agent_runtime_\d{3}(?:_[a-z0-9_]+)?$/.test(code))
 if(operational)return blocked(operational,operational.includes('presence')||limitations.some(v=>v.startsWith('Identificação do site pendente'))?'presence':'qualification')
 if(limitations.some(code=>code==='radar_qualification_waiting_identity'||code==='radar_profile_waiting_identity'))return{status:'insufficient',stage:'presence',reason:'radar_research_identity_insufficient'}
 if(limitations.some(code=>code.endsWith('_waiting_public_read')))return{status:'insufficient',stage:'reading',reason:'radar_research_evidence_insufficient'}
 return{status:'insufficient'}
}
