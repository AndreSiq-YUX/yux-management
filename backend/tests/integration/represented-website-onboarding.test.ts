import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
it('imports only into the stored represented target and safely reuses stable product references',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub',stubJobQueue:{async add(){return {id:'test'}},async close(){}}})
 const org=rig.ids.organizationA,root=`/api/company-intelligence/organizations/${org}`
 try{
  const brand=(await rig.request('client_admin_A','POST',`${root}/represented-businesses`,{name:'Fabricante sintético',relationshipType:'both'})).body
  const profileBefore=(await rig.request('client_admin_A','GET',`${root}/profile`)).body
  let count=0
  for(let i=0;i<2;i++){
   const response=await rig.request('client_admin_A','POST',`${root}/website-onboarding`,{websiteUrl:'https://example.test/catalogo',maxPages:1,target:{kind:'represented_business',representedBusinessId:brand.id}})
   expect(response.statusCode).toBe(202)
   const run=response.body.run
   const row=await rig.sql(`INSERT INTO public.company_intelligence_suggestions(run_id,organization_id,suggestion_kind,field_path,current_value,suggested_value,evidence_excerpt,source_url,confidence) VALUES($1,$2,'product','products','null',$3::jsonb,'Catálogo','https://example.test/catalogo',0.9) RETURNING id`,[run.id,org,JSON.stringify([{name:'Lasanha',description:'Congelada',sku:'LAS-1',packaging:'1 kg'}])])
   await rig.sql("UPDATE public.knowledge_intelligence_runs SET status='ready_for_review' WHERE id=$1",[run.id])
   expect((await rig.request('client_admin_A','POST',`${root}/website-onboarding/${run.id}/apply`,{suggestionIds:[row.rows[0].id],target:{kind:'own_company'}})).statusCode).toBe(400)
   const applied=await rig.request('client_admin_A','POST',`${root}/website-onboarding/${run.id}/apply`,{suggestionIds:[row.rows[0].id]})
   expect(applied.statusCode).toBe(200)
   const list=(await rig.request('client_admin_A','GET',`${root}/represented-businesses/${brand.id}/products`)).body
   expect(list.items).toHaveLength(1);count=list.total
   expect(list.items[0].metadata.commercialAvailability).toBe('unconfirmed')
   expect(list.items[0].representedBusinessId).toBe(brand.id)
  }
  expect(count).toBe(1)
  expect((await rig.request('client_admin_A','GET',`${root}/profile`)).body).toEqual(profileBefore)
  expect((await rig.request('client_admin_B','POST',`/api/company-intelligence/organizations/${rig.ids.organizationB}/website-onboarding`,{websiteUrl:'https://example.test',target:{kind:'represented_business',representedBusinessId:brand.id}})).statusCode).toBe(404)
  expect(await rig.providerCalls()).toHaveLength(0)
 }finally{await rig.close()}
})
