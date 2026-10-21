import {describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {captureFixture,connectionString,admin,organizationId} from '../support/radar-capture-fixture.js';
import {getRadarFunnelReport,auditRadarFunnelBlock} from '../../src/modules/radar/funnel-report.js';
import {recordRadarFunnelEvent} from '../../src/modules/radar/funnel-events.js';
import {reopenRadarFunnelCandidate} from '../../src/modules/radar/funnel-controls.js';
import {restoreRadarDecisionExclusion} from '../../src/modules/radar/decision-review.js';
describe.skipIf(!connectionString)('funnel report and scoped reopen',()=>{
 it('previews G0 for free, records review without bypass, and reopens only one gate idempotently',async()=>{
  const f=await captureFixture();try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true,"g0":{"mode":"enforce"}}')||'{"excludedNameTerms":["fora"]}'::jsonb WHERE id=$1`,[f.campaign.id]);
   const payload={tradeName:'Empresa fora',decisionExclusion:{active:true,gate:'g0',revision:1},funnel:{registry:{outcome:'block'}},funnelOverrides:[{gate:'g5',configurationRevision:1,reason:'Anterior'}]};
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa fora',$3,$4) RETURNING id`,[organizationId,f.campaign.id,randomUUID(),JSON.stringify(payload)])).rows[0];
   expect(await restoreRadarDecisionExclusion(f.pool,admin,candidate.id)).toMatchObject({status:'review_requested'});
   expect((await getRadarFunnelReport(f.pool,admin,{organizationId,campaignId:f.campaign.id})).companies[0]).toMatchObject({gate:'g0',reviewRequested:true,registryPreview:{blocked:true}});
   const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,gate:'g0',reason:'Verificação humana confirma aderência',requestId:randomUUID(),confirmFalseBlock:true};
   for(let i=0;i<2;i++)expect(await reopenRadarFunnelCandidate(f.pool,admin,candidate.id,input)).toMatchObject({status:'restored'});
   const after=(await f.pool.query('SELECT normalized_payload FROM radar_candidate_records WHERE id=$1',[candidate.id])).rows[0].normalized_payload;
   expect(after.decisionExclusion.active).toBe(false);expect(after.funnelOverrides.map((item:any)=>item.gate)).toEqual(['g5','g0']);
   expect((await getRadarFunnelReport(f.pool,admin,{organizationId,campaignId:f.campaign.id})).preview.blocked).toBe(0);
   expect((await f.pool.query('SELECT * FROM radar_funnel_reopen_audit WHERE candidate_id=$1',[candidate.id])).rows).toHaveLength(1);
  }finally{await f.close()}
 });
 it('restricts reports to global Admin, audits current enforced blocks and rejects another campaign',async()=>{
  const f=await captureFixture();try{
   for(const role of ['yux_operator','client_admin','client_member'])await expect(getRadarFunnelReport(f.pool,{...admin,role} as any,{organizationId,campaignId:f.campaign.id})).rejects.toThrow('radar_source_admin_required');
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Beta',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0];
   await recordRadarFunnelEvent(f.pool,{organizationId,campaignId:f.campaign.id,candidateId:candidate.id,configurationRevision:1,gate:'g1',mode:'enforce',outcome:'outside_profile',wouldBlock:true,eventKey:'fixture'});
   const event=(await f.pool.query('SELECT id FROM radar_funnel_events WHERE candidate_id=$1',[candidate.id])).rows[0];
   const input={organizationId,campaignId:f.campaign.id,eventId:event.id,outcome:'confirmed_outside',reason:'Evidência revisada no site'};
   expect(await auditRadarFunnelBlock(f.pool,admin,input)).toMatchObject({recorded:true});
   expect(await auditRadarFunnelBlock(f.pool,admin,input)).toMatchObject({recorded:true});
   const db=await f.pool.connect();try{for(const role of ['yux_admin','yux_operator','client_admin','client_member']){
    await db.query('BEGIN');await db.query('SET LOCAL ROLE yux_api');await db.query("SELECT set_config('app.current_role',$1,true),set_config('app.current_orgs',$2,true)",[role,`{${organizationId}}`]);
    expect((await db.query('SELECT id FROM radar_funnel_block_audits WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(role==='yux_admin'?1:0);await db.query('ROLLBACK');
   }}finally{await db.query('ROLLBACK');db.release()}
   await expect(auditRadarFunnelBlock(f.pool,admin,{...input,campaignId:randomUUID()})).rejects.toThrow('radar_audit_event_not_current');
  }finally{await f.close()}
 });
});
