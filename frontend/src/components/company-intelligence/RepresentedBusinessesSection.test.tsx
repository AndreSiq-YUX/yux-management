import {expect,it,vi} from 'vitest'
import {render,byText,click} from '@/components/portal-ui/__tests__/render'
vi.mock('@/services/companyIntelligenceService',()=>({companyIntelligenceService:{listRepresentedBusinesses:vi.fn().mockResolvedValue([{id:'brand',name:'Marca cadastrada',status:'active',version:1,description:'',serviceRegions:[],authorizedLines:[],commercialConditions:'',relationshipType:'both'}])}}))
import {RepresentedBusinessesSection} from './RepresentedBusinessesSection'
it('keeps existing brands accessible even after changing business roles',async()=>{
 const view=await render(<RepresentedBusinessesSection organizationId="org" canWrite={false} businessModels={[]} />)
 expect(view.container.textContent).toContain('Empresas e marcas representadas')
 expect(view.container.textContent).toContain('Marca cadastrada')
 expect(byText(view.container,'button','Adicionar representada')).toBeNull()
 await view.unmount()
})
