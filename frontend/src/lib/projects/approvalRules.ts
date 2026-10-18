import { ApprovalDecisionValue } from '@/types/project'

export function validateApprovalDecision(
  decision: ApprovalDecisionValue,
  comment?: string
): string | null {
  if (decision === 'approved' || comment?.trim()) {
    return null
  }

  return decision === 'changes_requested'
    ? 'Informe o ajuste necessário antes de enviar.'
    : 'Informe o motivo da rejeição antes de enviar.'
}
