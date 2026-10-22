import {expect,it} from 'vitest'
import {validateRadarPresenceResolution} from '../src/modules/radar/presence-resolution.js'
const identity={name:'Empresa Alfa',cnpj:'12345678000190'}
const evidence=[{id:'page-0',url:'https://brand.example/',text:'Marca Beta — Empresa Alfa. Soluções para empresas.',observedAt:'2026-10-13',kind:'institutional_candidate' as const}]
const resolved={candidateId:'page-0',scope:'group',reason:'Marca e empresa identificadas na página institucional.',claims:[{evidenceId:'page-0',excerpt:'Marca Beta — Empresa Alfa.'}]}
it('accepts only existing institutional pages and literal evidence, preserving group scope',()=>{
  expect(validateRadarPresenceResolution(resolved,identity,evidence)).toMatchObject({websiteUrl:'https://brand.example/',scope:'group'})
})
it('preserves the source spelling when a valid quote differs only in layout whitespace',()=>{
 const text='Marca\u00a0Beta — Empresa Alfa. Soluções para empresas.';
 expect(validateRadarPresenceResolution(resolved,identity,[{...evidence[0],text}]).claims[0].excerpt).toBe('Marca\u00a0Beta — Empresa Alfa.');
})
it.each([
  {...resolved,candidateId:'https://invented.example/'},
  {...resolved,claims:[{evidenceId:'page-0',excerpt:'Invented contact'}]},
  {...resolved,claims:[{evidenceId:'unknown',excerpt:evidence[0].text}]},
])('rejects invented candidates or unsupported claims',value=>{
  expect(()=>validateRadarPresenceResolution(value,identity,evidence)).toThrow('radar_presence_unverifiable')
})
it('rejects a directory or conflicting establishment even when the LLM says it is confirmed',()=>{
  expect(()=>validateRadarPresenceResolution(resolved,identity,[{...evidence[0],url:'https://unknown.example/cnpj/12345678000190'}])).toThrow('radar_presence_unverifiable')
  expect(()=>validateRadarPresenceResolution({...resolved,scope:'establishment'},identity,[{...evidence[0],text:evidence[0].text+' CNPJ 12.345.678/0002-71'}])).toThrow('radar_presence_scope_conflict')
})
