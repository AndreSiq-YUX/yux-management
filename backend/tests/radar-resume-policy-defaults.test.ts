import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {defaultRadarOperationalLimits,radarOperationalLimitsSchema} from '../src/modules/radar/operational-limits.js';

it('persists every parser-injected limit default using the audited migration helper',()=>{
 const sql=readFileSync(new URL('../src/db/migrations/0235_radar_funnel_operational_defaults.sql',import.meta.url),'utf8');
 const defaults=JSON.parse(sql.match(/backfill_radar_operational_defaults\('([^']+)'::jsonb\)/)![1]);
 const legacy={...defaultRadarOperationalLimits};for(const key of Object.keys(defaults))delete (legacy as any)[key];
 expect(radarOperationalLimitsSchema.parse(legacy)).toEqual({...legacy,...defaults});
 expect(defaults).toMatchObject({maxDecisionCallsPerCompany:6,maxPresenceResolutionsPerCompany:2,stalledAfterMinutes:10});
 expect(sql).not.toMatch(/UPDATE|CREATE OR REPLACE|consume_radar_analysis_retry/i);
});
