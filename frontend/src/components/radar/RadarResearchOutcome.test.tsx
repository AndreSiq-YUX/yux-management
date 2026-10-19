import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect} from 'vitest'
import type {CommercialResearchStatusV1} from '@/types/generated/radarResearch'
const api=await import('./RadarResearchOutcome').catch(()=>({})) as typeof import('./RadarResearchOutcome')
it('shows useful per-company changes and reasons without tools, cost or administrative guidance',async()=>{
 expect(api.RadarResearchOutcome).toBeTypeOf('function')
 const host=document.createElement('div'),root=createRoot(host)
 try{
  const feedback:CommercialResearchStatusV1 & {provider:string;costUsd:number}={schemaVersion:1,status:'incomplete',updatedFields:['email'],unresolvedFields:[{field:'website',reason:'reading_restricted'},{field:'companyProfile',reason:'verification_pending'}],lastAttemptAt:'2026-10-19T10:00:00Z',nextAction:'review_source',provider:'Brave',costUsd:5}
  await act(async()=>root.render(<api.RadarResearchOutcome feedback={feedback}/>))
  expect(host.textContent).toContain('E-mail');expect(host.textContent).toContain('Não foi possível ler')
  expect(host.textContent).toContain('ainda não foi concluída')
  expect(host.textContent).not.toMatch(/Brave|costUsd|USD|Admin|modelo|crédito|recibo/)
 }finally{act(()=>root.unmount())}
})
