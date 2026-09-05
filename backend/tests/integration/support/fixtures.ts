import type pg from 'pg'
import { hashPassword } from '../../../src/auth/password.js'

export const fixtureIds = {
  organizationA: '10000000-0000-4000-8000-000000000001',
  organizationB: '10000000-0000-4000-8000-000000000002',
  internalOrg: '10000000-0000-4000-8000-000000000003',
  clientA: '20000000-0000-4000-8000-000000000001',
  clientB: '20000000-0000-4000-8000-000000000002',
  contractA: '30000000-0000-4000-8000-000000000001',
  contractB: '30000000-0000-4000-8000-000000000002',
  documentA: '60000000-0000-4000-8000-000000000001',
  missionA: '80000000-0000-4000-8000-000000000001',
} as const

export const fixturePassword = 'integration-password'
export const integrationRolePassword = 'integration-service-password'

export async function provisionIntegrationServiceRoles(pool: pg.Pool) {
  await pool.query(`ALTER ROLE yux_api PASSWORD '${integrationRolePassword}'`)
  await pool.query(`ALTER ROLE yux_worker PASSWORD '${integrationRolePassword}'`)
  await pool.query(`ALTER ROLE yux_runtime PASSWORD '${integrationRolePassword}'`)
}

export const fixtureUsers = {
  yux_admin: { id: '40000000-0000-4000-8000-000000000001', email: 'yux-admin@integration.test', role: 'yux_admin', name: 'YUX Admin' },
  yux_operator: { id: '40000000-0000-4000-8000-000000000002', email: 'yux-operator@integration.test', role: 'yux_operator', name: 'YUX Operator' },
  client_admin_A: { id: '40000000-0000-4000-8000-000000000003', email: 'admin-a@integration.test', role: 'client_admin', name: 'Admin A' },
  client_member_A: { id: '40000000-0000-4000-8000-000000000004', email: 'member-a@integration.test', role: 'client_member', name: 'Member A' },
  client_admin_B: { id: '40000000-0000-4000-8000-000000000005', email: 'admin-b@integration.test', role: 'client_admin', name: 'Admin B' },
} as const

