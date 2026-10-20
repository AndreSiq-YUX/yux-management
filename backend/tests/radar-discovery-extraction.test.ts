import {expect,it,vi} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
const fixturePath=[new URL('../../contracts/radar/discovery/v1/cases.json',import.meta.url),new URL('../contracts/radar/discovery/v1/cases.json',import.meta.url)].find(path=>existsSync(path))
if(!fixturePath)throw Error('radar_discovery_fixture_missing')
const fixture=JSON.parse(readFileSync(fixturePath,'utf8'))
const modulePath='../src/modules/radar/discovery-extraction.js',api=await import(modulePath).catch(()=>({})) as Record<string,any>
it('extracts multiple evidenced names without inheriting contacts of a directory or marking its own URL official',()=>{
 expect(api.validateRadarBusinessMentions).toBeTypeOf('function')
 const result=api.validateRadarBusinessMentions(fixture.response,fixture.document)
 expect(result).toHaveLength(2)
 expect(result[0]).toMatchObject({name:'Alfa Refeições',claimedWebsite:'https://alfa.example/',needsVerification:true,contacts:[],location:{city:'Campinas',state:'SP'},sourceUrl:fixture.document.source_url})
 expect(result[1]).toMatchObject({name:'Beta Alimentos',needsVerification:true})
 expect(JSON.stringify(result)).not.toContain('editor@lista.example')
})
it('preserves the valid name while dropping unsupported fields and rejects a fabricated name',()=>{
 expect(api.validateRadarBusinessMentions).toBeTypeOf('function')
 const mention={...fixture.response.mentions[0],claimedWebsite:'https://invented.example/',claimedTaxId:'00.000.000/0000-00'}
 const [result]=api.validateRadarBusinessMentions({mentions:[mention]},fixture.document)
 expect(result.name).toBe('Alfa Refeições');expect(result.claimedWebsite).toBeUndefined();expect(result.claimedTaxId).toBeUndefined()
 expect(api.validateRadarBusinessMentions({mentions:[{...mention,name:'Empresa inventada'}]},fixture.document)).toEqual([])
})
it('keeps only evidence that supports its retained field, not another company in the same list',()=>{
 const mention={...fixture.response.mentions[0],evidenceSpans:[...fixture.response.mentions[0].evidenceSpans,{field:'claimedWebsite',evidenceId:'list-1',excerpt:'Beta Alimentos — Campinas/SP — https://beta.example/'}]}
 const [result]=api.validateRadarBusinessMentions({mentions:[mention]},fixture.document)
 expect(result.evidenceSpans.some((proof:{excerpt:string})=>proof.excerpt.includes('Beta Alimentos'))).toBe(false)
})
it('treats a null optional model field as absent without losing a proved business name or publishing null facts',()=>{
 const [result]=api.validateRadarBusinessMentions({mentions:[{...fixture.response.mentions[0],location:null,claimedTaxId:null,claimedWebsite:null,sourceUrl:null,observedAt:null}]},fixture.document)
 expect(result.name).toBe('Alfa Refeições');expect(result.location).toBeUndefined();expect(result.claimedWebsite).toBeUndefined();expect(result.sourceUrl).toBe(fixture.document.source_url)
})
it('validates contact syntax even when a literal institutional excerpt is provided',()=>{
 const excerpt='Alfa Refeições: telefone +55 11 3333-4444. Não é telefone: instrução maliciosa.'
 const item={name:'Alfa Refeições',subjectScope:'company',contacts:[{kind:'phone',value:'+55 11 3333-4444'},{kind:'phone',value:'instrução maliciosa'}],evidenceSpans:[{field:'name',evidenceId:'page',excerpt:'Alfa Refeições'},{field:'contact',evidenceId:'page',excerpt}]}
 const [result]=api.validateRadarBusinessMentions({mentions:[item]},{...fixture.document,id:'page',kind:'institutional_candidate',text:excerpt})
 expect(result.contacts).toEqual([{kind:'phone',value:'+55 11 3333-4444'}])
})
it.each(['http://localhost./','http://[::ffff:127.0.0.1]/','http://user:secret@public.example/'])('rejects an unsafe document URL before model invocation: %s',source_url=>{
 expect(api.prepareRadarDiscoveryDocument).toBeTypeOf('function')
 expect(()=>api.prepareRadarDiscoveryDocument({...fixture.document,source_url})).toThrow()
})
it('bounds UTF-8 context with versioned continuation instead of pretending a long document was fully covered',()=>{
 expect(api.prepareRadarDiscoveryDocument).toBeTypeOf('function')
 const document={...fixture.document,text:'Empresa brasileira 😀. '.repeat(4000)}
 const prepared=api.prepareRadarDiscoveryDocument(document)
 expect(Buffer.byteLength(prepared.document.text)).toBeLessThanOrEqual(8000)
 expect(prepared.document.text).not.toContain('\uFFFD');expect(prepared.nextOffsetBytes).toBeGreaterThan(0)
 expect(prepared.contentVersion).toBe(1)
 expect(api.prepareRadarDiscoveryDocument(document,prepared.nextOffsetBytes).offsetBytes).toBe(prepared.nextOffsetBytes)
})
it('overlaps successive windows so a business name across the boundary is not silently lost',()=>{
 const name='Empresa Alfa Refeições e Serviços LTDA',document={...fixture.document,text:'x'.repeat(7990)+name+' mais informações públicas '.repeat(400)}
 const first=api.prepareRadarDiscoveryDocument(document),second=api.prepareRadarDiscoveryDocument(document,first.nextOffsetBytes)
 expect(first.document.text.includes(name)||second.document.text.includes(name)).toBe(true)
 expect(second.offsetBytes).toBeGreaterThan(first.offsetBytes)
})
it('does not call the runtime for unreadable, unlicensed or private input and never admits candidates itself',async()=>{
 expect(api.extractRadarBusinesses).toBeTypeOf('function')
 const runtime=vi.fn()
 const approved={...fixture.document,canPersist:true}
 for(const document of [{...approved,text:''},{...approved,source_url:'http://127.0.0.1/'},{...approved,canPersist:false}])await expect(api.extractRadarBusinesses({document,region:{state:'SP'},criteria:{segment:'Empresas'},requestId:'request',tenant:{organizationId:'00000000-0000-4000-8000-000000000001'},enabled:true},{runtime})).rejects.toThrow()
 expect(runtime).not.toHaveBeenCalled()
})
it('keeps observation time out of the paid request and preserves reported usage without inventing zero cost',async()=>{
 const runtime=vi.fn(async(_path:string,_payload:Record<string,unknown>)=>({mentions:fixture.response.mentions,provider:null,model:null,usage:{inputTokens:20,outputTokens:10,costUsd:.001}}))
 const input={document:{...fixture.document,canPersist:true},region:{state:'SP'},criteria:{segment:'Empresas'},requestId:'stable-request',tenant:{organizationId:'00000000-0000-4000-8000-000000000001'},enabled:true}
 const first=await api.extractRadarBusinesses(input,{runtime})
 await api.extractRadarBusinesses({...input,document:{...input.document,observed_at:'2026-10-20T12:00:00Z'}},{runtime})
 expect(runtime.mock.calls[0]).toEqual(runtime.mock.calls[1])
 expect(runtime.mock.calls[0][1].document).not.toHaveProperty('observed_at')
 expect(first.analysis.usage.costUsd).toBe(.001);expect(first.mentions).toHaveLength(2)
})
