import { useCallback, useEffect, useState } from 'react'
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
      setError('Nao foi possivel carregar seus modelos de email.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  if (loading && templates.length === 0) {
    return <p className="text-sm text-gray-600">Carregando seus modelos de email...</p>
  }

  if (error && templates.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
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
