import {describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {captureFixture,connectionString,admin,organizationId} from '../support/radar-capture-fixture.js';
import {closeRadarLegacyLots} from '../../src/modules/radar/funnel-controls.js';
describe.skipIf(!connectionString)('free registry backfill during controlled history transition',()=>{
 it('recovers stored activity descriptions without a registry purchase and is idempotent',async()=>{
  const f=await captureFixture();try{
   const activities=[{code:'1234567',text:'Descrição cadastral salva',main:true}];
   const row=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload,raw_payload) VALUES($1,$2,'cnpja_advanced_search','Alfa',$3,'{"cnpj":"12345678000190"}',$4) RETURNING id`,[organizationId,f.campaign.id,randomUUID(),JSON.stringify({registryActivities:activities})])).rows[0];
   for(let i=0;i<2;i++)await closeRadarLegacyLots(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,confirmClose:true});
   expect((await f.pool.query('SELECT normalized_payload FROM radar_candidate_records WHERE id=$1',[row.id])).rows[0].normalized_payload.registryActivities).toEqual(activities);
  }finally{await f.close()}
 });
});
