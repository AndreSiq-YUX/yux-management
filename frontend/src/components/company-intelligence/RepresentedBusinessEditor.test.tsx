import {expect,it,vi} from 'vitest'
import {render,byText,click} from '@/components/portal-ui/__tests__/render'
import {RepresentedBusinessEditor} from './RepresentedBusinessEditor'
it('preserves the existing identity and commercial conditions when saving fails',async()=>{
 const value={id:'brand',organizationId:'org',version:4,name:'Massas de teste',relationshipType:'both' as const,description:'Produtos congelados',serviceRegions:['PR','SP'],authorizedLines:['Massas'],commercialConditions:'Consultar entrega',status:'active' as const,createdAt:'',updatedAt:''}
 const onSave=vi.fn().mockRejectedValue(new Error('conflict'))
 const view=await render(<RepresentedBusinessEditor value={value} onSave={onSave} onCancel={()=>{}}/>)
 await click(byText(view.container,'button','Salvar representada'))
 expect(onSave.mock.calls[0][0]).toMatchObject({name:value.name,commercialConditions:value.commercialConditions,serviceRegions:['PR','SP']})
 expect(view.container.textContent).toContain('Seu texto foi preservado')
 expect((view.container.querySelector('#represented-name') as HTMLInputElement).value).toBe(value.name)
 await view.unmount()
})
