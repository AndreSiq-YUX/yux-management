import {useId,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import {Alert,AlertDescription} from '@/components/ui/alert'
import type {RadarCaptureLimits,RadarCapturePreflight} from '@/types/radarResearch'
type Props={open:boolean;preflight:RadarCapturePreflight;busy:boolean;error?:string;mode?:'start'|'resume';onCancel:()=>void;onConfirm:(limits:RadarCaptureLimits)=>Promise<void>}
// The parent keys this component by the state receipt: an old approval never carries into a new lot.
export function RadarCaptureContinuationDialog({open,preflight,busy,error,mode='resume',onCancel,onConfirm}:Props){
 const id=useId(),[values,setValues]=useState(()=>Object.fromEntries(Object.entries(preflight.limits).map(([k,v])=>[k,String(v)]))),[sending,setSending]=useState(false)
 const inFlight=useRef(false)
 const caps=preflight.policy?.limits
 const fields=[['pageSize','Empresas por página',caps?.maxDiscoveryPageSize],['maxPagesPerScope','Total de páginas por região',caps?.maxPagesPerScope],['maxQueriesPerBatch','Total de consultas deste lote',caps?.maxDiscoveryQueriesPerLot]] as const
 const valid=!preflight.requiresLimitsApproval||!!caps&&fields.every(([key,,max])=>values[key]?.trim()&&Number.isSafeInteger(Number(values[key]))&&Number(values[key])>=1&&Number(values[key])<=max!)
 const restarts=preflight.continuations?.filter(s=>s.requiresRestartConfirmation)??[]
 const confirm=async()=>{
  if(!valid||busy||inFlight.current||!preflight.allowed)return
  inFlight.current=true;setSending(true)
  try{await onConfirm({pageSize:Number(values.pageSize),maxPagesPerScope:Number(values.maxPagesPerScope),maxQueriesPerBatch:Number(values.maxQueriesPerBatch)})}
  finally{inFlight.current=false;setSending(false)}
 }
 return <Dialog open={open} onOpenChange={next=>{if(!next&&!busy&&!sending)onCancel()}}>
  <DialogContent className="max-h-[90dvh] overflow-y-auto">
   <DialogHeader><DialogTitle>{mode==='start'?'Iniciar um novo lote':'Continuar o mesmo lote'}</DialogTitle><DialogDescription>{mode==='start'?'Serão pesquisadas':'Faltam'} {preflight.remaining} novas empresas. As empresas e os dados já salvos serão preservados; duplicatas não contam como novas.</DialogDescription></DialogHeader>
   {!!preflight.warnings?.length&&<Alert><AlertDescription className="flex flex-col gap-2">{preflight.warnings.map(warning=><p key={warning.code}>{warning.message}</p>)}
    {preflight.researchCapacity&&<p>Capacidade diária restante: até {preflight.researchCapacity.remainingQueries} consultas; planejamento conservador do lote: até {preflight.researchCapacity.plannedMaximumQueries} consultas. Não é reserva nem garantia de cobertura. Estimativa máxima de buscas: {preflight.researchCapacity.estimatedMaximumCostBrl.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}, sem IA.</p>}
    <a href="/admin/integrations" className="text-primary underline">Editar quotas das fontes e tetos operacionais no Admin</a>
   </AlertDescription></Alert>}
   {preflight.requiresLimitsApproval&&<>
    <p className="text-sm">Limites atuais: {preflight.limits.pageSize} empresas por página, {preflight.limits.maxPagesPerScope} páginas por região e {preflight.limits.maxQueriesPerBatch} consultas no lote. Já foram utilizadas {preflight.attemptedQueries} consultas. Capacidade adicional teórica atual: até {preflight.optimisticAdditionalCapacity} empresas.</p>
    {preflight.campaignLimits&&<><p className="text-sm">Campanha salva: {preflight.campaignLimits.pageSize} empresas por página, {preflight.campaignLimits.maxPagesPerScope} páginas por região e {preflight.campaignLimits.maxQueriesPerBatch} consultas. Esses valores não foram aplicados ao lote.</p><Button type="button" variant="outline" disabled={busy||sending||!caps} onClick={()=>setValues(Object.fromEntries(Object.entries(preflight.campaignLimits!).map(([k,v])=>[k,String(v)])))}>Usar os limites salvos na campanha</Button></>}
    <fieldset className="flex flex-col gap-3" disabled={busy||sending}><legend className="mb-3 text-sm font-medium">Limites totais autorizados apenas para este lote</legend>
     {fields.map(([key,label,max])=><div key={key} className="flex flex-col gap-2" data-invalid={max===undefined||!values[key]?.trim()||Number(values[key])<1||Number(values[key])>max||undefined}>
      <Label htmlFor={`${id}-${key}`}>{label}</Label><Input id={`${id}-${key}`} type="number" min={1} max={max} step={1} value={values[key]} aria-invalid={max===undefined||!values[key]?.trim()||!Number.isInteger(Number(values[key]))||Number(values[key])<1||Number(values[key])>max} onChange={event=>setValues({...values,[key]:event.target.value})}/>
     </div>)}
    </fieldset>
    <p className="text-sm text-muted-foreground">Nenhum limite é aumentado automaticamente. Estes totais incluem o consumo anterior e não alteram cotas diárias, orçamento nem créditos de IA.</p>
   </>}
   {restarts.map(state=><p key={state.scopeKey} className="text-sm">A busca em {state.scopeLabel} precisa reiniciar {state.reason==='unknown_age'?'porque a idade da continuação anterior é desconhecida':state.reason==='idle'?'porque ultrapassou a pausa administrativa configurada':'porque a continuação anterior foi rejeitada'}. Há {state.replayEstimate} páginas anteriores que podem ser revisitadas e consumir novas consultas dentro dos limites aprovados.</p>)}
   {!restarts.length&&preflight.expiredContinuation&&<p className="text-sm">A continuação da busca em {preflight.expiredContinuation.scopeLabel} foi rejeitada. Confirmar também autoriza reiniciar essa descoberta: páginas anteriores podem ser revisitadas e consumir novas consultas, sempre dentro dos limites aprovados.</p>}
   {preflight.requiresLimitsApproval&&!caps&&<p role="alert">Atualize a página: os tetos administrativos não foram carregados. Nenhum limite será presumido.</p>}
   <p className="text-sm text-muted-foreground">A quantidade final depende das empresas disponíveis e das cotas restantes. Saldo externo e conexão não foram testados nesta conferência.</p>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <DialogFooter><Button type="button" variant="outline" disabled={busy||sending} onClick={onCancel}>Cancelar</Button><Button type="button" disabled={!valid||busy||sending||!preflight.allowed} onClick={()=>void confirm()}>{busy||sending?'Confirmando…':mode==='start'?'Confirmar e iniciar':'Confirmar e retomar'}</Button></DialogFooter>
  </DialogContent>
 </Dialog>
}
