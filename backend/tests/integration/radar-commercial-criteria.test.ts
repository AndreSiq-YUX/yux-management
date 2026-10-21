import {describe,expect,it} from 'vitest';
import {captureFixture,connectionString,admin,organizationId} from '../support/radar-capture-fixture.js';
const api=await import('../../src/modules/radar/commercial-criteria.js').catch(()=>({})) as Record<string,any>;
describe.skipIf(!connectionString)('commercial criteria allowlist',()=>{
 it('edits only commercial fields, invalidates the revision and never accepts technical policy injection',async()=>{
  const f=await captureFixture();try{
   const before=(await f.pool.query('SELECT * FROM radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0];
   const input={organizationId,configurationRevision:1,targetCnaes:['5620101'],targets:[{key:'primary_target',label:'Refeições empresariais',definition:'Produção em escala para empresas.',priority:'primary',cnaes:[]}],outOfScopeExamples:['Varejo'],registry:{mainActivityRule:'target_secondary_needs_review',blockedMainCnaes:['20'],blockedNameTerms:[]},excludedNameTerms:[],contactPurpose:'suppliers',minPassRatio:.75};
   await expect(api.saveRadarCommercialCriteria(f.pool,admin,f.campaign.id,{...input,funnel:{enabled:true}})).rejects.toThrow();
   await api.saveRadarCommercialCriteria(f.pool,admin,f.campaign.id,input);
   const after=(await f.pool.query('SELECT * FROM radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0];
   expect(after.configuration_revision).toBe(2);expect(after.commercial_criteria_revision).toBe(2);
   expect(after.search_configuration.funnel.enabled).toBe(false);expect(after.search_configuration.research.webSearchProviders).toEqual(before.search_configuration.research.webSearchProviders);
   expect(after.search_configuration.batch.minPassRatio).toBe(.75);expect(after.budget_limit).toBe(before.budget_limit);expect(after.daily_limit).toBe(before.daily_limit);
  }finally{await f.close()}
 },30000);
});
