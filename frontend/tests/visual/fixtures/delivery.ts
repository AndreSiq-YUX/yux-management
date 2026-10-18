import { CLIENT, ids, uid } from './ids'
import { dayAgoDate, dayAheadDate, daysAgo, daysFromNow, hoursAgo } from './time'
import type { MockRoute } from './types'
import { leads } from './crm'

/* ------------------------------ Financeiro ------------------------------ */

const invoiceRow = (n: number, over: Record<string, unknown>) => ({
  id: uid('invoice', n),
  organization_id: ids.organization,
  client_id: ids.client,
  contract_id: ids.contract,
  currency: 'BRL',
  adjustments: 0,
  paid_amount: 0,
  clients: { company_name: CLIENT.companyName },
  contracts: { name: 'Growth Comercial 2026', billing_cycle: 'monthly' },
  created_at: daysAgo(40),
  updated_at: daysAgo(2),
  ...over,
})

const item = (invoiceN: number, n: number, description: string, amount: number, kind: string, quantity = 1) => ({
  id: uid('billing-item', invoiceN * 10 + n),
  invoice_id: uid('invoice', invoiceN),
  description,
  quantity,
  unit_amount: amount,
  total_amount: amount * quantity,
  kind,
  created_at: daysAgo(40),
  updated_at: daysAgo(40),
})

export const invoices = [
  invoiceRow(1, {
    invoice_number: '2026-014', status: 'issued', issue_date: dayAgoDate(2), due_date: dayAheadDate(3),
    period_start: dayAgoDate(28), period_end: dayAheadDate(2), subtotal: 6800, total_amount: 6800,
    notes: 'Mensalidade Growth Comercial — competência atual.',
    billing_items: [item(1, 1, 'Plano Growth Comercial (mensal)', 5400, 'recurring'), item(1, 2, 'Gestão de mídia paga', 1400, 'recurring')],
  }),
  invoiceRow(2, {
    invoice_number: '2026-013', status: 'paid', issue_date: dayAgoDate(32), due_date: dayAgoDate(27), paid_amount: 6800, paid_at: daysAgo(28),
    period_start: dayAgoDate(58), period_end: dayAgoDate(29), subtotal: 6800, total_amount: 6800,
    billing_items: [item(2, 1, 'Plano Growth Comercial (mensal)', 5400, 'recurring'), item(2, 2, 'Gestão de mídia paga', 1400, 'recurring')],
  }),
  invoiceRow(3, {
    invoice_number: '2026-012', status: 'paid', issue_date: dayAgoDate(62), due_date: dayAgoDate(57), paid_amount: 7300, paid_at: daysAgo(58),
    subtotal: 7300, total_amount: 7300,
    billing_items: [item(3, 1, 'Plano Growth Comercial (mensal)', 5400, 'recurring'), item(3, 2, 'Gestão de mídia paga', 1400, 'recurring'), item(3, 3, 'Landing page — campanha Implantes', 500, 'usage')],
  }),
  invoiceRow(4, {
    invoice_number: '2026-011', status: 'paid', issue_date: dayAgoDate(92), due_date: dayAgoDate(87), paid_amount: 8800, paid_at: daysAgo(88),
    subtotal: 8800, total_amount: 8800,
    billing_items: [item(4, 1, 'Setup e onboarding', 2000, 'setup'), item(4, 2, 'Plano Growth Comercial (mensal)', 5400, 'recurring'), item(4, 3, 'Gestão de mídia paga', 1400, 'recurring')],
  }),
]

/* ------------------------------ Projetos ------------------------------ */

const projectBase = {
  currency: 'BRL', clientId: ids.client, isActive: true, isArchived: false,
  client: { id: ids.client, companyName: CLIENT.companyName, contactName: CLIENT.contactName, email: CLIENT.email },
}

