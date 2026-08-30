import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FUNNEL_NURTURE_ATTRIBUTION_POLICY, FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'

describe('Funnel + Nurture pack persistence', () => {
  it('uses versioned last-touch attribution with resolvable identity only', () => {
    expect(FUNNEL_NURTURE_ATTRIBUTION_POLICY).toMatchObject({ version: 1, model: 'last_touch', windowDays: 30, identityResolution: 'exact_contact_or_declared_binding' })
    expect(FUNNEL_NURTURE_PACK_V1.metricSpec).toMatchObject({ primary: { attributionPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/) } })
  })

  it('seeds the exact compiled pack and keeps activation policies disabled by default', () => {
    const sql = readFileSync(new URL('../src/db/migrations/0138_funnel_nurture_pack.sql', import.meta.url), 'utf8')
    expect(sql).toContain("'funnel_nurture'")
    expect(sql).toContain(FUNNEL_NURTURE_PACK_V1.contentHash)
    expect(sql).toContain(String((FUNNEL_NURTURE_PACK_V1.metricSpec.primary as { attributionPolicyHash: string }).attributionPolicyHash))
    for (const capability of ['crm.pipeline.publish','email.template.publish','crm.sequence.publish','automation.flow.publish']) {
      expect(sql).toContain(capability)
    }
    expect(sql).toContain("enabled,kill_switch,approval_override")
    expect(sql).toContain("FALSE,FALSE,'always'")
  })
})