export async function seedIntegrationFixtures(pool: pg.Pool) {
  const passwordHash = await hashPassword(fixturePassword)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const user of Object.values(fixtureUsers)) {
      const legacyRole = user.role === 'yux_admin' ? 'ADMIN' : user.role === 'yux_operator' ? 'MANAGER' : 'CLIENT'
      await client.query(
        `INSERT INTO public.users (id, name, role)
         VALUES ($1,$2,$3::public.user_role)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role`,
        [user.id, user.name, legacyRole],
      )
      await client.query(
        `INSERT INTO public.app_users (id,email,password_hash,display_name,role,is_active)
         VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,
           display_name=EXCLUDED.display_name,role=EXCLUDED.role,is_active=TRUE`,
        [user.id, user.email, passwordHash, user.name, user.role],
      )
    }

    await client.query(
      `INSERT INTO public.clients (id,user_id,company_name,contact_name,email,sector,size,lead_source,status)
       VALUES ($1,$2,'Empresa A','Admin A','empresa-a@integration.test','Tecnologia','small','integration','active'),
              ($3,$4,'Empresa B','Admin B','empresa-b@integration.test','Serviços','small','integration','active')
       ON CONFLICT (id) DO UPDATE SET company_name=EXCLUDED.company_name,status='active'`,
      [fixtureIds.clientA, fixtureUsers.client_admin_A.id, fixtureIds.clientB, fixtureUsers.client_admin_B.id],
    )
    await client.query(
      `INSERT INTO public.organizations (id,name,slug,kind,client_id)
       VALUES ($1,'Empresa A','integration-empresa-a','client',$2),
              ($3,'Empresa B','integration-empresa-b','client',$4),
              ($5,'YUX Interna','integration-yux','yux',NULL)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,client_id=EXCLUDED.client_id`,
      [fixtureIds.organizationA, fixtureIds.clientA, fixtureIds.organizationB, fixtureIds.clientB, fixtureIds.internalOrg],
    )
    await client.query(
      `INSERT INTO public.memberships (user_id,organization_id,role_key)
       VALUES ($1,$2,'yux_admin'),($3,$2,'yux_manager'),($4,$5,'client_admin'),
              ($6,$5,'client_member'),($7,$8,'client_admin')
       ON CONFLICT (user_id,organization_id) DO UPDATE SET role_key=EXCLUDED.role_key`,
      [
        fixtureUsers.yux_admin.id, fixtureIds.internalOrg,
        fixtureUsers.yux_operator.id,
        fixtureUsers.client_admin_A.id, fixtureIds.organizationA,
        fixtureUsers.client_member_A.id,
        fixtureUsers.client_admin_B.id, fixtureIds.organizationB,
      ],
    )
    await client.query(
      `INSERT INTO public.packages (id,key,name,description)
       VALUES ('31000000-0000-4000-8000-000000000001','integration-package','Integration','Fixture')
       ON CONFLICT (id) DO NOTHING`,
    )
    await client.query(
      `INSERT INTO public.contracts (id,client_id,package_id,status)
       VALUES ($1,$2,'31000000-0000-4000-8000-000000000001','active'),
              ($3,$4,'31000000-0000-4000-8000-000000000001','active')
       ON CONFLICT (id) DO UPDATE SET status='active'`,
      [fixtureIds.contractA, fixtureIds.clientA, fixtureIds.contractB, fixtureIds.clientB],
    )
    await client.query(
      `INSERT INTO public.contract_modules (contract_id,module_key,enabled)
       SELECT contract_id,module_key,TRUE
       FROM (VALUES ($1::uuid),($2::uuid)) contracts(contract_id)
       CROSS JOIN (VALUES ('marketing_studio'),('crm'),('automations'),('whatsapp_ai')) modules(module_key)
       ON CONFLICT (contract_id,module_key) DO UPDATE SET enabled=TRUE`,
      [fixtureIds.contractA, fixtureIds.contractB],
    )
    await client.query(
      `INSERT INTO public.organization_company_profiles (organization_id,legal_name,trade_name,description)
       VALUES ($1,'Empresa A Ltda','Empresa A','Tenant A'),($2,'Empresa B Ltda','Empresa B','Tenant B')
       ON CONFLICT (organization_id) DO UPDATE SET legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,description=EXCLUDED.description`,
      [fixtureIds.organizationA, fixtureIds.organizationB],
    )

    await client.query(
      `INSERT INTO public.knowledge_sources (id,organization_id,source_type,name,status,visibility)
       VALUES ('50000000-0000-4000-8000-000000000001',$1,'manual','Documento A inicial','draft','both')
       ON CONFLICT (id) DO NOTHING`,
      [fixtureIds.organizationA],
    )
    await client.query(
      `INSERT INTO public.marketing_knowledge_documents
        (id,organization_id,client_id,contract_id,source_id,title,document_type,status,summary)
       VALUES ($1,$2,$3,$4,'50000000-0000-4000-8000-000000000001','Documento A inicial','other','draft','Fixture')
       ON CONFLICT (id) DO NOTHING`,
      [fixtureIds.documentA, fixtureIds.organizationA, fixtureIds.clientA, fixtureIds.contractA],
    )
    await client.query(
      `INSERT INTO public.action_packs (id,key,name,description)
       VALUES ('70000000-0000-4000-8000-000000000001','integration_pack','Integration Pack','Fixture')
       ON CONFLICT (id) DO NOTHING`,
    )
    await client.query(
      `INSERT INTO public.action_pack_versions
        (id,pack_id,semantic_version,outcome_type,status,definition,content_hash,created_by)
       VALUES ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
               '1.0.0','integration','published','{}'::jsonb,repeat('a',64),$1)
       ON CONFLICT (id) DO NOTHING`,
      [fixtureUsers.yux_admin.id],
    )
    await client.query(
      `INSERT INTO public.action_missions
        (id,organization_id,contract_id,pack_version_id,title,objective,status,mode,create_idempotency_key,created_by)
       VALUES ($1,$2,$3,'71000000-0000-4000-8000-000000000001','Missão A','Fixture persistente','draft','assisted','integration-mission-a',$4)
       ON CONFLICT (id) DO NOTHING`,
      [fixtureIds.missionA, fixtureIds.organizationA, fixtureIds.contractA, fixtureUsers.client_admin_A.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
