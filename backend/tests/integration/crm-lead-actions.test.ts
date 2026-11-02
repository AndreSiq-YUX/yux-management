import {afterAll,beforeAll,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createIntegrationRig,type IntegrationRig} from './support/rig.js'
import {createRecordProfileFixture} from './support/crm-record-profile-fixtures.js'
let rig:IntegrationRig,fixture:Awaited<ReturnType<typeof createRecordProfileFixture>>,leadId:string
beforeAll(async()=>{
 rig=await createIntegrationRig({queueMode:'stub'});fixture=await createRecordProfileFixture(rig)
 leadId=(await rig.request('client_admin_A','POST','/api/crm/leads',{organizationId:fixture.organizationId,crmInstanceId:fixture.instanceId,pipelineId:fixture.pipelineId,stageId:fixture.stageId,name:'Ações reais',email:'lead@empresa.test',source:'Manual'})).body.id
})
afterAll(async()=>{await rig?.close()})
it('persists notes, meetings and scheduled tasks atomically and prevents duplicate submissions',async()=>{
 const note={kind:'note',title:'Conversa comercial',description:'Solicitou retorno',requestId:randomUUID()}
 const first=await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,note)
 expect(first.statusCode,JSON.stringify(first.body)).toBe(201)
 expect((await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,note)).body).toEqual(first.body)
 const dueAt='2026-11-20T13:00:00.000Z'
 const meeting=await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,{kind:'meeting',title:'Reunião com compras',description:'Apresentar catálogo',dueAt,requestId:randomUUID()})
 expect(meeting.statusCode,JSON.stringify(meeting.body)).toBe(201)
 const tasks=await rig.request('client_admin_A','GET',`/api/crm/leads/${leadId}/tasks`)
 expect(tasks.body.find((t:any)=>t.id===meeting.body.taskId)).toMatchObject({title:'Reunião com compras',dueAt})
 const history=await rig.request('client_admin_A','GET',`/api/crm/leads/${leadId}/interactions`)
 expect(history.body.filter((i:any)=>i.title==='Conversa comercial')).toHaveLength(1)
 expect(history.body.find((i:any)=>i.type==='meeting').title).toBe('Reunião com compras')
 expect((await rig.sql('SELECT next_follow_up_at FROM leads WHERE id=$1',[leadId])).rows[0].next_follow_up_at.toISOString()).toBe(dueAt)
 expect((await rig.request('client_admin_B','POST',`/api/crm/leads/${leadId}/activities`,{...note,requestId:randomUUID()})).statusCode).toBe(404)
})
it('validates scheduling and reports unavailable email delivery without fabricating send success',async()=>{
 const invalid=await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,{kind:'meeting',title:'Sem data',description:'Teste',requestId:randomUUID()})
 expect(invalid.statusCode).toBe(400)
 const email=await rig.request('client_admin_A','GET',`/api/crm/leads/${leadId}/email`)
 expect(email.statusCode).toBe(200);expect(email.body.canSend).toBe(false);expect(email.body.message).toBeTruthy()
 const send=await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/email`,{requestId:randomUUID(),subject:'Catálogo',body:'Conteúdo'})
 expect(send.statusCode).toBe(422)
 expect((await rig.sql('SELECT id FROM email_send_requests WHERE lead_id=$1',[leadId])).rows).toHaveLength(0)
 expect(await rig.providerCalls()).toHaveLength(0)
})
