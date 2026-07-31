import type {
  Record360Input,
  Record360ProposalSummary,
  Record360Tab,
  Record360TaskSummary,
  RecordAssociationKind,
  RecordAssociationSummary,
  RecordMissingDataItem,
  RecordNextAction,
} from '@/types/growthWorkspace'

const BASE_TABS: Array<Omit<Record360Tab, 'isAvailable'>> = [
  { key: 'summary', label: 'Resumo' },
  { key: 'about', label: 'Sobre' },
  { key: 'activities', label: 'Atividades' },
  { key: 'conversations', label: 'Conversas' },
  { key: 'proposals_revenue', label: 'Propostas & Receita' },
  { key: 'intelligence', label: 'Inteligencia' },
]

const ASSOCIATION_LABELS: Record<RecordAssociationKind, string> = {
  company: 'Empresa',
  contacts: 'Contatos',
  opportunities: 'Oportunidades',
  campaigns: 'Campanhas',
  tickets: 'Tickets',
  documents: 'Documentos',
  contracts: 'Contratos',
  invoices: 'Faturas',
  automations: 'Automacoes',
}

export function buildRecord360Tabs(input: Record360Input): Record360Tab[] {
  return BASE_TABS.map(tab => ({
    ...tab,
    isAvailable: isRecord360TabAvailable(tab.key, input),
  }))
}

export function summarizeMissingRecordData(input: Record360Input): RecordMissingDataItem[] {
  const missing: RecordMissingDataItem[] = []

  if (!hasText(input.email)) missing.push({ key: 'email', label: 'E-mail', priority: 'high' })
  if (!hasText(input.phone)) missing.push({ key: 'phone', label: 'Telefone', priority: 'high' })
  if (!hasOwner(input)) missing.push({ key: 'owner', label: 'Responsavel', priority: 'high' })
  if (!hasCompany(input)) missing.push({ key: 'company', label: 'Empresa', priority: 'medium' })
  if (!hasText(input.source) && !hasText(input.sourceLabel)) missing.push({ key: 'source', label: 'Origem', priority: 'medium' })
  if (!hasNextAction(input)) missing.push({ key: 'nextAction', label: 'Proxima acao', priority: 'low' })

  return missing
}

export function pickNextBestAction(input: Record360Input): RecordNextAction {
  const overdueTask = findOverdueTask(input)
  if (overdueTask) {
    return {
      kind: 'overdue_task',
      label: overdueTask.title ?? 'Resolver tarefa vencida',
      description: 'Priorize a tarefa vencida antes de avancar o registro.',
      priority: 1,
      dueAt: overdueTask.dueAt,
      sourceId: overdueTask.id,
    }
  }

  const openProposal = findOpenProposal(input)
  if (openProposal) {
    return {
      kind: 'open_proposal',
      label: openProposal.title ?? 'Acompanhar proposta aberta',
      description: 'Existe uma proposta em aberto para acompanhar ou destravar.',
      priority: 2,
      sourceId: openProposal.id,
    }
  }

  if (hasRecentUnansweredConversation(input)) {
    return {
      kind: 'unanswered_conversation',
      label: 'Responder conversa recente',
      description: 'Ha uma conversa recente sem resposta registrada.',
      priority: 3,
      dueAt: input.recentUnansweredConversationAt ?? undefined,
    }
  }

  if (!hasOwner(input)) {
    return {
      kind: 'missing_owner',
      label: 'Definir responsavel',
      description: 'Atribua um responsavel antes de executar proximas acoes.',
      priority: 4,
    }
  }

  if (hasText(input.aiSuggestedAction)) {
    return {
      kind: 'ai_suggestion',
      label: input.aiSuggestedAction.trim(),
      description: 'Sugestao gerada a partir dos sinais de inteligencia disponiveis.',
      priority: 5,
    }
  }

  return {
    kind: 'review',
    label: 'Revisar registro',
    description: 'Revise o historico e defina a proxima movimentacao comercial.',
    priority: 6,
  }
}

export function summarizeAssociations(input: Record360Input): RecordAssociationSummary[] {
  return ASSOCIATION_KINDS.map(kind => ({
    kind,
    label: ASSOCIATION_LABELS[kind],
    count: getAssociationCount(kind, input),
  }))
}

