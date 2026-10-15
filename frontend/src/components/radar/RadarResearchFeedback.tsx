import {useEffect,useRef,useState} from 'react'
import {radarService} from '@/services/radarService'
import type {RadarResearchContact,RadarResearchFeedback as Feedback} from '@/types/radarResearch'
import {Button} from '@/components/ui/button'
import {Textarea} from '@/components/ui/textarea'
const labels:Record<Feedback['kind'],string>={identity_confirmed:'Confirmei a empresa',identity_wrong:'Empresa incorreta',contact_valid:'Contato confirmado pela equipe',contact_invalid:'Contato inválido',segment_confirmed:'Segmento confirmado',segment_wrong:'Segmento divergente'}
export function RadarResearchFeedback({candidateId,organizationId,revision,contacts,canReview}:{candidateId:string;organizationId:string;revision:number;contacts:RadarResearchContact[];canReview:boolean}){
  const [history,setHistory]=useState<Feedback[]>([]),[kind,setKind]=useState<Feedback['kind']>('identity_confirmed'),[channel,setChannel]=useState('0'),[note,setNote]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0)
  const pending=useRef<{hash:string;requestId:string}|null>(null),submitted=useRef(false)
  useEffect(()=>{let active=true;setHistory([])
    const load=async()=>{try{const value=await radarService.getResearchFeedback(candidateId,organizationId);if(active)setHistory(value)}catch{if(active)setMessage('Não foi possível carregar o histórico de conferência.')}}
    void load();return()=>{active=false}
  },[candidateId,organizationId,refresh])
  const wantsContact=kind==='contact_valid'||kind==='contact_invalid'
  async function save(){if(!canReview||submitted.current||wantsContact&&!contacts[Number(channel)])return
    const body={organizationId,configurationRevision:revision,kind,contact:wantsContact?{kind:contacts[Number(channel)].kind,value:contacts[Number(channel)].value}:undefined,note}
    const hash=JSON.stringify({candidateId,...body})
    if(pending.current?.hash!==hash)pending.current={hash,requestId:crypto.randomUUID()}
    submitted.current=true;setBusy(true);setMessage('')
    try{await radarService.saveResearchFeedback(candidateId,{...body,requestId:pending.current.requestId});pending.current=null;setNote('');setRefresh(value=>value+1);setMessage('Conferência registrada. Não altera aprovações, contatos do CRM ou critérios automaticamente.')}
    catch{setMessage('Não foi possível registrar. Confira as permissões e se a pesquisa ou configuração mudou.')}finally{submitted.current=false;setBusy(false)}
  }
  return <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Conferência da equipe e retorno do contato manual</summary><div className="mt-3 flex flex-col gap-3">
    <p className="text-xs text-muted-foreground">Registre o que a equipe verificou. Isso não envia mensagens, não aprova a empresa e não muda o CRM automaticamente.</p>
    {canReview&&<><label className="flex flex-col gap-1 text-sm">Resultado da conferência<select aria-label="Resultado da conferência" className="rounded-md border bg-background p-2" value={kind} disabled={busy} onChange={e=>setKind(e.target.value as Feedback['kind'])}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {wantsContact&&<label className="flex flex-col gap-1 text-sm">Canal conferido<select aria-label="Canal conferido" className="rounded-md border bg-background p-2" value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)}>{contacts.map((contact,index)=><option key={`${contact.kind}-${index}`} value={index}>{contact.value}</option>)}</select></label>}
      <label className="flex flex-col gap-1 text-sm">Observação<Textarea aria-label="Observação da conferência" maxLength={2000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
      <div><Button size="sm" disabled={busy||wantsContact&&!contacts[Number(channel)]} onClick={save}>{busy?'Registrando...':'Registrar conferência'}</Button></div></>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    {history.map(item=><div key={item.id} className="rounded-md border p-2 text-sm"><p>{labels[item.kind]}{item.contact?` · ${item.contact.value}`:''}</p><p>{item.note}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('pt-BR')} · revisão {item.configuration_revision}{item.configuration_revision!==revision?' (histórica)':''}</p></div>)}
  </div></details>
}
