import type pg from 'pg'
import { readJinaUrl } from '../../modules/radar/jinaClient.js'
import { readKnowledgeFile } from '../../modules/company-intelligence/file-storage.js'
import {
  completeKnowledgeIngestion,
  getKnowledgeDocument,
  markKnowledgeIngestionFailed,
} from '../../modules/company-intelligence/repository.js'
import { extractKnowledgeText, extractManualKnowledge } from '../../modules/company-intelligence/text-extraction.js'

export async function handleKnowledgeIndexing(pool: pg.Pool, data: Record<string, unknown>) {
  const sourceId = typeof data.sourceId === 'string' ? data.sourceId : ''
  const documentId = typeof data.documentId === 'string' ? data.documentId : ''
  if (!sourceId || !documentId) throw new Error('knowledge_index_context_required')
  const document = await getKnowledgeDocument(pool, documentId)
  if (document.sourceId !== sourceId) throw new Error('knowledge_source_document_mismatch')
  if (document.status === 'indexed' || document.status === 'published') return { duplicate: true, documentId }

  try {
    const extracted = document.sourceType === 'url'
      ? await extractUrl(document.sourceUrl, document.title)
      : await extractFile(document.storagePath, document.mimeType, document.title)
    return await completeKnowledgeIngestion(pool, { sourceId, documentId, extracted })
  } catch (error) {
    await markKnowledgeIngestionFailed(pool, sourceId, documentId, error)
    throw error
  }
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
