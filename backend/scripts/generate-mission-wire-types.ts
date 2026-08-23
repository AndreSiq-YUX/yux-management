import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFromFile } from 'json-schema-to-typescript'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = resolve(backendRoot, '../contracts/mission-supervisor/v1/mission-wire.schema.json')
const outputPath = resolve(backendRoot, 'src/modules/action-engine/generated/mission-wire.ts')

const source = await compileFromFile(schemaPath, {
  bannerComment: '/* Generated from contracts/mission-supervisor/v1/mission-wire.schema.json. Do not edit manually. */',
  enableConstEnums: false,
  format: true,
  style: { singleQuote: true, semi: false, tabWidth: 2, trailingComma: 'all' },
  unknownAny: true,
})

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, source.replaceAll('\r\n', '\n'), { encoding: 'utf8' })
