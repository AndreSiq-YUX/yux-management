import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
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

  const load = useCallback(async () => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setCampaigns(await campaignService.getPortalCampaigns(activeContract.id))
    } catch (error) {
      console.error('Erro ao carregar campanhas do portal:', error)
      toast.error('Erro ao carregar campanhas')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  const createDraft = useCallback(async (input: CreateCampaignDraftInput) => {
    if (!activeContract || !organization?.id) {
      toast.error('Contexto do contrato indisponivel')
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
    toast.success('Campanha enviada para aprovacao')
    await load()
    setMode('list')
  }, [createDraft, load])

  if (isPlatformLoading || loading) return <p className="text-sm text-slate-600">Carregando campanhas...</p>

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Campanhas</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
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
      onRequestChange={(campaignId) => {
        if (campaignId) {
          toast.success('Campanha selecionada para revisao')
          return
        }
        setMode('meta-builder')
      }}
    />
  )
}
