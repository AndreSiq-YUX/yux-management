import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {findFixedRadarCnaes} from './support/radar-cnae-policy-guard.js';

it('detects fixed formatted CNAEs and raw CNAE policies, not regex validation or unrelated numbers',()=>{
 expect(findFixedRadarCnaes("const allowedCnaes = ['1234-5/67', '7654321'];\nconst blockedMainCnaes = [1234567];")).toEqual([{line:1,value:'1234-5/67'},{line:1,value:'7654321'},{line:2,value:'1234567'}]);
 expect(findFixedRadarCnaes('const validator = /\\d{4}-\\d\\/\\d{2}/; const phone=1234567; const activityCodes=campaign.targetCnaes;')).toEqual([]);
});
it('keeps all production Radar domain policy configurable instead of embedding segment CNAEs',()=>{
 const directory=fileURLToPath(new URL('../src/modules/radar/',import.meta.url));
 const files=(path:string):string[]=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):entry.name.endsWith('.ts')?[join(path,entry.name)]:[]);
 const findings=files(directory).flatMap(file=>findFixedRadarCnaes(readFileSync(file,'utf8')).map(finding=>({file,...finding})));
 expect(findings).toEqual([]);
});
it.each([
 "if (candidate.mainCnae === '1234567') return 'block';",
 "const blocked = ['1234567'].includes(candidate.mainCnae);",
 "const blocked = new Set(['1234567']).has(candidate.cnae);",
 "switch(candidate.mainCnae){case '1234567':return 'block'}",
])('detects fixed CNAE comparison/membership policy: %s',source=>{
 expect(findFixedRadarCnaes(source)).toEqual([{line:1,value:'1234567'}]);
});
