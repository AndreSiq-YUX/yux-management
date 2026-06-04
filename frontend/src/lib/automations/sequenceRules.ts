import type { SequenceEnrollmentEligibilityInput } from '@/types/automationSequence'

export function canEnrollInSequence(input: SequenceEnrollmentEligibilityInput) {
  if ((input.channel === 'email' || input.channel === 'mixed') && !input.email?.trim()) {
    return { ok: false, reason: 'email_required' }
  }
  if ((input.channel === 'email' || input.channel === 'mixed') && !input.emailOptIn) {
    return { ok: false, reason: 'email_opt_in_required' }
  }
  if ((input.channel === 'whatsapp' || input.channel === 'mixed') && !input.whatsappPhone?.trim()) {
    return { ok: false, reason: 'whatsapp_required' }
  }
  if ((input.channel === 'whatsapp' || input.channel === 'mixed') && !input.whatsappOptIn) {
    return { ok: false, reason: 'whatsapp_opt_in_required' }
  }
  return { ok: true }
}

export function calculateSequenceConversionRate(input: { enrolled: number; converted: number }) {
  if (input.enrolled <= 0) return 0
  return Math.round((input.converted / input.enrolled) * 1000) / 10
}
