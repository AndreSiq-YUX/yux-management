import { describe, expect, it } from 'vitest'
import { materializeArtifactBindings } from '../src/modules/action-engine/composite-execution.js'
import { dependenciesSatisfied } from '../src/modules/action-engine/executor.js'

const hash='a'.repeat(64)
describe('composite Mission artifact execution',()=>{
  it('waits for upstream success and resolves only a declared immutable artifact snapshot',()=>{
    expect(dependenciesSatisfied(['succeeded','skipped'])).toBe(true)
    expect(dependenciesSatisfied(['succeeded','running'])).toBe(false)
    const resolved=materializeArtifactBindings({offer:'Consultoria'},[{artifact_key:'crm.funnel',schema_version:1,input_key:'upstream.funnelVersionId',output_path:'versionId',source_output:{output:{versionId:'version-1',contentHash:hash}}}])
    expect(resolved).toEqual({offer:'Consultoria',upstream:{funnelVersionId:'version-1'}})
  })
  it('rejects schema/hash mismatch and missing output without mutating the original input',()=>{
    const original={nested:{safe:true}}
    expect(()=>materializeArtifactBindings(original,[{artifact_key:'crm.funnel',schema_version:0,input_key:'funnel',output_path:'versionId',source_output:{output:{versionId:'v',contentHash:hash}}}])).toThrow('mission_composite_artifact_schema_invalid')
    expect(()=>materializeArtifactBindings(original,[{artifact_key:'crm.funnel',schema_version:1,input_key:'funnel',output_path:'versionId',source_output:{output:{versionId:'v',contentHash:'stale'}}}])).toThrow('mission_composite_artifact_hash_invalid')
    expect(()=>materializeArtifactBindings(original,[{artifact_key:'crm.funnel',schema_version:1,input_key:'funnel',output_path:'missing',source_output:{output:{versionId:'v',contentHash:hash}}}])).toThrow('mission_composite_artifact_output_missing')
    expect(original).toEqual({nested:{safe:true}})
  })
})
