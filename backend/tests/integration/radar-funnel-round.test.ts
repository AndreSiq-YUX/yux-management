import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {captureFixture,connectionString,admin,organizationId} from '../support/radar-capture-fixture.js';
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js';
import {closeRadarLegacyLots} from '../../src/modules/radar/funnel-controls.js';
describe.skipIf(!connectionString)('historical research transition and complete opt-in worker',()=>{
 it('reuses eligible pages in a new revision, protects unknown receipts and leaves history immutable',async()=>{
  const f=await captureFixture();try{
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{"cnpj":"12345678000190","tradeName":"Empresa Alfa"}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0];
   const page={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:new Date().toISOString()};
   const old=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output,calls) VALUES($1,$2,$3,$4,1,'partial',$5,$6) RETURNING *`,[organizationId,f.campaign.id,candidate.id,admin.id,JSON.stringify({pages:[page],discovery:{hits:[],association:'review'}}),JSON.stringify({semantic:{status:'uncertain',requestId:'original-paid-effect'},completed:{status:'completed',result:'old'}})])).rows[0];
   await closeRadarLegacyLots(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,confirmClose:true});
   await f.pool.query(`UPDATE radar_campaigns SET configuration_revision=2,search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true}') WHERE id=$1`,[f.campaign.id]);
   const next=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:candidate.id,configurationRevision:2,requestId:randomUUID()});
   const saved=(await f.pool.query('SELECT * FROM radar_candidate_research_runs WHERE id=$1',[next.runId])).rows[0];
   expect(saved.id).not.toBe(old.id);expect(saved.output.pages).toEqual([page]);expect(saved.calls).toEqual({semantic:{status:'uncertain',requestId:'original-paid-effect'}});
   const historical=(await f.pool.query('SELECT * FROM radar_candidate_research_runs WHERE id=$1',[old.id])).rows[0];
   expect(historical.output).toEqual(old.output);expect(historical.calls).toEqual(old.calls);expect(historical.historical_closed_at).not.toBeNull();
  }finally{await f.close()}
 });
 it('publishes the found website and contact in one worker round with no paid identity search or duplicate execution',async()=>{
  const f=await captureFixture();try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true,"g1":{"mode":"off"},"g5":{"mode":"off"}}') WHERE id=$1`,[f.campaign.id]);
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{"cnpj":"12345678000190","tradeName":"Empresa Alfa","emailRaw":"contato@alfa-teste.com.br"}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0];
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:candidate.id,configurationRevision:1});
   const web=vi.fn(async()=>[]),runtime=vi.fn(async()=>{throw Error('unexpected_paid_model')}),collect=vi.fn(async()=>[{url:'https://alfa-teste.com.br/',text:'Empresa Alfa CNPJ 12.345.678/0001-90. compras@alfa-teste.com.br',observedAt:new Date().toISOString()}]);
   await executeRadarCandidateResearch(f.pool,{} as any,{organizationId,runId:run.runId},undefined,{web,runtime:runtime as any,collect,loadSecret:async()=>'synthetic'});
   const saved=(await f.pool.query('SELECT * FROM radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0];
   expect(saved.status).not.toBe('blocked');expect(saved.output.siteAssociation).toBe('confirmed');expect(saved.output.contacts).toEqual(expect.arrayContaining([expect.objectContaining({value:'compras@alfa-teste.com.br'})]));
   expect((await f.pool.query('SELECT normalized_payload FROM radar_candidate_records WHERE id=$1',[candidate.id])).rows[0].normalized_payload.websiteUrl).toBe('https://alfa-teste.com.br/');
   await executeRadarCandidateResearch(f.pool,{} as any,{organizationId,runId:run.runId},undefined,{web,runtime:runtime as any,collect});
   expect(web).not.toHaveBeenCalled();expect(runtime).not.toHaveBeenCalled();
  }finally{await f.close()}
 });
});
