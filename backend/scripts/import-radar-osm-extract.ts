import pg from 'pg'
import { importRadarOsmExtract, previewRadarOsmExtract } from '../src/modules/radar/osm-extract.js'

function options(args: string[]) {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith('--') || !args[index + 1]) throw new Error('Argumentos esperados: --chave valor')
    values.set(args[index].slice(2), args[index + 1])
  }
  const required = (name: string) => {
    const value = values.get(name)
    if (!value) throw new Error(`Parâmetro obrigatório ausente: --${name}`)
    return value
  }
  return {
    path: required('pbf'),
    boundaryPath: required('boundary'),
    localityPath: required('locality'),
    municipalityCode: required('municipality-code'),
    city: required('city'),
    state: required('state'),
    regionKey: required('region-key'),
    sourceUrl: required('source-url'),
    boundarySource: required('boundary-source'),
    extractedAt: values.get('extracted-at'),
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const input = options(process.argv.slice(2).filter(argument => argument !== '--dry-run'))
  if (dryRun) {
    const result = await previewRadarOsmExtract(input)
    process.stdout.write(JSON.stringify({ municipalityCode: result.boundary.municipalityCode,
      city: result.boundary.city, state: result.boundary.state, places: result.places.length,
      withWebsite: result.places.filter(place => place.website).length,
      withPhone: result.places.filter(place => place.phone).length,
      withEmail: result.places.filter(place => place.email).length,
      skippedRelations: result.skippedRelations, skippedWays: result.skippedWays,
      sampleNames: result.places.slice(0, 8).map(place => place.name),
      sha256: result.sourceSha256,
      extractedAt: result.extractedAt.toISOString() }) + '\n')
    return
  }
  const databaseUrl = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('MIGRATOR_DATABASE_URL ou DATABASE_URL é obrigatória')
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
  try {
    const result = await importRadarOsmExtract(pool, input)
    process.stdout.write(JSON.stringify(result) + '\n')
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
