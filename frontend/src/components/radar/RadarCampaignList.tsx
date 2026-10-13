import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getRadarCampaignStatusLabel } from '@/lib/radar/radarRules'
import type { RadarCampaign } from '@/types/radar'

export function RadarCampaignList({campaigns,loading,canCreate,onCreate,onOpen}:{campaigns:RadarCampaign[];loading:boolean;canCreate:boolean;onCreate:()=>void;onOpen:(id:string)=>void}) {
  const [query,setQuery]=useState('')
  const visible=campaigns.filter(campaign=>`${campaign.name} ${campaign.targetSegment} ${campaign.targetCity} ${campaign.targetStates.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  return <section className="rounded-md border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold text-slate-950">Campanhas</h2>
      {canCreate&&<Button onClick={onCreate}>Nova campanha</Button>}
      <Input aria-label="Buscar campanhas" placeholder="Buscar por nome, público ou região" value={query} onChange={event=>setQuery(event.target.value)} className="w-full sm:max-w-sm"/>
    </div>
    {loading?<p className="p-4 text-sm text-slate-500">Carregando campanhas...</p>:visible.length===0?<p className="p-4 text-sm text-slate-500">Nenhuma campanha encontrada.</p>:visible.map(campaign=><div key={campaign.id} className="grid items-center gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1.2fr_1fr_auto]">
      <div><h3 className="font-medium text-slate-950">{campaign.name}</h3><p className="text-sm text-slate-500">{campaign.targetSegment} · {campaign.campaignType==='regional_b2b'?campaign.targetStates.join(', '):`${campaign.targetCity}/${campaign.targetState}`}</p></div>
      <div className="text-sm text-slate-600"><p>{getRadarCampaignStatusLabel(campaign.status)} · Limite diário: {campaign.dailyLimit}</p><p>Objetivo: {campaign.offerType}</p><p className="text-xs">Última alteração: {campaign.updatedAt?new Date(campaign.updatedAt).toLocaleDateString('pt-BR'):'não informada'}</p></div>
      <Button size="sm" variant="outline" onClick={()=>onOpen(campaign.id)}>Abrir</Button>
    </div>)}
  </section>
}
