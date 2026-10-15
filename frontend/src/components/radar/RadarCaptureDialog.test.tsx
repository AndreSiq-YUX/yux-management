import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {defaultRadarSearchConfiguration} from '@/lib/radar/radarSearchConfiguration'
import type {RadarCampaign} from '@/types/radar'
import type {RadarResearchAvailability} from '@/types/radarResearch'
const modulePath='./RadarCaptureDialog'
const api=await import(modulePath).catch(()=>({}))
const config=defaultRadarSearchConfiguration();config.research!.enabled=true;config.research!.webSearchEnabled=true
const campaign={id:'campaign',targetStates:['PR'],configurationRevision:2,searchConfiguration:config} as RadarCampaign
const availability={allowed:true,reasons:[],estimates:[],maximumCostPerCandidate:.03,maxQueriesPerCandidate:3,semanticQualificationEnabled:true} as RadarResearchAvailability
let cleanup=()=>{}
afterEach(()=>cleanup())
async function render(onStart=vi.fn(async()=>{})){
 expect(api.RadarCaptureDialog).toBeTypeOf('function')
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 cleanup=()=>{act(()=>root.unmount());container.remove()}
 await act(async()=>root.render(<api.RadarCaptureDialog campaign={campaign} availability={availability} discoveryCostPerQuery={.025} onStart={onStart} onClose={vi.fn()}/>))
 return {onStart,input:document.querySelector('input[type="number"]') as HTMLInputElement,submit:()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}
}
function set(input:HTMLInputElement,value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}
describe('capture quantity and consent',()=>{
 it('starts exactly seven once and separates discovery, research and AI estimates',async()=>{
  const ui=await render();await act(async()=>set(ui.input,'7'))
  expect(document.body.textContent).toContain('Descoberta: até')
  expect(document.body.textContent).toContain('Aprofundamento: até')
  expect(document.body.textContent).toContain('IA é cobrada separadamente')
  await act(async()=>ui.submit())
  expect(ui.onStart).toHaveBeenCalledWith(expect.objectContaining({requestedCount:7,requestId:expect.any(String)}))
 })
 it.each(['0','1.5','1001'])('rejects invalid quantity %s without starting',async value=>{
  const ui=await render();await act(async()=>set(ui.input,value));await act(async()=>ui.submit())
  expect(ui.onStart).not.toHaveBeenCalled();expect(document.body.textContent).toContain('número inteiro de 1 a 1.000')
 })
 it('retains request ID and original quantity after an uncertain HTTP failure',async()=>{
  const onStart=vi.fn().mockRejectedValueOnce(new Error('lost_response')).mockResolvedValueOnce(undefined)
  const ui=await render(onStart);await act(async()=>set(ui.input,'7'));await act(async()=>ui.submit())
  expect(ui.input.disabled).toBe(true)
  await act(async()=>ui.submit())
  expect(onStart.mock.calls[1][0]).toEqual(onStart.mock.calls[0][0])
 })
})
