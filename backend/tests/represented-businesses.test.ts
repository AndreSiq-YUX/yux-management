import {expect,it} from 'vitest'
import {representedBusinessSchema,businessModelsSchema} from '../src/modules/company-intelligence/represented-business-schemas.js'
it('supports several business roles and a represented company without its own website',()=>{
  expect(businessModelsSchema.parse(['commercial_representative','distributor'])).toHaveLength(2)
  expect(representedBusinessSchema.parse({name:'Marca de massas',relationshipType:'both'}).websiteUrl).toBeUndefined()
  expect(representedBusinessSchema.safeParse({name:'Marca',relationshipType:'both',organizationId:'forged'}).success).toBe(false)
  expect(businessModelsSchema.safeParse(['unknown']).success).toBe(false)
})
