import { Link } from 'react-router-dom'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import type { MissionArtifact } from '@/types/actionEngine'

const states:Record<string,string>={saved:'Campanha salva',proposed:'Campanha para revisão',not_started:'Pesquisa ainda não iniciada',pending:'Em pesquisa',blocked:'Aguardando ação',partial:'Finalizada com lacunas',completed:'Pronta para revisão'}
const labels:Record<string,string>={requested:'Solicitadas',found:'Encontradas',complete:'Pesquisa concluída',withGaps:'Com lacunas',outsideProfile:'Fora do perfil',waiting:'Aguardando ação',approved:'Aprovadas'}
export function RadarMissionArtifacts({artifacts}:{artifacts:MissionArtifact[]}){
 const workspacePath=usePortalWorkspacePath()
 return <section className="space-y-4 border border-yx-line bg-yx-surface p-5" aria-label="Radar Comercial">
  <h2 className="font-semibold text-yx-fg">Radar Comercial</h2>
  {artifacts.map(artifact=><article key={artifact.key} className="space-y-3">
   <h3 className="text-sm font-semibold">{states[String(artifact.data.state)]??'Aguardando revisão'}</h3>
   {artifact.kind==='radar_campaign'?<div className="space-y-1 text-sm"><p>{String(artifact.data.name??'Campanha selecionada')} · {String(artifact.data.targetSegment??'Perfil definido na campanha')}</p>
    <p>{typeof artifact.data.requestedCount==='number'?`${artifact.data.requestedCount} empresas`:null}{Array.isArray(artifact.data.targetStates)?` · ${artifact.data.targetStates.filter(v=>typeof v==='string').join(', ')}`:null}</p>
    <p className="text-xs text-yx-fg-3">Configuração {String(artifact.data.configurationRevision??'—')} · Critérios {String(artifact.data.criteriaRevision??'—')}</p>
   </div>:null}
   {artifact.data.counts&&typeof artifact.data.counts==='object'?<ul className="flex flex-wrap gap-4 text-sm">{Object.entries(artifact.data.counts).filter(([key,value])=>key in labels&&typeof value==='number').map(([key,value])=><li key={key}>{labels[key]}: {String(value)}</li>)}</ul>:null}
   {artifact.entityId?<Link className="text-sm font-semibold text-yx-blue underline" to={workspacePath(`/portal/comercial/radar/${encodeURIComponent(artifact.entityId)}`)}>Abrir campanha no Radar</Link>:null}
  </article>)}
  <p className="text-xs text-yx-fg-3">Revise as empresas antes de aprovar o uso comercial. A pesquisa não envia mensagens nem entrega contatos ao CRM.</p>
 </section>
}
