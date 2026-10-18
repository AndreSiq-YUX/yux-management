import { ids, uid } from './ids'
import { registerTable } from './query'
import { daysAgo, daysFromNow, hoursAgo, minutesAgo } from './time'
import type { MockRoute } from './types'

const channelRows = [
  { id: uid('chan', 1), organization_id: ids.organization, channel: 'whatsapp', name: 'WhatsApp — Recepção', provider_display_name: 'Clínica Sorriso Pleno', provider_account_id: '102030405060', provider_asset_id: 'waba_1', phone_number_id: '5511333344556', adapter_key: 'meta_cloud', is_active: true, provider_verify_state: 'verified', token_state: 'connected', health_status: 'healthy', fallback_mode: 'official', last_event_at: minutesAgo(12), health_checked_at: hoursAgo(1), provider_scopes: ['whatsapp_business_messaging'] },
  { id: uid('chan', 2), organization_id: ids.organization, channel: 'instagram', name: 'Instagram — @sorrisopleno', provider_display_name: 'Sorriso Pleno', provider_username: 'sorrisopleno', provider_account_id: '178414', adapter_key: 'meta_cloud', is_active: true, provider_verify_state: 'verified', token_state: 'stale', health_status: 'degraded', fallback_mode: 'official', last_event_at: hoursAgo(30), health_checked_at: hoursAgo(6) },
  { id: uid('chan', 3), organization_id: ids.organization, channel: 'messenger', name: 'Messenger — Página Sorriso Pleno', is_active: false, provider_verify_state: 'not_configured', token_state: 'not_configured', fallback_mode: 'official' },
  { id: uid('chan', 4), organization_id: ids.organization, channel: 'webchat', name: 'Chat do site', is_active: true, provider_verify_state: 'verified', token_state: 'connected', health_status: 'healthy', fallback_mode: 'official', last_event_at: hoursAgo(5) },
]

const contactNames = ['Camila Rocha', 'Eduardo Martins', 'Rafael Nunes', 'Juliana Prado', 'Thiago Ribeiro', 'Larissa Gomes', 'Marcos Tavares', 'Beatriz Souza']
const summaries = [
  'Quer saber valores de clareamento e se há horário no sábado.',
  'Pergunta sobre prazo de cicatrização do implante.',
  'Solicitou orçamento de protocolo sobre implantes.',
  'Quer remarcar a avaliação de quinta-feira.',
  'Dúvida sobre parcelamento em 24x.',
  'Enviou fotos para avaliação inicial.',
  'Perguntou se aceitam convênio.',
  'Agradeceu o atendimento e confirmou a consulta.',
]
const statuses = ['waiting_human', 'waiting_ai', 'assigned', 'open', 'waiting_human', 'resolved', 'assigned', 'resolved'] as const
const channels = ['whatsapp', 'whatsapp', 'whatsapp', 'instagram', 'whatsapp', 'webchat', 'instagram', 'whatsapp'] as const

export const conversations = contactNames.map((name, index) => ({
  id: uid('conversation', index + 1),
  organizationId: ids.organization,
  channel: channels[index],
  status: statuses[index],
  responseMode: index % 3 === 0 ? 'assisted' : 'automatic',
  subject: summaries[index].split('.')[0],
  summary: summaries[index],
  classification: ['Orçamento', 'Dúvida clínica', 'Orçamento', 'Agendamento', 'Financeiro', 'Triagem', 'Convênio', 'Pós-atendimento'][index],
  sentiment: index === 3 ? 'negative' : index % 2 ? 'neutral' : 'positive',
  lastMessageAt: minutesAgo(10 + index * 95),
  slaDeadlineAt: index === 0 ? minutesAgo(20) : index === 4 ? daysFromNow(0, 1) : undefined,
  resolvedAt: statuses[index] === 'resolved' ? hoursAgo(3 + index) : undefined,
  createdAt: daysAgo(1 + index),
  updatedAt: minutesAgo(10 + index * 95),
  contact: { id: uid('contact', index + 1), displayName: name, phone: `(11) 9${7000 + index * 41}-${1000 + index * 77}`, email: undefined },
  queue: index % 2 ? { id: uid('queue', 2), name: 'Comercial — Implantes' } : { id: uid('queue', 1), name: 'Recepção' },
  team: { id: uid('omni-team', 1), name: 'Atendimento Sorriso Pleno' },
  assignedUser: statuses[index] === 'assigned' ? { id: ids.user, name: 'Mariana Costa' } : undefined,
  tags: index % 2 ? ['implante'] : ['clareamento', 'quente'],
}))

