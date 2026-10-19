import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {radarService} from '@/services/radarService'
import {usePlatformContext} from '@/stores/platformStore'
import {canShowRadarNavigation,canManageRadar} from '@/lib/radar/radarRules'
import {RadarCommercialResults,RadarCommercialCompanyDetails} from './RadarCommercialResults'
import {RadarCommercialFeedback} from './RadarCommercialFeedback'
import {RadarCommercialResearchActions} from './RadarCommercialResearchActions'
import {RadarCrmDeliveryDialog} from './RadarCrmDeliveryDialog'
import type {RadarScreen} from './RadarCampaignPage'
import type {RadarCommercialCampaign,RadarCommercialCandidate,RadarCommercialCapture,RadarCommercialResearch,CommercialHistory,CommercialOpportunity} from '@/types/radarCommercial'
export type RadarWorkspaceProps={screen?:RadarScreen;campaignId?:string;onNavigate?:(path:string)=>void;leadPath?:(id:string,pipelineId?:string)=>string;technicalOnly?:boolean;adminOrganizationId?:string}
export function RadarCommercialWorkspace(props:RadarWorkspaceProps){
 const context=usePlatformContext(),org=context.organization?.id,allowed=canShowRadarNavigation(context),canReview=canManageRadar(context)
 const canCrm=canReview&&(context.organization?.isInternalGrowthWorkspace||context.enabledModuleKeys.includes('crm')&&context.role?.permissions.includes('leads.write'))
 const [campaigns,setCampaigns]=useState<RadarCommercialCampaign[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[localScreen,setLocalScreen]=useState<RadarScreen>('list')
 const id=props.campaignId??selectedId,screen=props.screen??localScreen,scope=`${org}:${id}:${screen}`
 const [candidates,setCandidates]=useState<RadarCommercialCandidate[]>([]),[operation,setOperation]=useState<RadarCommercialCapture|null>(null),[opportunities,setOpportunities]=useState<CommercialOpportunity[]>([]),[history,setHistory]=useState<CommercialHistory[]>([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[query,setQuery]=useState(''),[selected,setSelected]=useState<string[]>([]),[crmOpen,setCrmOpen]=useState(false)
 const [fullId,setFullId]=useState<string|null>(null),[research,setResearch]=useState<RadarCommercialResearch|null>(null),[detailsLoading,setDetailsLoading]=useState(false),[detailsError,setDetailsError]=useState('')
 const [actionBusy,setActionBusy]=useState(false),actionSending=useRef(false)
 const researchUpdated=useCallback(()=>setRefresh(value=>value+1),[])
 const requestSequence=useRef(0),currentScope=useRef(scope),heading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLElement|null>(null)
 const loadedOrganization=useRef<string>(),loadedResultsScope=useRef<string>()
 currentScope.current=scope
 useEffect(()=>{let active=true;if(loadedOrganization.current!==org){loadedOrganization.current=org;setCampaigns([]);setLoading(true)}if(!org||!allowed){setLoading(false);return}
  radarService.getCommercialCampaigns(org).then(value=>{if(active){setCampaigns(value);setError('')}}).catch(()=>{if(active)setError('Não foi possível carregar as campanhas. Tente novamente.')}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[org,allowed,refresh])
 useEffect(()=>{let active=true;if(loadedResultsScope.current!==scope){loadedResultsScope.current=scope;requestSequence.current++;setFullId(null);setResearch(null);setSelected([]);setCrmOpen(false);setCandidates([]);setOperation(null);setOpportunities([]);setHistory([])}
  if(!org||!id||!allowed)return
  Promise.all([radarService.getCommercialCandidates(id),radarService.getCommercialCapture(id,org),radarService.getCommercialOpportunities(id),screen==='history'?radarService.getCommercialHistory(id,org):Promise.resolve([])])
   .then(([companies,capture,offers,events])=>{if(active){setCandidates(companies);setOperation(capture.operation);setOpportunities(offers);setHistory(events);setError('')}})
   .catch(()=>{if(active)setError('Não foi possível atualizar a pesquisa. Os dados permanecem salvos.')})
  return()=>{active=false}
 },[org,id,screen,scope,allowed,refresh])
 const operationStatus=operation?.status
 const pendingAnalysis=opportunities.some(item=>item.status==='diagnosing')
 useEffect(()=>{if(!pendingAnalysis&&(!operationStatus||!['queued','discovering','researching'].includes(operationStatus)))return
  const timer=setTimeout(()=>setRefresh(value=>value+1),4_000);return()=>clearTimeout(timer)
 },[operationStatus,pendingAnalysis,refresh,scope])
 useEffect(()=>{if(fullId&&!detailsLoading){heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}},[fullId,detailsLoading])
 const campaign=campaigns.find(item=>item.id===id)
 const navigate=(path:string)=>{requestSequence.current++;setFullId(null);setResearch(null)
  if(props.onNavigate){props.onNavigate(path);return}
  const [next,suffix]=path.split('/');setSelectedId(next||null);setLocalScreen(!next?'list':suffix==='historico'?'history':suffix==='configuracoes'?'configuration':'results')
 }
 async function openDetails(candidateId:string){if(!org)return
  const sequence=++requestSequence.current,originalScope=currentScope.current;returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null
  setFullId(candidateId);setResearch(null);setDetailsError('');setDetailsLoading(true)
  try{const value=await radarService.getCommercialResearch(candidateId,org);if(sequence===requestSequence.current&&originalScope===currentScope.current)setResearch(value)}
  catch{if(sequence===requestSequence.current&&originalScope===currentScope.current)setDetailsError('Não foi possível abrir os detalhes completos. Tente novamente.')}
  finally{if(sequence===requestSequence.current&&originalScope===currentScope.current)setDetailsLoading(false)}
 }
 function closeDetails(){requestSequence.current++;setFullId(null);setResearch(null);if(returnFocus.current?.isConnected)returnFocus.current.focus()}
 async function opportunityAction(opportunityId:string,action:'analyze'|'approve'|'reject'|'optOut'|'convert'){
  if(!canReview||actionSending.current||action==='convert'&&!canCrm)return
  const originalScope=currentScope.current;actionSending.current=true;setActionBusy(true)
  try{await radarService.commercialOpportunityAction(opportunityId,action);if(originalScope===currentScope.current)setRefresh(value=>value+1)}
  catch{if(originalScope===currentScope.current)setError('Não foi possível concluir a ação. Confira a revisão e as permissões.')}
  finally{actionSending.current=false;setActionBusy(false)}
 }
 async function candidateAction(candidateId:string,action:'import'|'discard',input:{analyzeAfterImport:boolean}){
  const candidate=candidates.find(item=>item.id===candidateId)
  if(!canReview||actionSending.current||candidate?.status!=='pending_review'||action==='import'&&(campaign?.campaignType==='regional_b2b'||candidate.importedOpportunityId))return
  const originalScope=currentScope.current;actionSending.current=true;setActionBusy(true)
  try{await radarService.commercialCandidateAction(candidateId,action,input);if(originalScope===currentScope.current)setRefresh(value=>value+1)}
  catch{if(originalScope===currentScope.current)setError('Não foi possível concluir a revisão. Confira suas permissões e tente novamente.')}
  finally{actionSending.current=false;setActionBusy(false)}
 }
 if(!allowed)return <section className="rounded-md border bg-background p-4"><h2>Radar Comercial indisponivel</h2><p>O módulo precisa estar contratado e seu usuário precisa de permissão de acesso.</p></section>
 const company=candidates.find(item=>item.id===fullId),facts={...company?.facts,...research?.facts}
 return <div className="flex min-w-0 flex-col gap-5"><div><h1 className="text-2xl font-bold">Radar Comercial</h1><p className="text-sm text-muted-foreground">Encontre empresas, consulte seus dados e organize os próximos contatos.</p></div>
  {!canReview&&<p className="text-sm text-muted-foreground">Acesso de consulta: acompanhe as campanhas, os dados e as análises. A operação fica com a equipe responsável.</p>}
  {error&&<div role="alert" className="flex flex-wrap items-center gap-3"><p>{error}</p><Button variant="outline" size="sm" onClick={()=>setRefresh(value=>value+1)}>Tentar novamente</Button></div>}
  {loading?<p role="status">Carregando campanhas…</p>:!id?<section className="rounded-md border bg-background p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Campanhas</h2><Input aria-label="Buscar campanhas" placeholder="Buscar por nome, público ou região" className="sm:max-w-sm" value={query} onChange={event=>setQuery(event.target.value)}/></div>
   {campaigns.filter(item=>`${item.name} ${item.targetSegment} ${item.targetStates?.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map((item,i)=><div key={item.id??i} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><h3 className="font-medium">{item.name}</h3><p className="text-sm text-muted-foreground">{item.targetSegment} · {item.targetStates?.join(', ')||[item.targetCity,item.targetState].filter(Boolean).join('/')}</p><p className="text-sm">Objetivo: {item.offerType}</p></div>{item.id&&<Button size="sm" variant="outline" onClick={()=>navigate(item.id!)}>Abrir</Button>}</div>)}
   {!campaigns.length&&<p className="mt-4 text-sm">Nenhuma campanha encontrada.</p>}
  </section>:campaign?<RadarCommercialResults key={scope} campaign={campaign} candidates={candidates} operation={operation} screen={screen} history={history} opportunities={opportunities} onNavigate={navigate} onOpenDetails={openDetails}
   selectedIds={selected} onSelect={canReview?setSelected:undefined} onSendCrm={canCrm?()=>setCrmOpen(true):undefined} busy={actionBusy} onOpportunityAction={canReview?opportunityAction:undefined} onCandidateAction={canReview?candidateAction:undefined}
   researchActions={org&&id?<RadarCommercialResearchActions organizationId={org} campaignId={id} criteriaRevision={campaign.commercialCriteriaRevision??campaign.configurationRevision??1} canResearch={canReview} selectedIds={selected} companies={candidates} onUpdated={researchUpdated}/>:undefined}/>:<p>Campanha não encontrada ou acesso indisponível.</p>}
  {fullId&&screen==='results'&&<section className="rounded-md border bg-background p-4"><h3 ref={heading} tabIndex={-1} className="scroll-mt-6 font-semibold">Detalhes completos — {company?.title}</h3><Button size="sm" variant="ghost" onClick={closeDetails}>Fechar detalhes</Button>
   {detailsLoading?<p role="status">Carregando detalhes…</p>:detailsError?<div role="alert"><p>{detailsError}</p><Button size="sm" variant="outline" onClick={()=>openDetails(fullId)}>Tentar novamente</Button></div>:<><RadarCommercialCompanyDetails facts={facts} assessment={research?.assessment} feedback={research?.feedback}/>{research?.pendingMessage&&<p className="mt-3 text-sm">{research.pendingMessage}</p>}
    {org&&<RadarCommercialFeedback key={`${org}:${fullId}`} candidateId={fullId} organizationId={org} revision={campaign?.configurationRevision??1} contacts={facts.contacts??[]} canReview={canReview}/>}</>}
  </section>}
  {crmOpen&&org&&id&&canCrm&&<RadarCrmDeliveryDialog organizationId={org} campaignId={id} revision={campaign?.configurationRevision??1} candidateIds={selected} onClose={()=>setCrmOpen(false)} onCompleted={()=>setRefresh(value=>value+1)} leadPath={props.leadPath??((leadId,pipelineId)=>`/portal/comercial/leads?leadId=${encodeURIComponent(leadId)}${pipelineId?`&pipelineId=${encodeURIComponent(pipelineId)}`:''}`)}/>}
 </div>
}
