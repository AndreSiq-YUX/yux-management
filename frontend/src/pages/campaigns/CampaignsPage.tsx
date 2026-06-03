import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CampaignsWorkspace } from '@/components/campaigns/CampaignsWorkspace'
import { campaignService } from '@/services/campaignService'
import { platformService } from '@/services/platformService'
import type { AdProviderConnection, Campaign, CreateCampaignDraftInput } from '@/types/campaign'
import type { ContractDetails, Organization } from '@/types/platform'

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [providerConnections, setProviderConnections] = useState<AdProviderConnection[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedCampaigns, loadedConnections, loadedContracts, loadedOrganizations] = await Promise.all([
        campaignService.getCampaigns(),
        campaignService.getProviderConnections(),
        platformService.getContracts(),
        platformService.getOrganizations(),
      ])
      setCampaigns(loadedCampaigns)
      setProviderConnections(loadedConnections)
      setContracts(loadedContracts)
      setOrganizations(loadedOrganizations)
    } catch (error) {
      console.error('Erro ao carregar campanhas:', error)
      toast.error('Erro ao carregar campanhas')
      setCampaigns([])
      setProviderConnections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-slate-600">Carregando campanhas...</p>

  const defaultContract = contracts[0]
  const defaultOrganization = organizations.find(organization => organization.slug === 'yux') || organizations[0]

  const withToast = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
      load()
    } catch (error) {
      console.error('Erro em campanha:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar campanha')
    }
  }

  return (
    <CampaignsWorkspace
      campaigns={campaigns}
      providerConnections={providerConnections}
      defaultOrganizationId={defaultOrganization?.id}
      defaultClientId={defaultContract?.clientId}
      defaultContractId={defaultContract?.id}
      onRefresh={load}
      onCreateDraft={(input: CreateCampaignDraftInput) => withToast(() => campaignService.createCampaignDraft(input), 'Rascunho criado')}
      onSubmitApproval={campaignId => withToast(() => campaignService.submitCampaignForApproval(campaignId), 'Campanha enviada para aprovacao')}
      onApprove={campaignId => withToast(() => campaignService.approveCampaign(campaignId), 'Campanha aprovada')}
      onSyncMetrics={campaignId => withToast(() => campaignService.syncCampaignMetrics(campaignId), 'Sincronizacao enfileirada')}
      onPause={campaignId => withToast(() => campaignService.pauseCampaign(campaignId), 'Pausa enfileirada')}
    />
  )
}
