import {useRef,useState,type FormEvent} from 'react'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {defaultRadarSearchConfiguration} from '@/lib/radar/radarSearchConfiguration'
import type {RadarCampaign} from '@/types/radar'
import type {RadarResearchAvailability} from '@/types/radarResearch'
import {radarResearchMessage} from '@/lib/radar/radarResearchMessages'

export function RadarCaptureDialog({campaign,availability,discoveryCostPerQuery,discoveryBlocker,onStart,onClose,onConfigure}:{campaign:RadarCampaign;availability:RadarResearchAvailability|null;discoveryCostPerQuery:number;discoveryBlocker?:string|null;onStart:(input:{requestedCount:number;requestId:string})=>Promise<void>;onClose:()=>void;onConfigure?:()=>void}){
 const [quantity,setQuantity]=useState('10'),[requestId]=useState(()=>crypto.randomUUID())
 const [busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),sending=useRef(false)
 const count=Number(quantity),valid=quantity.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=1000
 const config=campaign.searchConfiguration??defaultRadarSearchConfiguration()
 const discoveryQueries=Math.min(config.batch.maxQueriesPerBatch,(config.cities.length||campaign.targetStates.length)*config.batch.maxPagesPerScope)
 const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4})
 const available=!discoveryBlocker&&availability?.allowed&&config.research?.enabled&&availability.presence?.routeConfigured!==false&&availability.semantic?.routeConfigured!==false
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(sending.current||done)return
  if(!valid){setError('Informe um número inteiro de 1 a 1.000.');return}
  if(!available)return
  sending.current=true;setBusy(true);setAttempted(true);setError('')
  try{await onStart({requestedCount:count,requestId});setDone(true)}
  catch(cause){const message=cause instanceof Error?radarResearchMessage(cause.message):'';setError(message&&!/^[a-z0-9_]+$/.test(message)?message:'Não foi possível confirmar o início. Tente novamente com a mesma quantidade; não criaremos um lote duplicado.')}
  finally{sending.current=false;setBusy(false)}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader>
  <DialogTitle>Quantas novas empresas você quer pesquisar?</DialogTitle>
  <DialogDescription>A descoberta e o aprofundamento seguem automaticamente as opções salvas desta campanha. A pesquisa continua mesmo com a página fechada.</DialogDescription>
 </DialogHeader><form onSubmit={submit} noValidate className="flex flex-col gap-4">
  <fieldset disabled={busy||done||attempted} className="flex flex-col gap-2" data-invalid={!valid||undefined}>
   <Label htmlFor="radar-capture-quantity">Novas empresas únicas</Label><Input id="radar-capture-quantity" type="number" min={1} max={1000} step={1} disabled={busy||done||attempted} value={quantity} aria-invalid={!valid} aria-describedby="radar-capture-quantity-help" onChange={event=>{setQuantity(event.target.value);setError('')}}/>
   <p id="radar-capture-quantity-help" className="text-sm text-muted-foreground">De 1 a 1.000 empresas adicionais. Duplicatas não contam. Não é uma garantia de empresas qualificadas ou aprovadas.</p>
  </fieldset>
  <div className="flex flex-col gap-2 text-sm"><p>Etapas: descoberta → site e canais → páginas e contatos → consolidação e sinais de atividade{config.research?.presenceResolutionEnabled?' → identificação por IA':''}{config.research?.semanticQualificationEnabled?' → qualificação por IA':''}{config.research?.profileEnabled?' → perfil da empresa':''}{config.research?.sizeAssessment?.enabled?' → avaliação de porte':''}.</p>
   <p>Descoberta: até {discoveryQueries} consultas · {discoveryCostPerQuery>0?money(discoveryQueries*discoveryCostPerQuery):'custo ainda não configurado'}.</p>
   <p>Aprofundamento: até {valid?count*(availability?.maxQueriesPerCandidate??0):0} consultas · {money(valid?count*(availability?.maximumCostPerCandidate??0):0)}.</p>
   <p>IA é cobrada separadamente{availability?.semanticQualificationEnabled?' conforme as rotas e os créditos autorizados no Admin.':' e não será ativada por esta confirmação.'}</p>
   <p className="text-muted-foreground">São tetos estimados, não cobranças antecipadas. Quotas, orçamento e limites por região permanecem iguais. O lote pode terminar parcial. Aprovar, exportar e enviar ao CRM continuam sendo ações separadas; nenhuma mensagem será enviada.</p>
  </div>
  {!available&&<div role="alert" className="flex flex-col gap-2 text-sm"><p>{!availability?'Verificando disponibilidade…':!config.research?.enabled?'Ative o aprofundamento na configuração antes de iniciar.':'A pesquisa completa ainda tem pendências. Confira as fontes, os modelos e os limites antes de iniciar.'}</p>{availability?.reasons.map((reason,index)=><p key={index}>{reason.message} {reason.resolution}</p>)}<div className="flex flex-wrap gap-2">{onConfigure&&<Button type="button" variant="outline" onClick={onConfigure}>Editar configuração</Button>}<a href="/admin/integrations#radar-sources" className="underline">Ver fontes no Admin</a><a href="/admin/ai" className="underline">Ver modelos de IA</a></div></div>}
  {discoveryBlocker&&<p role="alert" className="text-sm">{discoveryBlocker}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy||done||!available||!valid}>{busy?'Iniciando…':attempted&&error?'Tentar novamente sem duplicar':'Buscar e pesquisar empresas'}</Button></DialogFooter>
 </form></DialogContent></Dialog>
}
