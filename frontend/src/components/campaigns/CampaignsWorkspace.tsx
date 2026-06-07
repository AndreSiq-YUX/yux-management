import { CheckCircle2, Pause, RefreshCw, Send, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignBuilder } from './CampaignBuilder'
import { CampaignCreativePanel } from './CampaignCreativePanel'
import { CampaignMetricsPanel } from './CampaignMetricsPanel'
import type { AdProviderConnection, Campaign, CreateCampaignDraftInput } from '@/types/campaign'

interface CampaignsWorkspaceProps {
  campaigns: Campaign[]
  providerConnections: AdProviderConnection[]
  defaultOrganizationId?: string
  defaultClientId?: string
  defaultContractId?: string
  onRefresh: () => void
  onCreateDraft: (input: CreateCampaignDraftInput) => void
  onSubmitApproval: (campaignId: string) => void
  onApprove: (campaignId: string) => void
  onCreateProvider?: (campaignId: string) => void
  onSyncMetrics: (campaignId: string) => void
  onPause: (campaignId: string) => void
}

export function CampaignsWorkspace({
  campaigns,
  providerConnections,
  defaultOrganizationId,
  defaultClientId,
  defaultContractId,
  onRefresh,
  onCreateDraft,
  onSubmitApproval,
  onApprove,
  onCreateProvider,
  onSyncMetrics,
  onPause,
}: CampaignsWorkspaceProps) {
  const unhealthyConnections = providerConnections.filter(connection => connection.status !== 'connected')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Campanhas</h1>
          <p className="text-slate-600">Core API-first para Meta Ads, Google Ads, aprovacoes e ROI.</p>
        </div>
        <Button title="Atualizar campanhas" variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className={`rounded-md border p-4 ${unhealthyConnections.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4" />
          {unhealthyConnections.length
            ? `${unhealthyConnections.length} conexao(oes) exigem atencao`
            : 'Conexoes de midia sem pendencias criticas'}
        </div>
      </div>

      <CampaignMetricsPanel campaigns={campaigns} />
      <CampaignBuilder
        defaultOrganizationId={defaultOrganizationId}
        defaultClientId={defaultClientId}
        defaultContractId={defaultContractId}
        onCreateDraft={onCreateDraft}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {campaigns.map(campaign => {
          const providerConnection = providerConnections.find(connection => connection.id === campaign.providerConnectionId)
          const canCreateInProvider = campaign.lifecycleStatus === 'approved'
            && Boolean(campaign.providerConnectionId)
            && Boolean(campaign.adAccountId)
            && Boolean(providerConnection && ['connected', 'stale'].includes(providerConnection.status))
          return (
          <article key={campaign.id} className="rounded-md border bg-white p-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <CampaignCreativePanel creatives={campaign.creatives} />
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{campaign.name}</h2>
                    <p className="text-sm text-slate-500">{campaign.provider} · {campaign.objective}</p>
                  </div>
                  <Badge variant={campaign.lifecycleStatus === 'active' ? 'default' : 'secondary'}>{campaign.lifecycleStatus}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <Info label="Budget/dia" value={campaign.dailyBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="Gasto" value={campaign.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="Leads" value={campaign.leads.toString()} />
                  <Info label="MROI" value={`${campaign.mroi}x`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button title="Enviar para aprovacao" size="sm" variant="outline" onClick={() => onSubmitApproval(campaign.id)}>Aprovacao</Button>
                  <Button title="Aprovar campanha" size="sm" variant="outline" onClick={() => onApprove(campaign.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Aprovar local</Button>
                  <Button title="Criar campanha no provider" size="sm" variant="outline" disabled={!canCreateInProvider} onClick={() => onCreateProvider?.(campaign.id)}><Send className="mr-1 h-3.5 w-3.5" />Criar no provider</Button>
                  <Button title="Sincronizar metricas" size="sm" variant="outline" onClick={() => onSyncMetrics(campaign.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Sync</Button>
                  <Button title="Pausar campanha" size="sm" variant="outline" onClick={() => onPause(campaign.id)}><Pause className="mr-1 h-3.5 w-3.5" />Pausar</Button>
                </div>
                {providerConnection?.status === 'needs_reauth' && <p className="text-sm text-red-600">Provider precisa de reautenticacao antes de criar ou sincronizar.</p>}
                {!campaign.adAccountId && <p className="text-sm text-slate-500">Conta de anuncios pendente para ativacao provider.</p>}
                {(campaign.alerts?.length || 0) > 0 && <p className="text-sm text-amber-700">{campaign.alerts?.[0].title}</p>}
                {(campaign.recommendations?.length || 0) > 0 && <p className="text-sm text-slate-600">{campaign.recommendations?.[0].title}</p>}
              </div>
            </div>
          </article>
        )})}
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
