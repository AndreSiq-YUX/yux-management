import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import type { LocatedSection } from './text-extraction.js'

const curatedFactSchema = z.object({
  statement: z.string().min(1),
  category: z.string().min(1),
  evidence_excerpt: z.string().min(1),
  source_locator: z.string().min(1),
  confidence: z.number().min(0).max(1),
  usefulness: z.number().min(0).max(1),
  agent_profiles: z.array(z.string()).default([]),
  sensitivity: z.string().default('public'),
})

const curationSchema = z.object({
  summary: z.string(),
  facts: z.array(curatedFactSchema),
  discarded: z.array(z.unknown()).default([]),
  warnings: z.array(z.string()).default([]),
  provider: z.string(),
  model: z.string(),
})

export type CuratedKnowledge = z.infer<typeof curationSchema>

const websiteSuggestionSchema = z.object({
  suggestion_kind: z.enum(['profile', 'brand', 'product']),
  field_path: z.string().min(1),
  suggested_value: z.unknown(),
  evidence_excerpt: z.string().min(1),
  source_url: z.string().url(),
  confidence: z.number().min(0).max(1),
})

const websiteExtractionSchema = z.object({
  suggestions: z.array(websiteSuggestionSchema),
  warnings: z.array(z.string()).default([]),
  provider: z.string(),
  model: z.string(),
})

export type WebsiteIntelligenceExtraction = z.infer<typeof websiteExtractionSchema>

export async function curateKnowledgeWithRuntime(env: AppEnv, input: {
  organizationId: string
  clientId?: string
  contractId?: string
  sections: LocatedSection[]
}) {
  const result = await invokeAgentRuntime<unknown>(env, '/knowledge/curate', {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    sections: input.sections,
  })
  return curationSchema.parse(result)
}

export async function extractCompanyProfileWithRuntime(env: AppEnv, input: {
  organizationId: string
  clientId?: string
  contractId?: string
  pages: Array<{ url: string; title: string; content: string }>
}) {
  const result = await invokeAgentRuntime<unknown>(env, '/knowledge/extract-company-profile', {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    pages: input.pages,
  })
  return websiteExtractionSchema.parse(result)
}
