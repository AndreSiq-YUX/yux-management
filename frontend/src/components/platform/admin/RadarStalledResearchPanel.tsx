import {useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {radarService} from '@/services/radarService'
import type {RadarStalledResearchReport} from '@/types/radarResearch'
const reasons:Record<RadarStalledResearchReport['items'][number]['reason'],string>={running_with_heartbeat:'Execução com lease e worker ativos, mas sem avanço recente',waiting_capacity:'Aguardando capacidade ou créditos',waiting_authorization:'Aguardando autorização',queue_unavailable:'Entrega à fila indisponível ou sem acompanhamento durável',lease_expired:'Lease de execução expirado',effect_uncertain:'Resultado pago incerto — conciliar recibos antes de tentar novamente',no_progress:'Sem avanço recente — conferir execução'}
export function RadarStalledResearchPanel({isSystemAdmin}:{isSystemAdmin:boolean}){
 const [report,setReport]=useState<RadarStalledResearchReport|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(false)
 useEffect(()=>{
  let active=true
  if(!isSystemAdmin){setReport(null);return}
  setLoading(true)
  radarService.getStalledResearch().then(value=>{if(active){setReport(value);setError('')}}).catch(()=>{if(active)setError('Não foi possível conferir as pesquisas paradas. Nenhuma pesquisa foi retomada automaticamente.')}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[isSystemAdmin,refresh])
 if(!isSystemAdmin)return null
 return <section className="flex flex-col gap-3 rounded-md border bg-background p-4" aria-label="Pesquisas sem avanço">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Pesquisas sem avanço</h2><Button size="sm" variant="outline" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Atualizar diagnóstico</Button></div>
  <p className="text-sm text-muted-foreground">Atenção após {report?.stalledAfterMinutes??10} minutos sem mudança de etapa, evidência ou resultado. Atualizar a tela não conta como avanço. Este diagnóstico não repete chamadas pagas.</p>
  {loading&&!report&&<p role="status">Conferindo pesquisas…</p>}{error&&<p role="alert">{error}</p>}
  {report&&!report.items.length&&<p className="text-sm">Nenhuma pesquisa sem avanço no período configurado.</p>}
  <div className="grid gap-3 md:grid-cols-2">{report?.items.map(item=><article key={`${item.kind}:${item.id}`} className="min-w-0 rounded-md border p-3 text-sm"><h3 className="font-medium">{item.campaignName} · {item.organizationName}</h3><p>{item.kind==='capture'?'Lote de captação':'Atualização de empresas'} · etapa {item.stage}</p><p>{reasons[item.reason]}</p><p>Último avanço: {new Date(item.lastProgressAt).toLocaleString('pt-BR')}.</p><a className="text-primary underline" href={`/admin/integrations?radarOrganization=${encodeURIComponent(item.organizationId)}&radarCampaign=${encodeURIComponent(item.campaignId)}#radar-operations`}>{item.nextAction==='reconcile_receipts'?'Conciliar recibos e revisar retomada':'Conferir operação e capacidade'}</a></article>)}</div>
 </section>
}
