import { MessageSquarePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignCreativePanel } from './CampaignCreativePanel'
import type { PortalCampaign } from '@/types/campaign'
import type { ContractDetails } from '@/types/platform'

interface PortalCampaignsWorkspaceProps {
  contract: ContractDetails
  campaigns: PortalCampaign[]
  onRequestChange: (campaignId?: string) => void
}

export function PortalCampaignsWorkspace({ contract, campaigns, onRequestChange }: PortalCampaignsWorkspaceProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Campanhas do contrato</h1>
          <p className="text-slate-600">{contract.name || contract.id}</p>
        </div>
        <Button title="Solicitar nova campanha" onClick={() => onRequestChange()}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          Solicitar campanha
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {campaigns.map(campaign => (
          <article key={campaign.id} className="rounded-md border bg-white p-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <CampaignCreativePanel creatives={campaign.creatives} />
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{campaign.name}</h2>
                    <p className="text-sm text-slate-500">{campaign.provider}</p>
                  </div>
                  <Badge variant={campaign.lifecycleStatus === 'active' ? 'default' : 'secondary'}>{campaign.lifecycleStatus}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <Info label="Investimento" value={campaign.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="Leads" value={campaign.leads.toString()} />
                  <Info label="CPL" value={campaign.cpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="MROI" value={`${campaign.mroi}x`} />
                </div>
                {campaign.landingPageId && <p className="text-xs text-slate-500">Landing page vinculada: {campaign.landingPageId}</p>}
                {(campaign.recommendations?.length || 0) > 0 && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{campaign.recommendations?.[0].title}</p>}
                <Button title="Solicitar alteracao de campanha" size="sm" variant="outline" onClick={() => onRequestChange(campaign.id)}>
                  <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
                  Solicitar ajuste
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
