import { useCallback,useEffect,useState } from 'react'
import { MissionLearningPanel } from '@/components/action-engine/MissionLearningPanel'
import { actionEngineService } from '@/services/actionEngineService'
import { platformService } from '@/services/platformService'
import type { LearningExperiment,LearningRecommendation,MissionLearningMemory,MissionLearningWorkspace } from '@/types/actionEngine'
import type { Organization } from '@/types/platform'

const empty:MissionLearningWorkspace={memories:[],recommendations:[],experiments:[],promotions:[]}

export function MissionLearningPage(){
  const [organizations,setOrganizations]=useState<Organization[]>([]);const [organizationId,setOrganizationId]=useState('')
  const [workspace,setWorkspace]=useState<MissionLearningWorkspace>(empty);const [loading,setLoading]=useState(true);const [busyId,setBusyId]=useState<string|null>(null);const [error,setError]=useState<string|null>(null)
  const load=useCallback(async(id:string)=>{if(!id){setWorkspace(empty);setLoading(false);return}setLoading(true);setError(null);try{const [learning,experiments]=await Promise.all([actionEngineService.listLearning(id),actionEngineService.listLearningExperiments(id)]);setWorkspace({...learning,...experiments})}catch(error){console.error('Mission learning load failed',error);setError('Não foi possível carregar o aprendizado governado desta organização.')}finally{setLoading(false)}},[])
  useEffect(()=>{let active=true;void platformService.getOrganizations().then(items=>{if(!active)return;setOrganizations(items);const first=items[0]?.id??'';setOrganizationId(first)}).catch(error=>{console.error('Organization load failed',error);if(active)setError('Não foi possível carregar as organizações.')});return()=>{active=false}},[])
  useEffect(()=>{void load(organizationId)},[load,organizationId])
  const act=useCallback(async(id:string,operation:()=>Promise<unknown>)=>{setBusyId(id);setError(null);try{await operation();await load(organizationId)}catch(error){console.error('Mission learning action failed',error);setError('A ação não pôde ser concluída. Verifique os gates e tente novamente.')}finally{setBusyId(null)}},[load,organizationId])
  const review=(memory:MissionLearningMemory,decision:'approved'|'rejected')=>void act(memory.id,()=>actionEngineService.reviewLearningMemory(organizationId,memory.id,decision))
  const experiment=(item:LearningRecommendation)=>void act(item.id,()=>actionEngineService.createLearningExperiment(organizationId,item.id,{hypothesis:item.rationale,candidateVersionLabel:`${item.targetKey}-candidate`,expectedImpact:item.expectedImpact}))
  const decide=(item:LearningExperiment,decision:'approved'|'rejected')=>void act(item.id,()=>actionEngineService.decideLearningExperiment(organizationId,item.id,decision))
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold text-slate-900">Aprendizado de Missões</h1><p className="mt-1 text-sm text-slate-600">Revise memórias, compare experimentos shadow e solicite mudanças versionadas sem auto-modificação.</p></header><label className="block max-w-md text-sm font-medium text-slate-700">Organização<select className="mt-1 w-full rounded-md border bg-white px-3 py-2" value={organizationId} onChange={event=>setOrganizationId(event.target.value)}>{organizations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{loading?<p className="text-sm text-slate-500" aria-live="polite">Carregando aprendizado...</p>:null}{error?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>:null}{!loading?<MissionLearningPanel {...workspace} busyId={busyId} onReviewMemory={review} onCreateExperiment={experiment} onDecideExperiment={decide}/>:null}</div>
}
