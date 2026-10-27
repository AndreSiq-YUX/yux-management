import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import pg from 'pg'

const content = (summary = 'Priorizar serviços preventivos e atendimento da região.') => ({ schemaVersion: 1, title: 'Estratégia comercial da oficina', objective: 'Aumentar os agendamentos de revisão', summary, sections: [{ id: '0a000000-0000-4000-8000-000000000001', kind: 'audiences', title: 'Públicos', body: 'Motoristas da região com manutenção preventiva.', agentUse: 'external_guidance' }], references: { productIds: [], documentIds: [] } })

it('keeps the published revision while editing, rejects stale writes and replays safely', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const root = `/api/company-intelligence/organizations/${rig.ids.organizationA}/strategies`
  try {
    const command = { expectedVersion: null, content: content(), idempotencyKey: randomUUID() }
    const created = await rig.request('client_admin_A', 'POST', root, command)
    expect(created.statusCode).toBe(200)
    expect(created.body).toMatchObject({ version: 1, publishedRevision: null })
    const id = created.body.id
    const replay = await rig.request('client_admin_A', 'POST', root, command)
    expect(replay.body.id).toBe(id)
    const revision1 = created.body.draftRevision
    const published = await rig.request('client_admin_A', 'POST', `${root}/${id}/publish`, { revisionId: revision1.id, expectedVersion: 1, expectedContentHash: revision1.contentHash, idempotencyKey: randomUUID() })
    expect(published.statusCode).toBe(200)
    expect(published.body.publishedRevision.id).toBe(revision1.id)
    const saved = await rig.request('client_admin_A', 'PUT', `${root}/${id}/draft`, { expectedVersion: published.body.version, content: content('Nova estratégia ainda em análise, sem ativação nos agentes.'), idempotencyKey: randomUUID() })
    expect(saved.statusCode).toBe(200)
    expect(saved.body.publishedRevision.id).toBe(revision1.id)
    expect(saved.body.draftRevision.id).not.toBe(revision1.id)
    const stale = await rig.request('client_admin_A', 'PUT', `${root}/${id}/draft`, { expectedVersion: published.body.version, content: content('Uma edição que não pode sobrescrever a nova versão.'), idempotencyKey: randomUUID() })
    expect(stale.statusCode).toBe(409)
    const member = await rig.request('client_member_A', 'GET', `${root}/${id}`)
    expect(member.statusCode).toBe(200)
    expect(member.body.draftRevision).toBeNull()
    const history = await rig.request('client_admin_A', 'GET', `${root}/${id}/revisions`)
    expect(history.statusCode).toBe(200)
    expect(history.body.map((item: any) => item.id)).toEqual([saved.body.draftRevision.id, revision1.id])
    const memberHistory = await rig.request('client_member_A', 'GET', `${root}/${id}/revisions`)
    expect(memberHistory.body.map((item: any) => item.id)).toEqual([revision1.id])
    expect(JSON.stringify(member.body)).not.toContain('Nova estratégia ainda em análise')
    expect((await rig.request('client_member_A', 'PUT', `${root}/${id}/draft`, { expectedVersion: saved.body.version, content: content(), idempotencyKey: randomUUID() })).statusCode).toBe(403)
    expect((await rig.request('client_admin_B', 'GET', `/api/company-intelligence/organizations/${rig.ids.organizationB}/strategies/${id}`)).statusCode).toBe(404)
    const count = await rig.sql('SELECT count(*)::int AS count FROM public.company_strategy_revisions WHERE strategy_id=$1', [id])
    expect(count.rows[0].count).toBe(2)
    await expect(rig.sql("UPDATE public.company_strategy_revisions SET content='{}' WHERE id=$1", [revision1.id])).rejects.toThrow(/immutable/)
    expect(await rig.providerCalls()).toHaveLength(0)
    expect((await rig.request('client_admin_A', 'POST', root, { content: {} })).statusCode).toBe(400)
  } finally { await rig.close() }
})

