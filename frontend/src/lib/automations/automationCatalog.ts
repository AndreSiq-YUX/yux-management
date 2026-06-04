import type { AutomationCatalogTrigger } from '@/types/intelligentAutomation'

export const automationTriggerCatalog: AutomationCatalogTrigger[] = [
  { key: 'lead.created', module: 'crm', label: 'Lead criado', payloadSchema: { leadId: 'string', source: 'string' } },
  { key: 'lead.stage_changed', module: 'crm', label: 'Lead mudou de etapa', payloadSchema: { leadId: 'string', stageId: 'string' } },
  { key: 'lead.status_changed', module: 'crm', label: 'Status do lead mudou', payloadSchema: { leadId: 'string', status: 'string' } },
  { key: 'conversation.created', module: 'omnichannel', label: 'Conversa criada', payloadSchema: { conversationId: 'string', channel: 'string' } },
  { key: 'conversation.unanswered', module: 'omnichannel', label: 'Conversa sem resposta', payloadSchema: { conversationId: 'string', minutes: 'number' } },
  { key: 'conversation.handoff', module: 'omnichannel', label: 'Atendimento transferido', payloadSchema: { conversationId: 'string', assigneeId: 'string' } },
  { key: 'landing_page.form_submitted', module: 'landing_pages', label: 'Formulario enviado', payloadSchema: { landingPageId: 'string', leadId: 'string' } },
  { key: 'proposal.approved', module: 'proposals', label: 'Proposta aprovada', payloadSchema: { proposalId: 'string', leadId: 'string' } },
  { key: 'proposal.viewed', module: 'proposals', label: 'Proposta visualizada', payloadSchema: { proposalId: 'string', leadId: 'string' } },
  { key: 'project.phase_delayed', module: 'projects', label: 'Fase atrasada', payloadSchema: { projectId: 'string', phaseId: 'string' } },
  { key: 'invoice.overdue', module: 'finance', label: 'Fatura vencida', payloadSchema: { invoiceId: 'string', daysOverdue: 'number' } },
  { key: 'campaign.cpl_above_threshold', module: 'campaigns', label: 'CPL acima do limite', payloadSchema: { campaignId: 'string', cpl: 'number' } },
  { key: 'report.anomaly_detected', module: 'reports', label: 'Anomalia detectada', payloadSchema: { reportId: 'string', metricKey: 'string' } },
  { key: 'ticket.created', module: 'support', label: 'Ticket criado', payloadSchema: { ticketId: 'string', priority: 'string' } },
  { key: 'ticket.overdue', module: 'support', label: 'Ticket atrasado', payloadSchema: { ticketId: 'string', slaHours: 'number' } },
]
