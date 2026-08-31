import { z } from 'zod'

const uuid = z.string().uuid()

export const createMissionConversationSchema = z.object({
  organizationId: uuid,
  contractId: uuid.optional(),
  title: z.string().trim().min(3).max(200).optional(),
  message: z.string().trim().min(1).max(8_000),
  clientMessageId: z.string().trim().min(1).max(200),
})

export const missionConversationParamsSchema = z.object({ conversationId: uuid })
export const missionConversationQuerySchema = z.object({ organizationId: uuid })

export const appendMissionConversationMessageSchema = z.object({
  organizationId: uuid,
  expectedVersion: z.number().int().positive(),
  clientMessageId: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(8_000),
})

export const cancelMissionConversationSchema = z.object({
  organizationId: uuid,
  expectedVersion: z.number().int().positive(),
})
