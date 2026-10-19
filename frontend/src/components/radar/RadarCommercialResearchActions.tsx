import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {radarService} from '@/services/radarService'
import type {RadarResearchRequestInput,RadarResearchRequestResult} from '@/types/radarResearch'
import {RadarResearchOutcome} from './RadarResearchOutcome'

type Props={organizationId:string;campaignId:string;criteriaRevision:number;canResearch:boolean;selectedIds:string[];companies:Array<{id?:string;title?:string}>;onUpdated:()=>void}
const active=(request:RadarResearchRequestResult|null)=>!!request&&['accepted','running'].includes(request.state)
export function RadarCommercialResearchActions({organizationId,campaignId,criteriaRevision,canResearch,selectedIds,companies,onUpdated}:Props){
 const scope=`${organizationId}:${campaignId}:${criteriaRevision}`,currentScope=useRef(scope),generation=useRef(0),sending=useRef(false),lifetime=useRef({active:false})
 currentScope.current=scope
 const pending=useRef<{key:string;input:RadarResearchRequestInput}|null>(null)
 const [request,setRequest]=useState<RadarResearchRequestResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let mounted=true;const version=++generation.current,currentLifetime={active:true};lifetime.current=currentLifetime
  setRequest(null);setError('');pending.current=null
  radarService.getLatestResearchRequest(campaignId,organizationId).then(({request:saved})=>{if(mounted&&generation.current===version)setRequest(saved)})
   .catch(()=>{if(mounted&&generation.current===version)setError('Não foi possível recuperar o acompanhamento. Os resultados continuam salvos.')})
  return()=>{mounted=false;currentLifetime.active=false}
 },[scope,campaignId,organizationId])
 const requestId=request?.requestId,pendingResearch=active(request)
 useEffect(()=>{
  if(!requestId||!pendingResearch)return
  let mounted=true,timer:ReturnType<typeof setTimeout>|undefined
  const poll=async()=>{
   try{
    const updated=await radarService.getResearchRequest(campaignId,organizationId,requestId)
    if(!mounted)return
    setRequest(updated);setError('')
    if(!active(updated)){onUpdated();return}
   }catch{if(!mounted)return;setError('A pesquisa permanece salva. Tentando atualizar o acompanhamento…')}
   timer=setTimeout(poll,4000)
  }
  timer=setTimeout(poll,4000)
  return()=>{mounted=false;clearTimeout(timer)}
 },[requestId,pendingResearch,campaignId,organizationId,onUpdated])
 const waiting=request?.state==='waiting'?request.items.filter(item=>item.state==='waiting').map(item=>item.candidateId):[]
 const ids=[...new Set(selectedIds.length?selectedIds:waiting)].sort()
 async function start(){
  if(!canResearch||sending.current||pendingResearch||!ids.length)return
  if(!window.confirm('Pesquisar as informações destas empresas e completar as etapas pendentes? Nenhuma mensagem será enviada.'))return
  const originalScope=scope,version=++generation.current,currentLifetime=lifetime.current,intent=selectedIds.length?'refresh':'resume'
  const key=JSON.stringify({scope,ids,intent})
  if(pending.current?.key!==key)pending.current={key,input:{organizationId,candidateIds:ids,requestId:crypto.randomUUID(),criteriaRevision,intent}}
  sending.current=true;setBusy(true);setError('')
  try{
   const result=await radarService.queueResearchRequest(campaignId,pending.current.input)
   if(!currentLifetime.active||currentScope.current!==originalScope||generation.current!==version)return
   setRequest(result);pending.current=null
   if(!active(result))onUpdated()
  }catch{if(currentLifetime.active&&currentScope.current===originalScope&&generation.current===version)setError('Não foi possível confirmar o pedido. Tente novamente: o mesmo pedido será recuperado, sem duplicar a solicitação.')}
  finally{sending.current=false;if(currentLifetime.active&&currentScope.current===originalScope)setBusy(false)}
 }
 return <section className="mt-3 flex flex-col gap-3" aria-label="Acompanhamento das empresas selecionadas">
  {canResearch&&<Button size="sm" className="self-start" disabled={busy||pendingResearch||!ids.length} onClick={start}>{busy?'Confirmando pesquisa…':pendingResearch?'Completando dados…':selectedIds.length?'Completar dados das selecionadas':waiting.length?'Retomar empresas pendentes':'Selecione empresas para completar dados'}</Button>}
  {error&&<p role="status" className="text-sm">{error}</p>}
  {pendingResearch&&<p role="status" className="text-sm">Pesquisa salva e em andamento. Você pode sair desta página; o acompanhamento será recuperado ao voltar.</p>}
  {!!request?.items.length&&<div className="grid gap-3 md:grid-cols-2">{request.items.map(item=><article key={item.candidateId} className="min-w-0 rounded-md border p-3"><h4 className="font-medium">{companies.find(company=>company.id===item.candidateId)?.title??'Empresa pesquisada'}</h4><RadarResearchOutcome feedback={item.feedback}/>{!item.feedback&&<p className="text-sm">{item.state==='accepted'||item.state==='running'?'Pesquisa em andamento.':item.state==='waiting'?'Uma etapa ainda precisa ser concluída.':'Pesquisa registrada. Confira os dados da empresa.'}</p>}</article>)}</div>}
 </section>
}
