import { Beaker, BrainCircuit, Check, FileCheck2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from '@/components/ui/card'
import type { LearningExperiment,LearningPromotionRequest,LearningRecommendation,MissionLearningMemory } from '@/types/actionEngine'

type Props={
  memories:MissionLearningMemory[];recommendations:LearningRecommendation[];experiments:LearningExperiment[];promotions:LearningPromotionRequest[]
  busyId?:string|null
  onReviewMemory:(memory:MissionLearningMemory,decision:'approved'|'rejected')=>void
  onCreateExperiment:(recommendation:LearningRecommendation)=>void
  onDecideExperiment:(experiment:LearningExperiment,decision:'approved'|'rejected')=>void
}

export function MissionLearningPanel({memories,recommendations,experiments,promotions,busyId,onReviewMemory,onCreateExperiment,onDecideExperiment}:Props){
  return <div className="space-y-6" aria-label="Aprendizado governado de missões">
    <Summary memories={memories} recommendations={recommendations} experiments={experiments} promotions={promotions}/>
    <section className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BrainCircuit className="h-5 w-5 text-violet-600"/>Memórias operacionais</CardTitle><CardDescription>Somente resumos aprovados entram no contexto de novas missões.</CardDescription></CardHeader><CardContent className="space-y-3">
        {memories.length===0?<Empty label="Nenhuma missão encerrada aguardando revisão."/>:memories.map(memory=><article key={memory.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-900">{label(memory.packKey)} <span className="text-xs text-slate-500">v{memory.packVersion}</span></p><p className="mt-1 text-xs text-slate-500">Missão {short(memory.missionId)} · {memory.evidenceIds.length} evidências</p></div><Status value={memory.reviewStatus}/></div>
          {memory.reviewStatus==='pending'?<div className="mt-3 flex gap-2"><Button size="sm" disabled={busyId===memory.id} onClick={()=>onReviewMemory(memory,'approved')}><Check className="mr-1 h-4 w-4"/>Aprovar memória</Button><Button size="sm" variant="outline" disabled={busyId===memory.id} onClick={()=>onReviewMemory(memory,'rejected')}><X className="mr-1 h-4 w-4"/>Rejeitar</Button></div>:null}
        </article>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Beaker className="h-5 w-5 text-blue-600"/>Recomendações e shadow</CardTitle><CardDescription>Uma recomendação nunca altera produção diretamente.</CardDescription></CardHeader><CardContent className="space-y-3">
        {recommendations.length===0?<Empty label="Nenhuma recomendação gerada."/>:recommendations.map(item=>{
          const experiment=experiments.find(value=>value.recommendationId===item.id)
          return <article key={item.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-900">{typeLabel[item.recommendationType]}</p><p className="text-xs text-slate-500">Alvo: {item.targetKey}</p></div><Status value={item.status}/></div><p className="mt-2 text-sm text-slate-700">{item.rationale}</p>
            {!experiment&&item.status==='proposed'?<Button className="mt-3" size="sm" disabled={busyId===item.id} onClick={()=>onCreateExperiment(item)}><Beaker className="mr-1 h-4 w-4"/>Criar experimento shadow</Button>:null}
            {experiment?<ExperimentCard experiment={experiment} busy={busyId===experiment.id} onDecision={decision=>onDecideExperiment(experiment,decision)}/>:null}
          </article>})}
      </CardContent></Card>
    </section>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-emerald-600"/>Solicitações de promoção</CardTitle><CardDescription>A aprovação cria uma mudança versionada pendente; nenhum artefato publicado é sobrescrito.</CardDescription></CardHeader><CardContent>{promotions.length===0?<Empty label="Nenhuma solicitação de promoção criada."/>:<div className="grid gap-3 md:grid-cols-2">{promotions.map(item=><article key={item.id} className="rounded-lg border p-4"><div className="flex justify-between gap-2"><p className="font-medium">{typeLabel[item.changeType]} · {item.targetKey}</p><Status value={item.status}/></div><p className="mt-2 font-mono text-xs text-slate-500">{short(item.requestedChangeHash)}</p></article>)}</div>}</CardContent></Card>
  </div>
}

function Summary({memories,recommendations,experiments,promotions}:{memories:MissionLearningMemory[];recommendations:LearningRecommendation[];experiments:LearningExperiment[];promotions:LearningPromotionRequest[]}){const values:Array<[string,number]>=[['Memórias aprovadas',memories.filter(item=>item.reviewStatus==='approved').length],['Recomendações',recommendations.length],['Experimentos concluídos',experiments.filter(item=>item.status==='completed').length],['Promoções pendentes',promotions.filter(item=>item.status==='pending').length]];return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{values.map(([label,value])=><div key={label} className="rounded-lg border bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>)}</div>}
function ExperimentCard({experiment,busy,onDecision}:{experiment:LearningExperiment;busy:boolean;onDecision:(value:'approved'|'rejected')=>void}){return <div className="mt-3 rounded-md bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Shadow {short(experiment.id)}</span><Status value={experiment.status}/></div><p className="mt-2 text-xs text-slate-600">Efeitos em produção: nenhum · Golden gate: {experiment.goldenGatePassed===undefined?'aguardando':experiment.goldenGatePassed?'aprovado':'reprovado'}</p>{experiment.status==='completed'?<><p className="mt-1 text-xs text-slate-600">Comparação: {experiment.comparison.passed?'sem regressões':'com regressões'}</p><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy||!experiment.goldenGatePassed||experiment.comparison.passed!==true} onClick={()=>onDecision('approved')}><ShieldCheck className="mr-1 h-4 w-4"/>Solicitar promoção</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>onDecision('rejected')}>Rejeitar</Button></div></>:null}</div>}
function Empty({label}:{label:string}){return <p className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-500">{label}</p>}
function Status({value}:{value:string}){return <span className="inline-flex rounded-full border bg-white px-2 py-1 text-xs font-medium text-slate-600">{statusLabel[value]??value}</span>}
const typeLabel={pack_change:'Mudança de Action Pack',prompt_change:'Mudança de instrução',policy_change:'Mudança de política',knowledge_candidate:'Candidato à base de conhecimento'} as const
const statusLabel:Record<string,string>={pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',proposed:'Proposta',shadow_testing:'Em shadow',promoted:'Promovido',queued:'Na fila',running:'Executando',completed:'Concluído',failed:'Falhou',implemented:'Implementado'}
function label(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter:string)=>letter.toUpperCase())}
function short(value:string){return value.length>16?`${value.slice(0,8)}…${value.slice(-6)}`:value}
