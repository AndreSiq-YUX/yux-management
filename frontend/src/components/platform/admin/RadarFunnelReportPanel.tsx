import {useEffect,useId,useRef,useState} from 'react';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field,FieldLabel} from '@/components/ui/field';
import {radarService} from '@/services/radarService';
import type {RadarFunnelReport} from '@/types/radarFunnel';
import {radarFunnelReportCsv,radarFunnelProbabilityLabel,radarFunnelCounterfactualLabel} from '@/lib/radar/radarFunnelReportCsv';

export function RadarFunnelReportPanel({organizationId,campaignId}:{organizationId:string;campaignId:string}){
 const id=useId(),active=useRef(false),requests=useRef(new Map<string,string>());
 const [data,setData]=useState<Awaited<ReturnType<typeof radarService.getFunnelReport>>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reasons,setReasons]=useState<Record<string,string>>({});
 useEffect(()=>{active.current=true;radarService.getFunnelReport(organizationId,campaignId).then(value=>{if(active.current)setData(value)}).catch(()=>{if(active.current)setError('Não foi possível carregar o histórico do funil.')});return()=>{active.current=false}},[organizationId,campaignId]);
 async function reload(operationId=data?.operationId??''){setError('');try{const value=await radarService.getFunnelReport(organizationId,campaignId,operationId||undefined);if(active.current)setData(value)}catch{if(active.current)setError('Não foi possível atualizar o histórico.')}}
 async function selectLot(value:string){setBusy(true);try{await reload(value)}finally{if(active.current)setBusy(false)}}
 async function reopen(company:RadarFunnelReport['companies'][number]){
  if(!data||!company.gate||busy||!reasons[company.id]?.trim())return;
  setBusy(true);setError('');setMessage('');
  const signature=JSON.stringify({id:company.id,gate:company.gate,revision:data.configurationRevision,reason:reasons[company.id]});
  const requestId=requests.current.get(signature)??crypto.randomUUID();requests.current.set(signature,requestId);
  try{await radarService.reopenFunnelCandidate(company.id,{organizationId,campaignId,configurationRevision:data.configurationRevision,requestId,gate:company.gate,reason:reasons[company.id],confirmFalseBlock:true});if(active.current){setMessage('Reabertura registrada. As etapas pendentes serão retomadas; chamadas incertas continuam protegidas.');await reload()}}
  catch{if(active.current)setError('Não foi possível confirmar a retomada. Tente com o mesmo motivo; o pedido mantém o identificador e não duplica a autorização.')}
  finally{if(active.current)setBusy(false)}
 }
 async function audit(eventId:string,companyId:string,outcome:'confirmed_outside'|'uncertain'){
  if(busy||!reasons[companyId]?.trim())return;setBusy(true);setError('');
  try{await radarService.auditFunnelBlock({organizationId,campaignId,eventId,outcome,reason:reasons[companyId]});await reload()}catch{if(active.current)setError('Não foi possível registrar a auditoria.')}finally{if(active.current)setBusy(false)}
 }
 function download(){
  if(!data)return;const csv=radarFunnelReportCsv(data);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='radar-funil-administrativo.csv';link.click();URL.revokeObjectURL(url);
 }
 return <Card><CardHeader><CardTitle>Conferência do funil — Admin YUX</CardTitle><CardDescription>Prévia gratuita dos filtros, caminho de cada empresa, amostra de auditoria e reabertura por etapa. Abrir ou atualizar este relatório não inicia chamadas pagas.</CardDescription></CardHeader><CardContent className="space-y-4">
  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>reload()}>Atualizar histórico do funil</Button><Button type="button" variant="outline" disabled={!data||busy} onClick={download}>Exportar relatório administrativo</Button></div>
  {data&&<Field><FieldLabel htmlFor={`${id}-lot`}>Abrangência do relatório</FieldLabel><select id={`${id}-lot`} disabled={busy} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={data.operationId??''} onChange={event=>void selectLot(event.target.value)}><option value="">Toda a campanha</option>{data.lots.map(lot=><option key={lot.id} value={lot.id}>Lote de {lot.requested} empresas · {new Date(lot.createdAt).toLocaleDateString('pt-BR')} · {lot.status}</option>)}</select></Field>}
  {data&&<><p className="text-sm">Prévia cadastral: {data.preview.blocked} bloqueadas pelas regras atuais; {data.preview.verifiedPositives} positivas rotuladas; {data.preview.falseBlocks} positivas seriam bloqueadas. {data.preview.verifiedPositives===0?'Ainda não há positivos revisados suficientes para validar os filtros.':''}</p>
   <p className="text-sm text-muted-foreground">{data.totals.examined} empresas · {data.totals.outside} fora do perfil · {data.totals.completed} concluídas · {data.totals.completedWithGaps} com lacunas · {data.totals.technicalFailures} falhas técnicas</p>
   <section aria-labelledby={`${id}-blocks`} className="space-y-2 rounded-md border p-3 text-sm"><h3 id={`${id}-blocks`} className="font-medium">Bloqueios por motivo</h3>{data.summary.blocksByReason.length?<ul className="space-y-1">{data.summary.blocksByReason.map(block=><li key={`${block.stage}:${block.reason}`} className="break-words">{block.stage.toUpperCase()} · {block.reason}: {block.count}</li>)}</ul>:<p className="text-muted-foreground">Nenhum bloqueio registrado nesta seleção.</p>}</section>
   <section aria-labelledby={`${id}-decisions`} className="space-y-2 rounded-md border p-3 text-sm"><h3 id={`${id}-decisions`} className="font-medium">Classificações da IA</h3><p className="text-muted-foreground">Última decisão de cada portão por empresa nesta seleção. Probabilidades brutas não são precisão calibrada.</p>{data.summary.classifications.length?<ul className="space-y-1">{data.summary.classifications.map(item=><li key={`${item.gate}:${item.classification}`}>{item.gate.toUpperCase()} · {item.classification}: {item.count}</li>)}</ul>:<p>Sem classificações registradas.</p>}<p>{data.summary.counterfactual.evaluable?`${data.summary.counterfactual.wouldBlock} decisões teriam bloqueado entre ${data.summary.counterfactual.evaluable} avaliáveis.`:'Não avaliável: não há limiar calibrado registrado para estas decisões.'} {data.summary.counterfactual.notEvaluable} decisões não avaliáveis.</p></section>
   <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Custos internos por etapa — {data.operationId?'execuções vinculadas ao lote':'todas as rodadas da campanha'}</summary><p className="my-3 text-sm">Subtotal real conhecido: R$ {data.costs.knownActualBrl}. {data.costs.unknownActual} chamadas sem valor real conciliado; não são consideradas gratuitas.</p><div className="space-y-2">{data.costs.sources.map(source=><p key={source.source} className="break-words text-sm">{source.source}: {source.calls} chamadas · estimativa registrada R$ {source.estimatedKnownBrl} · real conhecido R$ {source.actualKnownBrl} · {source.unknownActual} sem valor real</p>)}</div></details>
   <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Empresas, revisões solicitadas e auditoria</summary><div className="mt-4 space-y-4">{data.companies.map(company=><article key={company.id} className="space-y-2 rounded-md border p-3 text-sm">
    <p className="font-medium">{company.name}{company.reviewRequested?' · revisão solicitada':''}{company.historical?' · histórico preservado':''}</p><p>{company.reason??company.registryPreview.reasonPt}</p>
    <p className="break-words text-muted-foreground">{company.path.map(step=>`${step.gate.toUpperCase()}: ${step.mode} / ${step.outcome}`).join(' → ')||'Sem decisões do novo funil registradas.'}</p>
    {company.path.filter(step=>step.gate==='g1'||step.gate==='g5').map(step=><p key={step.id} className="break-words text-muted-foreground">{step.gate.toUpperCase()} · {step.outcome} · probabilidade bruta: {radarFunnelProbabilityLabel(step.selectedProbability)} · fora do perfil: {radarFunnelProbabilityLabel(step.outsideProbability)} · teria bloqueado: {radarFunnelCounterfactualLabel(step.wouldBlock)}.</p>)}
    {(company.gate||company.path.some(step=>step.sampled&&!step.audit))&&<><Field><FieldLabel htmlFor={`${id}-${company.id}`}>Motivo da revisão de {company.name}</FieldLabel><Input id={`${id}-${company.id}`} maxLength={1000} disabled={busy} value={reasons[company.id]??''} onChange={event=>setReasons(current=>({...current,[company.id]:event.target.value}))}/></Field>
     {company.gate&&<Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal" disabled={busy||(reasons[company.id]?.trim().length??0)<3} onClick={()=>reopen(company)}>Confirmar falso bloqueio e retomar pesquisa</Button>}
     {company.path.filter(step=>step.sampled&&!step.audit).map(step=><div key={step.id} className="flex flex-wrap gap-2"><span>Amostra de auditoria {step.gate.toUpperCase()}</span><Button type="button" size="sm" variant="outline" disabled={busy||(reasons[company.id]?.trim().length??0)<3} onClick={()=>audit(step.id,company.id,'confirmed_outside')}>Confirmar bloqueio correto</Button><Button type="button" size="sm" variant="outline" disabled={busy||(reasons[company.id]?.trim().length??0)<3} onClick={()=>audit(step.id,company.id,'uncertain')}>Registrar dúvida</Button></div>)}</>}
   </article>)}</div></details></>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
 </CardContent></Card>
}
