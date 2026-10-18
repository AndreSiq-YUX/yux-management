import { useCallback, useEffect, useState } from 'react'
import { FileInput } from 'lucide-react'
import toast from 'react-hot-toast'
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/portal-ui'
import { ExternalLeadFormsWorkspace } from '@/components/landing-pages/ExternalLeadFormsWorkspace'
import { crmService } from '@/services/crmService'
import { landingPageService } from '@/services/landingPageService'
import { usePlatformStore } from '@/stores/platformStore'
import type { LandingPageForm } from '@/types/landingPage'
import type { CrmPipeline } from '@/types/crm'

export function PortalExternalLeadFormsPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const organization = usePlatformStore(state => state.organization)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [forms, setForms] = useState<LandingPageForm[]>([])
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // O endereço completo de envio só vem na criação e na renovação: a lista nunca o devolve.
  // Ao recarregar, mantemos o que já temos em memória para não perder o código pronto.
  const mergeLoadedForms = useCallback((loaded: LandingPageForm[]) => {
    setForms(current => loaded.map(form => {
      const previous = current.find(item => item.id === form.id)
      return {
        ...form,
        publicEndpoint: form.publicEndpoint || previous?.publicEndpoint,
        publicToken: form.publicToken || previous?.publicToken,
      }
    }))
  }, [])

  const load = useCallback(async () => {
    if (isPlatformLoading) return
    if (!activeContract) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(false)
    try {
      mergeLoadedForms(await landingPageService.getPublicLeadForms(activeContract.id))
      const organizationId = organization?.id || activeContract.clientId
      if (organizationId) {
        try {
          setPipelines(await crmService.getPipelines(organizationId))
        } catch (error) {
          console.error('Erro ao carregar funis para formulários externos:', error)
          setPipelines([])
        }
      }
    } catch (error) {
      console.error('Erro ao carregar formulários externos:', error)
      toast.error('Erro ao carregar formulários externos')
      setLoadError(true)
      setForms([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading, mergeLoadedForms, organization?.id])

  useEffect(() => { void load() }, [load])

  const refresh = useCallback(async () => {
    if (!activeContract) return
    try {
      mergeLoadedForms(await landingPageService.getPublicLeadForms(activeContract.id))
    } catch (error) {
      console.error('Erro ao atualizar formulários externos:', error)
      toast.error('Não foi possível atualizar os leads recebidos')
    }
  }, [activeContract, mergeLoadedForms])

  const mergeForm = (next: LandingPageForm) => {
    setForms(current => {
      const existing = current.find(form => form.id === next.id)
      return existing
        ? current.map(form => form.id === next.id ? { ...form, ...next } : form)
        : [next, ...current]
    })
  }

  if (isPlatformLoading || loading) return <SkeletonCard lines={5} />

  if (!activeContract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Formulários externos" />
        <EmptyState
          icon={FileInput}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Fale com a YUX para liberar os formulários externos."
        />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Formulários externos" />
        <ErrorState
          title="Não foi possível carregar os formulários."
          description="Confira a sua conexão e tente novamente."
          onRetry={() => void load()}
        />
      </div>
    )
  }

  return (
    <ExternalLeadFormsWorkspace
      contractName={activeContract.name || ''}
      forms={forms}
      pipelines={pipelines}
      onRefresh={refresh}
      onCreate={async input => {
        try {
          const form = await landingPageService.createPublicLeadForm({ contractId: activeContract.id, ...input })
          mergeForm({ ...form, recentSubmissions: form.recentSubmissions || [] })
          toast.success('Formulário criado. Agora instale o código no seu site.')
          return form
        } catch (error) {
          console.error('Erro ao criar formulário externo:', error)
          toast.error('Não foi possível criar o formulário')
          throw error
        }
      }}
      onRotate={async formId => {
        try {
          const form = await landingPageService.rotatePublicLeadFormToken(formId)
          mergeForm({ ...forms.find(item => item.id === formId), ...form })
          toast.success('Novo endereço de envio gerado. Atualize o código no seu site.')
          return form
        } catch (error) {
          console.error('Erro ao gerar novo endereço de envio:', error)
          toast.error('Não foi possível gerar um novo endereço')
          throw error
        }
      }}
      onToggle={async (formId, isActive) => {
        try {
          const form = await landingPageService.updatePublicLeadForm(formId, { isActive })
          mergeForm({ ...forms.find(item => item.id === formId), ...form })
          toast.success(isActive ? 'Captura ativada' : 'Captura pausada')
          return form
        } catch (error) {
          console.error('Erro ao alterar a captura de leads:', error)
          toast.error('Não foi possível alterar a captura de leads')
          throw error
        }
      }}
      onUpdateOrigins={async (formId, allowedOrigins) => {
        const form = await landingPageService.updatePublicLeadForm(formId, { allowedOrigins })
        mergeForm({ ...forms.find(item => item.id === formId), ...form })
        return form
      }}
      onUpdateFields={async (formId, fields) => {
        const form = await landingPageService.replacePublicLeadFormFields(formId, fields)
        mergeForm({ ...forms.find(item => item.id === formId), ...form })
        return form
      }}
    />
  )
}
