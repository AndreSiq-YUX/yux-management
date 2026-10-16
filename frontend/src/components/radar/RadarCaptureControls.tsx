import {useEffect,useId,useRef,useState,type FormEvent} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import type {RadarCaptureOperation} from '@/types/radarResearch'
type Props={scopeKey:string;operation:RadarCaptureOperation|null;loading:boolean;busy:boolean;available:boolean;error?:string;
 onStart:(input:{requestedCount:number;requestId:string})=>Promise<void>;onResume:()=>Promise<void>;onRefresh:()=>void}
export function RadarCaptureControls(props:Props){
 const terminal=props.operation&&['partial','completed'].includes(props.operation.status)?props.operation.id:'active'
 return <CaptureForm key={`${props.scopeKey}:${terminal}`} {...props}/>
}
function CaptureForm({operation,loading,busy,available,error,onStart,onResume,onRefresh}:Props){
 const id=useId(),[quantity,setQuantity]=useState('10'),[sending,setSending]=useState(false),[failure,setFailure]=useState(''),[acknowledged,setAcknowledged]=useState(false)
 const request=useRef<{requestedCount:number;requestId:string}|null>(null),inFlight=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const active=!!operation&&['queued','discovering','researching','blocked'].includes(operation.status),blocked=operation?.status==='blocked'
 const count=Number(quantity),valid=quantity.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=1000
 const disabled=loading||busy||sending||active&&!blocked||acknowledged&&!active||!active&&!available||!!error&&!blocked
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(disabled||inFlight.current||!active&&!valid)return
  inFlight.current=true;setSending(true);setFailure('')
  try{
   if(blocked)await onResume()
   else{request.current??={requestedCount:count,requestId:crypto.randomUUID()};await onStart(request.current);if(alive.current)setAcknowledged(true)}
  }catch{if(alive.current)setFailure('Não foi possível confirmar o início. Tente novamente sem alterar este lote.')}
  finally{inFlight.current=false;if(alive.current)setSending(false)}
 }
 return <form aria-label="Pesquisar novas empresas" onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
   <div className="flex flex-col gap-2 sm:w-52" data-invalid={!valid||undefined}>
    <Label htmlFor={id}>Novas empresas neste lote</Label>
    <Input id={id} type="number" min={1} max={1000} step={1} value={active?operation.counts.requested:quantity}
     disabled={loading||busy||sending||active||!!request.current||acknowledged} aria-invalid={!active&&!valid} aria-describedby={`${id}-help`}
     onChange={event=>{setQuantity(event.target.value);setFailure('')}}/>
   </div>
   <Button type="submit" disabled={disabled||!active&&!valid}>{sending||busy?blocked?'Retomando…':'Iniciando…':blocked?'Retomar pesquisa':active?'Pesquisando empresas…':failure?'Tentar novamente sem duplicar':'Pesquisar novas empresas'}</Button>
  </div>
  <p id={`${id}-help`} className="text-sm text-muted-foreground">A pesquisa encontra novas empresas e completa seus dados automaticamente. De 1 a 1.000 empresas; duplicatas não contam.</p>
  {!valid&&!active&&<p role="alert" className="text-sm text-destructive">Informe um número inteiro de 1 a 1.000.</p>}
  {!available&&!active&&!loading&&<p className="text-sm text-muted-foreground">A pesquisa precisa de liberação. Confira a operação técnica abaixo.</p>}
  {(failure||error)&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>{failure||error}</p>{error&&<Button type="button" size="sm" variant="outline" onClick={onRefresh}>Atualizar acompanhamento</Button>}</div>}
 </form>
}
