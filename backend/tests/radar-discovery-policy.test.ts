import {it,expect} from 'vitest'
import {radarDiscoveryPolicySchema,resolveRadarOsmMapping,matchConfiguredRadarOsmTags} from '../src/modules/radar/discovery-policy.js'
it('supports arbitrary editable business segments through data mappings, not executable expressions',()=>{
 const policy=radarDiscoveryPolicySchema.parse({osm:{mappings:[{key:'commercial_catering',terms:['Alimentação coletiva'],anyTags:[{key:'cuisine',values:['catering']}]}]}})
 const mapping=resolveRadarOsmMapping(policy,'Alimentação coletiva')!
 expect(mapping.key).toBe('commercial_catering')
 expect(matchConfiguredRadarOsmTags({cuisine:'catering'},mapping)).toBe(true)
 expect(matchConfiguredRadarOsmTags({shop:'tobacco'},mapping)).toBe(false)
 expect(resolveRadarOsmMapping(policy,'Outro segmento')).toBeUndefined()
 expect(()=>radarDiscoveryPolicySchema.parse({osm:{mappings:[{key:'unsafe',terms:['x'],anyTags:[{key:'x',expression:'eval(x)',values:['y']}]}]}})).toThrow()
})
it('does not infer broad source coverage from a missing mapping or snapshot',()=>{
 const policy=radarDiscoveryPolicySchema.parse({})
 expect(policy.osm.mappings).toEqual([])
 expect(resolveRadarOsmMapping(policy,'Cozinhas industriais')).toBeUndefined()
})
it('rejects duplicate keys and ambiguous normalized segment aliases',()=>{
 const entry={key:'first',terms:['Alimentação coletiva'],anyTags:[{key:'cuisine',values:['catering']}]}
 expect(()=>radarDiscoveryPolicySchema.parse({osm:{mappings:[entry,{...entry,terms:['Outro']} ]}})).toThrow()
 expect(()=>radarDiscoveryPolicySchema.parse({osm:{mappings:[entry,{...entry,key:'second',terms:[' alimentacao coletiva ']}]}})).toThrow()
})
