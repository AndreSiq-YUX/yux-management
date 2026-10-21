import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const getCampaignFunnel=vi.fn();
vi.mock('@/services/radarService',()=>({radarService:{getCampaignFunnel:()=>getCampaignFunnel()}}));
const api=await import('./RadarCampaignFunnelPanel');
it('does not load technical campaign policies outside the global admin audience',async()=>{
 const container=document.createElement('div'),root=createRoot(container);
 try{await act(async()=>root.render(<api.RadarCampaignFunnelPanel isSystemAdmin={false} organizationId="org" campaignId="campaign"/>));expect(container.textContent).toBe('');expect(getCampaignFunnel).not.toHaveBeenCalled()}finally{act(()=>root.unmount())}
});
