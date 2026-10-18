import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from './support/radar-capture-fixture.js'
const operationPath='../src/modules/radar/capture-operation.js',discoveryPath='../src/modules/radar/capture-discovery.js'
const operations=await import(operationPath).catch(()=>({})),discovery=await import(discoveryPath).catch(()=>({}))
describe('capture discovery interface',()=>{it('provides bounded durable discovery',()=>expect(discovery.advanceRadarCaptureDiscovery).toBeTypeOf('function'))})
describe.skipIf(!connectionString)('capture admission with real PostgreSQL',()=>{
  it('drains paid overflow across bounded turns before buying another page',async()=>{
    const f=await captureFixture(),old=company(),fresh=company()
    try{
      await f.pool.query("INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3)",[organizationId,f.campaign.id,`cnpj:${old.taxId}`])
      const run=(await f.pool.query("INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,provider,status) VALUES($1,$2,'cnpja_advanced_search','succeeded') RETURNING id",[organizationId,f.campaign.id])).rows[0]
      await f.pool.query("INSERT INTO public.radar_capture_overflow(organization_id,campaign_id,configuration_revision,scope_key,enrichment_run_id,candidate) SELECT $1,$2,1,'v1:PR:all',$3,$4::jsonb FROM generate_series(1,1000)",[organizationId,f.campaign.id,run.id,JSON.stringify(old)])
      await f.pool.query("INSERT INTO public.radar_capture_overflow(organization_id,campaign_id,configuration_revision,scope_key,enrichment_run_id,candidate) VALUES($1,$2,1,'v1:PR:all',$3,$4)",[organizationId,f.campaign.id,run.id,JSON.stringify(fresh)])
      const op=await operations.startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
      const searchPage=vi.fn(async()=>({candidates:[]})),input={organizationId,operationId:op.operationId}
      await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,searchPage,loadSecret:async()=>'fake'})
      expect(searchPage).not.toHaveBeenCalled()
      const result=await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,searchPage,loadSecret:async()=>'fake'})
      expect(result.counts.admitted).toBe(1);expect(searchPage).not.toHaveBeenCalled()
    }finally{await f.close()}
  },20_000)
  it('admits exactly seven new companies, preserves overflow and skips duplicates without changing old facts',async()=>{
    expect(discovery.advanceRadarCaptureDiscovery).toBeTypeOf('function')
    const f=await captureFixture(),old=company(),fresh=Array.from({length:10},company)
    try{
      const previous=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3,'{"websiteUrl":"https://old.example/"}') RETURNING id`,[organizationId,f.campaign.id,`cnpj:${old.taxId}`])).rows[0]
      await f.pool.query(`INSERT INTO public.radar_b2b_reviews(candidate_id,organization_id,campaign_id,target_status,product_fit,configuration_revision,approved_at,approved_by) VALUES($1,$2,$3,'confirmed','high',1,NOW(),$4)`,[previous.id,organizationId,f.campaign.id,admin.id])
      const start=await operations.startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:7},{availability:available})
      const searchPage=vi.fn(async(_input:{limit:number})=>({candidates:[old,...fresh],nextToken:'next-page'}))
      const state=await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
      expect(state.counts.admitted).toBe(7);expect(state.discoveryStopped).toBe(true)
      expect(searchPage.mock.calls[0][0]).toMatchObject({limit:7})
      expect((await f.pool.query('SELECT * FROM public.radar_capture_items WHERE operation_id=$1',[start.operationId])).rows).toHaveLength(7)
      expect((await f.pool.query('SELECT * FROM public.radar_capture_overflow WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(3)
      expect((await f.pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[previous.id])).rows[0].normalized_payload).toEqual({websiteUrl:'https://old.example/'})
      await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
      expect(searchPage).toHaveBeenCalledTimes(1)
      await f.pool.query("UPDATE public.radar_capture_operations SET status='completed' WHERE id=$1",[start.operationId])
      const next=await operations.startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:3},{availability:available})
      const reused=await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:next.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
      expect(reused.counts.admitted).toBe(3);expect(searchPage).toHaveBeenCalledTimes(1)
    }finally{await f.close()}
  })
  it.each(['duplicates','exhausted','cap'])('stops bounded discovery truthfully for %s',async mode=>{
    expect(discovery.advanceRadarCaptureDiscovery).toBeTypeOf('function')
    const f=await captureFixture(),old=company()
    try{
      await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3)`,[organizationId,f.campaign.id,`cnpj:${old.taxId}`])
      await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{batch,maxQueriesPerBatch}','2') WHERE id=$1`,[f.campaign.id])
      const start=await operations.startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:5},{availability:available})
      let calls=0
      const searchPage=vi.fn(async()=>({candidates:mode==='duplicates'?[old]:mode==='cap'?[company()]:[],nextToken:mode==='exhausted'?undefined:`token-${++calls}`}))
      let state
      for(let i=0;i<4;i++)state=await discovery.advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
      expect(searchPage).toHaveBeenCalledTimes(mode==='exhausted'?1:2)
      expect(state.discoveryStopped).toBe(true);expect(state.counts.admitted).toBe(mode==='cap'?2:0)
      expect(state.discoveryReason).toBe(mode==='exhausted'?'source_exhausted':'query_cap')
    }finally{await f.close()}
  })
})
