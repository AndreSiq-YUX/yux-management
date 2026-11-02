import {useEffect,useRef,useState,type FormEvent} from 'react'
import {apiRequest} from '@/lib/apiClient'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field'
import type {CrmLead} from '@/types/crm'
type Capability={canSend:boolean;message:string;requests:Array<{id:string;subject:string;status:string;createdAt:string}>}
const statusLabels:Record<string,string>={queued:'Na fila',sending:'Enviando',sent:'Enviado',delivered:'Entregue',failed:'Falhou',suppressed:'Bloqueado',bounced:'Devolvido',cancelled:'Cancelado'}
export function LeadEmailComposer({lead,onSent,onCancel}:{lead:CrmLead;onSent:()=>void|Promise<void>;onCancel:()=>void}){
 const [data,setData]=useState<Capability|null>(null),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const active=useRef(true),pending=useRef(false),requestId=useRef(crypto.randomUUID())
 useEffect(()=>{
  active.current=true;let inFlight=false
  const load=async()=>{if(inFlight)return;inFlight=true;try{const value=await apiRequest<Capability>(`/crm/leads/${lead.id}/email`);if(active.current){setData(value);setError('')}}catch{if(active.current)setError('Não foi possível consultar o envio de e-mail.')}finally{inFlight=false}}
  void load();const timer=window.setInterval(()=>void load(),5000)
  return()=>{active.current=false;window.clearInterval(timer)}
 },[lead.id])
 const send=async(e:FormEvent)=>{
  e.preventDefault();if(pending.current||!data?.canSend)return
  if(!subject.trim()||!body.trim()){setError('Preencha assunto e mensagem.');return}
  pending.current=true;setBusy(true);setError('')
  try{const result=await apiRequest<{status:string}>(`/crm/leads/${lead.id}/email`,{method:'POST',body:{subject:subject.trim(),body:body.trim(),requestId:requestId.current}});if(!active.current)return;setMessage(result.status==='sent'?'E-mail enviado.':'Mensagem registrada. Acompanhe o estado de entrega abaixo.');setSubject('');setBody('');requestId.current=crypto.randomUUID();setData(await apiRequest<Capability>(`/crm/leads/${lead.id}/email`));await onSent()}
  catch(reason){if(active.current)setError(reason instanceof Error?reason.message:'Não foi possível registrar o envio.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 const validEmail=!!lead.email&&!/@(?:lead|yux)\.local$/i.test(lead.email)
 return <form onSubmit={send} className="flex flex-col gap-4 rounded-lg border bg-background p-4" aria-label="Compor e-mail">
  <h3 className="font-semibold">E-mail para {lead.name}</h3><p className="break-words text-sm">Para: {validEmail?lead.email:'Sem e-mail cadastrado'}</p>
  <p className="text-sm text-muted-foreground">{data?.message||'Consultando disponibilidade...'}</p>
  <FieldGroup><Field><FieldLabel htmlFor="lead-email-subject">Assunto</FieldLabel><Input id="lead-email-subject" value={subject} onChange={e=>setSubject(e.target.value)} disabled={busy} maxLength={300}/></Field><Field><FieldLabel htmlFor="lead-email-body">Mensagem</FieldLabel><Textarea id="lead-email-body" value={body} onChange={e=>setBody(e.target.value)} disabled={busy} rows={6}/></Field></FieldGroup>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
  <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||!data?.canSend}>{busy?'Registrando...':'Confirmar envio'}</Button>{validEmail&&<Button asChild variant="outline"><a href={`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Abrir no aplicativo de e-mail</a></Button>}<Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Fechar</Button></div>
  {!!data?.requests.length&&<section className="flex flex-col gap-2" aria-label="Estado dos envios"><h4 className="text-sm font-medium">Envios deste lead</h4>{data.requests.map(r=><div key={r.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span className="break-words">{r.subject}</span><span>{statusLabels[r.status]||'Em acompanhamento'}</span></div>)}</section>}
 </form>
}
