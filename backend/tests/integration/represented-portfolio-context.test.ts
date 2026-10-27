import pg from 'pg'
import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
it('retrieves beyond ten products with real runtime scope and excludes internal information externally',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'})
 const runtime=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_runtime')})
 const org=rig.ids.organizationB,root=`/api/company-intelligence/organizations/${org}`
 try{
  const brand=(await rig.request('client_admin_B','POST',`${root}/represented-businesses`,{name:'Marca de homologação',relationshipType:'distribution',commercialConditions:'Margem interna reservada'})).body
  const products=[]
  for(let index=0;index<35;index++){
   const response=await rig.request('client_admin_B','POST',`${root}/represented-businesses/${brand.id}/products`,{name:index===31?'Lasanha termoespecial':'Produto genérico',description:'Congelado',details:{packaging:index===31?'1 kg':'500 g',storageConditions:'Manter congelado',serviceRegions:['PR']}})
   expect(response.statusCode).toBe(200);products.push(response.body)
  }
  const contract=products[0].contractId
  const read=async(audience='external_contact',targetOrg=org,ids=[brand.id])=>{
   const client=await runtime.connect()
   try{
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.service_role','runtime',true),set_config('app.current_role','client_admin',true),set_config('app.current_orgs',$1,true),set_config('app.current_contract_id',$2,true),set_config('app.current_profile_key','ai_sdr_comercial_1',true),set_config('app.current_audience',$3,true)",[`{${org}}`,contract,audience])
    return (await client.query('SELECT private.get_company_portfolio_context_v1($1,$2,$3,$4,$5,$6::uuid[],$7,$8) AS context',[targetOrg,contract,'ai_sdr_comercial_1',audience,'termoespecial',ids,0,20])).rows[0].context
   }finally{await client.query('ROLLBACK');client.release()}
  }
  const context=await read()
  expect(context.items[0].id).toBe(products[31].id)
  expect(context.items[0].packaging).toBe('1 kg')
  expect(context.items[0].commercialAvailability).toBe('unconfirmed')
  expect(JSON.stringify(context)).not.toContain('Margem interna')
  await expect(read('external_contact',rig.ids.organizationA)).rejects.toThrow(/scope/)
  await expect(read('external_contact',org,[rig.ids.organizationA])).rejects.toThrow(/scope/)
  await rig.request('client_admin_B','POST',`${root}/represented-businesses/${brand.id}/archive`,{expectedVersion:brand.version})
  expect((await read()).items).toEqual([])
  expect((await rig.sql('SELECT id FROM public.marketing_products_services WHERE id=$1',[products[31].id])).rows).toHaveLength(1)
 }finally{await runtime.end();await rig.close()}
})
