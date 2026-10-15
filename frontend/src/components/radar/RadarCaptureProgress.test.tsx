import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {describe,it,expect,vi} from 'vitest'
const modulePath='./RadarCaptureProgress',api=await import(modulePath).catch(()=>({}))
describe('truthful capture progress',()=>{
 it.each(['queued','partial','blocked'])('never labels %s as successful completion',async status=>{
  expect(api.RadarCaptureProgress).toBeTypeOf('function')
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCaptureProgress operation={{id:'op',status,configurationRevision:1,discoveryStopped:status!=='queued',counts:{requested:7,admitted:3,researching:0,completed:1,insufficient:1,blocked:1},blockers:['radar_ai_credits_insufficient'],items:[]}} onResume={vi.fn()} onRefresh={vi.fn()}/>))
  expect(container.textContent).not.toContain('Pesquisa concluída com sucesso')
  expect(container.textContent).toContain('Solicitadas');expect(container.textContent).toContain('Dados insuficientes')
  if(status==='blocked')expect(container.textContent).toContain('Retomar pesquisa deste lote')
  act(()=>root.unmount())
 })
})
