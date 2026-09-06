import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { strategyCurationItemSchema, strategyItemHash } from '../../src/modules/strategy-engine/curation.js'
import { fixtureIds, fixtureUsers } from '../integration/support/fixtures.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from '../integration/support/rig.js'

const acceptanceIds = {
  lead: 'a1000000-0000-4000-8000-000000000001',
  task: 'a1000000-0000-4000-8000-000000000002',
  connection: 'a1000000-0000-4000-8000-000000000003',
  contact: 'a1000000-0000-4000-8000-000000000004',
  conversation: 'a1000000-0000-4000-8000-000000000005',
  publishingConnection: 'a1000000-0000-4000-8000-000000000006',
  strategyPack: 'a1000000-0000-4000-8000-000000000007',
  strategyDocument: 'a1000000-0000-4000-8000-000000000008',
  strategyItem: 'a1000000-0000-4000-8000-000000000009',
} as const

const rig = await createIntegrationRig({ corsOrigin: 'http://127.0.0.1:4173' })
await seedAcceptanceRecords()
await rig.listen(4000)
const controlServer = createServer(async (request, response) => {
  if (request.headers.authorization !== 'Bearer acceptance-control-token') {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'invalid_control_token' }))
    return
  }
  try {
    if (request.method === 'POST' && request.url === '/worker-tick') {
      await rig.workerTick()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ drained: true }))
      return
    }
    if (request.method === 'GET' && request.url === '/provider-calls') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(await rig.providerCalls()))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not_found' }))
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'acceptance_control_failed' }))
  }
})
await new Promise<void>((resolve, reject) => {
  controlServer.once('error', reject)
  controlServer.listen(4002, '127.0.0.1', resolve)
})
process.stdout.write('acceptance-backend-ready\n')

