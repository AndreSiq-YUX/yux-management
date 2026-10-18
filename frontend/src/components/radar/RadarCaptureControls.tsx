import {useEffect,useId,useRef,useState,type FormEvent} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import type {RadarCaptureOperation} from '@/types/radarResearch'
type Props={scopeKey:string;operation:RadarCaptureOperation|null;loading:boolean;busy:boolean;available:boolean;error?:string;
 onStart:(input:{requestedCount:number;requestId:string})=>Promise<void>;onResume:(options?:{restartExpiredContinuation?:boolean})=>Promise<'confirmation_required'|void>;onRefresh:()=>void}
export function RadarCaptureControls(props:Props){
 const terminal=props.operation&&!props.operation.canContinue&&['partial','completed'].includes(props.operation.status)?props.operation.id:'active'
 return <CaptureForm key={`${props.scopeKey}:${props.operation?.id??'none'}:${terminal}`} {...props}/>
}
function CaptureForm({operation,loading,busy,available,error,onStart,onResume,onRefresh}:Props){
 const id=useId(),[quantity,setQuantity]=useState('10'),[sending,setSending]=useState(false),[failure,setFailure]=useState(''),[acknowledged,setAcknowledged]=useState(false)
 const [confirmRestart,setConfirmRestart]=useState(false)
 const request=useRef<{requestedCount:number;requestId:string}|null>(null),inFlight=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const active=!!operation&&(operation.canContinue||['queued','discovering','researching','blocked'].includes(operation.status)),blocked=operation?.status==='blocked'||operation?.canContinue
 const count=Number(quantity),valid=quantity.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=1000
 const disabled=loading||busy||sending||active&&!blocked||acknowledged&&!active||!active&&!available||!!error&&!blocked
 const resume=async(confirmed=false)=>{
  const result=confirmed?await onResume({restartExpiredContinuation:true}):await onResume()
  if(alive.current)setConfirmRestart(result==='confirmation_required')
 }
 const confirm=async()=>{
  if(disabled||inFlight.current||!blocked||!confirmRestart)return
  inFlight.current=true;setSending(true);setFailure('')
  try{await resume(true)}catch{if(alive.current)setFailure('Não foi possível retomar. Atualize o acompanhamento antes de tentar novamente.')}
  finally{inFlight.current=false;if(alive.current)setSending(false)}
 }
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(disabled||inFlight.current||!active&&!valid)return
  inFlight.current=true;setSending(true);setFailure('')
  try{
   if(blocked)await resume()
   else{request.current??={requestedCount:count,requestId:crypto.randomUUID()};await onStart(request.current);if(alive.current)setAcknowledged(true)}
  }catch(cause){if(alive.current){
   if(cause instanceof Error&&'captureNotStarted' in cause&&cause.captureNotStarted===true){request.current=null;setFailure(cause.message)}
   else setFailure('Não foi possível confirmar o início. Tente novamente sem alterar este lote.')
  }}
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
  {(failure||error)&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>{error||failure}</p>{error&&<Button type="button" size="sm" variant="outline" onClick={onRefresh}>Atualizar acompanhamento</Button>}</div>}
  <Dialog open={confirmRestart&&blocked} onOpenChange={open=>{if(!sending&&!busy)setConfirmRestart(open)}}>
   <DialogContent>
    <DialogHeader>
     <DialogTitle>Reiniciar a busca para retomar este lote?</DialogTitle>
     <DialogDescription>A continuação desta busca não é mais válida. Para retomar, será necessário reiniciar a descoberta. Isso pode revisitar páginas anteriores e consumir consultas dentro dos limites já configurados.</DialogDescription>
    </DialogHeader>
    <p className="text-sm text-muted-foreground">As empresas salvas serão preservadas e as duplicatas não contarão como novas. O mesmo lote de {operation?.counts.requested} {operation?.counts.requested===1?'empresa':'empresas'} e seus limites serão mantidos.</p>
    <DialogFooter>
     <Button type="button" variant="outline" disabled={sending||busy} onClick={()=>setConfirmRestart(false)}>Cancelar</Button>
     <Button type="button" disabled={disabled} onClick={()=>void confirm()}>{sending||busy?'Retomando…':'Confirmar e retomar'}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </form>
}
