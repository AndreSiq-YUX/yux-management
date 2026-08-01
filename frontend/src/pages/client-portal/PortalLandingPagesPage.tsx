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

  const mergeForm = useCallback((form: any) => {
    setPages(current => current.map(page => {
      if (page.id !== form.landingPageId) return page
      const nextForms = (page.forms || []).filter(existing => existing.id !== form.id)
      return { ...page, forms: [...nextForms, form] }
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
      onCreateLeadForm={async landingPageId => {
        const form = await landingPageService.createPublicLeadForm({ landingPageId })
        mergeForm(form)
        toast.success('Endpoint de captura gerado')
        return form
      }}
      onRotateLeadFormToken={async formId => {
        const form = await landingPageService.rotatePublicLeadFormToken(formId)
        mergeForm(form)
        toast.success('Novo endpoint gerado')
        return form
      }}
      onToggleLeadForm={async (formId, isActive) => {
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
      }}
      onUpdateLeadFormOrigins={async (formId, allowedOrigins) => {
        const form = await landingPageService.updatePublicLeadForm(formId, { allowedOrigins })
        const currentPage = pages.find(page => page.forms?.some(existing => existing.id === formId))
        const currentForm = currentPage?.forms?.find(existing => existing.id === formId)
        mergeForm({ ...currentForm, ...form, publicEndpoint: currentForm?.publicEndpoint, publicToken: currentForm?.publicToken })
        return form
      }}
      onUpdateLeadFormFields={async (formId, fields) => {
        const form = await landingPageService.replacePublicLeadFormFields(formId, fields)
        const currentPage = pages.find(page => page.forms?.some(existing => existing.id === formId))
        const currentForm = currentPage?.forms?.find(existing => existing.id === formId)
        mergeForm({
          ...currentForm,
          ...form,
          publicEndpoint: currentForm?.publicEndpoint,
          publicToken: currentForm?.publicToken,
        })
        return form
      }}
    />
  )
}
