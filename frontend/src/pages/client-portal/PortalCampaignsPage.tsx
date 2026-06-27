import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalCampaignsWorkspace } from '@/components/campaigns/PortalCampaignsWorkspace'
import { campaignService } from '@/services/campaignService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalCampaign } from '@/types/campaign'

export function PortalCampaignsPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [campaigns, setCampaigns] = useState<PortalCampaign[]>([])
  const [loading, setLoading] = useState(true)

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

  if (isPlatformLoading || loading) return <p className="text-sm text-slate-600">Carregando campanhas...</p>

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Campanhas</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  return (
    <PortalCampaignsWorkspace
      contract={activeContract}
      campaigns={campaigns}
      onRequestChange={() => toast.success('Solicitacao registrada')}
    />
  )
}
