import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY,
  CAMPAIGN_LAUNCH_PACK_V1,
} from '../src/modules/action-engine/packs/campaign-launch-v1.js'
import { hashAttributionPolicy } from '../src/modules/action-engine/metrics/attribution.js'

describe('Campaign Launch pack persistence', () => {
  it('pins the versioned attribution policy and the compiled pack hash', () => {
    const sql = readFileSync(new URL('../src/db/migrations/0142_campaign_launch_pack.sql', import.meta.url), 'utf8')
    const persistedDefinition = JSON.parse(sql.match(/\$definition\$\s*([\s\S]*?)\s*\$definition\$/)?.[1] ?? 'null')
    const {
      parameters: _parameters,
      contentHash: _contentHash,
      key: _key,
      semanticVersion: _semanticVersion,
      outcomeType: _outcomeType,
      status: _status,
      ...runtimeDefinition
    } = CAMPAIGN_LAUNCH_PACK_V1
    expect(sql).toContain("'campaign_launch'")
    expect(sql).toContain("'1.0.0'")
    expect(sql).toContain(CAMPAIGN_LAUNCH_PACK_V1.contentHash)
    expect(sql).toContain(hashAttributionPolicy(CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY))
    expect(persistedDefinition).toEqual(runtimeDefinition)
  })

  it('keeps provider create and activation disabled with mandatory approval', () => {
    const sql = readFileSync(new URL('../src/db/migrations/0142_campaign_launch_pack.sql', import.meta.url), 'utf8')
    expect(sql).toContain('campaign.provider.create_paused')
    expect(sql).toContain('campaign.provider.activate')
    expect(sql).toContain("FALSE, FALSE, 'always'")
    expect(sql).toContain("'campaign_launch_agent'")
  })
})
