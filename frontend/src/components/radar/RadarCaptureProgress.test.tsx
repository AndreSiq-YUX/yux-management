import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {describe,it,expect,vi} from 'vitest'
const modulePath='./RadarCaptureProgress',api=await import(modulePath).catch(()=>({}))
describe('truthful capture progress',()=>{
 it('finishes processed companies without claiming that missing contacts or excluded companies were approved',async()=>{
  const container=document.createElement('div'),root=createRoot(container)
  try{
   await act(async()=>root.render(<api.RadarCaptureProgress operation={{id:'op',status:'completed',configurationRevision:7,discoveryStopped:true,counts:{requested:3,admitted:3,researching:0,completed:1,insufficient:1,blocked:0,completedWithGaps:1,outsideProfile:1,technicalFailures:0},blockers:[],items:[]}} onRefresh={vi.fn()}/>))
   expect(container.textContent).toContain('Concluídas com lacunas')
   expect(container.textContent).toContain('Fora do perfil')
   expect(container.textContent).not.toContain('concluída com sucesso')
   expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100')
  }finally{act(()=>root.unmount())}
 })
 it.each([true,false])('does not count blocked companies as complete and separates technical guidance: %s',async showTechnical=>{
  const container=document.createElement('div'),root=createRoot(container)
  try{
   await act(async()=>root.render(<api.RadarCaptureProgress showTechnical={showTechnical} operation={{id:'op',status:'blocked',configurationRevision:6,discoveryStopped:true,counts:{requested:20,admitted:20,researching:0,completed:1,insufficient:8,blocked:11},blockers:['source_limit_exceeded'],items:[]}} onRefresh={vi.fn()}/>))
   expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('5')
   if(showTechnical){
    expect(container.textContent).toContain('etapas com dados salvos')
    expect(container.querySelector('a[href="/admin/integrations"]')).not.toBeNull()
   }else{
    expect(container.textContent).toContain('etapa pendente')
    expect(container.querySelector('a[href="/admin/integrations"]')).toBeNull()
    expect(container.textContent).not.toMatch(/fonte|quota|Admin|cobrança|certificado/)
   }
  }finally{act(()=>root.unmount())}
 })
 it('shows a rejected discovery reason instead of the generic pending message',async()=>{
  const container=document.createElement('div'),root=createRoot(container)
  try{
   await act(async()=>root.render(<api.RadarCaptureProgress showTechnical operation={{id:'op',status:'blocked',configurationRevision:6,discoveryStopped:false,counts:{requested:20,admitted:0,researching:0,completed:0,insufficient:0,blocked:0},blockers:['radar_capture_discovery_request_rejected'],items:[]}} onRefresh={vi.fn()}/>))
   expect(container.querySelector('[role="alert"]')?.textContent).toContain('rejeitada')
   expect(container.textContent).not.toContain('Há uma etapa pendente')
   expect(container.textContent).not.toMatch(/CNPJá|Serper|Brave/)
   expect(container.textContent).toContain('20')
  }finally{act(()=>root.unmount())}
 })
 it.each(['queued','partial','blocked'])('never labels %s as successful completion',async status=>{
  expect(api.RadarCaptureProgress).toBeTypeOf('function')
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCaptureProgress operation={{id:'op',status,configurationRevision:1,discoveryStopped:status!=='queued',counts:{requested:7,admitted:3,researching:0,completed:1,insufficient:1,blocked:1},blockers:['radar_ai_credits_insufficient'],items:[]}} onResume={vi.fn()} onRefresh={vi.fn()}/>))
  expect(container.textContent).not.toContain('Pesquisa concluída com sucesso')
  expect(container.textContent).toContain('Solicitadas');expect(container.textContent).toContain('Dados insuficientes')
  expect(container.querySelector('button')).toBeNull() // Commands belong to the single inline control area.
  act(()=>root.unmount())
 })
})
