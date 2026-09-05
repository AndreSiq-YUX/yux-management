import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import formatsPlugin from 'ajv-formats'
import { describe, expect, it } from 'vitest'

describe('platform knowledge contract', () => {
  it('accepts and rejects the shared policy corpus', async () => {
    const root = resolve(import.meta.dirname, '../..')
    const schema = JSON.parse(await readFile(resolve(root, 'contracts/knowledge/v1/knowledge.schema.json'), 'utf8'))
    const cases = JSON.parse(await readFile(resolve(root, 'contracts/knowledge/v1/policy-cases.json'), 'utf8'))
    const ajv = new Ajv2020({ strict: true })
    const addFormats = formatsPlugin as unknown as (target: Ajv2020) => Ajv2020
    addFormats(ajv)
    const validate = ajv.compile(schema)
    for (const value of cases.valid) expect(validate(value), JSON.stringify(validate.errors)).toBe(true)
    for (const testCase of cases.invalid) expect(validate(testCase.value), testCase.name).toBe(false)
  })
})
