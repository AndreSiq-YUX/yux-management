import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig } from './support/rig.js'

it('usa autenticação, API, PostgreSQL, Redis e dispatcher reais', async () => {
  const rig = await createIntegrationRig()
  try {
    const profile = await rig.request(
      'client_admin_A',
      'GET',
      `/api/company-intelligence/organizations/${rig.ids.organizationA}/profile`,
    )
    expect(profile.statusCode).toBe(200)

    const denied = await rig.request(
      'client_admin_B',
      'GET',
      `/api/company-intelligence/organizations/${rig.ids.organizationA}/profile`,
    )
    expect([403, 404]).toContain(denied.statusCode)

    const created = await rig.request(
      'client_admin_A',
      'POST',
      `/api/company-intelligence/organizations/${rig.ids.organizationA}/knowledge/text`,
      {
        contractId: rig.ids.contractA,
        title: `Conhecimento persistente ${randomUUID()}`,
        documentType: 'other',
        visibility: 'both',
        allowedAgentProfileKeys: [],
        blockedAgentProfileKeys: [],
        body: 'Este conteúdo atravessa a API, o banco, a fila e o dispatcher real.',
      },
    )
    expect(created.statusCode).toBe(202)
    expect(created.body.jobId).toBeTruthy()

    await rig.workerTick()
    const processing = await rig.request(
      'client_admin_A',
      'GET',
      `/api/company-intelligence/knowledge/${created.body.id}/processing`,
    )
    expect(processing.statusCode).toBe(200)
    expect(processing.body.document.status).toBe('indexed')
    expect(processing.body.run.status).toBe('degraded')

    await rig.restartApi()
    const afterRestart = await rig.request(
      'client_admin_A',
      'GET',
      `/api/company-intelligence/knowledge/${created.body.id}/processing`,
    )
    expect(afterRestart.statusCode).toBe(200)
    expect(afterRestart.body.document.status).toBe('indexed')

    expect((await rig.sql('SELECT current_database() AS name')).rows[0].name).toMatch(/^yux_test_/)
  } finally {
    await rig.close()
  }
})
