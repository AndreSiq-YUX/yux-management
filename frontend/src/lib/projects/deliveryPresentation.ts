import type { ApprovalRequestStatus, DeliverableStatus } from '@/types/project'

export const APPROVAL_LABELS: Record<ApprovalRequestStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
}
export const DELIVERABLE_LABELS: Record<DeliverableStatus, string> = {
  draft: 'Rascunho',
  delivered: 'Entregue',
  in_review: 'Em revisão',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Rejeitado',
}
export function formatDeliveryDate(value?: string) {
  if (!value) return 'Sem prazo definido'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : date.toLocaleDateString('pt-BR')
}
export function isDeliveryOverdue(
  dueDate: string | undefined,
  status: string,
  now = new Date()
) {
  if (
    !dueDate ||
    [
      'approved',
      'delivered',
      'completed',
      'cancelled',
      'COMPLETED',
      'CANCELLED',
      'ARCHIVED',
    ].includes(status)
  )
    return false
  return (
    new Date(`${dueDate.slice(0, 10)}T23:59:59.999`).getTime() < now.getTime()
  )
}
export function safeDeliveryUrl(value?: string) {
  if (!value) return undefined
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
      ? value
      : undefined
  } catch {
    return undefined
  }
}
