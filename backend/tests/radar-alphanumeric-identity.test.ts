import {expect,it} from 'vitest'
import {compareRadarBusinessIdentity} from '../src/modules/radar/site-discovery.js'
import {hasRadarOwnershipSignal,classifyRadarSource} from '../src/modules/radar/source-identity.js'
import {validateRadarPresenceResolution} from '../src/modules/radar/presence-resolution.js'
import {buildRadarDedupeKey} from '../src/modules/radar/repository.js'
import {registryRadarSizeFacts} from '../src/modules/radar/company-size.js'
const identity={name:'Empresa Teste',cnpj:'12ABC34501DE35'}
it('keeps an alphanumeric CNPJ complete in dedupe and documented registry facts',()=>{
 expect(buildRadarDedupeKey({cnpj:'12.ABC.345/01DE-35'})).toBe('cnpj:12ABC34501DE35')
 expect(registryRadarSizeFacts({cnpj:identity.cnpj,openingDate:'2020-01-01'},new Date('2026-10-19'))[0].sourceUrl).toContain(identity.cnpj)
})
it('compares exact establishment identifiers without collapsing their alphabetic portions',()=>{
 expect(compareRadarBusinessIdentity(identity,'Empresa Teste — CNPJ 12.ABC.345/01DE-35')).toMatchObject({association:'confirmed',scope:'establishment'})
 expect(compareRadarBusinessIdentity(identity,'Empresa Teste — CNPJ 12.ABC.345/01DF-35')).toMatchObject({association:'review'})
 expect(hasRadarOwnershipSignal('https://marca.example/',identity,{text:'Empresa Teste',html:'<footer>Empresa Teste CNPJ 12.ABC.345/01DE-35</footer>'})).toBe(true)
 expect(classifyRadarSource('https://diretorio.example/fornecedor/empresa-12ABC34501DE35').kind).toBe('directory')
})
it('rejects a model presence result when an alphanumeric establishment identifier conflicts',()=>{
 const excerpt='Empresa Teste — CNPJ 12.ABC.345/01DF-35',evidence=[{id:'page',url:'https://marca.example/',text:excerpt,kind:'institutional_candidate' as const,observedAt:'2026-10-19'}]
 expect(()=>validateRadarPresenceResolution({candidateId:'page',scope:'establishment',reason:'Empresa supostamente associada.',claims:[{evidenceId:'page',excerpt}]},identity,evidence)).toThrow('radar_presence_scope_conflict')
})