async function seedAcceptanceRecords() {
  await rig.sql(
    `INSERT INTO public.leads (id,organization_id,client_id,name,email,source,stage,status)
     VALUES ($1,$2,$3,'Lead aceitação browser','journey-browser@integration.test','integration','NEW','open')
     ON CONFLICT (id) DO UPDATE SET status='open', updated_at=NOW()`,
    [acceptanceIds.lead, fixtureIds.organizationA, fixtureIds.clientA],
  )
  await rig.sql(
    `INSERT INTO public.lead_tasks (id,organization_id,lead_id,title,due_at,assigned_to,completed_at,metadata)
     VALUES ($1,$2,$3,'Validar jornada browser',NOW(),$4,NULL,'{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET completed_at=NULL, due_at=NOW(), assigned_to=EXCLUDED.assigned_to, metadata='{}'::jsonb`,
    [acceptanceIds.task, fixtureIds.organizationA, acceptanceIds.lead, fixtureUsers.client_admin_A.id],
  )
  await rig.sql(
    `INSERT INTO public.channel_connections (
       id,organization_id,channel,name,is_active,adapter_key,inbound_token_hash,
       phone_number_id,provider_verify_state,token_state,health_status
     ) VALUES ($1,$2,'whatsapp','WhatsApp aceitação',TRUE,'meta_whatsapp','acceptance-hash',
       'acceptance-phone','verified','connected','connected')
     ON CONFLICT (id) DO UPDATE SET is_active=TRUE, provider_verify_state='verified', token_state='connected', health_status='connected'`,
    [acceptanceIds.connection, fixtureIds.organizationA],
  )
  await rig.sql(
    `INSERT INTO public.omnichannel_contacts (id,organization_id,display_name,phone,external_identities)
     VALUES ($1,$2,'Contato aceitação','+5511999999999','{"providerExternalId":"acceptance-contact"}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name`,
    [acceptanceIds.contact, fixtureIds.organizationA],
  )
  await rig.sql(
    `INSERT INTO public.conversations (
       id,organization_id,contact_id,connection_id,channel,status,response_mode,last_message_at
     ) VALUES ($1,$2,$3,$4,'whatsapp','open','automatic',NOW())
     ON CONFLICT (id) DO UPDATE SET status='open', response_mode='automatic', assigned_user_id=NULL,
       assigned_team_id=NULL, last_message_at=NOW(), resolved_at=NULL`,
    [acceptanceIds.conversation, fixtureIds.organizationA, acceptanceIds.contact, acceptanceIds.connection],
  )
  await rig.sql(
    `INSERT INTO public.messages (
       conversation_id,connection_id,direction,author_type,content_type,body,
       external_message_id,delivery_status,metadata
     ) VALUES ($1,$2,'inbound','contact','text','Preciso de atendimento','acceptance-message','delivered','{}'::jsonb)
     ON CONFLICT (connection_id,external_message_id) WHERE external_message_id IS NOT NULL
     DO UPDATE SET body=EXCLUDED.body, delivery_status='delivered'`,
    [acceptanceIds.conversation, acceptanceIds.connection],
  )
  const strategySource = 'Antes de recomendar uma solução, confirme problema, impacto e critério de sucesso.'
  const strategySourceHash = createHash('sha256').update(strategySource).digest('hex')
  const strategyPayload = {
    kind: 'concept_card', title: 'Diagnóstico governado de aceitação', principle: 'Confirmar contexto antes da oferta',
    problem: 'Recomendação prematura', diagnosticQuestions: ['Qual problema precisa ser resolvido?'],
    applicability: ['Venda consultiva'], contraindications: ['Necessidade já confirmada'],
    decisionRules: ['Diagnosticar primeiro'], recommendedActions: ['Perguntar e confirmar'],
    successCriteria: ['Problema e impacto confirmados'],
    evidence: [{ documentId: acceptanceIds.strategyDocument, documentHash: strategySourceHash, locator: 'section:1', section: 'section:1', excerpt: 'confirme problema, impacto e critério de sucesso', claimType: 'literal' }],
    confidence: 0.96, conflicts: [], embedding: [1, 0], embeddingModel: 'integration-embedding', embeddingDimensions: 2, embeddingStatus: 'ready',
  }
  await rig.sql(
    `INSERT INTO public.yux_strategy_packs (
       id,pack_key,name,description,scope,visibility,status,owner_organization_id,target_profile_keys,target_modules
     ) VALUES ($1,'acceptance_book','Pack livro aceitação','Fonte inédita controlada','client','internal_only','draft',$2,
       ARRAY['growth_strategist'],ARRAY['crm'])
     ON CONFLICT (id) DO UPDATE SET status='draft', owner_organization_id=EXCLUDED.owner_organization_id`,
    [acceptanceIds.strategyPack, fixtureIds.organizationA],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_source_documents (
       id,organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,source_hash,source_origin,human_review_status
     ) VALUES ($1,$2,$2,'client','internal_only','pdf','Livro de aceitação',$3,'document_extracted','approved')
     ON CONFLICT (id) DO UPDATE SET source_hash=EXCLUDED.source_hash, human_review_status='approved'`,
    [acceptanceIds.strategyDocument, fixtureIds.organizationA, strategySourceHash],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_source_chunks (
       document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,visibility,human_review_status,metadata
     ) VALUES ($1,'section',0,$2,$3,20,'internal','internal_only','approved','{"sourceLocator":"section:1"}'::jsonb)
     ON CONFLICT (document_id,chunk_hash) DO UPDATE SET chunk_text=EXCLUDED.chunk_text`,
    [acceptanceIds.strategyDocument, createHash('sha256').update(`chunk:${strategySource}`).digest('hex'), strategySource],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_items (
       id,pack_id,item_type,title,summary,body,profile_keys,status,priority,payload,source_origin,source_document_id,content_hash,confidence
     ) VALUES ($1,$2,'concept_card',$3,$4,$5,ARRAY['growth_strategist'],'proposed',1,$6::jsonb,'document_extracted',$7,$8,0.96)
     ON CONFLICT (id) DO UPDATE SET status='proposed',payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,source_document_id=EXCLUDED.source_document_id`,
    [acceptanceIds.strategyItem, acceptanceIds.strategyPack, strategyPayload.title, strategyPayload.problem, strategyPayload.principle,
      JSON.stringify(strategyPayload), acceptanceIds.strategyDocument, strategyItemHash(strategyCurationItemSchema.parse(strategyPayload))],
  )
  await rig.sql(
    `INSERT INTO public.publishing_connections (
       id,organization_id,client_id,contract_id,provider,name,status,site_url,auth_type,provider_asset_id
     ) VALUES ($1,$2,$3,$4,'meta_facebook','Facebook aceitação','connected',
       'https://facebook.com/integration','token_reference','acceptance-page')
     ON CONFLICT (id) DO UPDATE SET status='connected', provider_asset_id='acceptance-page'`,
    [acceptanceIds.publishingConnection, fixtureIds.organizationA, fixtureIds.clientA, fixtureIds.contractA],
  )
  const secretPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 1 })
  try {
    const secret = await storeProviderSecretToPool(secretPool, {
      organizationId: fixtureIds.organizationA,
      clientId: fixtureIds.clientA,
      contractId: fixtureIds.contractA,
      provider: 'meta_social',
      targetKind: 'publishing',
      connectionTable: 'publishing_connections',
      connectionId: acceptanceIds.publishingConnection,
      secretKind: 'access_token',
      value: 'acceptance-provider-token',
    }, new Uint8Array(32).fill(7))
    await rig.sql('UPDATE public.publishing_connections SET token_reference=$2 WHERE id=$1', [acceptanceIds.publishingConnection, secret.reference])
  } finally {
    await secretPool.end()
  }
}

let closing = false
async function close() {
  if (closing) return
  closing = true
  await new Promise<void>((resolve, reject) => controlServer.close(error => error ? reject(error) : resolve()))
  await rig.close()
  process.exit(0)
}

process.on('SIGINT', () => { void close() })
process.on('SIGTERM', () => { void close() })
