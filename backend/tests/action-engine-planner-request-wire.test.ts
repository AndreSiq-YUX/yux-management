import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it, vi } from 'vitest'
import { requestMissionPlan } from '../src/modules/action-engine/planner.js'
import type { ActionPackVersion } from '../src/modules/action-engine/action-pack.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { RADAR_PROSPECTING_PACK_V1 } from '../src/modules/action-engine/packs/radar-prospecting-v1.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../src/modules/action-engine/packs/campaign-launch-v1.js'

const schema = JSON.parse(readFileSync(new URL('../../contracts/mission-supervisor/v1/mission-wire.schema.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: true, allErrors: true, discriminator: true })
ajv.addSchema(schema)
const validate = ajv.getSchema(`${schema.$id}#/$defs/MissionPlanRequestWire`)!
const env = { YUX_AGENT_RUNTIME_URL: 'http://runtime.test', YUX_AGENT_RUNTIME_TOKEN: 'test-only' }
const capabilities = createActionEngineCapabilityRegistry().listMetadata()

function payload(pack: ActionPackVersion & { parameters?: unknown } = RADAR_PROSPECTING_PACK_V1) {
  const { parameters: _schema, ...serializable } = pack
  return {
    organization_id: '650e8400-e29b-41d4-a716-446655440001', mission: { id: 'test-mission' },
    action_pack: serializable, pack_catalog: [serializable], readiness: { ready: true },
    capabilities: capabilities.filter(item => pack.allowedCapabilities.some(allowed => allowed.key === item.key)),
    strategy_context: { strategyItems: [{ id: 'published-card', principle: 'A pesquisa exige aprovação.' }] },
    allowed_source_ids: ['published-card'],
  }
}

describe('real backend catalogs crossing the strict Harness request contract', () => {
  for (const pack of [RADAR_PROSPECTING_PACK_V1, REVENUE_RECOVERY_PACK_V0, FUNNEL_NURTURE_PACK_V1, CAMPAIGN_LAUNCH_PACK_V1]) {
    it(`sends ${pack.key} accepted by the exported Python request schema`, async () => {
      const input = payload(pack)
      const before = JSON.stringify(input)
      const transport = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body))
        expect(validate(body), JSON.stringify(validate.errors)).toBe(true)
        expect(body.action_pack.topologyTemplate).toEqual(pack.topologyTemplate)
        expect(body.action_pack.protectedStepKeys).toEqual(pack.protectedStepKeys)
        expect(body.strategy_context).toEqual(input.strategy_context)
        expect(body.allowed_source_ids).toEqual(input.allowed_source_ids)
        return new Response(JSON.stringify({ kind: 'clarification' }), { status: 200 })
      })
      await requestMissionPlan(env, input, transport as typeof fetch)
      expect(transport).toHaveBeenCalledOnce()
      expect(JSON.stringify(input)).toBe(before)
    })
  }

  it('rejects a broken capability before sending a request or incurring model cost', async () => {
    const input = { ...payload(), capabilities: [{ key: 'radar.campaign.inspect', version: 1, effect: 'invented' }] }
    const transport = vi.fn()
    await expect(requestMissionPlan(env, input, transport)).rejects.toThrow('mission_wire_request_invalid')
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not silently discard unrecognized request-level overrides', async () => {
    const transport = vi.fn()
    await expect(requestMissionPlan(env, { ...payload(), model_override: 'unapproved' }, transport)).rejects.toThrow('mission_wire_request_invalid')
    expect(transport).not.toHaveBeenCalled()
  })
})
