import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { getCompanyStrategyContext } from '../../src/modules/company-strategy/context.js'
import { verifyMissionKnowledgeContext } from '../../src/modules/action-engine/mission-source-verifier.js'

it('retrieves published company strategy across valid contracts, projects external guidance and enforces runtime scope', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const runtime = new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_runtime') })
  const worker = createContextAwarePool(new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')}),'worker')
  const root = `/api/company-intelligence/organizations/${rig.ids.organizationB}/strategies`
  const sectionId = randomUUID()
  const content = { schemaVersion: 1, title: 'Plano interno de expansão', objective: 'Priorizar mercados de maior margem', summary: 'Margem interna 25% e negociação reservada à equipe.', sections: [
    { id: sectionId, kind: 'constraints', title: 'Limites', body: 'Atender somente PR com oferta confirmada.', agentUse: 'external_guidance' },
    { id: randomUUID(), kind: 'audiences', title: 'Diagnóstico reservado', body: 'Não divulgar nossa margem nem a lista de concorrentes.', agentUse: 'internal' },
    { id: randomUUID(), kind: 'custom', title: 'Análise detalhada', body: 'Uma análise extensa de mercado. '.repeat(350), agentUse: 'internal' },
  ], references: { productIds: [], documentIds: [] } }
  const read = async ({org=rig.ids.organizationB,contract=rig.ids.contractB,profile='growth_strategist',audience='client_user',targetOrg=org,targetProfile=profile,targetAudience=audience,ids=[]}: {org?:string;contract?:string;profile?:string;audience?:string;targetOrg?:string;targetProfile?:string;targetAudience?:string;ids?:string[]}={}) => {
    const db = await runtime.connect()
    try {
      await db.query('BEGIN')
      await db.query("SELECT set_config('app.service_role','runtime',true),set_config('app.current_role','client_admin',true),set_config('app.current_orgs',$1,true),set_config('app.current_contract_id',$2,true),set_config('app.current_profile_key',$3,true),set_config('app.current_audience',$4,true)", [`{${org}}`,contract,profile,audience])
      return (await db.query('SELECT private.get_company_strategy_context_v1($1,$2,$3,$4,$5,$6::uuid[],$7) AS context', [targetOrg,contract,targetProfile,targetAudience,'expansão PR',ids,6000])).rows[0].context
    } finally { await db.query('ROLLBACK'); db.release() }
  }
  try {
    const draft = await rig.request('client_admin_B', 'POST', root, { content, expectedVersion: null, idempotencyKey: randomUUID() })
    expect(draft.statusCode).toBe(200)
    expect((await read({ids:[draft.body.id]})).selected).toEqual([])
    const publication = await rig.request('client_admin_B', 'POST', `${root}/${draft.body.id}/publish`, { expectedVersion: draft.body.version, revisionId: draft.body.draftRevision.id, expectedContentHash: draft.body.draftRevision.contentHash, idempotencyKey: randomUUID() })
    expect(publication.statusCode).toBe(200)
    const own = await read({ids:[draft.body.id]})
    expect(own.selected[0].revisionId).toBe(draft.body.draftRevision.id)
    expect(JSON.stringify(own.selected[0].sections)).toContain('Atender somente PR')
    expect(own.coverage.truncatedSections).toBeGreaterThan(0)
    for(let index=0;index<10;index++) {
      const extra=await rig.request('client_admin_B','POST',root,{expectedVersion:null,idempotencyKey:randomUUID(),content:{...content,title:`Frente comercial complementar ${index}`,objective:'Explorar outro mercado comercial',sections:[]}})
      await rig.request('client_admin_B','POST',`${root}/${extra.body.id}/publish`,{expectedVersion:extra.body.version,revisionId:extra.body.draftRevision.id,expectedContentHash:extra.body.draftRevision.contentHash,idempotencyKey:randomUUID()})
    }
    const broad=await read()
    expect(JSON.stringify({...broad,selected:broad.selected.map(({sourceContent:_source,...item}:any)=>item)}).length).toBeLessThanOrEqual(6000)
    const external = await read({profile:'ai_sdr_comercial_1',audience:'external_contact',ids:[draft.body.id]})
    expect(JSON.stringify(external)).not.toContain('Margem interna')
    expect(JSON.stringify(external)).not.toContain('Diagnóstico reservado')
    expect(JSON.stringify(external)).not.toContain('Plano interno de expansão')
    expect(external.selected[0].sections[0].id).toBe(sectionId)
    await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[rig.ids.organizationB],serviceRole:'worker'},async()=>{
      const context=await getCompanyStrategyContext(worker,{organizationId:rig.ids.organizationB,contractId:rig.ids.contractB,profileKey:'growth_strategist',audience:'client_user',query:'expansão',strategyIds:[draft.body.id]})
      const verified=await verifyMissionKnowledgeContext(worker,{organizationId:rig.ids.organizationB,contractId:rig.ids.contractB,audience:'client_user',sourceRefs:context.sources})
      expect(verified.knowledgeItems[0].kind).toBe('company_strategy')
      expect(verified.knowledgeItems[0].id).toBe(draft.body.draftRevision.id)
      expect(verified.sourceIds).toEqual([])
      await expect(verifyMissionKnowledgeContext(worker,{organizationId:rig.ids.organizationB,audience:'client_user',sourceRefs:[{...context.sources[0],contentHash:'f'.repeat(64)}]})).rejects.toThrow(/mission_source/)
      await expect(verifyMissionKnowledgeContext(worker,{organizationId:rig.ids.organizationA,audience:'client_user',sourceRefs:context.sources})).rejects.toThrow(/mission_source/)
    })
    const secondContract = randomUUID()
    await rig.sql("INSERT INTO public.contracts(id,client_id,package_id,status) SELECT $1,client_id,package_id,'active' FROM public.contracts WHERE id=$2", [secondContract,rig.ids.contractB])
    expect((await read({contract:secondContract,ids:[draft.body.id]})).selected[0].revisionId).toBe(draft.body.draftRevision.id)
    await expect(read({targetOrg:rig.ids.organizationA})).rejects.toThrow(/scope/)
    await expect(read({targetProfile:'ai_sdr_comercial_1'})).rejects.toThrow(/scope/)
    await expect(read({targetAudience:'internal_operator'})).rejects.toThrow(/scope/)
    await expect(read({contract:rig.ids.contractA})).rejects.toThrow(/scope/)
    await expect(read({ids:[randomUUID()]})).rejects.toThrow(/strategy.*scope/)
    await rig.request('client_admin_B','POST',`${root}/${draft.body.id}/archive`,{expectedVersion:publication.body.version})
    expect((await read()).selected.some((item:any)=>item.strategyId===draft.body.id)).toBe(false)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await runtime.end(); await worker.end(); await rig.close() }
})
