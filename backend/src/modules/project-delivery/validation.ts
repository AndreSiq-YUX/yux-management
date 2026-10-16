import { z } from 'zod'

const optionalText = z.string().trim().max(10000).nullable().optional()
const optionalDate = z.string().date().or(z.literal('')).nullable().optional()
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, 'invalid_delivery_url')
  .nullable()
  .optional()

export const deliverableSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: optionalText,
  phaseId: z.string().uuid().or(z.literal('')).nullable().optional(),
  dueDate: optionalDate,
  externalUrl: optionalUrl,
  isClientVisible: z.boolean(),
})

export const deliverablePatchSchema = deliverableSchema.partial().extend({
  status: z
    .enum([
      'draft',
      'delivered',
      'in_review',
      'approved',
      'changes_requested',
      'rejected',
    ])
    .optional(),
})

export const deliveryApprovalSchema = z.object({
  targetType: z.enum(['deliverable', 'document', 'creative']),
  targetId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  instructions: optionalText,
  isClientVisible: z.boolean().optional(),
})

export const decisionSchema = z
  .object({
    decision: z.enum(['approved', 'changes_requested', 'rejected']),
    comment: z.string().trim().max(10000).optional(),
  })
  .refine((value) => value.decision === 'approved' || Boolean(value.comment), {
    message: 'approval_comment_required',
  })

// Only explicitly supplied fields are changed. Empty values clear optional fields.
export function deliverablePatch(
  input: z.infer<typeof deliverablePatchSchema>
) {
  const result: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  const fields = {
    title: 'title',
    description: 'description',
    phaseId: 'phase_id',
    dueDate: 'due_date',
    externalUrl: 'external_url',
    status: 'status',
    isClientVisible: 'is_client_visible',
  } as const
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    if (input[key] !== undefined)
      result[fields[key]] = input[key] === '' ? null : input[key]
  }
  if (input.status === 'delivered')
    result.delivered_at = new Date().toISOString()
  return result
}
