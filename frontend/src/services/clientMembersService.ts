import { apiRequest } from '@/lib/apiClient'

export type ClientMemberRole = 'client_admin' | 'client_member'
export interface ClientMember {
  id: string
  name: string
  email: string
  role: ClientMemberRole
  isActive: boolean
  status: 'invited' | 'active' | 'inactive'
  lastLogin: string | null
  isCurrentUser: boolean
}
export interface ClientInvitationResult {
  action: 'client_invitation' | 'password_reset'
  emailSent: boolean
  emailError?: string
}
const path = (clientId: string) => `/workspace/client-accounts/${encodeURIComponent(clientId)}/members`
export const clientMembersService = {
  list: (clientId: string) => apiRequest<{ members: ClientMember[]; canManage: boolean }>(path(clientId)),
  invite: (clientId: string, input: { name: string; email: string; role: ClientMemberRole }) => apiRequest<{ member: ClientMember; invitation: ClientInvitationResult }>(path(clientId), { method: 'POST', body: input }),
  update: (clientId: string, userId: string, input: { role?: ClientMemberRole; isActive?: boolean }) => apiRequest<{ member: ClientMember }>(`${path(clientId)}/${encodeURIComponent(userId)}`, { method: 'PATCH', body: input }),
  sendAccessEmail: (clientId: string, userId: string) => apiRequest<{ invitation: ClientInvitationResult }>(`${path(clientId)}/${encodeURIComponent(userId)}/access-email`, { method: 'POST' }),
}
