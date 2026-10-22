import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {captureFixture,connectionString,organizationId} from '../support/radar-capture-fixture.js';
import {radarAnalysisRetryPolicy} from '../../src/modules/radar/analysis-retry-authorizations.js';
import {radarOperationalLimitsSchema} from '../../src/modules/radar/operational-limits.js';

describe.skipIf(!connectionString)('legacy policy migration and authorization parity in PostgreSQL',()=>{
 it('persists only missing defaults, audits once, and produces the exact limits consumed by the runtime',async()=>{
  const f=await captureFixture(),db=await f.pool.connect();
  try{
   await db.query('BEGIN');
   await db.query(`UPDATE public.radar_operational_limits SET limits=(limits-'maxPresenceResolutionsPerCompany'-'stalledAfterMinutes')||'{"maxDecisionCallsPerCompany":4}'::jsonb WHERE singleton=TRUE`);
   const before=(await db.query('SELECT * FROM public.radar_operational_limits WHERE singleton=TRUE')).rows[0];
   const sql=readFileSync(new URL('../../src/db/migrations/0235_radar_funnel_operational_defaults.sql',import.meta.url),'utf8');
   await db.query(sql);await db.query(sql);
   const stored=(await db.query('SELECT * FROM public.radar_operational_limits WHERE singleton=TRUE')).rows[0];
   const policy=await radarAnalysisRetryPolicy(db,organizationId,{},[]);
   expect(stored.version).toBe(before.version+1);
   expect(stored.limits).toEqual(radarOperationalLimitsSchema.parse(before.limits));
   expect(stored.limits.maxDecisionCallsPerCompany).toBe(4);
   expect(policy.snapshot.operationalPolicy).toEqual({version:stored.version,limits:stored.limits});
   expect(stored.cost_policy).toEqual(before.cost_policy);
   const audits=(await db.query('SELECT * FROM public.radar_operational_limit_audit WHERE policy_version=$1',[stored.version])).rows;
   expect(audits).toHaveLength(1);expect(audits[0]).toMatchObject({change_origin:'migration',updated_by:null,old_limits:before.limits,new_limits:stored.limits});
   for(const role of ['yux_api','yux_worker','yux_runtime'])expect((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed',[role,'private.backfill_radar_operational_defaults(jsonb)','EXECUTE'])).rows[0].allowed).toBe(false);
  }finally{await db.query('ROLLBACK');db.release();await f.close()}
 });
});
