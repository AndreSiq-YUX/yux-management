import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

it('resolve contexto real para workspaces interno e cliente sem atravessar organizações', async () => {
  const rig = await createIntegrationRig()
  try {
    const internal = await rig.request(
      'yux_admin',
      'GET',
      `/api/workspace/organizations/${rig.ids.internalOrg}/context`,
    )
    expect(internal.statusCode).toBe(200)
    expect(internal.body).toMatchObject({
      schemaVersion: 1,
      organizationId: rig.ids.internalOrg,
      kind: 'internal_growth',
      contractId: null,
      role: 'yux_admin',
    })
    expect(internal.body.moduleKeys).toContain('whatsapp_ai')

    const operator = await rig.request(
      'yux_operator',
      'GET',
      `/api/workspace/organizations/${rig.ids.internalOrg}/context`,
    )
    expect(operator.statusCode).toBe(200)
    expect(operator.body).toMatchObject({
      role: 'yux_operator',
      canConfigure: true,
      missionCreation: { mode: 'form' },
    })

    const client = await rig.request(
      'client_admin_A',
      'GET',
      `/api/workspace/organizations/${rig.ids.organizationA}/context`,
    )
    expect(client.statusCode).toBe(200)
    expect(client.body).toMatchObject({
      organizationId: rig.ids.organizationA,
      kind: 'client',
      contractId: rig.ids.contractA,
      role: 'client_admin',
    })
    expect(client.body.moduleKeys).toContain('whatsapp_ai')

    const readOnly = await rig.request(
      'client_member_A',
      'GET',
      `/api/workspace/organizations/${rig.ids.organizationA}/context`,
    )
    expect(readOnly.statusCode).toBe(200)
    expect(readOnly.body).toMatchObject({
      role: 'client_member',
      missionCreation: { mode: 'unavailable' },
    })

    const denied = await rig.request(
      'client_admin_B',
      'GET',
      `/api/workspace/organizations/${rig.ids.organizationA}/context`,
    )
    expect(denied.statusCode).toBe(403)
  } finally {
    await rig.close()
  }
})
