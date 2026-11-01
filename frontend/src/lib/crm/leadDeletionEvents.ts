import type { CrmLead } from '@/types/crm'

export const requestLeadDeletion = (leads: CrmLead[]) =>
  window.dispatchEvent(new CustomEvent('crm-lead-delete', { detail: leads }))
