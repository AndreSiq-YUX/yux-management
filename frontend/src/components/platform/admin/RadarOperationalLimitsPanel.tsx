import {useEffect,useId,useState,type FormEvent} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@/components/ui/card'
import {radarService} from '@/services/radarService'
import {publishRadarOperationalPolicy,useRadarOperationalPolicy} from '@/lib/radar/useRadarOperationalPolicy'
import type {RadarOperationalLimits} from '@/types/radarResearch'

const fields:Array<[keyof RadarOperationalLimits,string]>=[
 ['maxNewCompaniesPerLot','Empresas novas por lote'],['maxDiscoveryPageSize','Empresas por página de descoberta'],
 ['maxPagesPerScope','Páginas por região'],['maxDiscoveryQueriesPerLot','Consultas de descoberta por lote'],
 ['maxVerificationBatch','Empresas por lote de verificação'],['maxSearchQueriesPerCompany','Consultas por empresa, por fonte'],
 ['maxPublicPagesPerCompany','Páginas públicas por empresa'],['maxCampaignDailyQueries','Consultas diárias por campanha'],
 ['maxSourceDailyQueries','Consultas diárias por fonte'],['maxResearchFreshnessDays','Validade da pesquisa (dias)'],
 ['maxContinuationIdleMinutes','Pausa da continuação antes de confirmar reinício (minutos)'],
 ['stalledAfterMinutes','Atenção por pesquisa sem avanço (minutos)'],
 ['maxDecisionCallsPerCompany','Decisões por empresa (preparação, ainda não ativada)'],['maxDeepSearchesPerCompany','Pesquisas profundas por empresa (preparação, ainda não ativada)'],['maxFallbackAttemptsPerEffect','Tentativas de modelo alternativo por análise'],
]
export function RadarOperationalLimitsPanel({isAdmin}:{isAdmin:boolean}){
 const id=useId(),{policy,error,reload}=useRadarOperationalPolicy(isAdmin)
 const [values,setValues]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('')
 const [costValues,setCostValues]=useState({usdToBrl:'',rateAsOf:'',marginPercent:'0'})
 useEffect(()=>{if(policy){setValues(Object.fromEntries(Object.entries({maxDecisionCallsPerCompany:3,maxDeepSearchesPerCompany:1,maxFallbackAttemptsPerEffect:1,stalledAfterMinutes:10,...policy.limits}).map(([k,v])=>[k,String(v)])));setCostValues({usdToBrl:policy.costPolicy?.usdToBrl??'',rateAsOf:policy.costPolicy?.rateAsOf??'',marginPercent:policy.costPolicy?.marginPercent??'0'})}},[policy])
 if(!isAdmin)return null
 const decimal=/^\d{1,36}(?:\.\d{1,36})?$/
 const costValid=decimal.test(costValues.marginPercent)&&(!costValues.usdToBrl&&!costValues.rateAsOf||decimal.test(costValues.usdToBrl)&&Number(costValues.usdToBrl)>0&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(costValues.rateAsOf)&&Number.isFinite(Date.parse(costValues.rateAsOf)))
 const minimum=(key:keyof RadarOperationalLimits)=>key==='maxFallbackAttemptsPerEffect'?0:1
 const valid=!!policy&&costValid&&fields.every(([key])=>values[key]?.trim()&&Number.isSafeInteger(Number(values[key]))&&Number(values[key])>=minimum(key))
 const save=async(event:FormEvent)=>{
  event.preventDefault();if(!policy||!valid||saving)return
  setSaving(true);setFailure('');setMessage('')
  try{
   const result=await radarService.updateOperationalPolicy({expectedVersion:policy.version,limits:Object.fromEntries(fields.map(([key])=>[key,Number(values[key])])) as RadarOperationalLimits,costPolicy:{usdToBrl:costValues.usdToBrl||null,rateAsOf:costValues.rateAsOf||null,rateSource:'manual',marginPercent:costValues.marginPercent}})
   publishRadarOperationalPolicy(result);setMessage('Limites salvos. Nenhuma pesquisa foi iniciada; os lotes existentes mantêm a autorização anterior.')
  }catch{setFailure('Não foi possível salvar. A configuração pode ter mudado em outra aba. Atualize os limites e revise antes de confirmar.')}
  finally{setSaving(false)}
 }
 return <Card id="radar-operational-limits" aria-label="Limites operacionais do Radar">
  <CardHeader><CardTitle>Limites operacionais do Radar</CardTitle><CardDescription>Defina os tetos que as campanhas podem escolher. Salvar não altera campanhas, não inicia buscas e não aumenta a autorização de lotes em andamento.</CardDescription></CardHeader>
  <form onSubmit={save} noValidate>
   <CardContent className="flex flex-col gap-4">
    {!policy&&!error&&<p role="status">Carregando limites…</p>}
    {error&&<p role="alert">{error}</p>}
    {policy&&<><p className="text-sm text-muted-foreground">Política versão {policy.version}. A pausa de continuação é uma precaução administrativa, não uma validade garantida pelo fornecedor.</p>
     <fieldset disabled={saving} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><legend className="sr-only">Tetos permitidos nas campanhas</legend>
      {fields.map(([key,label])=><label key={key} className="flex flex-col gap-2" data-invalid={!values[key]?.trim()||Number(values[key])<minimum(key)||undefined}>
       <Label asChild><span>{label}</span></Label><Input id={`${id}-${key}`} name={key} type="number" min={minimum(key)} step={1} value={values[key]??''} aria-invalid={!values[key]?.trim()||!Number.isSafeInteger(Number(values[key]))||Number(values[key])<minimum(key)} onChange={event=>setValues({...values,[key]:event.target.value})}/>
      </label>)}
     </fieldset>
     <fieldset disabled={saving} className="grid gap-4 md:grid-cols-3"><legend className="mb-2 font-medium">Conversão de custos — estimativa em reais</legend>
      <label className="flex flex-col gap-2"><Label asChild><span>Reais por dólar (cotação manual)</span></Label><Input name="usdToBrl" inputMode="decimal" value={costValues.usdToBrl} onChange={event=>setCostValues(current=>({...current,usdToBrl:event.target.value}))}/></label>
      <label className="flex flex-col gap-2"><Label asChild><span>Data e hora da cotação (UTC)</span></Label><Input name="rateAsOf" placeholder="AAAA-MM-DDTHH:mm:ssZ" value={costValues.rateAsOf} onChange={event=>setCostValues(current=>({...current,rateAsOf:event.target.value}))}/></label>
      <label className="flex flex-col gap-2"><Label asChild><span>Margem de estimativa (%)</span></Label><Input name="marginPercent" inputMode="decimal" value={costValues.marginPercent} onChange={event=>setCostValues(current=>({...current,marginPercent:event.target.value}))}/></label>
      <p className="text-sm text-muted-foreground md:col-span-3">Sem cotação, custos em dólar ficam desconhecidos — não equivalem a zero. Cada reserva conserva a cotação utilizada. Valores são estimativas, sem afirmar taxas ou impostos do cartão.</p>
     </fieldset></>}
    {failure&&<p role="alert">{failure}</p>}{message&&<p role="status">{message}</p>}
   </CardContent>
   <CardFooter className="flex flex-wrap gap-3"><Button type="submit" disabled={!valid||saving}>{saving?'Salvando…':'Salvar limites do Radar'}</Button><Button type="button" variant="outline" disabled={saving} onClick={reload}>Atualizar limites</Button></CardFooter>
  </form>
 </Card>
}
