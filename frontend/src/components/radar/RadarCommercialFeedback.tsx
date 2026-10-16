import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Textarea} from '@/components/ui/textarea'
import {radarService} from '@/services/radarService'
import type {CommercialContact,CommercialFeedback} from '@/types/radarCommercial'
import type {RadarResearchFeedback} from '@/types/radarResearch'
const labels:Record<RadarResearchFeedback['kind'],string>={identity_confirmed:'Confirmei a empresa',identity_wrong:'Empresa incorreta',contact_valid:'Contato confirmado pela equipe',contact_invalid:'Contato inválido',segment_confirmed:'Segmento confirmado',segment_wrong:'Segmento divergente'}
export function RadarCommercialFeedback({candidateId,organizationId,revision,contacts,canReview}:{candidateId:string;organizationId:string;revision:number;contacts:CommercialContact[];canReview:boolean}){
 const [items,setItems]=useState<CommercialFeedback[]>([]),[kind,setKind]=useState<RadarResearchFeedback['kind']>('identity_confirmed'),[channel,setChannel]=useState('0'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0)
 const request=useRef<{hash:string;id:string}|null>(null),sending=useRef(false),wantsContact=kind==='contact_valid'||kind==='contact_invalid'
 useEffect(()=>{let active=true;radarService.getCommercialFeedback(candidateId,organizationId).then(value=>{if(active)setItems(value)}).catch(()=>{if(active)setMessage('Não foi possível carregar a conferência.')});return()=>{active=false}},[candidateId,organizationId,refresh])
 async function save(){const contact=contacts[Number(channel)];if(!canReview||sending.current||wantsContact&&(!contact?.kind||!contact.value))return
  const body={organizationId,configurationRevision:revision,kind,note,contact:wantsContact?{kind:contact.kind!,value:contact.value!}:undefined},hash=JSON.stringify({candidateId,...body})
  if(request.current?.hash!==hash)request.current={hash,id:crypto.randomUUID()}
  sending.current=true;setBusy(true);setMessage('')
  try{await radarService.saveResearchFeedback(candidateId,{...body,requestId:request.current.id});request.current=null;setNote('');setRefresh(value=>value+1);setMessage('Conferência registrada. Aprovação e CRM não são alterados automaticamente.')}
  catch{setMessage('Não foi possível registrar. Confira suas permissões e tente novamente.')}finally{sending.current=false;setBusy(false)}
 }
 return <details className="mt-4 rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Conferência da equipe</summary><div className="mt-3 flex flex-col gap-3 text-sm">
  {canReview&&<><label>Resultado<select aria-label="Resultado da conferência" className="mt-1 w-full rounded-md border bg-background p-2" value={kind} disabled={busy} onChange={event=>setKind(event.target.value as RadarResearchFeedback['kind'])}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
   {wantsContact&&<label>Canal<select aria-label="Canal conferido" value={channel} onChange={event=>setChannel(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2">{contacts.map((contact,i)=><option key={i} value={i}>{contact.value}</option>)}</select></label>}
   <label>Observação<Textarea value={note} maxLength={2000} disabled={busy} onChange={event=>setNote(event.target.value)}/></label><Button size="sm" disabled={busy||wantsContact&&!contacts[Number(channel)]} onClick={save}>Registrar conferência</Button></>}
  {message&&<p role="status">{message}</p>}{items.map((item,i)=><div key={item.id??i}><p>{labels[item.kind as RadarResearchFeedback['kind']]??'Conferência registrada'} {item.contact?.value}</p><p>{item.note}</p><p className="text-xs text-muted-foreground">{item.createdAt?new Date(item.createdAt).toLocaleDateString('pt-BR'):''} · revisão {item.configurationRevision}</p></div>)}
 </div></details>
}
