import type pg from 'pg'
import { createHash } from 'node:crypto'
import type { AppEnv } from '../../config/env.js'
import { readJinaUrl } from '../../modules/radar/jinaClient.js'
import { readKnowledgeFile } from '../../modules/company-intelligence/file-storage.js'
import {
  attachCuratedKnowledgeEmbeddings,
  completeKnowledgeIngestion,
  createKnowledgeShell,
  createKnowledgeIntelligenceRun,
  findKnowledgeDocumentByChecksum,
  getKnowledgeDocument,
  getKnowledgeProcessing,
  markKnowledgeIngestionFailed,
  markKnowledgeProcessingState,
  replaceCompanyIntelligenceSuggestions,
  replaceCuratedKnowledgeChunks,
  updateKnowledgeIntelligenceRun,
} from '../../modules/company-intelligence/repository.js'
import { cleanKnowledgeSections } from '../../modules/company-intelligence/knowledge-cleanup.js'
import { curateKnowledgeWithRuntime, type CuratedKnowledge } from '../../modules/company-intelligence/runtime-curation.js'
import { embedPassages } from '../../modules/company-intelligence/jina-embeddings.js'
import { extractCompanyProfileInBatches } from '../../modules/company-intelligence/runtime-curation.js'
import { discoverCompanyWebsite } from '../../modules/company-intelligence/website-discovery.js'
import { inspectWebsiteVisualIdentity } from '../../modules/company-intelligence/website-visual-identity.js'
import { extractKnowledgeText, extractManualKnowledge, type ExtractedKnowledge, type LocatedSection } from '../../modules/company-intelligence/text-extraction.js'

type PipelineDependencies = {
  curate?: typeof curateKnowledgeWithRuntime
  embed?: typeof embedPassages
}

export async function handleKnowledgeIndexing(pool: pg.Pool, env: AppEnv, data: Record<string, unknown>, dependencies: PipelineDependencies = {}) {
  const sourceId = typeof data.sourceId === 'string' ? data.sourceId : ''
  const documentId = typeof data.documentId === 'string' ? data.documentId : ''
  if (!sourceId || !documentId) throw new Error('knowledge_index_context_required')
  const document = await getKnowledgeDocument(pool, documentId)
  if (document.sourceId !== sourceId) throw new Error('knowledge_source_document_mismatch')
  if (document.status === 'published') return { duplicate: true, documentId }
  const previous = await getKnowledgeProcessing(pool, documentId)
  if (previous.run?.runKind === 'document_curation' && ['running', 'ready_for_review'].includes(previous.run.status)) return { duplicate: true, documentId }

  const run = await createKnowledgeIntelligenceRun(pool, documentId)

  try {
    const extracted = await extractDocument(document)
    await completeKnowledgeIngestion(pool, { sourceId, documentId, extracted })
    await markKnowledgeProcessingState(pool, documentId, 'indexing')
    await updateKnowledgeIntelligenceRun(pool, run.id, { stage: 'cleaning', progress: 30 })
    const cleaned = cleanKnowledgeSections(extracted.sections)
    await updateKnowledgeIntelligenceRun(pool, run.id, { stage: 'curating', progress: 45, metrics: cleaned.metrics })

    try {
      if (env.KNOWLEDGE_CURATION_ENABLED === false) throw new Error('knowledge_curation_disabled')
      const curate = dependencies.curate || curateKnowledgeWithRuntime
      const results: CuratedKnowledge[] = []
      for (const sections of batchLocatedSections(cleaned.cleanSections, env.KNOWLEDGE_CURATION_MAX_BATCH_CHARS || 12_000)) {
        results.push(await curate(env, {
          organizationId: document.organizationId,
          clientId: document.clientId,
          contractId: document.contractId,
          sections,
        }))
      }
      const facts = deduplicateCuratedFacts(results)
      const summary = results.map(result => result.summary.trim()).filter(Boolean).join('\n\n').slice(0, 8_000)
      const chunks = await replaceCuratedKnowledgeChunks(pool, documentId, [
        ...(summary ? [{ title: `Resumo de ${document.title}`, body: summary, chunkKind: 'curated_summary' as const, qualityScore: 0.8, metadata: { generated: true } }] : []),
        ...facts.map(fact => ({
          title: fact.category,
          body: fact.statement,
          chunkKind: 'curated_fact' as const,
          sourceLocator: fact.source_locator,
          evidenceExcerpt: fact.evidence_excerpt,
          qualityScore: Math.min(fact.confidence, fact.usefulness),
          metadata: { category: fact.category, confidence: fact.confidence, usefulness: fact.usefulness, agentProfiles: fact.agent_profiles, sensitivity: fact.sensitivity },
        })),
      ])
      await updateKnowledgeIntelligenceRun(pool, run.id, {
        stage: 'embedding', progress: 75,
        provider: results[0]?.provider, model: results[0]?.model,
        metrics: { curatedFacts: facts.length, discarded: results.reduce((total, result) => total + result.discarded.length, 0) },
        outputPayload: { warnings: results.flatMap(result => result.warnings) },
      })

      try {
        const embed = dependencies.embed || embedPassages
        const embedded = await embed(env, chunks.map(chunk => chunk.body))
        await attachCuratedKnowledgeEmbeddings(pool, {
          chunks: chunks.map((chunk, index) => ({ id: chunk.id, vector: embedded.vectors[index] })),
          model: embedded.model,
          dimensions: embedded.dimensions,
        })
        await updateKnowledgeIntelligenceRun(pool, run.id, {
          status: 'ready_for_review', stage: 'ready_for_review', progress: 100, completed: true,
          metrics: { embeddedChunks: chunks.length, embeddingTokens: embedded.tokens },
        })
        await markKnowledgeProcessingState(pool, documentId, 'indexed')
        logKnowledgeRun('ready_for_review', { runId: run.id, documentId, sourceId, rawCharacters: extracted.body.length, retainedCharacters: cleaned.metrics.retainedCharacters, curatedFacts: facts.length, embeddedChunks: chunks.length, provider: results[0]?.provider, model: results[0]?.model })
        return { documentId, runId: run.id, chunkCount: chunks.length, degraded: false }
      } catch (error) {
        await updateKnowledgeIntelligenceRun(pool, run.id, {
          status: 'degraded', stage: 'ready_for_review', progress: 100, completed: true,
          errorMessage: messageOf(error), metrics: { embeddedChunks: 0 },
        })
        await markKnowledgeProcessingState(pool, documentId, 'indexed')
        logKnowledgeRun('degraded', { runId: run.id, documentId, sourceId, curatedFacts: facts.length, embeddedChunks: 0, error: messageOf(error) })
        return { documentId, runId: run.id, chunkCount: chunks.length, degraded: true }
      }
    } catch (error) {
      await updateKnowledgeIntelligenceRun(pool, run.id, {
        status: 'degraded', stage: 'ready_for_review', progress: 100, completed: true,
        errorMessage: messageOf(error), metrics: { curatedFacts: 0 },
      })
      await markKnowledgeProcessingState(pool, documentId, 'indexed')
      logKnowledgeRun('degraded', { runId: run.id, documentId, sourceId, curatedFacts: 0, error: messageOf(error) })
      return { documentId, runId: run.id, chunkCount: 0, degraded: true }
    }
  } catch (error) {
    await markKnowledgeIngestionFailed(pool, sourceId, documentId, error)
    await updateKnowledgeIntelligenceRun(pool, run.id, { status: 'failed', stage: 'failed', progress: 100, errorMessage: messageOf(error), completed: true })
    logKnowledgeRun('failed', { runId: run.id, documentId, sourceId, error: messageOf(error) })
    throw error
  }
}

