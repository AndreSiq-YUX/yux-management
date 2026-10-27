import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientMember } from '@/services/clientMembersService'
import { ClientUsersManager } from './ClientUsersManager'

const member: ClientMember = { id: 'user-1', name: 'Maria Silva', email: 'maria@cliente.test', role: 'client_admin', isActive: true, status: 'invited', lastLogin: null, isCurrentUser: false }
let container: HTMLDivElement; let root: Root; let requests: Array<{ path: string; method: string; body: unknown }>; let roster: ClientMember[]; let canManage: boolean; let emailSent: boolean
async function render(clientId = 'client-1') { await act(async () => { root.render(<ClientUsersManager clientId={clientId} />) }) }
async function click(label: string) { const button = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!; expect(button, label).toBeTruthy(); await act(async () => button.click()) }
async function input(label: string, value: string) {
  const el = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement
  expect(el, label).toBeTruthy()
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  requests = []; roster = [{ ...member }]; canManage = true; emailSent = true
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url), method = init.method || 'GET', body = init.body ? JSON.parse(String(init.body)) : null
    requests.push({ path, method, body })
    if (method === 'GET') return new Response(JSON.stringify({ members: canManage ? roster : [], canManage }))
    if (method === 'POST' && !path.endsWith('/access-email')) { const created = { ...member, id: 'new-user', ...body, isCurrentUser: false }; roster.push(created); return new Response(JSON.stringify({ member: created, invitation: { emailSent, action: 'client_invitation' } }), { status: 201 }) }
    if (method === 'PATCH') { roster[0] = { ...roster[0], ...body }; return new Response(JSON.stringify({ member: roster[0] })) }
    return new Response(JSON.stringify({ invitation: { emailSent, action: 'client_invitation' } }))
  }))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
describe('ClientUsersManager', () => {
  it('loads the selected client roster and shows access controls', async () => { await render(); expect(requests[0].path).toBe('/api/workspace/client-accounts/client-1/members'); expect(container.textContent).toContain('Maria Silva'); expect(container.textContent).toContain('Convite pendente'); expect(container.textContent).toContain('Convidar usuário') })
  it('invites with name email and chosen role', async () => {
    await render(); await click('Convidar usuário'); await input('Nome do usuário', 'João Costa'); await input('E-mail do usuário', 'joao@cliente.test')
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(requests.find(r => r.method === 'POST')?.body).toEqual({ name: 'João Costa', email: 'joao@cliente.test', role: 'client_member' }); expect(container.textContent).toContain('João Costa')
  })
  it('updates a role on the server', async () => {
    await render(); const select = container.querySelector('[aria-label="Função de Maria Silva"]') as HTMLSelectElement
    await act(async () => { select.value = 'client_member'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await click('Salvar função'); expect(requests.find(r => r.method === 'PATCH')?.body).toEqual({ role: 'client_member' })
  })
  it('requires confirmation before deactivation', async () => { await render(); await click('Desativar'); expect(requests.some(r => r.method === 'PATCH')).toBe(false); await click('Confirmar desativação'); expect(requests.find(r => r.method === 'PATCH')?.body).toEqual({ isActive: false }) })
  it('resends invitation to the selected member', async () => { await render(); await click('Reenviar convite'); expect(requests.find(r => r.method === 'POST')?.path).toBe('/api/workspace/client-accounts/client-1/members/user-1/access-email') })
  it('explains a delivery failure without offering duplicate creation', async () => {
    emailSent = false; await render(); await click('Convidar usuário'); await input('Nome do usuário', 'João Costa'); await input('E-mail do usuário', 'joao@cliente.test'); await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.textContent).toContain('Usuário cadastrado, mas o e-mail não foi enviado'); expect(container.querySelector('form')).toBeNull()
  })
  it('hides management for limited members', async () => { canManage = false; await render(); expect(container.textContent).toContain('Somente administradores'); expect(container.textContent).not.toContain('Maria Silva'); expect(container.textContent).not.toContain('Convidar usuário') })
  it('prevents editing own access in the UI', async () => { roster[0].isCurrentUser = true; await render(); expect((container.querySelector('[aria-label="Função de Maria Silva"]') as HTMLSelectElement).disabled).toBe(true); expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Desativar')?.disabled).toBe(true) })
  it('shows request errors and offers retry', async () => { vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 })); await render(); expect(container.textContent).toContain('Não foi possível carregar'); await click('Tentar novamente'); expect(container.textContent).toContain('Maria Silva') })
  it('ignores a late roster response after switching clients', async () => {
    let finishOldRequest!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { finishOldRequest = resolve }))
    await render('old-client')
    roster = [{ ...member, id: 'new-client-user', name: 'Equipe do novo cliente' }]
    await render('new-client')
    expect(container.textContent).toContain('Equipe do novo cliente')
    await act(async () => finishOldRequest(new Response(JSON.stringify({ members: [{ ...member, name: 'Equipe anterior' }], canManage: true }))))
    expect(container.textContent).toContain('Equipe do novo cliente')
    expect(container.textContent).not.toContain('Equipe anterior')
  })
  it('keeps the roster when the last-admin protection rejects a change', async () => {
    await render()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'last_client_admin_required' }), { status: 409 }))
    const select = container.querySelector('[aria-label="Função de Maria Silva"]') as HTMLSelectElement
    await act(async () => { select.value = 'client_member'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await click('Salvar função')
    expect(container.textContent).toContain('pelo menos um administrador ativo')
    expect(container.textContent).toContain('Maria Silva')
  })
})
