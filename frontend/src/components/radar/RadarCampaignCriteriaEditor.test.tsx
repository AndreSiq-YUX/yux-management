import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const save=vi.fn(),search=vi.fn();
vi.mock('@/services/radarService',()=>({radarService:{saveCommercialCriteria:()=>save(),searchCnaeCatalog:()=>search()}}));
const api=await import('./RadarCampaignCriteriaEditor');
it('shows only business criteria and never fetches or saves anything for a read-only viewer',async()=>{
 const container=document.createElement('div'),root=createRoot(container);
 try{await act(async()=>root.render(<api.RadarCampaignCriteriaEditor campaign={{id:'campaign',organizationId:'org',configurationRevision:1,criteria:{}}} canEdit={false} onSaved={vi.fn()}/>));
 expect(container.textContent).toContain('Público-alvo e filtros');expect(container.textContent).not.toMatch(/Brave|Serper|CNPJá|Perplexity|modelo|probabilidade|calibra/i);
 expect([...container.querySelectorAll('button')].every(button=>button.disabled)).toBe(true);expect(save).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();
 }finally{act(()=>root.unmount())}
});
