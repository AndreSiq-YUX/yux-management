import {z} from 'zod'
export const businessModelsSchema=z.array(z.enum(['service_provider','retailer','manufacturer','commercial_representative','distributor','other'])).max(6).refine(items=>new Set(items).size===items.length)
const text=z.string().trim().max(12000).default('')
const list=z.array(z.string().trim().min(1).max(200)).max(100).default([])
export const representedBusinessSchema=z.object({name:z.string().trim().min(2).max(200),relationshipType:z.enum(['representation','distribution','both']),websiteUrl:z.string().trim().url().max(2000).optional(),description:text,serviceRegions:list,authorizedLines:list,commercialConditions:text,status:z.enum(['active','paused','archived']).default('active')}).strict()
export type RepresentedBusinessInput=z.infer<typeof representedBusinessSchema>
