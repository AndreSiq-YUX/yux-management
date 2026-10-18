import {useEffect,useState} from 'react'
import {radarService} from '@/services/radarService'
import type {RadarOperationalPolicy} from '@/types/radarResearch'

let pending:Promise<RadarOperationalPolicy>|null=null
const eventName='radar-operational-policy-saved'
export function publishRadarOperationalPolicy(policy:RadarOperationalPolicy){window.dispatchEvent(new CustomEvent(eventName,{detail:policy}))}
export function useRadarOperationalPolicy(enabled:boolean){
 const [policy,setPolicy]=useState<RadarOperationalPolicy|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(!enabled)return
  let active=true,savedDuringRead=false
  const onSaved=(event:Event)=>{if(active){savedDuringRead=true;setPolicy((event as CustomEvent<RadarOperationalPolicy>).detail);setError('')}}
  window.addEventListener(eventName,onSaved)
  setError('')
  pending??=Promise.resolve().then(()=>radarService.getOperationalPolicy()).finally(()=>{pending=null})
  void pending.then(value=>{if(active)setPolicy(previous=>savedDuringRead&&previous&&previous.version>value.version?previous:value)}).catch(()=>{if(active&&!savedDuringRead){setPolicy(null);setError('Não foi possível carregar os limites do Radar. Atualize antes de editar ou iniciar uma pesquisa.')}})
  return()=>{active=false;window.removeEventListener(eventName,onSaved)}
 },[enabled,revision])
 return{policy:enabled?policy:null,error:enabled?error:'',reload:()=>setRevision(value=>value+1)}
}
