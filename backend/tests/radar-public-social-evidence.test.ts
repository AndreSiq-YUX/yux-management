import {expect,it,vi} from 'vitest'
import {collectRadarPublicSocialEvidence} from '../src/modules/radar/public-social-evidence.js'
const page={url:'https://alfa.example/',text:'Alfa',observedAt:'2026-10-14',html:'<a href="https://facebook.com/alfa">Facebook</a><a href="https://linkedin.com/company/alfa">LinkedIn</a>'}
const response={status:'verified_present' as const,checkedAt:'2026-10-14',text:'Alfa contato@alfa.example',emails:[],phones:[]}
it('shares total limits, follows only directly linked profiles and never supplies TLS exceptions',async()=>{
  const inspect=vi.fn(async()=>response)
  const result=await collectRadarPublicSocialEvidence({linkedPages:[page],remainingPages:1,remainingAttempts:2,deadlineAt:Date.now()+10000},{inspect})
  expect(result).toHaveLength(1);expect(result[0].linkedFromUrl).toBe(page.url)
  expect(inspect.mock.calls[0]).toEqual(['https://facebook.com/alfa'])
})
it('does not read again after a checkpoint or when the shared budget/deadline is exhausted',async()=>{
  const inspect=vi.fn(async()=>response)
  const result=await collectRadarPublicSocialEvidence({linkedPages:[page],remainingPages:2,remainingAttempts:1,deadlineAt:Date.now()-1},{inspect})
  expect(result).toEqual([]);expect(inspect).not.toHaveBeenCalled()
  expect(await collectRadarPublicSocialEvidence({linkedPages:[{...page,html:'<a href="https://facebook.com/alfa">Facebook</a>'}],existingPages:[{url:'https://facebook.com/alfa',text:'',observedAt:'2026-10-14',linkedFromUrl:page.url}],remainingPages:2,remainingAttempts:2,deadlineAt:Date.now()+10000},{inspect})).toEqual([])
})
it.each([{...response,finalUrl:'https://facebook.com/login/'},{...response,html:'<input type="password">'},{...response,status:'unknown' as const,reason:'tls_invalid'}])('preserves a specific public-access limitation without taking content from an invalid profile',async supplied=>{
  const result=await collectRadarPublicSocialEvidence({linkedPages:[page],remainingPages:1,remainingAttempts:1,deadlineAt:Date.now()+10000},{inspect:async()=>supplied})
  expect(result[0].limitation).toBeTruthy();expect(result[0].text).toBe('')
})
it('never follows publisher profiles from a directory',async()=>{
  const inspect=vi.fn(async()=>response)
  expect(await collectRadarPublicSocialEvidence({linkedPages:[{...page,url:'https://empresadois.com.br/cnpj/12345678000190'}],remainingPages:2,remainingAttempts:2,deadlineAt:Date.now()+10000},{inspect})).toEqual([])
  expect(inspect).not.toHaveBeenCalled()
})
