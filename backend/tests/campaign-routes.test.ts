import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('campaign route boundary',()=>{
  it('keeps provider credentials out of the client campaign projection',()=>{
    const source=readFileSync(new URL('../src/modules/campaigns/routes.ts',import.meta.url),'utf8')
    const portalProjection=source.slice(source.indexOf("app.get('/portal/campaigns'"),source.indexOf("app.post('/query'"))
    expect(portalProjection).not.toContain('token_reference')
    expect(portalProjection).not.toContain('request_payload')
    expect(portalProjection).toContain('provider_connection_id')
  })
  it('exposes mission inspection through the shared repository and authorization boundary',()=>{
    const source=readFileSync(new URL('../src/modules/campaigns/routes.ts',import.meta.url),'utf8')
    expect(source).toContain("app.get('/mission-state'")
    expect(source).toContain("requireAccess(ctx, 'action_engine.read'")
    expect(source).toContain('inspectCampaignState')
  })
})
