import { useCallback, useEffect, useState } from 'react'
import { ErrorState, PageHeader, SkeletonCard } from '@/components/portal-ui'
import { EmailTemplateWorkspace } from '@/components/email-templates/EmailTemplateWorkspace'
import { emailTemplateService } from '@/services/emailTemplateService'
import type { EmailTemplate, EmailTemplateSendRequest } from '@/types/emailTemplate'

export function PortalEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [sendRequests, setSendRequests] = useState<EmailTemplateSendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [templateResult, sendRequestResult] = await Promise.all([
        emailTemplateService.listPortalTemplates(),
        emailTemplateService.listPortalSendRequests(),
      ])
      setTemplates(templateResult)
      setSendRequests(sendRequestResult)
    } catch (cause) {
      console.error('Error loading portal email templates:', cause)
      setError('Não foi possível carregar os seus modelos de e-mail.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  if (loading && templates.length === 0) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <PageHeader title="Modelos de e-mail" lead="Carregando os seus modelos…" />
        <SkeletonCard lines={5} />
      </div>
    )
  }

  if (error && templates.length === 0) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Modelos de e-mail" />
        <ErrorState title={error} description="Verifique sua conexão e tente de novo." onRetry={() => void loadTemplates()} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {error && (
        <p className="m-0 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-4 py-3 text-sm text-yx-crit" role="alert">
          {error}
        </p>
      )}
      <EmailTemplateWorkspace
        mode="portal"
        templates={templates}
        sendRequests={sendRequests}
        onReload={loadTemplates}
      />
    </div>
  )
}
