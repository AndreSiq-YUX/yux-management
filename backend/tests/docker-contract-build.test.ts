import { resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('compiles the discovery fixture test with the flattened Docker build layout', () => {
  const backend = resolve(import.meta.dirname, '..')
  const externalContracts = resolve(backend, '../contracts').replaceAll('\\', '/').toLowerCase() + '/'
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    esModuleInterop: true, skipLibCheck: true, noEmit: true,
  }
  const host = ts.createCompilerHost(options)
  const fileExists = host.fileExists.bind(host)
  // Docker copies backend/ to /app and contracts/ to /app/contracts, not /contracts.
  // Compile-time imports cannot rely on the parent repository directory existing.
  host.fileExists = path => !path.replaceAll('\\', '/').toLowerCase().startsWith(externalContracts) && fileExists(path)
  const program = ts.createProgram([resolve(backend, 'tests/radar-discovery-extraction.test.ts')], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error)
  expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([])
}, 60_000)