async function extractDocument(document: Awaited<ReturnType<typeof getKnowledgeDocument>>): Promise<ExtractedKnowledge> {
  if (document.sourceType === 'url') return extractUrl(document.sourceUrl, document.title)
  if (document.sourceType === 'manual') return extractManualKnowledge(document.title, document.bodyPreview || '')
  return extractFile(document.storagePath, document.mimeType, document.title)
}

async function extractUrl(sourceUrl: string | undefined, title: string) {
  if (!sourceUrl) throw new Error('knowledge_source_url_required')
  const result = await readJinaUrl(sourceUrl)
  return extractManualKnowledge(result.title || title, result.content)
}

async function extractFile(storagePath: string | undefined, mimeType: string | undefined, title: string) {
  if (!storagePath || !mimeType) throw new Error('knowledge_file_context_required')
  return extractKnowledgeText({ content: await readKnowledgeFile(storagePath), mimeType, title })
}

export function batchLocatedSections(sections: LocatedSection[], maxCharacters = 18_000) {
  const batches: LocatedSection[][] = []
  let current: LocatedSection[] = []
  let size = 0
  for (const section of sections) {
    if (current.length && size + section.body.length > maxCharacters) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(section)
    size += section.body.length
  }
  if (current.length) batches.push(current)
  return batches
}

