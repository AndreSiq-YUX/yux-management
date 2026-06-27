import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalLandingPagesWorkspace } from '@/components/landing-pages/PortalLandingPagesWorkspace'
import { landingPageService } from '@/services/landingPageService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalLandingPage } from '@/types/landingPage'

export function PortalLandingPagesPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [pages, setPages] = useState<PortalLandingPage[]>([])
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
      setPages(await landingPageService.getPortalLandingPages(activeContract.id))
    } catch (error) {
      console.error('Erro ao carregar landing pages do portal:', error)
      toast.error('Erro ao carregar landing pages')
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  if (isPlatformLoading || loading) return <p className="text-sm text-slate-600">Carregando landing pages...</p>

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Landing Pages</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  return (
    <PortalLandingPagesWorkspace
      contract={activeContract}
      pages={pages}
      onRequestChange={async landingPageId => {
        await landingPageService.requestLandingPageChange({ landingPageId, message: 'Cliente solicitou ajuste pelo portal.' })
        toast.success('Solicitacao enviada')
        load()
      }}
      onApprove={async landingPageId => {
        await landingPageService.approveLandingPage({ landingPageId, status: 'approved', comment: 'Aprovado pelo portal.' })
        toast.success('Publicacao aprovada')
        load()
      }}
    />
  )
}
