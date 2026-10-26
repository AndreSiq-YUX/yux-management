import {describe,it,expect} from 'vitest'

const path='../src/modules/radar/municipalities.js'
const {resolveRadarMunicipalityCode:resolve}=await import(path).catch(()=>({resolveRadarMunicipalityCode:undefined})) as {resolveRadarMunicipalityCode?: (city:string,state?:string)=>number}

describe('local official municipality resolution',()=>{
  it.each([
    ['Bauru','SP',3506003],['Marilia','SP',3529005],['Presidente Prudente','SP',3541406],['Assis','SP',3504008],
    ['Curitiba','PR',4106902],['Bom Jesus','PI',2201903],['Bom Jesus','RS',4302303],
    ['  são paulo  ','sp',3550308],['Boa Esperança do Norte','MT',5101837],
  ])('resolves %s/%s without a live geography service',(city,state,want)=>expect(resolve?.(city,state)).toBe(want))
  it.each([['Bauru','RJ'],['Cidade Inexistente','SP'],['Bauru/SP','SP'],['','SP']])('never broadens an unresolved %s/%s to the whole state',(city,state)=>{
    expect(()=>resolve?.(city,state)).toThrow('cnpja_municipality_not_found')
  })
  it.each([undefined,'','XX'])('requires a real UF (%s)',state=>expect(()=>resolve?.('Bauru',state)).toThrow('cnpja_city_requires_state'))
})

const generatorPath='../scripts/update-radar-municipalities.mjs'
const {normalizeMunicipalities:normalize}=await import(generatorPath).catch(()=>({normalizeMunicipalities:undefined})) as {normalizeMunicipalities?: (value:unknown)=>unknown}
describe('catalog update rejects unsafe replacements',()=>{
  it('rejects incomplete input rather than replacing the country with a partial list',()=>expect(()=>normalize?.([])).toThrow('incomplete_municipality_catalog'))
  it('rejects invalid official identifiers before generating executable source',()=>expect(()=>normalize?.([{'municipio-id':'oops','municipio-nome':'Bauru','UF-sigla':'SP'}])).toThrow('invalid_municipality_record'))
})
