import {expect,it} from 'vitest'
import {hasUsefulRadarHits,planRadarResearch} from '../src/modules/radar/research-planner.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
const identity={name:'Marca Alfa',legalName:'Empresa Alfa LTDA',cnpj:'12345678000190'}
const policy=resolveRadarSearchConfiguration({research:{localSearchOrder:'after_web_if_needed',webSearchEnabled:true}}).research
it('starts with the plain name without requiring a city or choosing a company identity',()=>{
  expect(planRadarResearch({identity,policy,hits:[],pages:[],queriesUsed:0,missing:['identity']})).toEqual({next:{kind:'web',query:'Marca Alfa'}})
})
it('does not consider government or unrelated institutional hits useful identity candidates',()=>{
  expect(hasUsefulRadarHits(identity,[{url:'https://compras.example.gov.br/ata/empresa',title:'Marca Alfa',snippets:[identity.cnpj],observedAt:''}])).toBe(false)
  expect(hasUsefulRadarHits(identity,[{url:'https://outra.example/',title:'Outra empresa',snippets:['Contatos comerciais'],observedAt:''}])).toBe(false)
})
it('stops at the shared call budget and when all requested gaps are resolved',()=>{
  expect(planRadarResearch({identity,policy,hits:[],pages:[],queriesUsed:3,missing:['contact']}).stopReason).toBe('query_limit')
  expect(planRadarResearch({identity,policy,hits:[],pages:[],queriesUsed:1,missing:[]}).stopReason).toBe('criteria_met')
})
it('uses the associated domain for a missing supplier contact rather than repeating a local search',()=>{
  const page={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-10-15'}
  expect(planRadarResearch({identity,policy:{...policy,contactPurpose:'suppliers'},hits:[],pages:[page],queriesUsed:1,missing:['contact']}).next)
    .toEqual({kind:'web',query:'site:alfa.example fornecedores compras contato'})
})
