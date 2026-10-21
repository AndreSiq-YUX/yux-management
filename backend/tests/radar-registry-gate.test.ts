import {describe,expect,it} from 'vitest'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
const api=await import('../src/modules/radar/registry-gate.js').catch(()=>({})) as Record<string,any>
const configuration=()=>resolveRadarSearchConfiguration({qualification:{targets:[{key:'target',label:'Cozinha industrial',definition:'Produção de refeições para empresas',priority:'primary'}],registry:{blockedMainCnaes:['4729601','20'],blockedNameTerms:['tabacaria'],mainActivityRule:'target_secondary_needs_review'}}})
const evaluate=(payload:unknown,config=configuration())=>api.evaluateRadarRegistryRules({payload,targetCnaes:['5620101'],configuration:config})
describe('campaign-specific registry filter',()=>{
 it('does not contain implicit segment exclusions for a fresh campaign',()=>{
  expect(evaluate({tradeName:'Tabacaria',registryActivities:[{code:'4729601',main:true}]},resolveRadarSearchConfiguration({}))).toMatchObject({outcome:'pass'})
 })
 it('blocks an explicitly configured principal activity or name and explains the exact rule',()=>{
  expect(evaluate({tradeName:'Comércio',registryActivities:[{code:'4729601',main:true}]})).toMatchObject({outcome:'block',rule:'blocked_main_cnae',matchedValue:'4729601'})
  expect(evaluate({tradeName:'TABACARIA ESQUINA'})).toMatchObject({outcome:'block',rule:'blocked_name_term',matchedValue:'tabacaria'})
  expect(evaluate({registryActivities:[{code:'2011800',main:true}]})).toMatchObject({outcome:'block',matchedValue:'20'})
 })
 it('does not reject a principal target because another broad exclusion prefix or secondary activity exists',()=>{
  expect(evaluate({registryActivities:[{code:'5620101',main:true},{code:'4729601',main:false}]})).toMatchObject({outcome:'pass'})
 })
 it('sends a secondary-only target for investigation instead of claiming a mismatch',()=>{
  expect(evaluate({registryActivities:[{code:'5611201',main:true},{code:'5620101',main:false}]})).toMatchObject({outcome:'doubt',flags:['target_secondary_only']})
 })
 it('does not match a short excluded name fragment inside a different word',()=>{
  const config=resolveRadarSearchConfiguration({qualification:{registry:{blockedNameTerms:['bar']}}})
  expect(evaluate({tradeName:'Refeições Barueri'},config)).toMatchObject({outcome:'pass'})
 })
 it('validates target keys and CNAE prefixes rather than silently accepting ambiguous policies',()=>{
  expect(()=>resolveRadarSearchConfiguration({qualification:{targets:[{key:'same',label:'A',definition:'A',priority:'primary'},{key:'same',label:'B',definition:'B',priority:'secondary'}]}})).toThrow()
  expect(()=>resolveRadarSearchConfiguration({qualification:{registry:{blockedMainCnaes:['x']}}})).toThrow()
 })
})
