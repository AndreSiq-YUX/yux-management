import { apiRequest } from '@/lib/apiClient'

export type CommercialSender = {
  revision: string
  mode: 'professional' | 'managed'
  fromEmail: string | null
  fromName: string
  replyTo: string | null
  approvedAt: string | null
}

type SenderInput = { mode: 'professional'; fromEmail: string; fromName: string; replyTo: string }
  | { mode: 'managed'; fromName: string; replyTo?: string }
type ReviewInput = { approved: false; revision: string }
  | { approved: true; revision: string; verified: true; managedAddress?: string; managedReplyTo?: string }
type SenderResponse = { canManage: boolean; sender: CommercialSender | null }
type RequestIdentity = { requestKey: string; revision: string }
type QueuedMessage = { id: string; status: string }
export type ContactBasis = 'published_business_contact' | 'explicit_opt_in'
export type ContactPolicy = {
  emailBasis: ContactBasis
  whatsappBasis: ContactBasis
  revision: string | null
  updatedAt: string | null
}
type ContactPolicyResponse = { canManage: boolean; policy: ContactPolicy }

const path = (organizationId: string) => `/commercial-email/organizations/${organizationId}`

export const commercialEmailService = {
  sender: (organizationId: string) => apiRequest<SenderResponse>(`${path(organizationId)}/sender`),
  save: (organizationId: string, body: SenderInput) =>
    apiRequest<SenderResponse>(`${path(organizationId)}/sender`, { method: 'PUT', body }),
  review: (organizationId: string, body: ReviewInput) =>
    apiRequest<SenderResponse>(`${path(organizationId)}/sender/review`, { method: 'POST', body }),
  test: (organizationId: string, body: RequestIdentity) =>
    apiRequest<QueuedMessage>(`${path(organizationId)}/sender/test`, { method: 'POST', body }),
  contactPolicy: (organizationId: string) =>
    apiRequest<ContactPolicyResponse>(`${path(organizationId)}/contact-policy`),
  saveContactPolicy: (organizationId: string, body: Omit<ContactPolicy, 'updatedAt'>) =>
    apiRequest<ContactPolicyResponse>(`${path(organizationId)}/contact-policy`, {
      method: 'PUT',
      body: { emailBasis: body.emailBasis, whatsappBasis: body.whatsappBasis, revision: body.revision },
    }),
}

const errors: Record<string, string> = {
  commercial_sender_not_ready: 'O remetente comercial precisa estar ativo. Atualize a tela se ele acabou de ser alterado.',
  commercial_sender_changed: 'Os dados do remetente foram alterados. Atualize a tela antes de continuar.',
  commercial_sender_use_managed: 'Para usar um endereço da YUX, escolha a opção de remetente gerenciado.',
  commercial_sender_managed_address_required: 'Informe um endereço do domínio comercial.yux.com.br.',
  commercial_sender_reply_required: 'Informe a caixa comercial que receberá as respostas.',
  commercial_sender_address_in_use: 'Este remetente já está ativo em outra empresa.',
  commercial_recipient_changed: 'O endereço do lead mudou. Atualize a ficha antes de enviar.',
  commercial_email_invalid_input: 'Revise os endereços e os campos obrigatórios.',
  commercial_email_admin_required: 'Neste piloto, o envio e o histórico de e-mail estão disponíveis para administradores da empresa.',
  commercial_email_request_conflict: 'Este pedido já foi usado para outra mensagem. Confira o histórico e revise o rascunho.',
  recipient_suppressed: 'Este contato está bloqueado para recebimento de e-mail.',
  daily_quota_exhausted: 'A empresa atingiu o limite diário de envio.',
  recipient_email_required: 'O lead precisa de um endereço de e-mail válido.',
  lead_not_found: 'Lead indisponível ou sem permissão de acesso.',
  contact_policy_changed: 'A política de contato foi alterada por outra pessoa. Atualize a tela e revise.',
}

export function commercialEmailError(error: unknown, fallback: string) {
  return (error instanceof Error && errors[error.message]) || fallback
}