function deduplicateCuratedFacts(results: CuratedKnowledge[]) {
  const seen = new Set<string>()
  return results.flatMap(result => result.facts).filter(fact => {
    const key = fact.statement.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function messageOf(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
}

export async function handleWebsiteOnboarding(pool: pg.Pool, env: AppEnv, data: Record<string, unknown>) {
  const runId = typeof data.runId === 'string' ? data.runId : ''
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId : ''
  const websiteUrl = typeof data.websiteUrl === 'string' ? data.websiteUrl : ''
  const maxPages = Math.max(1, Math.min(50, Number(data.maxPages || 30)))
  if (!runId || !organizationId || !websiteUrl) throw new Error('website_onboarding_context_required')
  try {
    await updateKnowledgeIntelligenceRun(pool, runId, { status: 'running', stage: 'discovering', progress: 10 })
    const discovery = await discoverCompanyWebsite(websiteUrl, { maxPages: Math.min(maxPages, env.KNOWLEDGE_WEBSITE_MAX_PAGES || 30) })
    await updateKnowledgeIntelligenceRun(pool, runId, {
      stage: 'extracting', progress: 45,
      metrics: { discoveredPages: discovery.pages.length, failedPages: discovery.failedPages },
      outputPayload: { rootUrl: discovery.rootUrl, pageUrls: discovery.pages.map(page => page.url) },
    })
    const visualSignals = await inspectWebsiteVisualIdentity(websiteUrl).catch(() => null)
    const contractId = typeof data.contractId === 'string' ? data.contractId : undefined
    const clientId = typeof data.clientId === 'string' ? data.clientId : undefined
    const extraction = await extractCompanyProfileInBatches(env, {
      organizationId, clientId, contractId,
      pages: discovery.pages.map((page, index) => ({
        url: page.url,
        title: page.title,
        content: index === 0 && visualSignals?.evidenceText
          ? `${page.content}\n\n## Identidade visual detectada automaticamente\n${visualSignals.evidenceText}`
          : page.content,
      })),
    })
    await replaceCompanyIntelligenceSuggestions(pool, runId, extraction.suggestions.map(item => ({
      suggestionKind: item.suggestion_kind,
      fieldPath: item.field_path,
      suggestedValue: item.suggested_value,
      evidenceExcerpt: item.evidence_excerpt,
      sourceUrl: item.source_url,
      confidence: item.confidence,
    })))

    const combined = discovery.pages.map(page => `# ${page.title}\nFonte: ${page.url}\n\n${page.content}`).join('\n\n---\n\n')
    const checksumSha256 = createHash('sha256').update(combined).digest('hex')
    const existingKnowledge = await findKnowledgeDocumentByChecksum(pool, organizationId, checksumSha256)
    const shell = existingKnowledge
      ? { sourceId: existingKnowledge.sourceId, documentId: existingKnowledge.id }
      : await createKnowledgeShell(pool, {
          organizationId, contractId, title: 'Site institucional', sourceType: 'manual',
          sourceUrl: discovery.rootUrl, documentType: 'other', visibility: 'both',
          checksumSha256,
          metadata: { websiteOnboardingRunId: runId, discoveredUrls: discovery.pages.map(page => page.url) },
        })
    if (!existingKnowledge) {
      await completeKnowledgeIngestion(pool, {
        sourceId: shell.sourceId,
        documentId: shell.documentId,
        extracted: extractManualKnowledge('Site institucional', combined),
      })
    }
    await updateKnowledgeIntelligenceRun(pool, runId, {
      status: 'ready_for_review', stage: 'ready_for_review', progress: 100,
      provider: extraction.provider, model: extraction.model, completed: true,
      sourceId: shell.sourceId, documentId: shell.documentId,
      metrics: {
        suggestions: extraction.suggestions.length,
        extractionBatches: extraction.successfulBatches,
        extractionFailedPages: extraction.failedPageUrls.length,
      },
      outputPayload: {
        warnings: extraction.warnings,
        ...(extraction.failedPageUrls.length ? { extractionFailedPageUrls: extraction.failedPageUrls } : {}),
        ...(visualSignals ? { visualSignals } : {}),
        ...(existingKnowledge ? { knowledgeReused: true } : {}),
      },
    })
    try {
      await handleKnowledgeIndexing(pool, env, { sourceId: shell.sourceId, documentId: shell.documentId })
    } catch (error) {
      await updateKnowledgeIntelligenceRun(pool, runId, {
        outputPayload: { knowledgeWarning: messageOf(error) },
        metrics: { knowledgeDocumentDegraded: true },
      })
    }
    logKnowledgeRun('website_ready_for_review', { runId, documentId: shell.documentId, sourceId: shell.sourceId, discoveredPages: discovery.pages.length, failedPages: discovery.failedPages, suggestions: extraction.suggestions.length, provider: extraction.provider, model: extraction.model })
    return { runId, documentId: shell.documentId, suggestions: extraction.suggestions.length }
  } catch (error) {
    await updateKnowledgeIntelligenceRun(pool, runId, { status: 'failed', stage: 'failed', progress: 100, errorMessage: messageOf(error), completed: true })
    logKnowledgeRun('website_failed', { runId, error: messageOf(error) })
    throw error
  }
}

function logKnowledgeRun(event: string, fields: Record<string, unknown>) {
  console.info('[company-intelligence]', JSON.stringify({ event, ...fields }))
}
