import {useEffect,useState} from 'react'
import {radarService} from '@/services/radarService'
import type {RadarResearchMetrics as Metrics} from '@/types/radarResearch'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
const brl=(value:number|null|undefined)=>typeof value!=='number'||!Number.isFinite(value)?'Não disponível':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4})
export function RadarResearchMetrics({campaignId,organizationId,showCosts}:{campaignId:string;organizationId:string;showCosts:boolean}){
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})
  const [from,setFrom]=useState(today),[to,setTo]=useState(today),[refresh,setRefresh]=useState(0)
  const [result,setResult]=useState<Metrics|null>(null),[error,setError]=useState(false)
  useEffect(()=>{let active=true;setResult(null);setError(false)
    const load=async()=>{try{const value=await radarService.getResearchMetrics(campaignId,organizationId,from,to);if(active)setResult(value)}catch{if(active)setError(true)}}
    void load();return()=>{active=false}
  },[campaignId,organizationId,from,to,refresh])
  return <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Resultados e consumo da pesquisa</summary>
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">De<Input type="date" aria-label="Métricas desde" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Até<Input type="date" aria-label="Métricas até" value={to} onChange={e=>setTo(e.target.value)}/></label><Button size="sm" variant="outline" onClick={()=>setRefresh(value=>value+1)}>Atualizar indicadores</Button></div>
      <p className="text-xs text-muted-foreground">Período dos registros diários: UTC. Empresas únicas no período, não quantidade de chamadas.</p>
      {error?<p role="alert">Não foi possível carregar os indicadores. Os resultados da pesquisa foram preservados.</p>:!result?<p role="status">Carregando indicadores...</p>:<>
        <p className="text-sm">{result.companies} pesquisadas · {result.identified} com identidade associada · {result.withUsefulContact} com contato útil · {result.readyForReview} prontas para revisão.</p>
        {showCosts&&<><p className="text-sm">Buscas estimadas: {brl(result.searchEstimatedBrl)} · {result.searchQueries} consultas · {brl(result.searchCostPerCompanyBrl)} por empresa pesquisada.</p>
          <p className="text-sm">Por identidade associada: {brl(result.searchCostPerIdentityBrl)} · Por empresa com contato útil: {brl(result.searchCostPerUsefulContactBrl)}.</p>
          <p className="text-sm">Por empresa pronta para revisão: {brl(result.searchCostPerReadyForReviewBrl)}.</p>
          <details className="text-sm"><summary className="cursor-pointer">Detalhamento das buscas — Admin</summary><ul>{result.sources.map(source=><li key={source.sourceType}>{({serper_web_search:'Google via Serper',brave_web_search:'Brave Web',brave_place_search:'Brave Places'} as Record<string,string>)[source.sourceType]??source.sourceType}: {source.units} consultas · {brl(source.estimatedCostBrl)}</li>)}</ul></details>
          <p className="text-sm">IA: {result.aiReportedUsd===null?'custo não disponível':`subtotal informado US$ ${result.aiReportedUsd.toFixed(6)}`} · custo conhecido em {result.aiCostKnown} de {result.aiAnalyses} análises · {result.aiCostUnknown} sem custo conhecido.</p>
          <p className="text-xs text-muted-foreground">{result.currencyNote}</p></>}
      </>}
    </div>
  </details>
}
