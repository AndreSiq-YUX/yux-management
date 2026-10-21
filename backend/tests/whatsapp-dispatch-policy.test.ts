import { describe, expect, it } from 'vitest'
import { evaluateWhatsAppDispatchPolicy } from '../src/modules/omnichannel/whatsapp-dispatch-policy.js'

const allowedServiceReply = {
  connectionActive: true,
  connectionMatchesConversation: true,
  connectionMatchesMessage: true,
  tenantMatches: true,
  inCustomerWindow: true,
  consentGranted: false,
  optedOut: false,
  permissionRevoked: false,
  contentType: 'text',
  purpose: 'service' as const,
}

describe('WhatsApp dispatch policy', () => {
  it('allows service replies in the 24-hour window without requiring marketing opt-in', () => {
    expect(evaluateWhatsAppDispatchPolicy(allowedServiceReply)).toBeNull()
  })

  it('blocks a queued outbound when its number was disconnected or bindings changed', () => {
    expect(evaluateWhatsAppDispatchPolicy({ ...allowedServiceReply, connectionActive: false })).toBe('whatsapp_connection_unavailable')
    expect(evaluateWhatsAppDispatchPolicy({ ...allowedServiceReply, connectionMatchesMessage: false })).toBe('whatsapp_connection_binding_mismatch')
    expect(evaluateWhatsAppDispatchPolicy({ ...allowedServiceReply, tenantMatches: false })).toBe('whatsapp_connection_binding_mismatch')
  })

  it('requires consent and an approved named template for proactive delivery outside the customer window', () => {
    const outsideWindow = { ...allowedServiceReply, inCustomerWindow: false, purpose: 'marketing' as const, contentType: 'template' }
    expect(evaluateWhatsAppDispatchPolicy(outsideWindow)).toBe('whatsapp_consent_required')
    expect(evaluateWhatsAppDispatchPolicy({ ...outsideWindow, consentGranted: true })).toBe('whatsapp_template_name_required')
    expect(evaluateWhatsAppDispatchPolicy({ ...outsideWindow, consentGranted: true, templateName: 'welcome' })).toBe('whatsapp_template_approval_unverified')
    expect(evaluateWhatsAppDispatchPolicy({ ...outsideWindow, consentGranted: true, templateName: 'welcome', templateApproved: true })).toBeNull()
  })

  it('blocks all purposes for opted-out or revoked recipients', () => {
    expect(evaluateWhatsAppDispatchPolicy({ ...allowedServiceReply, optedOut: true })).toBe('recipient_opted_out')
    expect(evaluateWhatsAppDispatchPolicy({ ...allowedServiceReply, permissionRevoked: true })).toBe('recipient_opted_out')
  })
})
