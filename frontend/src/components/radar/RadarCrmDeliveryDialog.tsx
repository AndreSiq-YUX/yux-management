import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select'
import {Label} from '@/components/ui/label'
import {radarService} from '@/services/radarService'
type Destination={crmInstanceId:string;pipelineId:string;stageId:string}
type Item={candidateId:string;status:'created'|'already_linked'|'blocked';leadId?:string;pipelineId?:string;reason?:string}
const messages:Record<string,string>={radar_crm_review_required:'Revisão e aprovação atuais da empresa são necessárias.',radar_crm_company_already_exists:'Já existe uma empresa com este CNPJ no CRM. Confira o lead antes de vincular.',radar_candidate_not_found:'Empresa indisponível nesta campanha.',radar_cnpja_client_delivery_not_approved:'A entrega destes dados ainda não foi liberada pelo responsável.',radar_brave_client_delivery_not_approved:'A entrega destes dados ainda não foi liberada pelo responsável.'}
export function RadarCrmDeliveryDialog({organizationId,campaignId,revision,candidateIds,initialDestination,onClose,onCompleted,leadPath}:{organizationId:string;campaignId:string;revision:number;candidateIds:string[];initialDestination?:Destination;onClose:()=>void;onCompleted:()=>void;leadPath:(id:string,pipelineId?:string)=>string}){
  const [destinations,setDestinations]=useState<Array<Destination&{pipelineName:string;stageName:string}>>([])
  const [selected,setSelected]=useState(initialDestination?.stageId??''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[items,setItems]=useState<Item[]>([]),[retry,setRetry]=useState(0),requestId=useRef(crypto.randomUUID()),submitting=useRef(false)
  useEffect(()=>{let active=true;setLoading(true);setError('');radarService.getCrmDestinations(organizationId).then(value=>{if(active)setDestinations(value)}).catch(()=>{if(active)setError('Não foi possível carregar os destinos. Confira seu acesso ao CRM e tente novamente.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[organizationId,retry])
  const destination=destinations.find(item=>item.stageId===selected)
  const send=async()=>{
    if(!destination||!confirmed||submitting.current)return
    submitting.current=true;setBusy(true);setError('')
    try{const result=await radarService.deliverToCrm(campaignId,{organizationId,configurationRevision:revision,candidateIds,destination:{crmInstanceId:destination.crmInstanceId,pipelineId:destination.pipelineId,stageId:destination.stageId},requestId:requestId.current});setItems(result.items);onCompleted()}
    catch{setError('Não foi possível enviar. Confira a revisão da campanha, o destino e suas permissões; tente novamente sem recriar a empresa.')}
    finally{submitting.current=false;setBusy(false)}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Enviar empresas ao CRM</DialogTitle><DialogDescription>Revise o destino das {candidateIds.length} empresas selecionadas. Só empresas com aprovação atual serão transferidas. Nenhuma mensagem ou sequência de contato será iniciada.</DialogDescription></DialogHeader>
    <div className="flex flex-col gap-3"><Label htmlFor="radar-crm-destination">CRM, funil e etapa de entrada</Label>
      <Select value={selected} onValueChange={setSelected} disabled={loading||busy||items.length>0}><SelectTrigger id="radar-crm-destination"><SelectValue placeholder={loading?'Carregando destinos...':'Escolha o destino'}/></SelectTrigger><SelectContent><SelectGroup>{destinations.map(item=><SelectItem key={item.stageId} value={item.stageId}>{item.pipelineName} — {item.stageName}</SelectItem>)}</SelectGroup></SelectContent></Select>
      {!loading&&!error&&!destinations.length&&<p className="text-sm text-muted-foreground">Nenhum destino disponível. É necessário um CRM ativo, com funil e etapa de entrada, e permissão de escrita.</p>}
      <p className="text-sm text-muted-foreground">Contatos não comprovados não viram contatos confirmados. Empresas sem e-mail continuam sem e-mail; informações cadastrais permanecem identificadas como tal.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||items.length>0} onChange={event=>setConfirmed(event.target.checked)}/>Revisei as empresas selecionadas e confirmo o destino. O contato será organizado separadamente pela equipe.</label>
      {error&&<div role="alert" className="text-sm text-destructive"><p>{error}</p>{!destinations.length&&<Button variant="outline" size="sm" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</Button>}</div>}
      {items.length>0&&<ul className="flex flex-col gap-2 text-sm" aria-label="Resultado do envio">{items.map((item,index)=><li key={item.candidateId}>Empresa {index+1}: {item.status==='created'?'Enviada ao CRM':item.status==='already_linked'?'Já vinculada ao CRM':messages[item.reason??'']??'Envio bloqueado; confira a revisão e o destino.'} {item.leadId&&<a className="text-primary underline" href={leadPath(item.leadId,item.pipelineId??destination?.pipelineId)}>Abrir lead no CRM</a>}</li>)}</ul>}
    </div>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>{!items.length&&<Button disabled={!destination||!confirmed||busy} onClick={send}>{busy?'Enviando...':'Confirmar envio ao CRM'}</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
