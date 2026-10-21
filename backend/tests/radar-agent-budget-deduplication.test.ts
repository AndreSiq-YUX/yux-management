import {expect,it} from 'vitest';
import {radarAgentCampaignSpentUsd} from '../src/modules/radar/deep-research-execution.js';
it('counts one historical Agent receipt once and prefers its reconciled actual amount regardless of row order',()=>{
 const reserved={source:'perplexity_agent',requestId:'same-effect',reservedUsd:'0.01'} as any;
 const completed={...reserved,actualUsd:'0.006'};
 for(const attempts of [[completed,reserved],[reserved,completed]])expect(radarAgentCampaignSpentUsd(attempts.map(entry=>({calls:{entry}})))).toBe('0.006');
});
