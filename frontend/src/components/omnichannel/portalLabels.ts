/** Rótulos em português (linguagem do cliente) para os estados do atendimento. */

const normalize = (value?: string | null) => (value || '').trim().toLowerCase()

const conversationStatusLabels: Record<string, string> = {
  open: 'Aberta',
  waiting_ai: 'Em atendimento pela IA',
  waiting_human: 'Aguardando atendente',
  assigned: 'Com atendente',
  resolved: 'Resolvida',
  archived: 'Arquivada',
}

export const conversationStatusLabel = (status?: string | null) =>
  conversationStatusLabels[normalize(status)] || 'Não informado'

const responseModeLabels: Record<string, string> = {
  automatic: 'IA responde',
  assisted: 'IA sugere',
  manual: 'Só atendente',
}

export const responseModeLabel = (mode?: string | null) => responseModeLabels[normalize(mode)] || 'Não informado'

const authorLabels: Record<string, string> = {
  contact: 'Cliente',
  ai: 'Agente IA',
  agent: 'Atendente',
  user: 'Atendente',
  human: 'Atendente',
  system: 'Sistema',
}

export const messageAuthorLabel = (author?: string | null) => authorLabels[normalize(author)] || 'Atendente'

const deliveryLabels: Record<string, string> = {
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Não enviada',
  received: 'Recebida',
}

export const messageDeliveryLabel = (status?: string | null) => deliveryLabels[normalize(status)] || ''

const strategyLabels: Record<string, string> = {
  round_robin: 'Rodízio entre atendentes',
  least_busy: 'Quem está com menos conversas',
  priority: 'Por ordem de prioridade',
  manual: 'Escolha manual',
}

export const queueStrategyLabel = (strategy?: string | null) => strategyLabels[normalize(strategy)] || 'Não definida'

export const QUEUE_STRATEGY_OPTIONS = Object.entries(strategyLabels).map(([value, label]) => ({ value, label }))

const availabilityLabels: Record<string, string> = {
  always_on: 'Sempre disponível',
  business_hours: 'Em horário comercial',
  manual: 'Conforme cada atendente',
}

export const teamAvailabilityLabel = (mode?: string | null) => availabilityLabels[normalize(mode)] || 'Não definida'

export const TEAM_AVAILABILITY_OPTIONS = Object.entries(availabilityLabels).map(([value, label]) => ({ value, label }))
