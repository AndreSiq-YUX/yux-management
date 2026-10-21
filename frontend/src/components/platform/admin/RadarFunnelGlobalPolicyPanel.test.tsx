import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const getEmailDomainPolicy=vi.fn(),getFunnelFloors=vi.fn();
vi.mock('@/services/radarService',()=>({radarService:{getEmailDomainPolicy:()=>getEmailDomainPolicy(),getFunnelFloors:()=>getFunnelFloors()}}));
const api=await import('./RadarFunnelGlobalPolicyPanel').catch(()=>({})) as Record<string,any>;
it('never renders or fetches global policies for a non-system-admin',async()=>{
 const container=document.createElement('div'),root=createRoot(container);
 try{await act(async()=>root.render(<api.RadarFunnelGlobalPolicyPanel isSystemAdmin={false}/>));expect(container.textContent).toBe('');expect(getEmailDomainPolicy).not.toHaveBeenCalled();expect(getFunnelFloors).not.toHaveBeenCalled()}finally{act(()=>root.unmount())}
});
