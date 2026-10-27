import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Mail, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { clientMembersService, type ClientInvitationResult, type ClientMember, type ClientMemberRole } from '@/services/clientMembersService'

const roles: Array<{ value: ClientMemberRole; label: string }> = [
  { value: 'client_admin', label: 'Administrador da conta' },
  { value: 'client_member', label: 'Membro com acesso limitado' },
]
const errorMessages: Record<string, string> = {
  client_login_email_already_exists: 'Este e-mail já está cadastrado. Confira a lista de usuários ou use outro e-mail.',
  last_client_admin_required: 'A conta precisa manter pelo menos um administrador ativo. Promova outro usuário antes de alterar este acesso.',
  cannot_change_own_access: 'Peça a outro administrador para alterar o seu acesso.',
  internal_account_not_editable: 'Esta é uma conta interna da YUX e não pode ser alterada aqui.',
  shared_account_not_editable: 'Esta conta possui outros vínculos. Solicite a alteração à equipe YUX.',
  client_member_inactive: 'Reative o usuário antes de enviar um e-mail de acesso.',
  forbidden: 'Você não tem permissão para gerenciar os usuários deste cliente.',
  not_authenticated: 'Sua sessão expirou. Entre novamente para continuar.',
  client_account_not_found: 'O acesso desta conta ainda não está configurado. Solicite a configuração à equipe YUX.',
}
function readableError(error: unknown, fallback: string) { return error instanceof Error ? errorMessages[error.message] || fallback : fallback }
function roleDescription(role: ClientMemberRole) {
  return role === 'client_admin'
    ? 'Gerencia os usuários e as configurações da conta nos módulos contratados.'
    : 'Usa as permissões do perfil de membro nos módulos contratados, sem gerenciar usuários ou configurações administrativas.'
}
function dateLabel(date: string | null) { return date ? new Date(date).toLocaleString('pt-BR') : 'Ainda não acessou' }