const ASSOCIATION_KINDS: RecordAssociationKind[] = [
  'company',
  'contacts',
  'opportunities',
  'campaigns',
  'tickets',
  'documents',
  'contracts',
  'invoices',
  'automations',
]

function isRecord360TabAvailable(key: Record360Tab['key'], input: Record360Input) {
  if (key === 'conversations') return (input.conversationCount ?? 0) > 0 || Boolean(input.hasConversationModule)
  if (key === 'proposals_revenue') {
    return (input.proposalCount ?? 0) > 0
      || sanitizeCount(input.revenueValue) > 0
      || Boolean(input.hasRevenueModule)
  }
  if (key === 'intelligence') {
    return hasText(input.aiSummary)
      || (input.aiInsightCount ?? 0) > 0
      || Boolean(input.hasAiModule)
  }
  return true
}

function findOverdueTask(input: Record360Input): Record360TaskSummary | undefined {
  const task = input.tasks?.find(item => isOverdueTask(item, input.currentDate))
  if (task) return task

  if ((input.overdueTaskCount ?? 0) > 0) {
    return {
      title: input.nextActionLabel ?? 'Resolver tarefa vencida',
      dueAt: input.nextActionAt ?? undefined,
      status: 'overdue',
    }
  }

  return undefined
}

function isOverdueTask(task: Record360TaskSummary, currentDate: Record360Input['currentDate']) {
  if (task.status === 'completed' || task.status === 'cancelled') return false
  if (task.status === 'overdue') return true
  if (!task.dueAt) return false

  const dueAt = new Date(task.dueAt)
  const now = currentDate ? new Date(currentDate) : new Date()

  return isValidDate(dueAt) && isValidDate(now) && dueAt.getTime() < now.getTime()
}

function findOpenProposal(input: Record360Input): Record360ProposalSummary | undefined {
  const proposal = input.proposals?.find(item => isOpenProposal(item))
  if (proposal) return proposal

  if ((input.openProposalCount ?? 0) > 0) {
    return {
      title: 'Acompanhar proposta aberta',
      status: 'open',
    }
  }

  return undefined
}

function isOpenProposal(proposal: Record360ProposalSummary) {
  return proposal.status === 'open' || proposal.status === 'sent' || proposal.status === 'viewed'
}

function hasRecentUnansweredConversation(input: Record360Input) {
  return Boolean(input.hasRecentUnansweredConversation)
    || (input.unansweredConversationCount ?? 0) > 0
    || hasText(input.recentUnansweredConversationAt)
}

function hasNextAction(input: Record360Input) {
  if (hasText(input.nextActionLabel) || hasText(input.nextActionAt)) return true
  if ((input.pendingTaskCount ?? 0) > 0 || (input.overdueTaskCount ?? 0) > 0) return true
  return Boolean(input.tasks?.some(task => task.status !== 'completed' && task.status !== 'cancelled'))
}

function hasOwner(input: Record360Input) {
  return hasText(input.ownerId) || hasText(input.ownerName) || hasText(input.assignedTo)
}

function hasCompany(input: Record360Input) {
  if (hasText(input.companyId) || hasText(input.companyName) || hasText(input.company)) return true
  return input.type === 'company' && hasText(input.name)
}

function getAssociationCount(kind: RecordAssociationKind, input: Record360Input) {
  const explicitCount = input.associationCounts?.[kind]
  if (explicitCount !== undefined) return sanitizeCount(explicitCount)

  if (kind === 'company') return sanitizeCount(input.companyCount ?? (hasCompany(input) ? 1 : 0))
  if (kind === 'contacts') return sanitizeCount(input.contactCount)
  if (kind === 'opportunities') return sanitizeCount(input.opportunityCount)
  if (kind === 'campaigns') return sanitizeCount(input.campaignCount)
  if (kind === 'tickets') return sanitizeCount(input.ticketCount)
  if (kind === 'documents') return sanitizeCount(input.documentCount)
  if (kind === 'contracts') return sanitizeCount(input.contractCount)
  if (kind === 'invoices') return sanitizeCount(input.invoiceCount)
  return sanitizeCount(input.automationCount)
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim())
}

function sanitizeCount(value: number | undefined) {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
}
