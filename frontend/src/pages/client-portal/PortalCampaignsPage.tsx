import { useCallback, useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/portal-ui'
import { MetaCampaignBuilder } from '@/components/campaigns/MetaCampaignBuilder'
import { PortalCampaignsWorkspace } from '@/components/campaigns/PortalCampaignsWorkspace'
import { campaignService } from '@/services/campaignService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CreateCampaignDraftInput } from '@/types/campaign'
import type { PortalCampaign } from '@/types/campaign'

export function PortalCampaignsPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const organization = usePlatformStore(state => state.organization)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [campaigns, setCampaigns] = useState<PortalCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'meta-builder'>('list')

  // `silent` recarrega sem trocar a tela por "Carregando" e mantém os dados atuais se falhar.
  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true

    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract) {
      setLoading(false)
      return
    }

    if (!silent) setLoading(true)
    try {
      setCampaigns(await campaignService.getPortalCampaigns(activeContract.id))
    } catch (error) {
      console.error('Erro ao carregar campanhas do portal:', error)
      toast.error('Erro ao carregar campanhas')
      if (!silent) setCampaigns([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(() => load({ silent: true }), [load])

  const createDraft = useCallback(async (input: CreateCampaignDraftInput) => {
    if (!activeContract || !organization?.id) {
      toast.error('Contexto do contrato indisponível')
      return null
    }

    const draft = await campaignService.createCampaignDraft(input)
    toast.success('Rascunho Meta Ads salvo')
    await load()
    return draft
  }, [activeContract, load, organization?.id])

  const submitDraftForApproval = useCallback(async (input: CreateCampaignDraftInput) => {
    const draft = await createDraft(input)
    if (!draft) return
    await campaignService.submitCampaignForApproval(draft.id)
    toast.success('Campanha enviada para aprovação')
    await load()
    setMode('list')
  }, [createDraft, load])

  if (isPlatformLoading || loading) return <SkeletonCard lines={5} />

  if (!activeContract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Campanhas" />
        <EmptyState
          icon={Megaphone}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Fale com a YUX para liberar as campanhas."
        />
      </div>
    )
  }

  if (mode === 'meta-builder') {
    return (
      <MetaCampaignBuilder
        contract={activeContract}
        organizationId={organization?.id}
        onBack={() => setMode('list')}
        onSaveDraft={async (input) => {
          await createDraft(input)
        }}
        onSubmitForApproval={submitDraftForApproval}
      />
    )
  }

  return (
    <PortalCampaignsWorkspace
      contract={activeContract}
      campaigns={campaigns}
      onNewCampaign={() => setMode('meta-builder')}
      onRefresh={refresh}
    />
  )
}
