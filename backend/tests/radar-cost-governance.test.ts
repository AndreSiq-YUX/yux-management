import {it,expect} from 'vitest'
import {evaluateRadarSourceGovernance} from '../src/modules/radar/repository.js'
function fixture(localCost:string,globalCost:string,unitPrice:number){return{source:{enabled:true,sourceType:'brave_web_search',defaultCostPerUnit:unitPrice,rateLimitPerDay:100},db:{query:async(sql:string)=>{
 if(sql.includes('FROM public.radar_campaigns'))return{rows:[{daily_limit:100,budget_limit:'0.3'}]}
 if(sql.includes('FROM public.radar_source_usage_counters'))return{rows:[{units:0,estimated_cost:sql.includes("source_type<>'perplexity_agent'")?globalCost:localCost}]}
 throw Error('unexpected_fixture_query')
}}}}
it('permits the final exact monetary unit without losing it to binary rounding',async()=>{
 const f=fixture('0.1','0.1',.2)
 const result=await evaluateRadarSourceGovernance(f.db as never,'org','campaign',f.source as never,1)
 expect(result.allowed).toBe(true);expect(result.remainingQueries).toBe(1)
})
it('uses all campaign costs, not just the current source, without treating a free read as new spending',async()=>{
 const f=fixture('0','0.25',.1)
 expect((await evaluateRadarSourceGovernance(f.db as never,'org','campaign',f.source as never,1)).issues).toContainEqual(expect.objectContaining({code:'source_budget_exceeded'}))
 const free=fixture('0','0.4',0)
 expect((await evaluateRadarSourceGovernance(free.db as never,'org','campaign',free.source as never,1)).allowed).toBe(true)
})
it('locks the campaign only for an actual reservation, not a read-only availability check',async()=>{
 const f=fixture('0','0',.1),queries:string[]=[],db={query:async(sql:string)=>{queries.push(sql);return f.db.query(sql)}}
 await evaluateRadarSourceGovernance(db as never,'org','campaign',f.source as never,1)
 expect(queries.some(sql=>sql.includes('FOR UPDATE'))).toBe(false)
 await evaluateRadarSourceGovernance(db as never,'org','campaign',f.source as never,1,1,true)
 expect(queries.some(sql=>sql.includes('FOR UPDATE'))).toBe(true)
})