export const projects = [
  {
    ...projectBase, id: uid('project', 1), name: 'Reposicionamento digital da clínica',
    description: 'Novo site, identidade de comunicação e jornada de captação de pacientes.',
    status: 'ACTIVE', priority: 'HIGH', type: 'MARKETING', startDate: dayAgoDate(60), expectedEndDate: dayAheadDate(45),
    createdAt: daysAgo(62), updatedAt: daysAgo(1), budget: 24000, spent: 13800, progress: 58, completedTasks: 14, totalTasks: 24,
  },
  {
    ...projectBase, id: uid('project', 2), name: 'Campanha Implantes — Outubro Rosa Sorriso',
    description: 'Campanha sazonal com landing page, anúncios e automação de WhatsApp.',
    status: 'REVIEW', priority: 'MEDIUM', type: 'MARKETING', startDate: dayAgoDate(25), expectedEndDate: dayAheadDate(10),
    createdAt: daysAgo(26), updatedAt: daysAgo(2), budget: 9500, spent: 6100, progress: 82, completedTasks: 9, totalTasks: 11,
  },
  {
    ...projectBase, id: uid('project', 3), name: 'Agente de atendimento IA no WhatsApp',
    description: 'Implantação do agente de pré-atendimento com regras de transferência.',
    status: 'PLANNING', priority: 'MEDIUM', type: 'CONSULTING', startDate: dayAheadDate(5), expectedEndDate: dayAheadDate(70),
    createdAt: daysAgo(5), updatedAt: daysAgo(3), budget: 12000, spent: 0, progress: 6, completedTasks: 1, totalTasks: 16,
  },
  {
    ...projectBase, id: uid('project', 4), name: 'Site institucional v1',
    description: 'Site responsivo com páginas de tratamentos e agendamento online.',
    status: 'COMPLETED', priority: 'LOW', type: 'WEBSITE', startDate: dayAgoDate(140), expectedEndDate: dayAgoDate(80), actualEndDate: dayAgoDate(78),
    createdAt: daysAgo(141), updatedAt: daysAgo(78), budget: 15000, spent: 14200, progress: 100, completedTasks: 18, totalTasks: 18,
  },
]

const phases = (projectId: string) => [
  { id: uid('phase', 1), projectId, name: 'Diagnóstico e estratégia', status: 'completed', progress: 100, orderIndex: 0, startDate: dayAgoDate(60), endDate: dayAgoDate(40), createdAt: daysAgo(60), updatedAt: daysAgo(40) },
  { id: uid('phase', 2), projectId, name: 'Criação e produção', status: 'in_progress', progress: 55, orderIndex: 1, startDate: dayAgoDate(40), endDate: dayAheadDate(10), createdAt: daysAgo(60), updatedAt: daysAgo(2) },
  { id: uid('phase', 3), projectId, name: 'Publicação e otimização', status: 'planning', progress: 0, orderIndex: 2, startDate: dayAheadDate(10), endDate: dayAheadDate(45), createdAt: daysAgo(60), updatedAt: daysAgo(60) },
]

