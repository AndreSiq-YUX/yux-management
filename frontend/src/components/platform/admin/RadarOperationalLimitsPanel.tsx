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
 ['maxVerificationBatch','Empresas por lote de verificação'],['maxSearchQueriesPerCompany','Consultas por empresa'],
 ['maxPublicPagesPerCompany','Páginas públicas por empresa'],['maxCampaignDailyQueries','Consultas diárias por campanha'],
 ['maxSourceDailyQueries','Consultas diárias por fonte'],['maxResearchFreshnessDays','Validade da pesquisa (dias)'],
 ['maxContinuationIdleMinutes','Pausa da continuação antes de confirmar reinício (minutos)'],
]
export function RadarOperationalLimitsPanel({isAdmin}:{isAdmin:boolean}){
 const id=useId(),{policy,error,reload}=useRadarOperationalPolicy(isAdmin)
 const [values,setValues]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('')
 useEffect(()=>{if(policy)setValues(Object.fromEntries(Object.entries(policy.limits).map(([k,v])=>[k,String(v)])))},[policy])
 if(!isAdmin)return null
 const valid=!!policy&&fields.every(([key])=>values[key]?.trim()&&Number.isSafeInteger(Number(values[key]))&&Number(values[key])>0&&Number(values[key])<=2_147_483_647)
 const save=async(event:FormEvent)=>{
  event.preventDefault();if(!policy||!valid||saving)return
  setSaving(true);setFailure('');setMessage('')
  try{
   const result=await radarService.updateOperationalPolicy({expectedVersion:policy.version,limits:Object.fromEntries(fields.map(([key])=>[key,Number(values[key])])) as RadarOperationalLimits})
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
      {fields.map(([key,label])=><label key={key} className="flex flex-col gap-2" data-invalid={!values[key]?.trim()||Number(values[key])<1||undefined}>
       <Label asChild><span>{label}</span></Label><Input id={`${id}-${key}`} name={key} type="number" min={1} step={1} value={values[key]??''} aria-invalid={!values[key]?.trim()||!Number.isSafeInteger(Number(values[key]))||Number(values[key])<1} onChange={event=>setValues({...values,[key]:event.target.value})}/>
      </label>)}
     </fieldset></>}
    {failure&&<p role="alert">{failure}</p>}{message&&<p role="status">{message}</p>}
   </CardContent>
   <CardFooter className="flex flex-wrap gap-3"><Button type="submit" disabled={!valid||saving}>{saving?'Salvando…':'Salvar limites do Radar'}</Button><Button type="button" variant="outline" disabled={saving} onClick={reload}>Atualizar limites</Button></CardFooter>
  </form>
 </Card>
}
