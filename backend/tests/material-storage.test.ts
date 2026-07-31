import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { assertAllowedMaterialFile, resolveMaterialStoragePath } from '../src/modules/automations/repository.js'

describe('automation material storage', () => {
  it('never resolves a material path outside the configured storage root', () => {
    const root = path.resolve('storage', 'materials')
    expect(resolveMaterialStoragePath(root, path.join('org-a', 'file.pdf'))).toBe(path.join(root, 'org-a', 'file.pdf'))
    expect(resolveMaterialStoragePath(root, path.join('..', '..', 'secrets.txt'))).toBeNull()
  })

  it('requires an allowed magic type that matches the declared MIME type', async () => {
    await expect(assertAllowedMaterialFile(Buffer.from('%PDF-1.7\n'), 'application/pdf')).resolves.toBe('application/pdf')
    await expect(assertAllowedMaterialFile(Buffer.from('not a PDF'), 'application/pdf')).rejects.toThrow('invalid_material_file_type')
  })
})
