import {it,expect} from 'vitest'
const api=await import('../src/modules/radar/cost-conversion.js').catch(()=>({})) as Record<string,any>
const quote={usdToBrl:'5.50',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual',marginPercent:'0'}
it('converts exact decimals and freezes the manual rate per estimate without float accumulation',()=>{
 expect(api.estimateRadarCostBrl).toBeTypeOf('function')
 const result=api.estimateRadarCostBrl({amount:'0.01',currency:'USD',rateSnapshot:quote})
 expect(result).toMatchObject({amountBrl:'0.055',originalAmount:'0.01',currency:'USD',estimated:true,rateSnapshot:quote})
 expect(api.estimateRadarCostBrl({amount:'0.000000001',currency:'USD',rateSnapshot:quote}).amountBrl).toBe('0.0000000055')
 expect(api.radarReportedCostAmount(1e-9)).toBe('0.000000001')
 quote.usdToBrl='9'
 expect(result.rateSnapshot.usdToBrl).toBe('5.50');quote.usdToBrl='5.50'
 expect(api.estimateRadarCostBrl({amount:'0.01',currency:'USD',rateSnapshot:{...quote,marginPercent:'10'}}).amountBrl).toBe('0.0605')
})
it('keeps BRL direct and treats missing quote or unknown original cost as unknown, never free',()=>{
 expect(api.estimateRadarCostBrl).toBeTypeOf('function')
 expect(api.estimateRadarCostBrl({amount:'0.025',currency:'BRL',rateSnapshot:null})).toMatchObject({amountBrl:'0.025',originalAmount:'0.025',estimated:true})
 expect(api.estimateRadarCostBrl({amount:'0.01',currency:'USD',rateSnapshot:null})).toMatchObject({amountBrl:null,reason:'radar_cost_rate_missing'})
 expect(api.estimateRadarCostBrl({amount:'0',currency:'USD',rateSnapshot:null})).toMatchObject({amountBrl:'0'})
 expect(api.estimateRadarCostBrl({amount:null,currency:'USD',rateSnapshot:quote})).toMatchObject({amountBrl:null,originalAmount:null,reason:'radar_cost_unknown'})
 for(const amount of ['-1','NaN','Infinity','1e3','', ' 1 '])expect(()=>api.estimateRadarCostBrl({amount,currency:'USD',rateSnapshot:quote})).toThrow()
})
it('compares, adds and divides budget values exactly at the final available unit',()=>{
 expect(api.addRadarDecimal).toBeTypeOf('function')
 expect(api.addRadarDecimal('0.1','0.2')).toBe('0.3')
 expect(api.compareRadarDecimal(api.addRadarDecimal('0.1','0.2'),'0.3')).toBe(0)
 expect(api.remainingRadarCostUnits({budget:'0.3',used:'0.1',unitPrice:'0.2'})).toBe(1)
 expect(api.remainingRadarCostUnits({budget:'0.3',used:'0.3',unitPrice:'0.2'})).toBe(0)
})
