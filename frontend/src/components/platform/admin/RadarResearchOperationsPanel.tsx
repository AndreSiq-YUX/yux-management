import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {radarService} from '@/services/radarService'
import type {RadarAdministrativeResearch,RadarAdministrativeResumeResult} from '@/types/radarResearch'
type RevalidationItem=Awaited<ReturnType<typeof radarService.revalidateAdministrativeResearch>>['items'][number]&{companyName?:string}
type RetryIntent={key:string;requestId:string;expiresAt:string}
const retryReason=(code?:string)=>({radar_analysis_retry_stage_disabled:'esta etapa está desativada na campanha',radar_analysis_retry_route_missing:'falta uma rota ativa para esta etapa no painel de modelos',radar_campaign_configuration_changed:'a configuração da campanha mudou; atualize o acompanhamento',radar_analysis_retry_scope_superseded:'esta análise foi substituída por uma pesquisa mais recente; confira o resultado atual',radar_analysis_still_running:'a análise anterior ainda está em execução',radar_analysis_retry_authorization_expired:'a autorização venceu; confirme uma nova tentativa',radar_analysis_retry_policy_changed:'a política de modelos mudou; confirme novamente com a configuração atual',radar_research_request_registration_failed:'não foi possível salvar o pedido; a nova autorização desta tentativa não foi efetivada',radar_source_admin_required:'é necessário usar o Admin global YUX',radar_analysis_recovery_scope_invalid:'a seleção não corresponde mais a esta campanha; atualize a conciliação',invalid_radar_research_resume_payload:'a seleção ou a confirmação está inválida; atualize a conciliação'} as Record<string,string>)[code??'']??'aguardando verificação do pedido; nenhuma repetição automática foi autorizada'
export function RadarResearchOperationsPanel({isSystemAdmin,organizationId,campaignId}:{isSystemAdmin:boolean;organizationId:string;campaignId:string}){
 const scope=`${organizationId}:${campaignId}`,currentScope=useRef(scope),mounted=useRef(false),sending=useRef(false)
 currentScope.current=scope
 const [data,setData]=useState<RadarAdministrativeResearch|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [selected,setSelected]=useState<string[]>([]),[acknowledge,setAcknowledge]=useState(false),[page,setPage]=useState(0),[results,setResults]=useState<RevalidationItem[]>([])
 const [retryResults,setRetryResults]=useState<Array<RadarAdministrativeResumeResult['items'][number]&{companyName:string}>>([])
 const loadingRequest=useRef<{scope:string;promise:Promise<RadarAdministrativeResearch>}|null>(null)
 const retryIntent=useRef<RetryIntent|null>(null),budgetIntents=useRef(new Map<string,string>())
 const selectionKey=[...selected].sort().join(',')
 useEffect(()=>{setAcknowledge(false);retryIntent.current=null},[selectionKey,scope])
 async function load(active=()=>mounted.current&&currentScope.current===scope){
  if(!isSystemAdmin)return
  const pending=loadingRequest.current?.scope===scope?loadingRequest.current.promise:radarService.getAdministrativeResearch(campaignId,organizationId)
  loadingRequest.current={scope,promise:pending}
  setLoading(true)
  try{const value=await pending;if(active()){setData(value);setSelected(ids=>ids.filter(id=>value.analyses.some(item=>item.receiptId===id)));setError('')}}
  catch{if(active())setError('Não foi possível carregar a conciliação. Nenhuma chamada externa foi executada.')}
  finally{if(loadingRequest.current?.promise===pending)loadingRequest.current=null;if(active())setLoading(false)}
 }
 useEffect(()=>{
  mounted.current=true;let active=true
  setData(null);setSelected([]);setResults([]);setRetryResults([]);setMessage('');setError('');setPage(0);budgetIntents.current.clear()
  if(isSystemAdmin)void load(()=>active&&currentScope.current===scope)
  return()=>{active=false;mounted.current=false}
  // load is scoped by these explicit identity inputs, not by every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[isSystemAdmin,organizationId,campaignId,scope])
 const hasActiveRequests=!!data?.requests.some(request=>request.state==='accepted'||request.state==='running')
 useEffect(()=>{
  if(!isSystemAdmin||!hasActiveRequests)return
  let active=true
  const timer=window.setInterval(()=>{if(!sending.current&&!document.hidden)void load(()=>active&&mounted.current&&currentScope.current===scope)},5000)
  return()=>{active=false;window.clearInterval(timer)}
  // Only active durable requests need polling; load guards overlap and scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[isSystemAdmin,hasActiveRequests,scope])
 if(!isSystemAdmin)return null
 const chosen=data?.analyses.filter(item=>selected.includes(item.receiptId))??[]
 const pageCount=Math.max(1,Math.ceil((data?.analyses.length??0)/50)),currentPage=Math.min(page,pageCount-1),visible=data?.analyses.slice(currentPage*50,(currentPage+1)*50)??[]
 const stillHere=()=>mounted.current&&currentScope.current===scope
 async function revalidate(){
  if(sending.current||!chosen.some(item=>item.canRevalidate))return
  sending.current=true;setBusy('revalidate');setError('');setMessage('')
  try{const value=await radarService.revalidateAdministrativeResearch({organizationId,campaignId,receiptIds:chosen.map(item=>item.receiptId)});if(stillHere()){
   setResults(value.items.map(item=>({...item,companyName:chosen.find(row=>row.receiptId===item.receiptId)?.companyName})));setMessage(`${value.items.filter(item=>item.state==='revalidated').length} revalidadas; ${value.items.filter(item=>item.state==='invalid').length} ainda inválidas; ${value.items.filter(item=>item.state==='no_saved_response').length} sem resposta recuperável; ${value.items.filter(item=>item.state==='waiting').length} aguardando. Nenhuma nova geração foi comprada. Retome a pesquisa para aplicar respostas válidas.`)
   await load()
  }}catch{if(stillHere())setError('Não foi possível revalidar. Confira o tamanho da seleção e a disponibilidade do runtime; não houve autorização de nova cobrança.')}
  finally{sending.current=false;if(stillHere())setBusy('')}
 }
 async function authorizeRetry(){
  if(!data||sending.current||!acknowledge||!chosen.some(item=>item.canAuthorizeRetry))return
  sending.current=true;setBusy('retry');setError('');setMessage('')
  const key=`${scope}:${data.configurationRevision}:${selectionKey}`
  if(retryIntent.current?.key!==key||Date.parse(retryIntent.current.expiresAt)<=Date.now())retryIntent.current={key,requestId:crypto.randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString()}
  const intent=retryIntent.current
  try{
   const value=await radarService.resumeAdministrativeResearch({organizationId,campaignId,configurationRevision:data.configurationRevision,requestId:intent.requestId,expiresAt:intent.expiresAt,acknowledgePreviousChargeMayExist:true,receiptIds:chosen.map(item=>item.receiptId)})
   if(stillHere()){setRetryResults(value.items.map(item=>({...item,companyName:chosen.find(row=>row.receiptId===item.receiptId)?.companyName??'Empresa selecionada'})));setAcknowledge(false);setMessage(`${value.items.filter(item=>item.state==='queued').length} retomadas registradas; ${value.items.filter(item=>item.state==='already_completed').length} já concluídas; ${value.items.filter(item=>item.state==='waiting').length} aguardando. Os pedidos abaixo mostram fila, execução e conclusão. Recibos anteriores foram preservados.`);await load()}
  }catch(cause){if(stillHere())setError(`${retryReason(cause instanceof Error?cause.message:undefined)}. Reenvie a mesma seleção para conferir o pedido sem duplicá-lo.`)}
  finally{sending.current=false;if(stillHere())setBusy('')}
 }
 async function authorizeBudget(request:RadarAdministrativeResearch['requests'][number]){
  if(sending.current||!request.waiting)return
  if(!window.confirm('Aplicar a configuração atual de capacidade a este mesmo pedido e retomar suas pendências? O consumo anterior não será zerado; novas consultas seguem os limites e custos aprovados.'))return
  sending.current=true;setBusy(request.requestId);setError('');setMessage('')
  const key=`${request.requestId}:${request.budgetRevision}`
  if(!budgetIntents.current.has(key))budgetIntents.current.set(key,crypto.randomUUID())
  try{await radarService.authorizeResearchBudget(request.requestId,{organizationId,expectedBudgetRevision:request.budgetRevision,authorizationId:budgetIntents.current.get(key)!});if(stillHere()){setMessage('Capacidade atual autorizada para o mesmo pedido, sem apagar consumo ou repetir a descoberta.');await load()}}
  catch{if(stillHere())setError('Não foi possível ampliar agora. Confira a configuração, se há uma execução ativa ou se o pedido mudou em outra aba. O consumo e as aprovações anteriores foram preservados.')}
  finally{sending.current=false;if(stillHere())setBusy('')}
 }
 return <section className="flex flex-col gap-4 rounded-md border bg-background p-4" aria-label="Conciliação e retomada de pesquisas">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Conciliação e retomada de pesquisas</h2><Button variant="outline" size="sm" disabled={!!busy||loading} onClick={()=>load()}>Atualizar conciliação</Button></div>
  <p className="text-sm text-muted-foreground">Respostas salvas podem ser revalidadas sem comprar outra geração. Efeitos incertos sem resposta continuam pendentes; uma tentativa paga exige autorização distinta e explícita.</p>
  {loading&&!data&&<p role="status">Carregando pendências…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
  {!!data?.requests.length&&<div className="flex flex-col gap-3"><h3 className="font-medium">Pedidos duráveis</h3>{hasActiveRequests&&<p role="status" className="text-sm">Acompanhamento automático ativo. Pedido registrado não significa pesquisa concluída.</p>}{data.requests.map(request=><article key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><p>{request.items} empresas · {request.queued??(request.state==='accepted'?request.items:0)} na fila · {request.running??0} em pesquisa · {request.completed??0} concluídas · {request.waiting} aguardando · capacidade versão {request.budgetRevision}</p>{request.waiting>0&&<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>authorizeBudget(request)}>Aplicar capacidade atual e retomar</Button>}</article>)}</div>}
  {!!retryResults.length&&<ul className="list-disc pl-5 text-sm" aria-label="Resultado da retomada">{retryResults.map(item=><li key={item.receiptId}>{item.companyName}: {item.state==='queued'?'retomada registrada':item.state==='already_completed'?'análise já concluída':retryReason(item.reason)}.</li>)}</ul>}
  {data&&!data.analyses.length&&<p className="text-sm">Nenhuma análise pendente de conciliação nesta campanha.</p>}
  {!!visible.length&&<><div className="flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" aria-label="Selecionar análises desta página" disabled={!!busy} checked={visible.every(item=>selected.includes(item.receiptId))} onChange={event=>setSelected(ids=>event.target.checked?[...new Set([...ids,...visible.map(item=>item.receiptId)])]:ids.filter(id=>!visible.some(item=>item.receiptId===id)))}/>Selecionar esta página</label><Button variant="outline" size="sm" disabled={!!busy||!chosen.some(item=>item.canRevalidate)} onClick={revalidate}>Revalidar respostas salvas</Button></div>
   <div className="grid gap-3 md:grid-cols-2">{visible.map(item=><article key={item.receiptId} className="min-w-0 rounded-md border p-3 text-sm"><label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label={`Selecionar ${item.companyName}`} disabled={!!busy} checked={selected.includes(item.receiptId)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,item.receiptId]:ids.filter(id=>id!==item.receiptId))}/>{item.companyName}</label><p>{item.action==='radar_presence_resolution'?'Identificação da presença pública':'Qualificação comercial'} · {item.status}</p><p>Transporte: {item.transport??'sem resposta registrada'} · validação: {item.validation??'pendente'} · cobrança: {item.billing}.</p><p className="break-all">{item.provider??'Provedor não registrado'} · {item.model??'modelo não registrado'}</p><p>Informado: {item.reportedUsd===null?'custo USD desconhecido':`USD ${item.reportedUsd}`} · estimativa BRL: {item.estimatedBrl===null?'indisponível':`R$ ${item.estimatedBrl}`}.</p>{item.failureCode&&<p className="break-all">{item.failureCode}</p>}<p>{item.canRevalidate?'Há resposta salva para revalidação gratuita.':'Não há resposta revalidável disponível nesta etapa.'}</p></article>)}</div>
   {pageCount>1&&<div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={!currentPage||!!busy} onClick={()=>setPage(currentPage-1)}>Anterior</Button><span>{currentPage+1} de {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage+1>=pageCount||!!busy} onClick={()=>setPage(currentPage+1)}>Próxima</Button></div>}
   <label className="flex items-start gap-2 text-sm"><input name="acknowledgePreviousCharge" type="checkbox" disabled={!!busy} checked={acknowledge} onChange={event=>setAcknowledge(event.target.checked)}/>Reconheço que a chamada anterior pode já ter sido cobrada e autorizo uma tentativa adicional para cada análise selecionada, pela política atual de modelos e limites. A autorização dura uma hora.</label>
   <Button className="self-start" disabled={!!busy||!acknowledge||!chosen.some(item=>item.canAuthorizeRetry)} onClick={authorizeRetry}>Autorizar nova tentativa e retomar</Button>
  </>}
  {!!results.length&&<ul className="list-disc pl-5 text-sm">{results.map(item=><li key={item.receiptId}>{item.companyName??data?.analyses.find(row=>row.receiptId===item.receiptId)?.companyName??'Análise selecionada'}: {({revalidated:'resposta revalidada',invalid:'resposta ainda inválida',no_saved_response:'sem resposta recuperável',waiting:'aguardando'} as const)[item.state]}.</li>)}</ul>}
 </section>
}
