import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,describe,it,expect,vi} from 'vitest'
import type {RadarCaptureOperation} from '@/types/radarResearch'
const modulePath='./RadarCaptureControls'
const api=await import(modulePath).catch(()=>({}))
let cleanup=()=>{}
afterEach(()=>cleanup())
async function render(overrides:Record<string,unknown>={}){
 expect(api.RadarCaptureControls).toBeTypeOf('function')
 const container=document.createElement('div'),root=createRoot(container)
 const props={scopeKey:'org:campaign:1',operation:null,loading:false,busy:false,available:true,error:'',onStart:vi.fn(async()=>{}),onResume:vi.fn(async()=>{}),onRefresh:vi.fn(),...overrides}
 cleanup=()=>act(()=>root.unmount())
 const update=async(next:Record<string,unknown>)=>{Object.assign(props,next);await act(async()=>root.render(<api.RadarCaptureControls {...props}/>))}
 await update({})
 const input=()=>container.querySelector('input') as HTMLInputElement
 const set=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}))})
 const submit=()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 return{container,props,update,input,set,submit}
}
const operation=(status:RadarCaptureOperation['status'])=>({id:'op',campaignId:'campaign',configurationRevision:1,status,counts:{requested:7,admitted:7,researching:0,completed:0,insufficient:0,blocked:7},blockers:[],items:[],discoveryStopped:true,queries:1})
describe('direct complete capture controls',()=>{
 it('starts exactly seven from a visible field with no quantity modal',async()=>{
  const ui=await render();expect(ui.input().value).toBe('10');await ui.set('7');await act(async()=>ui.submit())
  expect(ui.props.onStart).toHaveBeenCalledExactlyOnceWith({requestedCount:7,requestId:expect.any(String)})
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull()
 })
 it.each(['0','1.5','1001',''])('rejects %s without starting paid work',async value=>{
  const ui=await render();await ui.set(value);await act(async()=>ui.submit())
  expect(ui.props.onStart).not.toHaveBeenCalled();expect(ui.input().getAttribute('aria-invalid')).toBe('true')
 })
 it('retains the exact request and count after a lost response',async()=>{
  const onStart=vi.fn().mockRejectedValueOnce(Error('lost_response')).mockResolvedValueOnce(undefined)
  const ui=await render({onStart});await ui.set('7');await act(async()=>ui.submit())
  expect(ui.input().disabled).toBe(true);expect(ui.container.textContent).toContain('Tentar novamente sem duplicar')
  await act(async()=>ui.submit());expect(onStart.mock.calls[1][0]).toEqual(onStart.mock.calls[0][0])
 })
 it('prevents duplicate submits while the first request is pending',async()=>{
  let finish!:()=>void;const onStart=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
  const ui=await render({onStart});await act(async()=>{ui.submit();ui.submit()})
  expect(onStart).toHaveBeenCalledTimes(1);expect(ui.input().disabled).toBe(true)
  await act(async()=>finish())
 })
 it('uses one contextual resume for a blocked lot and keeps its original count',async()=>{
  const ui=await render({operation:operation('blocked')});expect(ui.input().value).toBe('7');expect(ui.input().disabled).toBe(true)
  expect(ui.container.querySelectorAll('button[type="submit"]')).toHaveLength(1)
  expect(ui.container.textContent).toContain('Retomar pesquisa');await act(async()=>ui.submit())
  expect(ui.props.onResume).toHaveBeenCalledTimes(1);expect(ui.props.onStart).not.toHaveBeenCalled()
 })
 it('disables new work while running and resets the next lot after terminal results',async()=>{
  const ui=await render({operation:operation('researching')});await act(async()=>ui.submit());expect(ui.props.onStart).not.toHaveBeenCalled()
  await ui.update({operation:operation('partial')});expect(ui.input().value).toBe('10');expect(ui.input().disabled).toBe(false)
 })
 it('does not apply a lost response to another campaign scope',async()=>{
  let fail!:(error:Error)=>void;const onStart=vi.fn(()=>new Promise<void>((_,reject)=>{fail=reject}))
  const ui=await render({onStart});await ui.set('7');await act(async()=>ui.submit())
  await ui.update({scopeKey:'org:other:1'});await act(async()=>fail(Error('lost_response')))
  expect(ui.input().value).toBe('10');expect(ui.input().disabled).toBe(false);expect(ui.container.textContent).not.toContain('Tentar novamente sem duplicar')
 })
})
