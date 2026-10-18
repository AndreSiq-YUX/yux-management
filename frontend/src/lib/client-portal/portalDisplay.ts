const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Converte texto/Date em Date válida. Datas sem horário ("2026-10-20") são
 * tratadas como dia local para não "voltar um dia" em fusos negativos.
 */
const toValidDate = (value?: string | Date | null): Date | null => {
  if (value === undefined || value === null || value === '') return null
  let date: Date
  if (value instanceof Date) {
    date = value
  } else if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    date = new Date(year, month - 1, day)
  } else {
    date = new Date(value)
  }
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Diferença em dias de calendário (positivo = data no futuro). */
const calendarDayDiff = (date: Date, now: Date) => {
  const diff = startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()
  return Math.round(diff / 86_400_000)
}

export const formatPortalDate = (value?: string) => {
  const date = toValidDate(value)
  if (!date) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export const formatPortalDateTime = (value?: string) => {
  const date = toValidDate(value)
  if (!date) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "20 out" no ano atual; "20 out 2025" em outros anos. */
export const formatShortDate = (value?: string | Date | null, now: Date = new Date()) => {
  const date = toValidDate(value)
  if (!date) return 'Sem data'
  const base = `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`
}

const plural = (count: number, singular: string, pluralForm: string) => (count === 1 ? singular : pluralForm)

/** "agora", "há 5 min", "há 2 h", "ontem", "há 2 dias", "amanhã", "em 3 dias". */
export const formatRelativeTime = (value?: string | Date | null, now: Date = new Date()) => {
  const date = toValidDate(value)
  if (!date) return 'Sem data'

  const elapsedMs = now.getTime() - date.getTime()
  const isPast = elapsedMs >= 0
  const absMinutes = Math.floor(Math.abs(elapsedMs) / 60_000)
  const dayDiff = calendarDayDiff(date, now)

  if (absMinutes < 1) return 'agora'

  if (absMinutes < 60) return isPast ? `há ${absMinutes} min` : `em ${absMinutes} min`

  if (absMinutes < 24 * 60) {
    const hours = Math.floor(absMinutes / 60)
    if (isPast) return `há ${hours} h`
    if (dayDiff === 0) return `em ${hours} h`
  }

  if (dayDiff === 0) return 'agora'
  if (dayDiff === -1) return 'ontem'
  if (dayDiff === 1) return 'amanhã'

  const days = Math.abs(dayDiff)
  if (days >= 30) {
    const months = Math.floor(days / 30)
    const label = `${months} ${plural(months, 'mês', 'meses')}`
    return isPast ? `há ${label}` : `em ${label}`
  }
  return isPast ? `há ${days} dias` : `em ${days} dias`
}

/** "vence hoje", "vence amanhã", "vence em 3 dias", "venceu ontem", "venceu há 2 dias". */
export const formatDueLabel = (value?: string | Date | null, now: Date = new Date()) => {
  const date = toValidDate(value)
  if (!date) return 'Sem data'
  const dayDiff = calendarDayDiff(date, now)
  if (dayDiff === 0) return 'vence hoje'
  if (dayDiff === 1) return 'vence amanhã'
  if (dayDiff > 1) return `vence em ${dayDiff} dias`
  if (dayDiff === -1) return 'venceu ontem'
  return `venceu há ${Math.abs(dayDiff)} dias`
}

export const formatPortalCurrency = (value?: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

const compactNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** "R$ 186,4 mil", "R$ 1,2 mi"; abaixo de mil usa a moeda normal. */
export const formatCompactCurrency = (value?: number) => {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs < 1_000) return formatPortalCurrency(amount)
  if (abs < 1_000_000) return `${sign}R$ ${compactNumber.format(abs / 1_000)} mil`
  if (abs < 1_000_000_000) return `${sign}R$ ${compactNumber.format(abs / 1_000_000)} mi`
  return `${sign}R$ ${compactNumber.format(abs / 1_000_000_000)} bi`
}

export const countItems = <T>(items: T[], predicate: (item: T) => boolean) => items.filter(predicate).length

const statusLabels: Record<string, string> = {
  // Genéricos
  active: 'Ativo',
  inactive: 'Inativo',
  archived: 'Arquivado',
  approved: 'Aprovado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  completed: 'Concluído',
  delivered: 'Entregue',
  draft: 'Rascunho',
  due_soon: 'Vence em breve',
  due_today: 'Vence hoje',
  in_progress: 'Em andamento',
  in_review: 'Em revisão',
  review: 'Em revisão',
  reviewing: 'Em revisão',
  issued: 'Emitida',
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
  adjustments_requested: 'Ajustes solicitados',
  failed: 'Com falha',
  error: 'Com erro',
  blocked: 'Bloqueado',
  skipped: 'Ignorado',
  expired: 'Expirado',
  refunded: 'Reembolsado',
  succeeded: 'Concluído',
  queued: 'Na fila',
  processing: 'Processando',
  running: 'Em execução',
  ready: 'Pronto',
  planned: 'Planejado',
  planning: 'Em planejamento',
  on_hold: 'Em espera',
  on_track: 'No prazo',
  stale: 'Desatualizado',
  unscheduled: 'Sem prazo',
  viewed: 'Visualizado',
  accepted: 'Aceito',
  dismissed: 'Dispensado',
  converted: 'Convertida',
  resolved: 'Resolvido',
  closed: 'Encerrado',
  ended: 'Encerrado',
  unknown: 'Não informado',

  // Chamados de suporte
  waiting_client: 'Aguardando você',

  // Faturas
  unpaid: 'Em aberto',

  // Landing pages
  pending_approval: 'Aguardando aprovação',

  // Campanhas
  syncing: 'Sincronizando',
  waiting_assets: 'Aguardando materiais',
  waiting_approval: 'Aguardando aprovação',

  // Conteúdos
  missed: 'Não publicado',

  // Canais conectados
  connected: 'Conectado',
  disconnected: 'Desconectado',
  disabled: 'Desativado',
  needs_setup: 'Configuração pendente',
  needs_reauth: 'Reconexão necessária',
  not_configured: 'Não configurado',
  degraded: 'Instável',

  // Campanhas e criativos (objetivo, etapa do funil e formato)
  lead_generation: 'Geração de leads',
  traffic: 'Tráfego',
  conversions: 'Conversões',
  awareness: 'Reconhecimento',
  consideration: 'Consideração',
  conversion: 'Conversão',
  retention: 'Retenção',
  image: 'Imagem',
  video: 'Vídeo',
  carousel: 'Carrossel',
  text: 'Texto',

  // Propostas
  conversion_failed: 'Falha na conversão',
  superseded: 'Substituída',
}

export const statusLabel = (status?: string) => {
  if (!status) return 'Não informado'
  const normalizedStatus = status.toLowerCase()
  return statusLabels[normalizedStatus] || status.replace(/_/g, ' ')
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_')

const createLabeler = (dictionary: Record<string, string>) => (value?: string | null) => {
  if (!value) return 'Não informado'
  const key = normalizeKey(value)
  return dictionary[key] || capitalize(value.replace(/_/g, ' '))
}

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  webchat: 'Chat do site',
  instagram: 'Instagram',
  messenger: 'Messenger',
  facebook: 'Messenger',
  email: 'E-mail',
  sms: 'SMS',
}

export const channelLabel = createLabeler(channelLabels)

const billingCycleLabels: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  biannual: 'Semestral',
  yearly: 'Anual',
  annual: 'Anual',
  one_time: 'Pagamento único',
  onetime: 'Pagamento único',
}

export const billingCycleLabel = createLabeler(billingCycleLabels)

const ticketCategoryLabels: Record<string, string> = {
  technical: 'Técnico',
  billing: 'Financeiro',
  financial: 'Financeiro',
  content: 'Conteúdo',
  access: 'Acesso',
  request: 'Solicitação',
  commercial: 'Comercial',
  other: 'Outro',
}

export const ticketCategoryLabel = createLabeler(ticketCategoryLabels)

const ticketPriorityLabels: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

export const ticketPriorityLabel = createLabeler(ticketPriorityLabels)

const roleLabels: Record<string, string> = {
  client: 'Cliente',
  client_admin: 'Administrador da conta',
  client_member: 'Membro',
  yux_admin: 'Admin YUX',
  yux_operator: 'Operação YUX',
  manager: 'Gestor',
  seller: 'Vendedor',
}

export const roleLabel = createLabeler(roleLabels)
