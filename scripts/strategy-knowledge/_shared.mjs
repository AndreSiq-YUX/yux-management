import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      index += 1
    }
  }
  return args
}

export function requireArg(args, key) {
  if (!args[key] || typeof args[key] !== 'string') {
    throw new Error(`Missing required --${key}`)
  }
  return args[key]
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function estimateTokens(text) {
  const normalized = normalizeText(text)
  if (!normalized) return 0
  return Math.ceil(normalized.length / 4)
}

export async function ensureParentDir(path) {
  await mkdir(dirname(path), { recursive: true })
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function writeJson(path, value) {
  await ensureParentDir(path)
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function readJsonl(path) {
  const body = await readFile(path, 'utf8')
  return body
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${error.message}`)
      }
    })
}

export async function writeJsonl(path, rows) {
  await ensureParentDir(path)
  await writeFile(path, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
}

export function splitTextByMaxChars(text, maxChars = 2800, overlapChars = 200) {
  const clean = normalizeText(text)
  if (!clean) return []

  const paragraphs = clean.split(/\n{2,}/)
  const chunks = []
  let current = ''

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) chunks.push(current)
    if (paragraph.length <= maxChars) {
      current = paragraph
      continue
    }
    for (let start = 0; start < paragraph.length; start += Math.max(1, maxChars - overlapChars)) {
      chunks.push(paragraph.slice(start, start + maxChars))
    }
    current = ''
  }

  if (current) chunks.push(current)
  return chunks.map(normalizeText).filter(Boolean)
}

export function detectSectionKey(text, fallback = 'section') {
  const firstMeaningfulLine = normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length >= 3)

  if (!firstMeaningfulLine) return fallback

  const normalized = firstMeaningfulLine
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return normalized || fallback
}

export function stableRecordId(...parts) {
  return sha256(parts.filter(Boolean).join('|')).slice(0, 32)
}
