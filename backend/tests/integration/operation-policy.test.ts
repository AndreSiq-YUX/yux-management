import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

it('nega publicação por consulta genérica e mantém leitura segura de revisões', async () => {
  const rig = await createIntegrationRig()
  try {
    const mutation = await rig.request('client_member_A', 'POST', '/api/marketing-studio/query', {
      table: 'marketing_knowledge_documents',
      operation: 'update',
      values: { status: 'published' },
      filters: [{ column: 'id', op: 'eq', value: rig.ids.documentA }],
    })
    expect(mutation.statusCode).toBe(403)
    expect((await rig.sql('SELECT status FROM public.marketing_knowledge_documents WHERE id=$1', [rig.ids.documentA])).rows[0].status).toBe('draft')

    const reviews = await rig.request(
      'client_member_A', 'GET', `/api/marketing-studio/portal/reviews?contractId=${rig.ids.contractA}`,
    )
    expect(reviews.statusCode).toBe(200)
    expect(reviews.body).toEqual([])

    const crossTenant = await rig.request(
      'client_member_A', 'GET', `/api/marketing-studio/portal/reviews?contractId=${rig.ids.contractB}`,
    )
    expect(crossTenant.statusCode).toBe(403)
  } finally {
    await rig.close()
  }
})