const messages = (conversationId: string) => [
  { id: uid('msg-a', 1), conversationId, direction: 'inbound', authorType: 'contact', contentType: 'text', body: 'Olá! Vi o anúncio de vocês. Qual o valor da avaliação?', deliveryStatus: 'read', metadata: {}, createdAt: hoursAgo(5), updatedAt: hoursAgo(5), attachments: [] },
  { id: uid('msg-a', 2), conversationId, direction: 'outbound', authorType: 'ai', contentType: 'text', body: 'Olá! A avaliação é gratuita e leva cerca de 40 minutos. Posso verificar um horário para você?', deliveryStatus: 'delivered', metadata: {}, createdAt: hoursAgo(5), updatedAt: hoursAgo(5), attachments: [] },
  { id: uid('msg-a', 3), conversationId, direction: 'inbound', authorType: 'contact', contentType: 'text', body: 'Tem sábado de manhã?', deliveryStatus: 'read', metadata: {}, createdAt: hoursAgo(4), updatedAt: hoursAgo(4), attachments: [] },
  { id: uid('msg-a', 4), conversationId, direction: 'outbound', authorType: 'agent', authorUserId: ids.user, contentType: 'text', body: 'Temos sim! Sábado às 9h ou 10h30. Qual prefere?', deliveryStatus: 'delivered', metadata: {}, createdAt: hoursAgo(3), updatedAt: hoursAgo(3), attachments: [] },
]

const teams = [{ id: uid('omni-team', 1), organization_id: ids.organization, name: 'Atendimento Sorriso Pleno', availability_mode: 'business_hours', is_active: true, created_at: daysAgo(100), updated_at: daysAgo(10) }]
const queues = [
  { id: uid('queue', 1), organization_id: ids.organization, team_id: uid('omni-team', 1), name: 'Recepção', strategy: 'round_robin', sla_settings: { firstResponseMinutes: 10 }, is_active: true, created_at: daysAgo(100), updated_at: daysAgo(10) },
  { id: uid('queue', 2), organization_id: ids.organization, team_id: uid('omni-team', 1), name: 'Comercial — Implantes', strategy: 'least_busy', sla_settings: { firstResponseMinutes: 5 }, is_active: true, created_at: daysAgo(100), updated_at: daysAgo(10) },
]
const rules = [
  { id: uid('rule', 1), organization_id: ids.organization, name: 'Falar com pessoa', is_enabled: true, priority: 1, combinator: 'any', conditions: [{ field: 'message', operator: 'contains', value: 'atendente' }], outcome: { type: 'manual', queueId: uid('queue', 1) }, created_at: daysAgo(90), updated_at: daysAgo(10) },
  { id: uid('rule', 2), organization_id: ids.organization, name: 'Interesse em implante', is_enabled: true, priority: 2, combinator: 'all', conditions: [{ field: 'classification', operator: 'equals', value: 'Orçamento' }], outcome: { type: 'route', queueId: uid('queue', 2) }, created_at: daysAgo(90), updated_at: daysAgo(10) },
]

registerTable('conversation_queues', queues)
registerTable('omnichannel_teams', teams)

export const omnichannelRoutes: MockRoute[] = [
  { method: 'GET', path: '/omnichannel/channel-connections', respond: () => channelRows },
  { method: 'GET', path: '/omnichannel/portal/conversations', respond: () => conversations },
  { method: 'GET', path: /^\/omnichannel\/conversations\/([^/]+)\/messages$/, respond: ({ params }) => messages(params[0]) },
  {
    method: 'GET',
    path: /^\/omnichannel\/conversations\/([^/]+)$/,
    respond: ({ params }) => conversations.find(conversation => conversation.id === params[0]) ?? conversations[0],
  },
  { method: 'GET', path: '/omnichannel/teams', respond: () => teams },
  { method: 'GET', path: /^\/omnichannel\/teams\/[^/]+\/members$/, respond: () => [{ id: uid('tm', 1), team_id: uid('omni-team', 1), user_id: ids.user, name: 'Mariana Costa' }] },
  { method: 'GET', path: '/omnichannel/queues', respond: () => queues },
  { method: 'GET', path: '/omnichannel/rules', respond: () => rules },
  { method: 'GET', path: '/omnichannel/settings', respond: () => ({ organization_id: ids.organization, default_response_mode: 'assisted', retention_months: 24 }) },
]