const deliverablesFor = (projectId: string) => [
  { id: uid('deliverable', 1), projectId, phaseId: uid('phase', 1), title: 'Diagnóstico de presença digital', description: 'Análise de site, redes e concorrentes.', status: 'approved', dueDate: dayAgoDate(42), deliveredAt: daysAgo(41), externalUrl: 'https://docs.example/diagnostico', isClientVisible: true, createdAt: daysAgo(60), updatedAt: daysAgo(40) },
  { id: uid('deliverable', 2), projectId, phaseId: uid('phase', 2), title: 'Wireframes das páginas de tratamento', status: 'in_review', dueDate: dayAheadDate(1), deliveredAt: daysAgo(1), externalUrl: 'https://figma.example/wireframes', isClientVisible: true, createdAt: daysAgo(30), updatedAt: daysAgo(1) },
  { id: uid('deliverable', 3), projectId, phaseId: uid('phase', 2), title: 'Guia de tom de voz e mensagens', status: 'delivered', dueDate: dayAheadDate(4), deliveredAt: daysAgo(2), isClientVisible: true, createdAt: daysAgo(30), updatedAt: daysAgo(2) },
  { id: uid('deliverable', 4), projectId, phaseId: uid('phase', 3), title: 'Calendário de publicações — 1º mês', status: 'draft', dueDate: dayAheadDate(14), isClientVisible: true, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
]

const tasksFor = (projectId: string) => [
  { id: uid('ptask', 1), projectId, phaseId: uid('phase', 2), title: 'Fotografar equipe e consultórios', status: 'in_progress', priority: 'high', dueDate: dayAheadDate(3), orderIndex: 0, isClientVisible: true, createdAt: daysAgo(20), updatedAt: daysAgo(1) },
  { id: uid('ptask', 2), projectId, phaseId: uid('phase', 2), title: 'Enviar depoimentos de pacientes', status: 'pending', priority: 'medium', dueDate: dayAgoDate(2), orderIndex: 1, isClientVisible: true, createdAt: daysAgo(20), updatedAt: daysAgo(5) },
  { id: uid('ptask', 3), projectId, phaseId: uid('phase', 1), title: 'Reunião de alinhamento de estratégia', status: 'completed', priority: 'medium', completedAt: daysAgo(44), orderIndex: 2, isClientVisible: true, createdAt: daysAgo(60), updatedAt: daysAgo(44) },
]

export const approvals = [
  { id: uid('approval', 1), projectId: uid('project', 1), targetType: 'deliverable', targetId: uid('deliverable', 2), title: 'Aprovar wireframes das páginas de tratamento', instructions: 'Confira a estrutura das páginas de implante, ortodontia e estética.', status: 'pending', isClientVisible: true, submittedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  { id: uid('approval', 2), projectId: uid('project', 2), targetType: 'creative', targetId: uid('creative', 1), title: 'Aprovar anúncios da campanha Implantes', instructions: 'Três variações de imagem e texto para Meta Ads.', status: 'pending', isClientVisible: true, submittedAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: daysAgo(3) },
  { id: uid('approval', 3), projectId: uid('project', 1), targetType: 'document', targetId: uid('doc', 1), title: 'Guia de tom de voz', status: 'approved', isClientVisible: true, submittedAt: daysAgo(12), decidedAt: daysAgo(10), createdAt: daysAgo(12), updatedAt: daysAgo(10), decisions: [{ id: uid('decision', 1), approvalRequestId: uid('approval', 3), decision: 'approved', comment: 'Ficou ótimo, pode seguir.', decidedBy: 'Mariana Costa', createdAt: daysAgo(10) }] },
  { id: uid('approval', 4), projectId: uid('project', 4), targetType: 'deliverable', targetId: uid('deliverable', 9), title: 'Entrega final do site', status: 'changes_requested', isClientVisible: true, submittedAt: daysAgo(90), decidedAt: daysAgo(88), createdAt: daysAgo(90), updatedAt: daysAgo(88), decisions: [{ id: uid('decision', 2), approvalRequestId: uid('approval', 4), decision: 'changes_requested', comment: 'Trocar a foto da home.', decidedBy: 'Mariana Costa', createdAt: daysAgo(88) }] },
]

const timeline = (projectId: string) => [
  { id: uid('timeline', 1), projectId, entryType: 'approval_requested', title: 'Aprovação solicitada: wireframes', metadata: {}, origin: 'automatic', isClientVisible: true, createdAt: daysAgo(1) },
  { id: uid('timeline', 2), projectId, entryType: 'manual_update', title: 'Sessão de fotos agendada', body: 'Equipe de foto estará na clínica na próxima semana.', metadata: {}, origin: 'manual', isClientVisible: true, createdAt: daysAgo(4) },
  { id: uid('timeline', 3), projectId, entryType: 'deliverable_created', title: 'Guia de tom de voz entregue', metadata: {}, origin: 'automatic', isClientVisible: true, createdAt: daysAgo(12) },
]

/* ------------------------------ Propostas ------------------------------ */

const proposalBase = {
  organizationId: ids.organization, leadId: leads[12].id, clientId: ids.client, packageId: ids.package,
  billingCycle: 'monthly', selectedModuleKeys: ['crm', 'whatsapp_ai', 'campaigns'],
}

const proposalItems = (proposalId: string) => [
  { id: uid('pitem', 1), proposalId, itemKey: 'crm', label: 'CRM e funis comerciais', description: 'Implantação e operação mensal.', quantity: 1, unitValue: 2400, totalValue: 2400, orderIndex: 0 },
  { id: uid('pitem', 2), proposalId, itemKey: 'whatsapp_ai', label: 'Agente IA no WhatsApp', quantity: 1, unitValue: 2800, totalValue: 2800, orderIndex: 1 },
  { id: uid('pitem', 3), proposalId, itemKey: 'campaigns', label: 'Gestão de campanhas', quantity: 1, unitValue: 1600, totalValue: 1600, orderIndex: 2 },
]

export const proposals = [
  { ...proposalBase, id: uid('proposal', 1), status: 'sent', title: 'Expansão Growth — Agente IA e campanhas', scope: 'Ampliação do plano com agente de atendimento IA e gestão de campanhas de captação.', finalValue: 6800, currentVersionId: uid('pversion', 1), items: proposalItems(uid('proposal', 1)) },
  { ...proposalBase, id: uid('proposal', 2), status: 'approved', title: 'Landing pages de tratamento (pacote 3)', scope: 'Três landing pages com formulário integrado ao CRM.', finalValue: 4500, currentVersionId: uid('pversion', 2), items: proposalItems(uid('proposal', 2)).slice(0, 2) },
  { ...proposalBase, id: uid('proposal', 3), status: 'adjustments_requested', title: 'Conteúdo orgânico — trimestre', scope: '12 posts/mês e 4 artigos de blog.', finalValue: 3200, currentVersionId: uid('pversion', 3), items: proposalItems(uid('proposal', 3)).slice(1) },
]

const versions = (proposal: (typeof proposals)[number], n: number, status: string) => [{
  id: uid('pversion', n), proposalId: proposal.id, versionNumber: 1, status, sentAt: daysAgo(6 + n * 3),
  decidedAt: status === 'pending' ? undefined : daysAgo(4 + n),
  snapshot: { ...proposal, currentVersionId: undefined },
}]

export const deliveryRoutes: MockRoute[] = [
  { method: 'GET', path: '/finance/portal/invoices', respond: () => invoices },
  { method: 'GET', path: '/project-delivery/portal/projects', respond: () => ({ projects }) },
  {
    method: 'GET',
    path: /^\/project-delivery\/portal\/projects\/([^/]+)$/,
    respond: ({ params }) => {
      const projectId = decodeURIComponent(params[0])
      return {
        tasks: tasksFor(projectId),
        phases: phases(projectId),
        deliverables: deliverablesFor(projectId),
        approvals: approvals.filter(approval => approval.projectId === projectId),
        timeline: timeline(projectId),
      }
    },
  },
  { method: 'GET', path: '/project-delivery/portal/approvals', respond: () => ({ approvals }) },
  { method: 'GET', path: '/proposals/portal', respond: () => proposals },
  {
    method: 'GET',
    path: /^\/proposals\/([^/]+)\/versions$/,
    respond: ({ params }) => {
      const index = proposals.findIndex(proposal => proposal.id === params[0])
      const proposal = proposals[Math.max(0, index)]
      return versions(proposal, index + 1, ['pending', 'approved', 'adjustments_requested'][Math.max(0, index)])
    },
  },
  { method: 'GET', path: '/proposals/decisions', respond: () => [] },
  {
    method: 'GET',
    path: '/support/portal/tickets',
    respond: () => [
      {
        id: uid('ticket', 1), organization_id: ids.organization, client_id: ids.client, contract_id: ids.contract, project_id: uid('project', 2),
        subject: 'Alterar horário de atendimento nos anúncios', category: 'request', priority: 'medium', status: 'in_progress',
        sla_due_at: daysFromNow(1), last_message_at: hoursAgo(5), created_at: daysAgo(2), updated_at: hoursAgo(5),
        projects: { name: 'Campanha Implantes — Outubro Rosa Sorriso' },
        support_messages: [
          { id: uid('msg', 1), ticket_id: uid('ticket', 1), author_type: 'client', author_name: 'Mariana Costa', body: 'Precisamos ajustar o horário nos anúncios: a clínica passa a atender aos sábados.', is_internal: false, created_at: daysAgo(2), updated_at: daysAgo(2) },
          { id: uid('msg', 2), ticket_id: uid('ticket', 1), author_type: 'internal', author_name: 'Equipe YUX', body: 'Recebido! Já estamos atualizando as campanhas e a landing page.', is_internal: false, created_at: hoursAgo(5), updated_at: hoursAgo(5) },
        ],
      },
      {
        id: uid('ticket', 2), organization_id: ids.organization, client_id: ids.client, contract_id: ids.contract,
        subject: 'Dúvida sobre a fatura de setembro', category: 'billing', priority: 'low', status: 'waiting_client',
        sla_due_at: daysFromNow(3), last_message_at: daysAgo(1), created_at: daysAgo(4), updated_at: daysAgo(1),
        support_messages: [
          { id: uid('msg', 3), ticket_id: uid('ticket', 2), author_type: 'client', author_name: 'Mariana Costa', body: 'Qual o motivo do valor adicional de R$ 500?', is_internal: false, created_at: daysAgo(4), updated_at: daysAgo(4) },
          { id: uid('msg', 4), ticket_id: uid('ticket', 2), author_type: 'internal', author_name: 'Financeiro YUX', body: 'É a landing page extra da campanha de implantes. Pode confirmar?', is_internal: false, created_at: daysAgo(1), updated_at: daysAgo(1) },
        ],
      },
      {
        id: uid('ticket', 3), organization_id: ids.organization, client_id: ids.client, contract_id: ids.contract,
        subject: 'Acesso do novo recepcionista ao CRM', category: 'access', priority: 'high', status: 'resolved',
        sla_due_at: daysAgo(8), last_message_at: daysAgo(9), resolved_at: daysAgo(9), created_at: daysAgo(12), updated_at: daysAgo(9),
        support_messages: [
          { id: uid('msg', 5), ticket_id: uid('ticket', 3), author_type: 'client', author_name: 'Mariana Costa', body: 'Podem liberar o acesso do Rafael?', is_internal: false, created_at: daysAgo(12), updated_at: daysAgo(12) },
          { id: uid('msg', 6), ticket_id: uid('ticket', 3), author_type: 'internal', author_name: 'Equipe YUX', body: 'Acesso liberado e convite enviado.', is_internal: false, created_at: daysAgo(9), updated_at: daysAgo(9) },
        ],
      },
    ],
  },
  {
    method: 'GET',
    path: /^\/reports\/portal\/operational\/[^/]+$/,
    respond: () => ({
      organizationId: ids.organization,
      generatedAt: new Date().toISOString(),
      leadsBySource: [
        { source: 'Meta Ads', leads: 9 }, { source: 'Landing page', leads: 5 }, { source: 'WhatsApp', leads: 4 },
        { source: 'Google Ads', leads: 4 }, { source: 'Indicação', leads: 3 }, { source: 'Orgânico', leads: 2 },
      ],
      stageConversions: [
        { stage: 'Novo contato', entered: 27, advanced: 20, conversionRate: 74.1 },
        { stage: 'Qualificado', entered: 20, advanced: 14, conversionRate: 70 },
        { stage: 'Avaliação agendada', entered: 14, advanced: 10, conversionRate: 71.4 },
        { stage: 'Orçamento enviado', entered: 10, advanced: 6, conversionRate: 60 },
        { stage: 'Negociação', entered: 6, advanced: 3, conversionRate: 50 },
      ],
      responseTimeHours: 1.8,
      stalledOpportunities: 4,
      campaignMetrics: [
        { campaignId: uid('campaign', 1), name: 'Implantes — Outubro', spend: 4200, impressions: 128000, clicks: 3150, leads: 46, cpl: 91.3, opportunities: 18, proposals: 9, clients: 4, revenue: 41200, mroi: 8.8, syncStatus: 'connected' },
        { campaignId: uid('campaign', 2), name: 'Clareamento — Verão', spend: 1800, impressions: 76000, clicks: 1900, leads: 31, cpl: 58.1, opportunities: 12, proposals: 6, clients: 3, revenue: 11700, mroi: 5.5, syncStatus: 'connected' },
        { campaignId: uid('campaign', 3), name: 'Google — Dentista perto de mim', spend: 2600, impressions: 41000, clicks: 1380, leads: 22, cpl: 118.2, opportunities: 8, proposals: 3, clients: 1, revenue: 9400, mroi: 2.6, syncStatus: 'stale' },
      ],
      landingPageMetrics: [
        { landingPageId: uid('lp', 1), name: 'Implantes — avaliação gratuita', visits: 2410, leads: 118, conversionRate: 4.9 },
        { landingPageId: uid('lp', 2), name: 'Clareamento a laser', visits: 1520, leads: 64, conversionRate: 4.2 },
      ],
      proposalMetrics: { sent: 14, approved: 8, approvalRate: 57.1 },
      projectDelivery: [
        { label: 'Entregas no prazo', value: 92, unit: '%' },
        { label: 'Aprovações pendentes', value: 2 },
        { label: 'Projetos ativos', value: 3 },
      ],
      executiveCampaignSummary: {
        spend: 8600, impressions: 245000, clicks: 6430, leads: 99, cpl: 86.9, opportunities: 38, proposals: 18, clients: 8,
        revenue: 62300, mroi: 7.2, syncStatus: 'connected', aiRecommendation: 'Realoque 15% da verba de Google para implantes na Meta, que converte 2x mais.',
      },
      aiInsight: {
        topOpportunity: 'Leads de implante têm o maior ticket e a melhor taxa de fechamento.',
        periodChange: 'Leads +18% e custo por lead -9% em relação aos 30 dias anteriores.',
        dataGaps: ['Conectar o Google Ads para atribuição completa.'],
      },
    }),
  },
]
