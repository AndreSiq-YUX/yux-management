import { expect, it } from 'vitest'
import pg from 'pg'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { createIntegrationRig } from './support/rig.js'

it('separa credenciais de serviço e aplica isolamento RLS entre organizações', async () => {
  const rig = await createIntegrationRig()
  const apiPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api') }), 'api')
  const runtimePool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_runtime') }), 'runtime')
  try {
    const roles = await rig.sql(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
       FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
      [['yux_api', 'yux_migrator', 'yux_runtime', 'yux_worker']],
    )
    expect(roles.rows).toHaveLength(4)
    expect(roles.rows.every((role) => !role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && !role.rolcreatedb)).toBe(true)

    const tenantA = await runWithDatabaseRequestContext({
      role: 'client_member', organizationIds: [rig.ids.organizationA], serviceRole: 'api',
    }, () => apiPool.query(`SELECT organization_id,trade_name FROM public.organization_company_profiles ORDER BY trade_name`))
    expect(tenantA.rows).toEqual([{ organization_id: rig.ids.organizationA, trade_name: 'Empresa A' }])

    const tenantB = await runWithDatabaseRequestContext({
      role: 'client_member', organizationIds: [rig.ids.organizationB], serviceRole: 'api',
    }, () => apiPool.query(`SELECT organization_id,trade_name FROM public.organization_company_profiles ORDER BY trade_name`))
    expect(tenantB.rows).toEqual([{ organization_id: rig.ids.organizationB, trade_name: 'Empresa B' }])

    await expect(runWithDatabaseRequestContext({
      role: 'client_member', organizationIds: [rig.ids.organizationA], serviceRole: 'runtime',
    }, () => runtimePool.query('SELECT * FROM public.platform_provider_secrets'))).rejects.toThrow()
  } finally {
    await apiPool.end()
    await runtimePool.end()
    await rig.close()
  }
})
