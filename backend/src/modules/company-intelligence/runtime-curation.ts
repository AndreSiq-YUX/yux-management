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

export type WebsiteExtractionInput = {
  organizationId: string
  clientId?: string
  contractId?: string
  pages: Array<{ url: string; title: string; content: string }>
}

export type BatchedWebsiteIntelligenceExtraction = WebsiteIntelligenceExtraction & {
  successfulBatches: number
  failedPageUrls: string[]
}

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

export async function extractCompanyProfileWithRuntime(env: AppEnv, input: WebsiteExtractionInput) {
  const result = await invokeAgentRuntime<unknown>(env, '/knowledge/extract-company-profile', {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    pages: input.pages,
  })
  return websiteExtractionSchema.parse(result)
}

export async function extractCompanyProfileInBatches(
  env: AppEnv,
  input: WebsiteExtractionInput,
): Promise<BatchedWebsiteIntelligenceExtraction> {
  const batches = splitWebsitePages(input.pages)
  const successes: WebsiteIntelligenceExtraction[] = []
  const failures: Array<{ url: string; error: string }> = []

  const extract = async (pages: WebsiteExtractionInput['pages']): Promise<void> => {
    try {
      successes.push(await extractCompanyProfileWithRuntime(env, { ...input, pages }))
    } catch (error) {
      if (pages.length > 1) {
        const middle = Math.ceil(pages.length / 2)
        await extract(pages.slice(0, middle))
        await extract(pages.slice(middle))
        return
      }
      failures.push({ url: pages[0].url, error: runtimeErrorMessage(error) })
    }
  }

  for (const batch of batches) await extract(batch)
  if (!successes.length) throw new Error(failures[0]?.error || 'website_extraction_failed')

  return {
    suggestions: deduplicateWebsiteSuggestions(successes.flatMap(result => result.suggestions)),
    warnings: [
      ...new Set(successes.flatMap(result => result.warnings)),
      ...failures.map(failure => `website_page_extraction_failed:${failure.url}:${failure.error}`),
    ],
    provider: successes[0].provider,
    model: successes[0].model,
    successfulBatches: successes.length,
    failedPageUrls: failures.map(failure => failure.url),
  }
}

function splitWebsitePages(pages: WebsiteExtractionInput['pages']) {
  const batches: Array<WebsiteExtractionInput['pages']> = []
  let current: WebsiteExtractionInput['pages'] = []
  let currentChars = 0
  for (const page of pages) {
    const bounded = { ...page, content: boundWebsiteContent(page.content) }
    if (current.length && (current.length >= 3 || currentChars + bounded.content.length > 60_000)) {
      batches.push(current)
      current = []
      currentChars = 0
    }
    current.push(bounded)
    currentChars += bounded.content.length
  }
  if (current.length) batches.push(current)
  return batches
}

function boundWebsiteContent(content: string) {
  if (content.length <= 20_000) return content
  return `${content.slice(0, 16_000)}\n\n[conteúdo intermediário omitido]\n\n${content.slice(-4_000)}`
}

function deduplicateWebsiteSuggestions(suggestions: WebsiteIntelligenceExtraction['suggestions']) {
  const selected = new Map<string, WebsiteIntelligenceExtraction['suggestions'][number]>()
  for (const suggestion of suggestions) {
    const key = suggestion.suggestion_kind === 'product'
      ? `${suggestion.suggestion_kind}|${suggestion.field_path}|${suggestion.source_url}|${JSON.stringify(suggestion.suggested_value)}`
      : `${suggestion.suggestion_kind}|${suggestion.field_path}`
    const existing = selected.get(key)
    if (!existing || suggestion.confidence > existing.confidence) selected.set(key, suggestion)
  }
  return [...selected.values()]
}

function runtimeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, '_').slice(0, 300)
}
