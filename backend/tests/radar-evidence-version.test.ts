import {expect,it} from 'vitest'
const api=await import('../src/modules/radar/evidence-version.js').catch(()=>({})) as Record<string,any>
const evidence=[{id:'page-0',url:'https://empresa.example/?utm_source=test#top',text:'Empresa Alfa\nTelefone 4133334444',observedAt:'2026-10-18',kind:'institutional_candidate',scope:'establishment'}]
it('hashes content, identity, criteria and purpose, not observation time, position, attempt or budget',()=>{
 expect(api.radarEvidenceContentHash).toBeTypeOf('function')
 const base={identity:{name:'Empresa Alfa',cnpj:'12345678000190'},criteria:{segment:'Serviços'},purpose:'presence',evidence}
 const hash=api.radarEvidenceContentHash(base)
 expect(api.radarEvidenceContentHash({...base,evidence:[{...evidence[0],id:'page-7',url:'https://empresa.example/',text:'Empresa Alfa Telefone 4133334444',observedAt:'2026-10-19',attempt:20,budget:9}]})).toBe(hash)
 for(const changed of [{...base,evidence:[{...evidence[0],text:'Empresa Alfa Telefone 4199999999'}]},{...base,identity:{...base.identity,cnpj:'98765432000190'}},{...base,criteria:{segment:'Outro'}},{...base,purpose:'qualification'},{...base,evidence:[{...evidence[0],scope:'group'}]}])expect(api.radarEvidenceContentHash(changed)).not.toBe(hash)
 const more=[...evidence,{...evidence[0],id:'page-1',url:'https://empresa.example/contato',text:'Contato institucional'}]
 expect(api.radarEvidenceContentHash({...base,evidence:more})).toBe(api.radarEvidenceContentHash({...base,evidence:[...more].reverse()}))
 expect(evidence[0].text).toContain('\n')
})
it('binds a legacy receipt only with a matching reconstructed hash and content; remaps citation IDs without changing paid identity',()=>{
 expect(api.radarEvidenceBindingMatch).toBeTypeOf('function')
 const current={hashVersion:2,hash:'new',bindings:[{id:'page-1',key:'same-page'},{id:'page-0',key:'other-page'}],legacy:{hash:'old',hashVersion:1,contentHash:'new',bindings:[{id:'page-0',key:'same-page'}]}}
 const match=api.radarEvidenceBindingMatch({evidenceHash:'old'},current)
 expect(match).toEqual(current.legacy.bindings)
 expect(api.remapRadarEvidenceResult({candidateId:'page-0',claims:[{evidenceId:'page-0',excerpt:'Original text'}]},match,current.bindings)).toEqual({candidateId:'page-1',claims:[{evidenceId:'page-1',excerpt:'Original text'}]})
 expect(api.remapRadarEvidenceResult({evidenceSources:[{id:'page-0',sourceUrl:'https://empresa.example/'}]},match,current.bindings)).toEqual({evidenceSources:[{id:'page-1',sourceUrl:'https://empresa.example/'}]})
 expect(api.radarEvidenceBindingMatch({evidenceHash:'unknown'},current)).toBeUndefined()
 expect(api.radarEvidenceBindingMatch({evidenceHash:'old'},{...current,legacy:undefined})).toBeUndefined()
 expect(api.radarEvidenceBindingMatch({evidenceHash:'old'},{...current,legacy:{...current.legacy,contentHash:'changed'}})).toBeUndefined()
 expect(()=>api.remapRadarEvidenceResult({evidenceIds:['page-9']},match,current.bindings)).toThrow('radar_analysis_evidence_binding_missing')
})
it('keeps a new provider request ordered identically when input evidence order changes',()=>{
 expect(api.canonicalRadarAnalysisEvidence).toBeTypeOf('function')
 const values=[...evidence,{...evidence[0],id:'page-1',url:'https://empresa.example/contato',text:'Contato institucional'}]
 const project=(items:typeof values)=>api.canonicalRadarAnalysisEvidence(items).map(({id,url,text,kind}:typeof values[number])=>({id,url,text,kind}))
 expect(project(values)).toEqual(project([...values].reverse()))
})
it('separates identity/contact/qualification dependencies without changing the v2 paid content hash',()=>{
 expect(api.radarResearchDependencyVersions).toBeTypeOf('function')
 const base={identity:{name:'Empresa Alfa',cnpj:'12345678000190',phone:'4133334444'},criteria:{segment:'Serviços'},evidence:[{url:'https://alfa.example/',text:'Empresa Alfa atende empresas. Telefone (41) 3333-4444.'}],contacts:[{kind:'phone',value:'+554133334444',sourceUrl:'https://alfa.example/',scope:'group'}]}
 const changed={...base,identity:{...base.identity,phone:'4199999999'},evidence:[{url:'https://alfa.example/',text:'Empresa Alfa atende empresas. Telefone (41) 9999-9999.'}],contacts:[{...base.contacts[0],value:'+554199999999'}]}
 const first=api.radarResearchDependencyVersions(base),second=api.radarResearchDependencyVersions(changed)
 expect(second.identityHash).toBe(first.identityHash)
 expect(second.presenceHash).toBe(first.presenceHash)
 expect(second.qualificationHash).toBe(first.qualificationHash)
 expect(second.contactsHash).not.toBe(first.contactsHash)
 expect(api.radarResearchDependencyVersions({...base,identity:{...base.identity,cnpj:'98765432000190'}}).identityHash).not.toBe(first.identityHash)
 expect(api.radarResearchDependencyVersions({...base,criteria:{segment:'Outro'}}).qualificationHash).not.toBe(first.qualificationHash)
 expect(api.radarEvidenceContentHash({...base,purpose:'presence'})).not.toBe(api.radarEvidenceContentHash({...changed,purpose:'presence'}))
})
