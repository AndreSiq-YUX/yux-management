import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalMarketingStudioWorkspace } from '@/components/marketing-studio/PortalMarketingStudioWorkspace'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type { MarketingStudioSettings, PortalMarketingContentItem } from '@/types/marketingStudio'

export function PortalMarketingStudioPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const [contents, setContents] = useState<PortalMarketingContentItem[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [loadedContents, loadedSettings] = await Promise.all([
        marketingStudioService.getPortalContents(activeContract.id),
        marketingStudioService.getSettings(activeContract.id),
      ])
      setContents(loadedContents)
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio do portal:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [activeContract])

  useEffect(() => {
    load()
  }, [load])

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  return <PortalMarketingStudioWorkspace contents={contents} settings={settings} />
}
