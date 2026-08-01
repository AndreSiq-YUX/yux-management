import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLeadFormsWorkspace } from '@/components/landing-pages/ExternalLeadFormsWorkspace'
import { landingPageService } from '@/services/landingPageService'
import { usePlatformStore } from '@/stores/platformStore'
import type { LandingPageForm } from '@/types/landingPage'

export function PortalExternalLeadFormsPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [forms, setForms] = useState<LandingPageForm[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (isPlatformLoading) return
    if (!activeContract) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setForms(await landingPageService.getPublicLeadForms(activeContract.id))
    } catch (error) {
      console.error('Erro ao carregar formulários externos:', error)
      toast.error('Erro ao carregar formulários externos')
      setForms([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => { void load() }, [load])

  const mergeForm = (next: LandingPageForm) => {
    setForms(current => {
      const existing = current.find(form => form.id === next.id)
      return existing
        ? current.map(form => form.id === next.id ? { ...form, ...next } : form)
        : [next, ...current]
    })
  }

  if (isPlatformLoading || loading) return <p className="text-sm text-slate-600">Carregando formulários externos...</p>
  if (!activeContract) return <p className="text-sm text-slate-600">Nenhum contrato ativo encontrado para este usuário.</p>

  return (
    <ExternalLeadFormsWorkspace
      contractName={activeContract.name || activeContract.id}
      forms={forms}
      onCreate={async input => {
        const form = await landingPageService.createPublicLeadForm({ contractId: activeContract.id, ...input })
        mergeForm({ ...form, recentSubmissions: form.recentSubmissions || [] })
        toast.success('Formulário criado e endpoint gerado')
        return form
      }}
      onRotate={async formId => {
        const form = await landingPageService.rotatePublicLeadFormToken(formId)
        mergeForm({ ...forms.find(item => item.id === formId), ...form })
        toast.success('Novo endpoint gerado')
        return form
      }}
      onToggle={async (formId, isActive) => {
        const form = await landingPageService.updatePublicLeadForm(formId, { isActive })
        mergeForm({ ...forms.find(item => item.id === formId), ...form })
        toast.success(isActive ? 'Captura ativada' : 'Captura pausada')
        return form
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
