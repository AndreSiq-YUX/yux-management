import {randomUUID} from 'node:crypto'
import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
it('keeps homonymous products separate, validates references and updates without losing metadata',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'})
 const root=`/api/company-intelligence/organizations/${rig.ids.organizationA}`
 try{
  const brands=[]
  for(const name of ['Marca A','Marca B'])brands.push((await rig.request('client_admin_A','POST',`${root}/represented-businesses`,{name,relationshipType:'both'})).body)
  const products:any[]=[]
  for(const brand of brands){const response=await rig.request('client_admin_A','POST',`${root}/represented-businesses/${brand.id}/products`,{name:'Lasanha',description:'Produto de teste',details:{packaging:brand.name==='Marca A'?'1 kg':'500 g'}});expect(response.statusCode).toBe(200);products.push(response.body)}
  expect(new Set(products.map(product=>product.representedBusinessId)).size).toBe(2)
  await rig.sql(`UPDATE public.marketing_products_services SET metadata=metadata||'{"legacy":"keep"}'::jsonb WHERE id=$1`,[products[0].id])
  const current=(await rig.request('client_admin_A','GET',`${root}/represented-businesses/${brands[0].id}/products`)).body.items.find((item:any)=>item.id===products[0].id)
  const edited=await rig.request('client_admin_A','PUT',`${root}/represented-businesses/${brands[0].id}/products/${products[0].id}`,{name:'Lasanha',description:'Descrição revisada',details:{packaging:'1 kg'},expectedUpdatedAt:current.updatedAt})
  expect(edited.statusCode).toBe(200)
  expect(edited.body.metadata.legacy).toBe('keep')
  expect((await rig.request('client_admin_A','PUT',`${root}/represented-businesses/${brands[0].id}/products/${products[0].id}`,{name:'Lasanha',description:'Edição antiga',expectedUpdatedAt:products[0].updatedAt})).statusCode).toBe(409)
  const foreign=`/api/company-intelligence/organizations/${rig.ids.organizationB}/represented-businesses/${brands[0].id}/products`
  expect((await rig.request('client_admin_B','POST',foreign,{name:'Forjado',description:'Não deve salvar'})).statusCode).toBe(404)
  expect((await rig.request('client_member_A','POST',`${root}/represented-businesses/${brands[0].id}/products`,{name:'Forjado',description:'Não deve salvar'})).statusCode).toBe(403)
  const strategy={schemaVersion:1,title:'Estratégia multimarcas',objective:'Captar cozinhas para o representante',summary:'Distinguir marcas e condições comerciais por região.',sections:[],references:{productIds:[],documentIds:[],representedBusinessIds:[brands[0].id]}}
  const draft=await rig.request('client_admin_A','POST',`${root}/strategies`,{expectedVersion:null,content:strategy,idempotencyKey:randomUUID()})
  expect(draft.statusCode).toBe(200)
  strategy.references.representedBusinessIds=[randomUUID()]
  expect((await rig.request('client_admin_A','POST',`${root}/strategies`,{expectedVersion:null,content:strategy,idempotencyKey:randomUUID()})).statusCode).toBe(404)
  const publication=await rig.request('client_admin_A','POST',`${root}/strategies/${draft.body.id}/publish`,{expectedVersion:draft.body.version,revisionId:draft.body.draftRevision.id,expectedContentHash:draft.body.draftRevision.contentHash,idempotencyKey:randomUUID()})
  expect(publication.statusCode).toBe(200)
  expect((await rig.request('client_admin_A','POST',`${root}/represented-businesses/${brands[0].id}/archive`,{expectedVersion:brands[0].version})).statusCode).toBe(200)
  const archivedLink={...strategy,references:{...strategy.references,representedBusinessIds:[brands[0].id]}}
  expect((await rig.request('client_admin_A','PUT',`${root}/strategies/${draft.body.id}/draft`,{expectedVersion:publication.body.version,content:archivedLink,idempotencyKey:randomUUID()})).statusCode).toBe(404)
  const repaired=await rig.request('client_admin_A','PUT',`${root}/strategies/${draft.body.id}/draft`,{expectedVersion:publication.body.version,content:{...archivedLink,references:{...archivedLink.references,representedBusinessIds:[]}},idempotencyKey:randomUUID()})
  expect(repaired.statusCode).toBe(200)
  expect(repaired.body.publishedRevision.content.references.representedBusinessIds).toEqual([brands[0].id])
  expect(repaired.body.draftRevision.content.references.representedBusinessIds).toEqual([])

 }finally{await rig.close()}
})
