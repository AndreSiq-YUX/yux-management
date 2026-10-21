export interface WhatsAppDispatchPolicyInput {
  connectionActive: boolean
  connectionMatchesConversation: boolean
  connectionMatchesMessage: boolean
  tenantMatches: boolean
  inCustomerWindow: boolean
  consentGranted: boolean
  optedOut: boolean
  permissionRevoked: boolean
  contentType: string
  templateName?: string | null
  templateApproved?: boolean
  purpose: 'service' | 'marketing' | 'transactional'
}

export function evaluateWhatsAppDispatchPolicy(input: WhatsAppDispatchPolicyInput): string | null {
  if (!input.connectionActive) return 'whatsapp_connection_unavailable'
  if (!input.connectionMatchesConversation || !input.connectionMatchesMessage || !input.tenantMatches) {
    return 'whatsapp_connection_binding_mismatch'
  }
  if (input.optedOut || input.permissionRevoked) return 'recipient_opted_out'

  const isTemplate = input.contentType === 'template'
  if (input.purpose !== 'service' && !input.consentGranted) return 'whatsapp_consent_required'
  if (!input.inCustomerWindow) {
    if (!isTemplate) return 'whatsapp_template_required_outside_window'
    if (!input.consentGranted) return 'whatsapp_consent_required'
  }
  if (isTemplate) {
    if (!input.templateName?.trim()) return 'whatsapp_template_name_required'
    if (input.templateApproved !== true) return 'whatsapp_template_approval_unverified'
  }
  return null
}
