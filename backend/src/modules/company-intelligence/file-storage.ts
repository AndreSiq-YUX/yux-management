import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'

export const KNOWLEDGE_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

export function knowledgeStorageRoot() {
  return path.resolve(process.env.KNOWLEDGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'company-knowledge'))
}

export function resolveKnowledgeStoragePath(relativePath: string) {
  const root = knowledgeStorageRoot()
  const resolved = path.resolve(root, relativePath)
  if (!resolved.startsWith(`${root}${path.sep}`)) throw domainError(400, 'invalid_knowledge_storage_path')
  return resolved
}

export async function validateKnowledgeFile(content: Buffer, declaredMimeType: string) {
  if (!KNOWLEDGE_MIME_TYPES.has(declaredMimeType)) throw domainError(400, 'unsupported_knowledge_file_type')
  if (declaredMimeType === 'text/plain' || declaredMimeType === 'text/markdown') {
    if (content.includes(0)) throw domainError(400, 'invalid_knowledge_text_file')
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(content)
    } catch {
      throw domainError(400, 'invalid_knowledge_text_encoding')
    }
    return declaredMimeType
  }
  const detected = await fileTypeFromBuffer(content)
  if (!detected || detected.mime !== declaredMimeType) throw domainError(400, 'knowledge_file_mime_mismatch')
  return detected.mime
}

export async function writeKnowledgeFile(input: {
  organizationId: string
  documentId: string
  fileName: string
  mimeType: string
  content: Buffer
}) {
  await validateKnowledgeFile(input.content, input.mimeType)
  const safeName = sanitizeFileName(input.fileName)
  const relativePath = path.join(input.organizationId, `${input.documentId}-${safeName}`)
  const absolutePath = resolveKnowledgeStoragePath(relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, input.content)
  return {
    relativePath,
    checksumSha256: createHash('sha256').update(input.content).digest('hex'),
    byteSize: input.content.byteLength,
  }
}

export function readKnowledgeFile(relativePath: string) {
  return readFile(resolveKnowledgeStoragePath(relativePath))
}

export async function deleteKnowledgeFile(relativePath?: string | null) {
  if (!relativePath) return
  await unlink(resolveKnowledgeStoragePath(relativePath)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'knowledge-file'
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
