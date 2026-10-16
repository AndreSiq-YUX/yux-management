import { Button } from '@/components/ui/button'
import type { RadarCampaign } from '@/types/radar'
import {RadarResearchMetrics} from './RadarResearchMetrics'

export type RadarScreen='list'|'new'|'results'|'configuration'|'history'
export function RadarCampaignPage({campaign,screen,canManage,onNavigate,onDuplicate}:{campaign:RadarCampaign;screen:RadarScreen;canManage:boolean;onNavigate:(path:string)=>void;onDuplicate?:()=>void}) {
  return <header className="space-y-4 rounded-md border bg-white p-4">
    <Button size="sm" variant="ghost" onClick={()=>onNavigate('')}>Voltar às campanhas</Button>
    <div><h2 className="text-xl font-semibold text-slate-950">{campaign.name}</h2><p className="mt-1 text-sm text-slate-600">{campaign.targetSegment} · {campaign.offerType}</p></div>
    <nav aria-label="Navegação da campanha" className="flex flex-wrap gap-2">
      <Button variant={screen==='results'?'default':'outline'} onClick={()=>onNavigate(campaign.id)}>Resultados</Button>
      <Button variant={screen==='configuration'?'default':'outline'} onClick={()=>onNavigate(`${campaign.id}/configuracoes`)}>{canManage?'Editar configuração':'Configurações'}</Button>
      <Button variant={screen==='history'?'default':'outline'} onClick={()=>onNavigate(`${campaign.id}/historico`)}>Histórico</Button>
    </nav>
    {canManage&&onDuplicate&&<details><summary className="cursor-pointer text-sm text-muted-foreground">Ações da campanha</summary><div className="mt-2 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" onClick={onDuplicate}>Duplicar pesquisa</Button><p className="text-xs text-muted-foreground">Cria outra campanha independente; não continua esta pesquisa.</p>
    </div></details>}
    <p className="text-xs text-slate-500">Configuração salva: revisão {campaign.configurationRevision??1}. Salvar configurações não inicia buscas ou contatos.</p>
    {screen==='results'&&<RadarResearchMetrics campaignId={campaign.id} organizationId={campaign.organizationId} showCosts={canManage}/>}
  </header>
}