function MemberRow({ member, busy, onUpdate, onEmail }: { member: ClientMember; busy: boolean; onUpdate: (id: string, input: { role?: ClientMemberRole; isActive?: boolean }) => Promise<void>; onEmail: (id: string) => Promise<void> }) {
  const [role, setRole] = useState(member.role)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { setRole(member.role) }, [member.role])
  const editable = !member.isCurrentUser && roles.some(item => item.value === member.role)
  return (
    <li className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold text-gray-900">{member.name}{member.isCurrentUser && <span className="ml-2 text-xs font-normal text-gray-500">Você</span>}</p>
          <p className="break-all text-sm text-gray-600">{member.email}</p>
          <p className="mt-1 text-xs text-gray-500">Último acesso: {dateLabel(member.lastLogin)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${!member.isActive ? 'bg-gray-100 text-gray-600' : member.status === 'invited' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
          {!member.isActive ? 'Desativado' : member.status === 'invited' ? 'Convite pendente' : 'Ativo'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={`Função de ${member.name}`} value={role} disabled={busy || !editable} onChange={event => setRole(event.target.value as ClientMemberRole)} className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-50 sm:flex-none">
          {roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {role !== member.role && <button type="button" disabled={busy || !editable} onClick={() => void onUpdate(member.id, { role })} className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Salvar função</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !member.isActive} onClick={() => void onEmail(member.id)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Mail className="h-4 w-4" />{member.lastLogin ? 'Enviar redefinição de senha' : 'Reenviar convite'}</button>
        <button type="button" disabled={busy || !editable} onClick={() => member.isActive ? setConfirming(true) : void onUpdate(member.id, { isActive: true })} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">{member.isActive ? 'Desativar' : 'Reativar'}</button>
      </div>
      {confirming && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
        <p>Desativar {member.name}? O usuário perderá o acesso e suas sessões serão encerradas.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setConfirming(false); void onUpdate(member.id, { isActive: false }) }} className="rounded-md bg-red-600 px-3 py-2 font-medium text-white disabled:opacity-50">Confirmar desativação</button><button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-md border border-amber-300 px-3 py-2">Cancelar</button></div>
      </div>}
    </li>
  )
}

export function ClientUsersManager({ clientId }: { clientId: string }) {
  return <ClientUsersPanel key={clientId} clientId={clientId} />
}
function ClientUsersPanel({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<ClientMember[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ClientMemberRole>('client_member')
  const mounted = useRef(false)
  const requestVersion = useRef(0)
  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true); setError(null)
    try {
      const result = await clientMembersService.list(clientId)
      if (!mounted.current || version !== requestVersion.current) return
      setMembers(result.members); setCanManage(result.canManage)
    } catch (loadError) {
      if (mounted.current && version === requestVersion.current) { setMembers([]); setCanManage(false); setError(readableError(loadError, 'Não foi possível carregar os usuários. Tente novamente.')) }
    } finally { if (mounted.current && version === requestVersion.current) setLoading(false) }
  }, [clientId])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [load])

  function deliveryNotice(result: ClientInvitationResult, created = false) {
    setNotice({ warning: !result.emailSent, text: !result.emailSent
      ? `${created ? 'Usuário cadastrado, mas o e-mail não foi enviado' : 'O e-mail não foi enviado'}. Use “Reenviar convite” ou “Enviar redefinição de senha” para tentar novamente.`
      : result.action === 'password_reset' ? 'E-mail de redefinição de senha enviado.' : 'Convite enviado. A pessoa poderá criar sua senha pelo link recebido no e-mail.' })
  }
  async function invite(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await clientMembersService.invite(clientId, { name: name.trim(), email: email.trim(), role })
      if (!mounted.current) return
      setMembers(previous => [...previous, result.member]); setShowInvite(false); setName(''); setEmail(''); setRole('client_member'); deliveryNotice(result.invitation, true)
    } catch (inviteError) { if (mounted.current) setError(readableError(inviteError, 'Não foi possível cadastrar o usuário. Confira os dados e tente novamente.')) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function update(id: string, input: { role?: ClientMemberRole; isActive?: boolean }) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await clientMembersService.update(clientId, id, input)
      if (!mounted.current) return
      setMembers(previous => previous.map(member => member.id === id ? result.member : member))
      setNotice({ text: 'Acesso atualizado. O usuário precisará entrar novamente.', warning: false })
    } catch (updateError) { if (mounted.current) setError(readableError(updateError, 'Não foi possível atualizar o acesso. Tente novamente.')) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function sendEmail(id: string) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { const result = await clientMembersService.sendAccessEmail(clientId, id); if (mounted.current) deliveryNotice(result.invitation) }
    catch (sendError) { if (mounted.current) setError(readableError(sendError, 'Não foi possível enviar o e-mail de acesso. Tente novamente.')) }
    finally { if (mounted.current) setBusy(false) }
  }
  return (
    <section className="space-y-5" aria-label="Usuários da conta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Users className="h-5 w-5 text-yux-600" />Usuários da conta</h2><p className="mt-1 text-sm text-gray-600">Cada pessoa entra com seu próprio e-mail e senha, com acesso apenas a este cliente.</p></div>
        {canManage && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} disabled={loading || busy} aria-label="Atualizar usuários" className="rounded-md border p-2 text-gray-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button><button type="button" disabled={busy} onClick={() => { setShowInvite(true); setError(null) }} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:opacity-50"><UserPlus className="h-4 w-4" />Convidar usuário</button></div>}
      </div>
      {notice && <p role="status" className={`rounded-md border p-3 text-sm ${notice.warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-900'}`}>{notice.text}</p>}
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{error}</p>{!canManage && <button type="button" onClick={() => void load()} className="mt-2 font-medium underline">Tentar novamente</button>}</div>}
      {loading ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando usuários…</p> : !canManage && !error ? <p className="rounded-md border bg-gray-50 p-4 text-sm text-gray-600">Somente administradores da conta podem consultar, convidar ou alterar usuários. Solicite o acesso ao responsável pela sua empresa.</p> : canManage && <>
        <div className="rounded-lg border border-yux-100 bg-yux-50 p-4 text-sm text-gray-700"><p className="mb-2 flex items-center gap-2 font-medium text-yux-900"><ShieldCheck className="h-4 w-4" />Funções e permissões</p>{roles.map(item => <p key={item.value} className="mt-1"><strong>{item.label}:</strong> {roleDescription(item.value)}</p>)}</div>
        {showInvite && <form onSubmit={invite} className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"><h3 className="font-semibold text-gray-900">Convidar uma pessoa</h3><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Nome<input aria-label="Nome do usuário" autoComplete="name" required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} disabled={busy} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">E-mail<input aria-label="E-mail do usuário" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label></div><label className="block text-sm font-medium text-gray-700">Função<select aria-label="Função do novo usuário" value={role} onChange={event => setRole(event.target.value as ClientMemberRole)} disabled={busy} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2">{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="text-xs text-gray-500">O convite será enviado ao e-mail informado. A pessoa criará sua senha para entrar nesta conta.</p><div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Enviar convite</button><button type="button" disabled={busy} onClick={() => setShowInvite(false)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Cancelar</button></div></form>}
        {members.length ? <ul className="space-y-3">{members.map(member => <MemberRow key={member.id} member={member} busy={busy} onUpdate={update} onEmail={sendEmail} />)}</ul> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">Nenhum usuário cadastrado. Convide o administrador desta conta para começar.</p>}
      </>}
    </section>
  )
}
