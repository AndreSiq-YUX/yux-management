import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFromFile } from 'json-schema-to-typescript'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(backendRoot, '..')
const contracts = [
  { schema: 'contracts/knowledge/v1/knowledge.schema.json', outputs: ['backend/src/contracts/generated/knowledge.ts', 'frontend/src/types/generated/knowledge.ts'] },
  { schema: 'contracts/workspace/v1/workspace.schema.json', outputs: ['backend/src/contracts/generated/workspace.ts', 'frontend/src/types/generated/workspace.ts'] },
]

for (const contract of contracts) {
  const source = await compileFromFile(resolve(repositoryRoot, contract.schema), {
    bannerComment: `/* Generated from ${contract.schema}. Do not edit manually. */`,
    enableConstEnums: false,
    format: true,
    style: { singleQuote: true, semi: false, tabWidth: 2, trailingComma: 'all' },
    unknownAny: false,
  })
  for (const output of contract.outputs) {
    const outputPath = resolve(repositoryRoot, output)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, source.replaceAll('\r\n', '\n'), 'utf8')
  }
}
