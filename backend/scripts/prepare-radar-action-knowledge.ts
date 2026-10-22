import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { prepareRadarKnowledgePublication } from '../src/modules/radar/knowledge-publication.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = await readFile(path.join(repo, 'docs/knowledge/radar-commercial-action-engine.md'), 'utf8')
const prepared = prepareRadarKnowledgePublication(source)
const destination = path.join(repo, 'docs/knowledge/publication/radar-commercial.review.json')
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, JSON.stringify(prepared, null, 2) + '\n')
console.log(JSON.stringify({ status: prepared.status, destination, sourceHash: prepared.source.sha256, items: prepared.items.length }))
