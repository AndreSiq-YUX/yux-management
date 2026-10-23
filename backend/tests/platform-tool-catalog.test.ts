import { expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { buildPlatformToolCatalog } from '../src/modules/action-engine/platform-tool-catalog.js'

it('keeps platform knowledge identical across execution gates and covers every registered tool', () => {
  const registry = createActionEngineCapabilityRegistry()
  const allKeys = registry.listMetadata().map(item => item.key)
  const restricted = buildPlatformToolCatalog(registry, allKeys.filter(key => !key.startsWith('radar.')))
  const enabled = buildPlatformToolCatalog(registry, allKeys)
  expect(restricted.tools.map(({ planningAvailable: _, ...tool }) => tool)).toEqual(enabled.tools.map(({ planningAvailable: _, ...tool }) => tool))
  expect(new Set(enabled.tools.map(tool => tool.key))).toEqual(new Set(allKeys.map(key => key.split('.')[0])))
  expect(restricted.tools.find(tool => tool.key === 'radar')?.planningAvailable).toBe(false)
  expect(enabled.tools.find(tool => tool.key === 'radar')?.planningAvailable).toBe(true)
  expect(restricted.executionPolicy).toBe('requires_account_readiness_and_approval')
})
