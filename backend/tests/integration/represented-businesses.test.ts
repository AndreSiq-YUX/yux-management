import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
it('isolates represented companies, preserves them when business roles change and guards writes',async()=>{
  const rig=await createIntegrationRig({queueMode:'stub'})
  const root=`/api/company-intelligence/organizations/${rig.ids.organizationA}`
  try{
    const created=await rig.request('client_admin_A','POST',`${root}/represented-businesses`,{name:'Marca sintética',relationshipType:'both'})
    expect(created.statusCode).toBe(200)
    const id=created.body.id
    expect(created.body.version).toBe(1)
    const profile=(await rig.request('client_admin_A','GET',`${root}/profile`)).body
    const models=['commercial_representative','distributor']
    const saved=await rig.request('client_admin_A','PUT',`${root}/profile`,{...profile,businessModels:models})
    expect(saved.body.businessModels).toEqual(models)
    const {businessModels:_,...legacy}=saved.body
    expect((await rig.request('client_admin_A','PUT',`${root}/profile`,legacy)).body.businessModels).toEqual(models)
    expect((await rig.request('client_admin_A','PUT',`${root}/profile`,{...saved.body,businessModels:['service_provider']})).body.businessModels).toEqual(['service_provider'])
    expect((await rig.request('client_admin_A','GET',`${root}/represented-businesses`)).body.some((row:any)=>row.id===id)).toBe(true)
    for(const role of ['yux_admin','yux_operator','client_admin_A','client_member_A'] as const){
      const result=await rig.request(role,'PUT',`${root}/represented-businesses/${id}`,{expectedVersion:created.body.version,name:'Marca sintética',relationshipType:'both'})
      expect(result.statusCode).toBe(role==='client_member_A'?403:role==='yux_admin'?200:409)
    }
    expect((await rig.request('client_admin_B','PUT',`/api/company-intelligence/organizations/${rig.ids.organizationB}/represented-businesses/${id}`,{expectedVersion:1,name:'Tentativa cruzada',relationshipType:'both'})).statusCode).toBe(404)
    expect((await rig.request('client_member_A','GET',`${root}/represented-businesses`)).body.some((row:any)=>row.id===id)).toBe(true)
    expect(await rig.providerCalls()).toHaveLength(0)
  }finally{await rig.close()}
})
