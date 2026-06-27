import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CampaignsWorkspace } from '@/components/campaigns/CampaignsWorkspace'
import { campaignService } from '@/services/campaignService'
import { growthWorkspaceService } from '@/services/growthWorkspaceService'
import { platformService } from '@/services/platformService'
import type { AdProviderConnection, Campaign, CreateCampaignDraftInput } from '@/types/campaign'
import type { CampaignPlan, CampaignPlanStep } from '@/types/growthWorkspace'
import type { ContractDetails, Organization } from '@/types/platform'

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [providerConnections, setProviderConnections] = useState<AdProviderConnection[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [campaignPlans, setCampaignPlans] = useState<CampaignPlan[]>([])
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

      const defaultContract = loadedContracts[0]
      const defaultOrganization = loadedOrganizations.find(organization => organization.slug === 'yux') || loadedOrganizations[0]
      if (defaultOrganization) {
        const loadedPlans = await growthWorkspaceService.listCampaignPlans({
          organizationId: defaultOrganization.id,
          contractId: defaultContract?.id,
        })
        setCampaignPlans(loadedPlans)
      } else {
        setCampaignPlans([])
      }
    } catch (error) {
      console.error('Erro ao carregar campanhas:', error)
      toast.error('Erro ao carregar campanhas')
      setCampaigns([])
      setProviderConnections([])
      setCampaignPlans([])
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
      campaignPlans={campaignPlans}
      onRefresh={load}
      onCreateDraft={(input: CreateCampaignDraftInput) => withToast(() => campaignService.createCampaignDraft(input), 'Rascunho criado')}
      onCreateCampaignPlan={async plan => {
        try {
          const created = await growthWorkspaceService.createCampaignPlan(plan)
          toast.success('Plano guiado criado')
          await load()
          return created
        } catch (error) {
          console.error('Erro ao criar plano guiado:', error)
          toast.error(error instanceof Error ? error.message : 'Erro ao criar plano guiado')
        }
      }}
      onUpdateCampaignPlanStep={async (stepId: string, patch: Partial<Pick<CampaignPlanStep, 'status' | 'ownerId' | 'dueAt' | 'completedAt' | 'blockedReason'>>) => {
        try {
          const updated = await growthWorkspaceService.updateCampaignPlanStep(stepId, patch)
          toast.success('Etapa atualizada')
          await load()
          return updated
        } catch (error) {
          console.error('Erro ao atualizar etapa:', error)
          toast.error(error instanceof Error ? error.message : 'Erro ao atualizar etapa')
        }
      }}
      onSubmitApproval={campaignId => withToast(() => campaignService.submitCampaignForApproval(campaignId), 'Campanha enviada para aprovacao')}
      onApprove={campaignId => withToast(() => campaignService.approveCampaign(campaignId), 'Campanha aprovada')}
      onSyncMetrics={campaignId => withToast(() => campaignService.syncCampaignMetrics(campaignId), 'Sincronizacao enfileirada')}
      onPause={campaignId => withToast(() => campaignService.pauseCampaign(campaignId), 'Pausa enfileirada')}
    />
  )
}
