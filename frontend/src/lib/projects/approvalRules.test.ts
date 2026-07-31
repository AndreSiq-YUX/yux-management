import { describe, expect, it } from 'vitest'
import { validateApprovalDecision } from './approvalRules'

describe('validateApprovalDecision', () => {
  it('accepts an approval without a comment', () => {
    expect(validateApprovalDecision('approved', '')).toBeNull()
  })

  it('requires a comment when requesting changes', () => {
    expect(validateApprovalDecision('changes_requested', '   ')).toBe(
      'Informe o ajuste necessario antes de enviar.'
    )
  })

  it('requires a comment when rejecting an item', () => {
    expect(validateApprovalDecision('rejected')).toBe(
      'Informe o motivo da rejeicao antes de enviar.'
    )
  })

  it('accepts a trimmed explanatory comment', () => {
    expect(validateApprovalDecision('rejected', '  Fora do escopo aprovado.  ')).toBeNull()
  })
})
