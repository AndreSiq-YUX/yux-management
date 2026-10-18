import { useCallback, useEffect, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import toast from 'react-hot-toast'
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/portal-ui'
import { PortalLandingPagesWorkspace } from '@/components/landing-pages/PortalLandingPagesWorkspace'
import { landingPageService } from '@/services/landingPageService'
import { usePlatformStore } from '@/stores/platformStore'
import type { LandingPageForm, PortalLandingPage } from '@/types/landingPage'

export function PortalLandingPagesPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [pages, setPages] = useState<PortalLandingPage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const mergeForm = useCallback((form: Partial<LandingPageForm> & { id: string; landingPageId?: string }) => {
    setPages(current => current.map(page => {
      if (page.id !== form.landingPageId) return page
      const nextForms = (page.forms || []).filter(existing => existing.id !== form.id)
      return { ...page, forms: [...nextForms, form as LandingPageForm] }
    }))
  }, [])

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
    setLoadError(false)
    try {
      setPages(await landingPageService.getPortalLandingPages(activeContract.id))
    } catch (error) {
      console.error('Erro ao carregar landing pages do portal:', error)
      toast.error('Erro ao carregar landing pages')
      setLoadError(true)
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  if (isPlatformLoading || loading) return <SkeletonCard lines={5} />

  if (!activeContract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Landing pages" />
        <EmptyState
          icon={LayoutTemplate}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Fale com a YUX para liberar as landing pages."
        />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Landing pages" />
        <ErrorState
          title="Não foi possível carregar as landing pages."
          description="Confira a sua conexão e tente novamente."
          onRetry={() => void load()}
        />
      </div>
    )
  }

  return (
    <PortalLandingPagesWorkspace
      contract={activeContract}
      pages={pages}
      onRequestChange={async (landingPageId, message) => {
        await landingPageService.requestLandingPageChange({ landingPageId, message })
        toast.success('Solicitação de ajuste enviada')
        void load()
      }}
      onApprove={async landingPageId => {
        await landingPageService.approveLandingPage({ landingPageId, status: 'approved', comment: 'Aprovado pelo portal.' })
        toast.success('Publicação aprovada')
        void load()
      }}
      onCreateLeadForm={async landingPageId => {
        try {
          const form = await landingPageService.createPublicLeadForm({ landingPageId })
          mergeForm(form)
          toast.success('Captura de leads ativada')
          return form
        } catch (error) {
          console.error('Erro ao ativar a captura de leads:', error)
          toast.error('Não foi possível ativar a captura de leads')
          throw error
        }
      }}
      onToggleLeadForm={async (formId, isActive) => {
        try {
          const form = await landingPageService.updatePublicLeadForm(formId, { isActive })
          const currentPage = pages.find(page => page.forms?.some(existing => existing.id === formId))
          const currentForm = currentPage?.forms?.find(existing => existing.id === formId)
          mergeForm({
            ...currentForm,
            ...form,
            publicEndpoint: form.publicEndpoint || currentForm?.publicEndpoint,
            publicToken: form.publicToken || currentForm?.publicToken,
          })
          toast.success(isActive ? 'Captura ativada' : 'Captura pausada')
          return form
        } catch (error) {
          console.error('Erro ao alterar a captura de leads:', error)
          toast.error('Não foi possível alterar a captura de leads')
          throw error
        }
      }}
    />
  )
}