it('enforces the four company roles, tenant references, primary and archive lifecycle', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const root = `/api/company-intelligence/organizations/${rig.ids.organizationA}/strategies`
  try {
    for (const role of ['yux_admin', 'yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      const response = await rig.request(role, 'POST', root, { expectedVersion: null, content: content(), idempotencyKey: randomUUID() })
      expect(response.statusCode).toBe(role === 'client_member_A' ? 403 : 200)
    }
    const foreignRef = await rig.request('client_admin_A', 'POST', root, { expectedVersion: null, content: { ...content(), references: { productIds: [], documentIds: [randomUUID()] } }, idempotencyKey: randomUUID() })
    expect(foreignRef.statusCode).toBe(404)
    const list = await rig.request('client_admin_A', 'GET', root)
    const selected = list.body[0]
    const primary = await rig.request('client_admin_A', 'POST', `${root}/${selected.id}/primary`, { expectedVersion: selected.version })
    expect(primary.statusCode).toBe(200)
    expect(primary.body.isPrimary).toBe(true)
    const archived = await rig.request('client_admin_A', 'POST', `${root}/${selected.id}/archive`, { expectedVersion: primary.body.version })
    expect(archived.body.archivedAt).toBeTruthy()
    const restored = await rig.request('client_admin_A', 'POST', `${root}/${selected.id}/restore`, { expectedVersion: archived.body.version })
    expect(restored.body.publishedRevision).toBeNull()
    expect(restored.body.draftRevision).toBeTruthy()
  } finally { await rig.close() }
})

it('can explicitly republish a restored strategy and keeps publication and its event atomic', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const root = `/api/company-intelligence/organizations/${rig.ids.organizationA}/strategies`
  const publish = (strategy: any) => rig.request('client_admin_A', 'POST', `${root}/${strategy.id}/publish`, { expectedVersion: strategy.version, revisionId: strategy.draftRevision.id, expectedContentHash: strategy.draftRevision.contentHash, idempotencyKey: randomUUID() })
  try {
    const created = await rig.request('client_admin_A', 'POST', root, { expectedVersion: null, content: content(), idempotencyKey: randomUUID() })
    const first = await publish(created.body)
    const archived = await rig.request('client_admin_A', 'POST', `${root}/${first.body.id}/archive`, { expectedVersion: first.body.version })
    const restored = await rig.request('client_admin_A', 'POST', `${root}/${first.body.id}/restore`, { expectedVersion: archived.body.version })
    expect((await publish(restored.body)).statusCode).toBe(200)
    const draft = await rig.request('client_admin_A', 'POST', root, { expectedVersion: null, content: content(), idempotencyKey: randomUUID() })
    await rig.sql(`CREATE FUNCTION private.test_strategy_event_rejection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='company.strategy_published' THEN RAISE EXCEPTION 'test_event_rejection'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_strategy_event_rejection BEFORE INSERT ON public.domain_events FOR EACH ROW EXECUTE FUNCTION private.test_strategy_event_rejection();`)
    expect((await publish(draft.body)).statusCode).toBe(500)
    const after = await rig.request('client_admin_A', 'GET', `${root}/${draft.body.id}`)
    expect(after.body.publishedRevision).toBeNull()
    expect(after.body.version).toBe(draft.body.version)
    expect((await rig.sql('SELECT id FROM public.company_strategy_publications WHERE strategy_id=$1', [draft.body.id])).rows).toHaveLength(0)
  } finally {
    await rig.sql('DROP TRIGGER IF EXISTS test_strategy_event_rejection ON public.domain_events; DROP FUNCTION IF EXISTS private.test_strategy_event_rejection()')
    await rig.close()
  }
})

it('does not duplicate company strategies across contracts and denies raw runtime access', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const root = `/api/company-intelligence/organizations/${rig.ids.organizationA}/strategies`
  const runtime = new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_runtime') })
  try {
    await rig.sql(`INSERT INTO public.contracts(id,client_id,package_id,status) SELECT $1,client_id,package_id,'active' FROM public.contracts WHERE id=$2`, [randomUUID(), rig.ids.contractA])
    const created = await rig.request('client_admin_A', 'POST', root, { expectedVersion: null, content: content(), idempotencyKey: randomUUID() })
    expect((await rig.request('client_admin_A', 'GET', root)).body.filter((item: any) => item.id === created.body.id)).toHaveLength(1)
    await expect(runtime.query('SELECT content FROM public.company_strategy_revisions')).rejects.toThrow(/permission denied/)
    await expect(runtime.query('UPDATE public.company_strategies SET is_primary=true')).rejects.toThrow(/permission denied/)
  } finally { await runtime.end(); await rig.close() }
})
