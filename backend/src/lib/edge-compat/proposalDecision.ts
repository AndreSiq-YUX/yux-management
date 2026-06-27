export function validatePublicDecision(decision: string, comment?: string) {
  if (!['approved', 'rejected', 'adjustments_requested'].includes(decision)) return 'Decisao invalida.'
  if (decision === 'adjustments_requested' && !comment?.trim()) return 'Descreva os ajustes solicitados.'
}
