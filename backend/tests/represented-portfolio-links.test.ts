import {expect,it} from 'vitest'
import {representedProductSchema} from '../src/modules/company-intelligence/represented-products.js'
it('keeps explicit product conditions and refuses arbitrary scope or metadata',()=>{
 const parsed=representedProductSchema.parse({name:'Lasanha',description:'Pacote congelado',details:{packaging:'1 kg'}})
 expect(parsed.details.commercialAvailability).toBe('unconfirmed')
 expect(representedProductSchema.safeParse({...parsed,organizationId:'foreign'}).success).toBe(false)
 expect(representedProductSchema.safeParse({...parsed,details:{secret:'injected'}}).success).toBe(false)
})
