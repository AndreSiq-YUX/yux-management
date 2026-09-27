import { describe, expect, it } from 'vitest'
import { awaitCurrentRadarPlacePreview } from './radarPlacePreviewGuard'

describe('radar place preview guard', () => {
  it('discards a late response after the campaign or provider changes', async () => {
    let complete!: (value: string) => void
    const pending = new Promise<string>(resolve => { complete = resolve })
    let current = 'org-a:campaign-a:serper_places:1'
    const result = awaitCurrentRadarPlacePreview(pending, current, () => current)
    current = 'org-a:campaign-b:brave_place_search:2'
    complete('old campaign result')
    await expect(result).resolves.toBeNull()
  })

  it('keeps a response for the current organization, campaign and provider', async () => {
    await expect(awaitCurrentRadarPlacePreview(Promise.resolve('current result'), 'org-a:campaign-a:serper_places:1',
      () => 'org-a:campaign-a:serper_places:1')).resolves.toBe('current result')
  })

  it('discards a late response after search fields change within the same campaign', async () => {
    let complete!: (value: string) => void
    const pending = new Promise<string>(resolve => { complete = resolve })
    let current = 'org-a:campaign-a:serper_places:1'
    const result = awaitCurrentRadarPlacePreview(pending, current, () => current)
    current = 'org-a:campaign-a:serper_places:2'
    complete('stale search')
    await expect(result).resolves.toBeNull()
  })
})
