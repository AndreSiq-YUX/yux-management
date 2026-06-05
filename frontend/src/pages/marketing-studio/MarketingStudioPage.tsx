import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MarketingStudioWorkspace } from '@/components/marketing-studio/MarketingStudioWorkspace'
import { marketingStudioService } from '@/services/marketingStudioService'
import { platformService } from '@/services/platformService'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

export function MarketingStudioPage() {
  const [contents, setContents] = useState<MarketingContentItem[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const contracts = await platformService.getContracts()
      const defaultContract = contracts[0]
      const loadedContents = await marketingStudioService.getContents()
      setContents(loadedContents)
      setSettings(defaultContract ? await marketingStudioService.getSettings(defaultContract.id) : null)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  return <MarketingStudioWorkspace contents={contents} settings={settings} onRefresh={load} />
}
