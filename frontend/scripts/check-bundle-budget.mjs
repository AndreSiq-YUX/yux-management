import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const distRoot = resolve(projectRoot, 'dist')
const manifest = JSON.parse(readFileSync(resolve(distRoot, '.vite', 'manifest.json'), 'utf8'))
const config = JSON.parse(readFileSync(resolve(projectRoot, 'bundle-budget.json'), 'utf8'))
const manifestEntries = Object.entries(manifest)
const mainEntry = manifestEntries.find(([key, chunk]) => chunk.isEntry && (chunk.src === 'src/main.tsx' || key === 'index.html'))

if (!mainEntry) {
  throw new Error('O manifest do build nao contem a entrada src/main.tsx.')
}

function collectStaticChunks(entryKey, collected = new Set()) {
  if (collected.has(entryKey)) return collected
  const chunk = manifest[entryKey]
  if (!chunk) throw new Error(`Chunk ausente no manifest: ${entryKey}`)
  collected.add(entryKey)
  for (const dependency of chunk.imports ?? []) collectStaticChunks(dependency, collected)
  return collected
}

function measure(entryKeys) {
  const chunks = new Set()
  for (const entryKey of entryKeys) collectStaticChunks(entryKey, chunks)
  const files = [...chunks]
    .map(key => manifest[key].file)
    .filter(file => file.endsWith('.js'))
    .sort()
  let bytes = 0
  let gzipBytes = 0
  for (const file of files) {
    const content = readFileSync(resolve(distRoot, file))
    bytes += content.byteLength
    gzipBytes += gzipSync(content).byteLength
  }
  return { bytes, gzipBytes, files }
}

const [mainKey] = mainEntry
const initial = measure([mainKey])
const journeys = {}

for (const [name, source] of Object.entries(config.journeys)) {
  const routeEntry = manifestEntries.find(([key, chunk]) => key === source || chunk.src === source)
  if (!routeEntry) throw new Error(`Rota monitorada ausente no manifest: ${source}`)
  const total = measure([mainKey, routeEntry[0]])
  journeys[name] = {
    ...total,
    incrementalBytes: total.bytes - initial.bytes,
    incrementalGzipBytes: total.gzipBytes - initial.gzipBytes,
  }
}

const reductionPercent = Number((100 * (1 - initial.gzipBytes / config.baseline.preSplitInitialJsGzipBytes)).toFixed(2))
const report = {
  schemaVersion: 1,
  baseline: config.baseline,
  current: { initial, journeys },
  result: {
    reductionPercent,
    maximumInitialJsGzipBytes: config.budget.maximumInitialJsGzipBytes,
    passed: initial.gzipBytes <= config.budget.maximumInitialJsGzipBytes
      && reductionPercent >= config.budget.minimumReductionPercent,
  },
}

writeFileSync(resolve(distRoot, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

if (!report.result.passed) {
  throw new Error(`Orcamento excedido: ${initial.gzipBytes} bytes gzip iniciais; limite ${config.budget.maximumInitialJsGzipBytes}.`)
}
