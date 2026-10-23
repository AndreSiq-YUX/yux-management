import { z } from 'zod'

const calendarDate = z.union([z.string().date(), z.string().datetime({ offset: true })]).transform(value => value.slice(0, 10))
const optionalDate = calendarDate.or(z.literal('').transform(() => null)).nullable().optional()
const optionalId = z.string().uuid().or(z.literal('').transform(() => null)).nullable().optional()
const text = z.string().max(10000).nullable().optional()
const amount = z.number().min(0).max(999999999).nullable().optional()
const hours = z.number().min(0).max(999999.99).nullable().optional()

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: text,
  status: z.enum(['PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'PAUSED', 'CANCELLED', 'ARCHIVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  type: z.enum(['WEBSITE', 'ECOMMERCE', 'MOBILE_APP', 'MARKETING', 'BRANDING', 'CONSULTING', 'OTHER']).optional(),
  startDate: calendarDate,
  expectedEndDate: calendarDate,
  actualEndDate: optionalDate,
  budget: z.number().min(0).max(999999999).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  clientId: z.string().uuid(),
  managerId: optionalId,
  teamMembers: z.array(z.string().uuid()).max(100).optional(),
  tags: z.array(z.string().max(100)).max(100).optional(),
  notes: text,
  progress: z.number().int().min(0).max(100).optional(),
  notificationRules: z.partialRecord(z.enum(['deadline-7d', 'deadline-3d', 'deadline-1d', 'progress-stalled', 'milestone-completed', 'budget-80', 'team-overload']), z.boolean()).optional(),
})
export const projectPatchSchema = projectSchema.partial()

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: text,
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: optionalId,
  phaseId: optionalId,
  dueDate: optionalDate,
  estimatedHours: hours,
  actualHours: hours,
  isClientVisible: z.boolean().optional(),
})
export const taskPatchSchema = taskSchema.partial()

export const phaseSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: text,
  status: z.enum(['planning', 'in_progress', 'completed', 'on_hold']).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  budget: amount,
  orderIndex: z.number().int().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
})
export const phasePatchSchema = phaseSchema.partial()

export function validDateRange(start?: string | null, end?: string | null) {
  return !start || !end || end >= start
}

export function taskPayload(input: z.infer<typeof taskPatchSchema>) {
  return {
    title: input.title, description: input.description, status: input.status, priority: input.priority,
    assigned_to: input.assignedTo, phase_id: input.phaseId, due_date: input.dueDate,
    estimated_hours: input.estimatedHours, actual_hours: input.actualHours, is_client_visible: input.isClientVisible,
    updated_at: new Date().toISOString(),
  }
}

export function phasePayload(input: z.infer<typeof phasePatchSchema>) {
  return {
    name: input.name, description: input.description, status: input.status,
    start_date: input.startDate, end_date: input.endDate, budget: input.budget,
    order_index: input.orderIndex, progress: input.progress, updated_at: new Date().toISOString(),
  }
}
