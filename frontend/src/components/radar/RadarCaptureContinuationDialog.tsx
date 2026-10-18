import {useId,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import type {RadarCaptureLimits,RadarCapturePreflight} from '@/types/radarResearch'
type Props={open:boolean;preflight:RadarCapturePreflight;busy:boolean;error?:string;onCancel:()=>void;onConfirm:(limits:RadarCaptureLimits)=>Promise<void>}
// The parent keys this component by the state receipt: an old approval never carries into a new lot.
export function RadarCaptureContinuationDialog({open,preflight,busy,error,onCancel,onConfirm}:Props){
 const id=useId(),[values,setValues]=useState(()=>Object.fromEntries(Object.entries(preflight.limits).map(([k,v])=>[k,String(v)]))),[sending,setSending]=useState(false)
 const inFlight=useRef(false)
 const fields=[['pageSize','Empresas por página',10],['maxPagesPerScope','Total de páginas por região',10],['maxQueriesPerBatch','Total de consultas deste lote',100]] as const
 const valid=fields.every(([key,,max])=>values[key]?.trim()&&Number.isInteger(Number(values[key]))&&Number(values[key])>=1&&Number(values[key])<=max)
 const confirm=async()=>{
  if(!valid||busy||inFlight.current||!preflight.allowed)return
  inFlight.current=true;setSending(true)
  try{await onConfirm({pageSize:Number(values.pageSize),maxPagesPerScope:Number(values.maxPagesPerScope),maxQueriesPerBatch:Number(values.maxQueriesPerBatch)})}
  finally{inFlight.current=false;setSending(false)}
 }
 return <Dialog open={open} onOpenChange={next=>{if(!next&&!busy&&!sending)onCancel()}}>
  <DialogContent className="max-h-[90dvh] overflow-y-auto">
   <DialogHeader><DialogTitle>Continuar o mesmo lote</DialogTitle><DialogDescription>Faltam {preflight.remaining} novas empresas. As empresas e os dados já salvos serão preservados; duplicatas não contam como novas.</DialogDescription></DialogHeader>
   {preflight.requiresLimitsApproval&&<>
    <p className="text-sm">Limites atuais: {preflight.limits.pageSize} empresas por página, {preflight.limits.maxPagesPerScope} páginas por região e {preflight.limits.maxQueriesPerBatch} consultas no lote. Já foram utilizadas {preflight.attemptedQueries} consultas. Capacidade adicional teórica atual: até {preflight.optimisticAdditionalCapacity} empresas.</p>
    <fieldset className="flex flex-col gap-3" disabled={busy||sending}><legend className="mb-3 text-sm font-medium">Limites totais autorizados apenas para este lote</legend>
     {fields.map(([key,label,max])=><div key={key} className="flex flex-col gap-2" data-invalid={!values[key]?.trim()||Number(values[key])<1||Number(values[key])>max||undefined}>
      <Label htmlFor={`${id}-${key}`}>{label}</Label><Input id={`${id}-${key}`} type="number" min={1} max={max} step={1} value={values[key]} aria-invalid={!values[key]?.trim()||!Number.isInteger(Number(values[key]))||Number(values[key])<1||Number(values[key])>max} onChange={event=>setValues({...values,[key]:event.target.value})}/>
     </div>)}
    </fieldset>
    <p className="text-sm text-muted-foreground">Nenhum limite é aumentado automaticamente. Estes totais incluem o consumo anterior e não alteram cotas diárias, orçamento nem créditos de IA.</p>
   </>}
   {preflight.expiredContinuation&&<p className="text-sm">A continuação da busca em {preflight.expiredContinuation.scopeLabel} expirou. Confirmar também autoriza reiniciar essa descoberta: páginas anteriores podem ser revisitadas e consumir novas consultas, sempre dentro dos limites aprovados.</p>}
   <p className="text-sm text-muted-foreground">A quantidade final depende das empresas disponíveis e das cotas restantes. Saldo externo e conexão não foram testados nesta conferência.</p>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <DialogFooter><Button type="button" variant="outline" disabled={busy||sending} onClick={onCancel}>Cancelar</Button><Button type="button" disabled={!valid||busy||sending||!preflight.allowed} onClick={()=>void confirm()}>{busy||sending?'Retomando…':'Confirmar e retomar'}</Button></DialogFooter>
  </DialogContent>
 </Dialog>
}
