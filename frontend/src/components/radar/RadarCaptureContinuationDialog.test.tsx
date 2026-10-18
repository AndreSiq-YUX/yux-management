import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,describe,it,expect,vi} from 'vitest'
const path='./RadarCaptureContinuationDialog',api=await import(path).catch(()=>({}))
import {radarPolicyFixture} from '@/test/fixtures/radarOperationalPolicy'
let clean=()=>{};afterEach(()=>clean())
const preflight={stateId:'a'.repeat(64),policy:radarPolicyFixture,allowed:true,requiresLimitsApproval:true,remaining:20,limits:{pageSize:10,maxPagesPerScope:1,maxQueriesPerBatch:5},attemptedQueries:1,successfulPagesByScope:{},optimisticAdditionalCapacity:10,minimumAdditionalQueries:2,blockers:[],checks:[],expiredContinuation:{receiptId:'receipt',scopeLabel:'Paraná'}}
async function render(overrides:Record<string,unknown>={}){
 expect(api.RadarCaptureContinuationDialog).toBeTypeOf('function')
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 const props={open:true,preflight,busy:false,onCancel:vi.fn(),onConfirm:vi.fn(async()=>{}),...overrides}
 await act(async()=>root.render(<api.RadarCaptureContinuationDialog {...props}/>))
 clean=()=>{act(()=>root.unmount());host.remove()}
 const dialog=()=>document.querySelector('[role="dialog"]')!
 const set=async(index:number,value:string)=>act(async()=>{const input=dialog().querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
 const confirm=()=>[...dialog().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Confirmar e retomar')!
 return{props,dialog,set,confirm}
}
describe('same-lot continuation confirmation',()=>{
 it('uses the persisted ceilings and offers explicit adoption of campaign limits',async()=>{
  const policy={version:2,limits:{maxDiscoveryPageSize:25,maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500}}
  const ui=await render({preflight:{...preflight,policy,campaignLimits:{pageSize:25,maxPagesPerScope:20,maxQueriesPerBatch:200},continuations:[{scopeKey:'PR',scopeLabel:'Paraná',reason:'idle',requiresRestartConfirmation:true,replayEstimate:3}]}})
  expect(ui.dialog().textContent).toContain('3 páginas')
  const adopt=[...ui.dialog().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Usar os limites salvos na campanha')!
  expect(adopt).toBeDefined();await act(async()=>adopt.click())
  expect([...ui.dialog().querySelectorAll<HTMLInputElement>('input')].map(i=>i.value)).toEqual(['25','20','200'])
  expect(ui.confirm().disabled).toBe(false)
 })
 it('combines limits and expired pagination in one dialog without automatic increases',async()=>{
  const ui=await render();expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(ui.dialog().textContent).toContain('20');expect(ui.dialog().textContent).toContain('Paraná')
  expect([...ui.dialog().querySelectorAll<HTMLInputElement>('input')].map(i=>i.value)).toEqual(['10','1','5'])
  expect(ui.props.onConfirm).not.toHaveBeenCalled()
 })
 it('cancels without submitting',async()=>{
  const ui=await render();await act(async()=>[...ui.dialog().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Cancelar')!.click())
  expect(ui.props.onCancel).toHaveBeenCalledTimes(1);expect(ui.props.onConfirm).not.toHaveBeenCalled()
 })
 it('confirms only exact edited limits and prevents duplicate clicks',async()=>{
  let finish!:()=>void;const onConfirm=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
  const ui=await render({onConfirm});await ui.set(1,'4');await ui.set(2,'8')
  await act(async()=>{ui.confirm().click();ui.confirm().click()})
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({pageSize:10,maxPagesPerScope:4,maxQueriesPerBatch:8})
  await act(async()=>finish())
 })
 it.each(['0','1.5','11',''])('blocks invalid page size %s',async value=>{
  const ui=await render();await ui.set(0,value);expect(ui.confirm().disabled).toBe(true)
  await act(async()=>ui.confirm().click());expect(ui.props.onConfirm).not.toHaveBeenCalled()
 })
})
