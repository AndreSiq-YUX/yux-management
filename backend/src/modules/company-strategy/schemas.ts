import { z } from 'zod'
import type { UserRole } from '../../http/request-context.js'

const ids = z.array(z.string().uuid()).max(100).refine(values => new Set(values).size === values.length, 'duplicate_references').default([])
export const strategySectionKinds = ['diagnosis', 'audiences', 'offers', 'markets', 'positioning', 'channels', 'initiatives', 'metrics', 'constraints', 'assumptions', 'next_steps', 'custom'] as const
export const companyStrategyContentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(3).max(200),
  objective: z.string().trim().min(10).max(2000),
  summary: z.string().trim().min(20).max(2000),
  sections: z.array(z.object({
    id: z.string().uuid(), kind: z.enum(strategySectionKinds), title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(12000), agentUse: z.enum(['internal', 'external_guidance']).default('internal'),
  }).strict()).max(30).default([]),
  references: z.object({ productIds: ids, documentIds: ids }).strict().default({ productIds: [], documentIds: [] }),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sections.map(section => section.id)).size !== value.sections.length) ctx.addIssue({ code: 'custom', message: 'duplicate_section_ids', path: ['sections'] })
  if (JSON.stringify(value).length > 100000) ctx.addIssue({ code: 'custom', message: 'strategy_content_too_large' })
})
export type CompanyStrategyContentV1 = z.infer<typeof companyStrategyContentSchema>
export type CompanyStrategyAccess = { organizationId: string; actorId: string; role: UserRole }
export type CompanyStrategyRevision = { id: string; strategyId: string; revisionNumber: number; content: CompanyStrategyContentV1; contentHash: string; origin: Record<string, unknown>; createdBy: string; createdAt: string }
export type CompanyStrategy = { id: string; organizationId: string; clientId: string | null; version: number; isPrimary: boolean; archivedAt: string | null; draftRevision: CompanyStrategyRevision | null; publishedRevision: CompanyStrategyRevision | null; createdAt: string; updatedAt: string }
export const idempotencyKeySchema = z.string().trim().min(1).max(200)
export const strategyDraftCommandSchema = z.object({ expectedVersion: z.number().int().positive().nullable(), content: companyStrategyContentSchema, idempotencyKey: idempotencyKeySchema }).strict()
export const strategyPublishCommandSchema = z.object({ expectedVersion: z.number().int().positive(), revisionId: z.string().uuid(), expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: idempotencyKeySchema }).strict()
export const strategyVersionCommandSchema = z.object({ expectedVersion: z.number().int().positive() }).strict()
export const companyStrategyProposalSchema = z.object({
  strategyId: z.string().uuid().nullish(), baseRevisionId: z.string().uuid().nullish(), baseStrategyVersion: z.number().int().positive().nullish(),
  content: companyStrategyContentSchema, sourceRefs: z.array(z.string().min(1).max(300)).max(100).default([]),
}).strict().superRefine((value, ctx) => {
  const base = [value.strategyId,value.baseRevisionId,value.baseStrategyVersion]
  if (base.some(item=>item!=null) && !base.every(item=>item!=null)) ctx.addIssue({code:'custom',message:'company_strategy_proposal_base_incomplete'})
})
export type CompanyStrategyProposalInput = z.infer<typeof companyStrategyProposalSchema>
export const applyStrategyProposalSchema = z.object({ expectedStrategyVersion: z.number().int().positive().nullable(), idempotencyKey: idempotencyKeySchema, reviewedContent: companyStrategyContentSchema.optional() }).strict()
