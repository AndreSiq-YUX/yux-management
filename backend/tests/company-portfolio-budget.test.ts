import {expect,it} from 'vitest'
import {getCompanyPortfolioContext} from '../src/modules/company-intelligence/portfolio-context.js'
const input={organizationId:'org',profileKey:'growth_strategist',audience:'client_user' as const,query:'Lasanha'}
it('reserves context for the relevant product before unrelated brand summaries',async()=>{
 const product={id:'product-31',name:'Lasanha',representedBusinessId:'brand-7',packaging:'1 kg',storageConditions:'Congelado',serviceRegions:['PR'],commercialAvailability:'unconfirmed'}
 const context={items:[product],total:1,offset:0,representedBusinesses:Array.from({length:8},(_,i)=>({id:`brand-${i}`,name:`Marca ${i}`,description:'D'.repeat(500),commercialConditions:'C'.repeat(1000)})),coverage:{hasMore:false}}
 const result=await getCompanyPortfolioContext({query:async()=>({rows:[{context:structuredClone(context)}]})} as never,input)
 expect(result.items[0]).toEqual(product)
 expect(JSON.stringify(result).length).toBeLessThanOrEqual(10000)
 expect(result.coverage.hasMore).toBe(false)
})
it('recomputes coverage after omitting lower priority products',async()=>{
 const context={items:Array.from({length:20},(_,i)=>({id:`product-${i}`,description:'D'.repeat(800)})),total:20,offset:0,representedBusinesses:[],coverage:{hasMore:false}}
 const result=await getCompanyPortfolioContext({query:async()=>({rows:[{context:structuredClone(context)}]})} as never,input)
 expect(result.items.length).toBeLessThan(20)
 expect(result.coverage.hasMore).toBe(true)
})
