import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from '../src/server.js'
import { hashSessionToken } from '../src/auth/session.js'
import { sendConfiguredSmtp2GoEmail } from '../src/email/smtp2goConfigured.js'
vi.mock('../src/email/smtp2goConfigured.js', () => ({ sendConfiguredSmtp2GoEmail: vi.fn() }))
const env = { NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost', SESSION_COOKIE_NAME: 'yux_session', SESSION_SECRET: 'test-secret-value-with-at-least-32-chars', CORS_ORIGIN: 'http://localhost:3000' }
const clientId = '10000000-0000-4000-8000-000000000001', orgId = '20000000-0000-4000-8000-000000000001', actorId = '30000000-0000-4000-8000-000000000001', targetId = '30000000-0000-4000-8000-000000000002'
const base = `/api/workspace/client-accounts/${clientId}/members`
type Member = { id: string; email: string; display_name: string; role: string; role_key: string; is_active: boolean; last_login: string | null }
class Pool {
  members: Member[] = [{ id: targetId, email: 'admin@cliente.test', display_name: 'Admin Cliente', role: 'client_admin', role_key: 'client_admin', is_active: true, last_login: null }]
  actorRole = 'client_admin'; shared = false; organizationIds = [orgId]
  queries: Array<{ sql: string; values: unknown[] }> = []
  async connect() { return this }
  release() {}
  async query(sql: string, values: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ sql, values }); const result = (rows: any[] = []) => ({ rows, rowCount: rows.length })
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return result()
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return result(this.organizationIds.map(organization_id => ({ organization_id })))
    if (sql.includes('SELECT DISTINCT cm.module_key')) return result()
    if (sql.includes('FROM public.clients c') && sql.includes('JOIN public.organizations')) return result([{ id: clientId, company_name: 'Mali Massas', organization_id: orgId }])
    if (sql.includes('FROM public.organizations') && sql.includes('FOR UPDATE')) return result([{ id: orgId }])
    if (sql.includes('SELECT role_key FROM public.memberships')) return result([{ role_key: this.actorRole }])
    if (sql.includes('FROM public.memberships m') && sql.includes('JOIN app_users')) return result(this.members.filter(m => !sql.includes('m.user_id = $2') || m.id === values[1]).map(m => ({ ...m, user_id: m.id })))
    if (sql.includes('FROM public.memberships') && sql.includes('organization_id <>')) return result(this.shared ? [{ organization_id: 'other' }] : [])
    if (sql.includes('FROM app_users') && sql.includes('lower(email)')) return result(this.members.filter(m => m.email.toLowerCase() === String(values[0]).toLowerCase()))
    if (sql.includes('INSERT INTO app_users')) { this.members.push({ id: String(values[0]), email: String(values[1]), display_name: String(values[3]), role: String(values[4]), role_key: String(values[4]), is_active: true, last_login: null }); return result() }
    if (sql.includes('UPDATE app_users') && sql.includes('SET role =')) { const m = this.members.find(m => m.id === values[2])!; m.role = String(values[0]); m.is_active = Boolean(values[1]); return result() }
    if (sql.includes('UPDATE public.memberships')) { this.members.find(m => m.id === values[1])!.role_key = String(values[0]); return result() }
    if (sql.includes('INSERT INTO app_password_reset_tokens')) return result([{ id: 'token-id' }])
    if (sql.includes('FROM public.email_templates')) return result()
    if (/^(INSERT INTO public.users|INSERT INTO public.memberships|INSERT INTO audit_events|DELETE FROM app_sessions|UPDATE app_password_reset_tokens)/.test(sql.trim())) return result()
    throw new Error(`Unexpected SQL: ${sql}`)
  }
}
let app: FastifyInstance | undefined; let pool: Pool
async function setup(role = 'client_admin', organizations = [orgId]) {
  pool = new Pool(); pool.organizationIds = organizations
  const user = { id: actorId, email: 'actor@test.test', name: 'Actor', role }
  const authStore = { async findActiveUserByEmail() { return null }, async createSession() {}, async deleteSession() {}, async findUserBySession(hash: string) { return hash === hashSessionToken('token') ? user : null } }
  app = await buildServer(env, { pool: pool as never, authStore }); return { cookie: 'yux_session=token' }
}
beforeEach(() => { vi.mocked(sendConfiguredSmtp2GoEmail).mockReset(); vi.mocked(sendConfiguredSmtp2GoEmail).mockResolvedValue({ sent: true, providerMessageId: 'email-id' }) })
afterEach(async () => { await app?.close(); app = undefined })
describe('client account members', () => {
  it('requires authentication', async () => { await setup(); expect((await app!.inject({ method: 'GET', url: base })).statusCode).toBe(401) })
  it.each(['GET', 'POST', 'PATCH'] as const)('blocks another client on %s', async method => {
    const headers = await setup('client_admin', []); const response = await app!.inject({ method, url: method === 'PATCH' ? `${base}/${targetId}` : base, headers, payload: method === 'GET' ? undefined : method === 'PATCH' ? { role: 'client_member' } : { name: 'New', email: 'new@test.test', role: 'client_admin' } }); expect(response.statusCode).toBe(403)
  })
  it('checks membership role instead of global role', async () => { const headers = await setup(); pool.actorRole = 'client_member'; expect((await app!.inject({ method: 'POST', url: base, headers, payload: { name: 'New', email: 'new@test.test', role: 'client_admin' } })).statusCode).toBe(403) })
  it('hides roster from limited members', async () => { const headers = await setup('client_member'); pool.actorRole = 'client_member'; const r = await app!.inject({ method: 'GET', url: base, headers }); expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ members: [], canManage: false }) })
  it('lists member status', async () => { const headers = await setup(); const r = await app!.inject({ method: 'GET', url: base, headers }); expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ canManage: true, members: [{ id: targetId, role: 'client_admin', status: 'invited' }] }); expect(r.body).not.toContain('password_hash') })
  it.each(['yux_admin', 'yux_operator'])('allows internal %s', async role => { const headers = await setup(role, []); expect((await app!.inject({ method: 'GET', url: base, headers })).statusCode).toBe(200) })
  it('invites into only the selected organization without exposing tokens', async () => {
    const headers = await setup(); const r = await app!.inject({ method: 'POST', url: base, headers, payload: { name: ' Maria ', email: ' MARIA@cliente.test ', role: 'client_member' } })
    expect(r.statusCode, r.body).toBe(201); expect(r.json()).toMatchObject({ member: { name: 'Maria', email: 'maria@cliente.test', role: 'client_member' }, invitation: { emailSent: true } })
    expect(pool.queries.find(q => q.sql.includes('INSERT INTO public.memberships'))!.values).toEqual([r.json().member.id, orgId, 'client_member'])
    expect(vi.mocked(sendConfiguredSmtp2GoEmail).mock.calls[0][2].to).toBe('maria@cliente.test'); expect(r.body).not.toContain('accessUrl'); expect(r.body).not.toContain('token-id'); expect(pool.queries.some(q => q.sql.includes('INSERT INTO audit_events'))).toBe(true)
  })
  it('rejects existing email instead of linking accounts', async () => { const headers = await setup(); expect((await app!.inject({ method: 'POST', url: base, headers, payload: { name: 'Admin', email: 'ADMIN@cliente.test', role: 'client_member' } })).statusCode).toBe(409); expect(sendConfiguredSmtp2GoEmail).not.toHaveBeenCalled() })
  it.each(['yux_admin', 'yux_operator', 'unknown'])('rejects invalid role %s', async role => { const headers = await setup(); expect((await app!.inject({ method: 'POST', url: base, headers, payload: { name: 'New', email: 'new@test.test', role } })).statusCode).toBe(400) })
  it('preserves new member when email delivery fails', async () => { const headers = await setup(); vi.mocked(sendConfiguredSmtp2GoEmail).mockResolvedValue({ sent: false, reason: 'smtp2go_not_configured', error: 'No provider' }); const r = await app!.inject({ method: 'POST', url: base, headers, payload: { name: 'New', email: 'new@test.test', role: 'client_member' } }); expect(r.statusCode, r.body).toBe(201); expect(r.json().invitation.emailSent).toBe(false); expect(pool.members).toHaveLength(2) })
  it.each([{ role: 'client_member' }, { isActive: false }])('protects the last active admin %j', async payload => { const headers = await setup(); const r = await app!.inject({ method: 'PATCH', url: `${base}/${targetId}`, headers, payload }); expect(r.statusCode).toBe(409); expect(r.json().error).toBe('last_client_admin_required') })
  it('synchronizes role and invalidates sessions', async () => {
    const headers = await setup(); pool.members.push({ ...pool.members[0], id: actorId, email: 'actor@test.test' }); const r = await app!.inject({ method: 'PATCH', url: `${base}/${targetId}`, headers, payload: { role: 'client_member' } }); expect(r.statusCode, r.body).toBe(200); expect(pool.members[0]).toMatchObject({ role: 'client_member', role_key: 'client_member' }); expect(pool.queries.some(q => q.sql.includes('DELETE FROM app_sessions') && q.values[0] === targetId)).toBe(true); expect(pool.queries.findIndex(q => q.sql.includes('FOR UPDATE'))).toBeLessThan(pool.queries.findIndex(q => q.sql.includes('UPDATE app_users')))
  })
  it('protects own access', async () => { const headers = await setup(); pool.members[0].id = actorId; expect((await app!.inject({ method: 'PATCH', url: `${base}/${actorId}`, headers, payload: { isActive: false } })).statusCode).toBe(409) })
  it('rejects users outside roster', async () => { const headers = await setup(); expect((await app!.inject({ method: 'PATCH', url: `${base}/${actorId}`, headers, payload: { role: 'client_member' } })).statusCode).toBe(404) })
  it('protects internal accounts', async () => { const headers = await setup(); pool.members[0].role = 'yux_admin'; expect((await app!.inject({ method: 'PATCH', url: `${base}/${targetId}`, headers, payload: { role: 'client_member' } })).statusCode).toBe(409) })
  it('protects accounts shared with another organization', async () => { const headers = await setup(); pool.shared = true; expect((await app!.inject({ method: 'PATCH', url: `${base}/${targetId}`, headers, payload: { isActive: false } })).statusCode).toBe(409) })
  it('resends invitation without exposing the secret', async () => { const headers = await setup(); const r = await app!.inject({ method: 'POST', url: `${base}/${targetId}/access-email`, headers }); expect(r.statusCode, r.body).toBe(200); expect(r.json()).toEqual({ invitation: { action: 'client_invitation', emailSent: true } }) })
  it('uses password reset after first login', async () => { const headers = await setup(); pool.members[0].last_login = '2026-10-26T12:00:00Z'; const r = await app!.inject({ method: 'POST', url: `${base}/${targetId}/access-email`, headers }); expect(r.statusCode, r.body).toBe(200); expect(r.json().invitation.action).toBe('password_reset') })
  it('does not send access to disabled members', async () => { const headers = await setup(); pool.members[0].is_active = false; expect((await app!.inject({ method: 'POST', url: `${base}/${targetId}/access-email`, headers })).statusCode).toBe(409); expect(sendConfiguredSmtp2GoEmail).not.toHaveBeenCalled() })
})
