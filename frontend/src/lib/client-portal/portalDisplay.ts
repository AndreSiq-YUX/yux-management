export const formatPortalDate = (value?: string) => {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export const formatPortalDateTime = (value?: string) => {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export const formatPortalCurrency = (value?: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export const countItems = <T>(items: T[], predicate: (item: T) => boolean) => items.filter(predicate).length

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  approved: 'Aprovado',
  cancelled: 'Cancelado',
  completed: 'Concluido',
  delivered: 'Entregue',
  draft: 'Rascunho',
  due_soon: 'Vence em breve',
  in_progress: 'Em andamento',
  in_review: 'Em revisao',
  issued: 'Emitido',
  open: 'Aberto',
  overdue: 'Vencido',
  paid: 'Pago',
  partial: 'Parcial',
  partial_overdue: 'Parcial vencido',
  paused: 'Pausado',
  pending: 'Pendente',
  published: 'Publicado',
  rejected: 'Rejeitado',
  requested: 'Solicitado',
  scheduled: 'Agendado',
  sent: 'Enviado',
  won: 'Ganho',
  lost: 'Perdido',
  changes_requested: 'Ajustes solicitados',
}

export const statusLabel = (status?: string) => {
  if (!status) return 'Nao informado'
  const normalizedStatus = status.toLowerCase()
  return statusLabels[normalizedStatus] || status.replace(/_/g, ' ')
}
