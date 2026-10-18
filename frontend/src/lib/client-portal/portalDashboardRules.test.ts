import { describe, expect, it } from 'vitest'
import type { CrmLead } from '@/types/crm'
import type { ApprovalRequest } from '@/types/project'
import {
  buildGreeting,
  buildLeadSentence,
  buildPortalDashboardModel,
  buildYourTurn,
  getModuleGridColumns,
  resolveDashboardWindow,
  type PortalDashboardInput,
  type PortalDashboardWindow,
} from './portalDashboardRules'

const baseInput = (overrides: Partial<PortalDashboardInput> = {}): PortalDashboardInput => ({
  organization: {
    id: 'org-1',
    name: 'Empresa ABC',
    slug: 'empresa-abc',
    kind: 'client',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  contract: {
    id: 'contract-1',
    clientId: 'client-1',
    packageId: 'package-1',
    status: 'active',
    name: 'Growth Comercial',
    startsAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    package: {
      id: 'package-1',
      key: 'growth',
      name: 'Growth',
      description: 'Pacote Growth',
      moduleKeys: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
  },
  enabledModuleKeys: ['crm'],
  actions: [],
  projects: [],
  approvals: [],
  invoices: [],
  crm: {
    leads: [],
    tasks: [],
    loading: false,
    error: null,
  },
  marketing: {
    campaigns: [],
    contents: [],
    reviews: [],
    creativeSuggestions: [],
    workflowRuns: [],
    loading: false,
    error: null,
  },
  actionLoading: false,
  actionError: null,
  windowLabel: '7 dias',
  ...overrides,
})

describe('portalDashboardRules', () => {
  it('prioriza foco comercial quando o contrato tem CRM', () => {
    const model = buildPortalDashboardModel(baseInput({
      crm: {
        leads: [
          {
            id: 'lead-1',
            organizationId: 'org-1',
            pipelineId: 'pipeline-1',
            stageId: 'stage-1',
            name: 'Oportunidade enterprise',
            email: 'lead@example.com',
            source: 'site',
            score: 72,
            value: 12000,
            status: 'open',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        tasks: [],
        loading: false,
        error: null,
      },
    }))

    expect(model.focus).toBe('commercial')
    expect(model.mainResult.title).toBe('Funil comercial')
    expect(model.mainResult.kind).toBe('funnel')
    expect(model.mainResult.headline).toBe('R$ 12 mil')
    expect(model.mainResult.headlineDetail).toBe('em 1 oportunidade aberta')
  })

  it('muda para foco executivo quando o contrato combina frentes diferentes', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns', 'projects'],
    }))

    expect(model.focus).toBe('executive')
    expect(model.focusLabel).toBe('Foco executivo')
  })

  it('respeita override de foco editavel pela YUX', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns', 'projects'],
      focusOverride: 'marketing',
    }))

    expect(model.focus).toBe('marketing')
    expect(model.mainResult.title).toBe('Leads por campanha')
    // Sem campanhas contratadas/carregadas: estado vazio honesto, nunca números inventados.
    expect(model.mainResult.kind).toBe('empty')
    expect(model.pulse).toEqual([])
  })

  it('oferece modulos ainda nao contratados como expansao contextual', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns'],
      crm: {
        leads: [],
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 1',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'task-2',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 2',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'task-3',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 3',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        loading: false,
        error: null,
      },
    }))

    expect(model.expansionSuggestions.map(suggestion => suggestion.moduleKey)).toContain('automations')
    expect(model.expansionSuggestions.length).toBeLessThanOrEqual(2)
  })

  it('sinaliza dados parciais ou falha quando fontes nao carregam', () => {
    const partial = buildPortalDashboardModel(baseInput({
      actionError: 'Falha parcial',
      actions: [{
        id: 'approval-1',
        kind: 'approval',
        priority: 'high',
        title: 'Aprovacao pendente',
        description: 'Existe uma aprovacao pendente.',
        href: '/portal/projetos/aprovacoes',
      }],
    }))
    const failed = buildPortalDashboardModel(baseInput({
      actionError: 'Falha geral',
    }))

    expect(partial.dataStatus).toBe('Parcial')
    expect(failed.dataStatus).toBe('Com falha')
  })
})

// ---------------------------------------------------------------------------
// Filtro de período
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 9, 17, 15, 0, 0)
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString()

const lead = (id: string, createdAt: string, overrides: Partial<CrmLead> = {}): CrmLead => ({
  id,
  organizationId: 'org-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: `Lead ${id}`,
  email: `${id}@example.com`,
  source: 'site',
  score: 50,
  value: 1000,
  status: 'open',
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

const crmInput = (leads: CrmLead[], windowLabel: PortalDashboardWindow, overrides: Partial<PortalDashboardInput> = {}) => baseInput({
  windowLabel,
  now: NOW,
  crm: { leads, tasks: [], loading: false, error: null },
  ...overrides,
})

const metric = (model: ReturnType<typeof buildPortalDashboardModel>, id: string) => {
  const found = model.pulse.find(item => item.id === id)
  if (!found) throw new Error(`métrica ${id} não encontrada`)
  return found
}

// A: hoje (2h atrás) | B: ontem 13h | C: 5 dias | D: 10 dias | E: 40 dias
const periodLeads = () => [
  lead('A', ago(0, 2)),
  lead('B', ago(1, 2)),
  lead('C', ago(5)),
  lead('D', ago(10)),
  lead('E', ago(40)),
]

describe('resolveDashboardWindow', () => {
  it('Hoje vai da meia-noite local até agora e compara com o mesmo trecho de ontem', () => {
    const range = resolveDashboardWindow('Hoje', NOW)

    expect(range.start).toEqual(new Date(2026, 9, 17, 0, 0, 0))
    expect(range.end).toEqual(NOW)
    expect(range.previousStart).toEqual(new Date(2026, 9, 16, 0, 0, 0))
    expect(range.previousEnd).toEqual(new Date(2026, 9, 16, 15, 0, 0))
    expect(range.comparisonLabel).toBe('vs. ontem')
  })

  it('7 e 30 dias usam janela móvel e período anterior de mesmo tamanho', () => {
    const week = resolveDashboardWindow('7 dias', NOW)
    expect(week.start).toEqual(new Date(2026, 9, 10, 15, 0, 0))
    expect(week.previousStart).toEqual(new Date(2026, 9, 3, 15, 0, 0))
    expect(week.previousEnd).toEqual(week.start)
    expect(week.comparisonLabel).toBe('vs. 7 dias antes')

    const month = resolveDashboardWindow('30 dias', NOW)
    expect(month.start).toEqual(new Date(2026, 8, 17, 15, 0, 0))
    expect(month.previousStart).toEqual(new Date(2026, 7, 18, 15, 0, 0))
    expect(month.comparisonLabel).toBe('vs. 30 dias antes')
  })
})

describe('portalDashboardRules: filtro de período', () => {
  it('conta novos leads só dentro de cada janela e compara com o período anterior', () => {
    const leads = periodLeads()

    const today = metric(buildPortalDashboardModel(crmInput(leads, 'Hoje')), 'new-leads')
    expect(today.kind).toBe('period')
    expect(today.value).toBe('1')
    expect(today.delta).toEqual({ text: 'Sem variação', tone: 'flat' })
    expect(today.comparison).toBe('vs. ontem')

    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'new-leads')
    expect(week.value).toBe('3')
    expect(week.delta).toEqual({ text: '+2 (+200%)', tone: 'good' })
    expect(week.comparison).toBe('vs. 7 dias antes')

    const month = metric(buildPortalDashboardModel(crmInput(leads, '30 dias')), 'new-leads')
    expect(month.value).toBe('4')
    expect(month.delta).toEqual({ text: '+3 (+300%)', tone: 'good' })
    expect(month.comparison).toBe('vs. 30 dias antes')
  })

  it('sinaliza queda de novos leads como ruim', () => {
    const leads = [lead('old-1', ago(9)), lead('old-2', ago(10)), lead('old-3', ago(11)), lead('new', ago(2))]
    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'new-leads')

    expect(week.value).toBe('1')
    expect(week.delta).toEqual({ text: '-2 (-67%)', tone: 'bad' })
  })

  it('monta a série diária (7 e 30 pontos) e a horária em Hoje', () => {
    const leads = periodLeads()

    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'new-leads').spark
    expect(week).toHaveLength(7)
    expect(week?.reduce((sum, value) => sum + value, 0)).toBe(3)
    expect(week?.slice(-2)).toEqual([1, 1])

    const month = metric(buildPortalDashboardModel(crmInput(leads, '30 dias')), 'new-leads').spark
    expect(month).toHaveLength(30)
    expect(month?.reduce((sum, value) => sum + value, 0)).toBe(4)

    const today = metric(buildPortalDashboardModel(crmInput(leads, 'Hoje')), 'new-leads').spark
    expect(today).toHaveLength(16)
    expect(today?.[13]).toBe(1)
  })

  it('posição atual não é filtrada pela janela', () => {
    const leads = periodLeads()
    const values = (['Hoje', '7 dias', '30 dias'] as const).map(windowLabel => {
      const opportunities = metric(buildPortalDashboardModel(crmInput(leads, windowLabel)), 'opportunities')
      return { kind: opportunities.kind, value: opportunities.value, detail: opportunities.detail, spark: opportunities.spark }
    })

    expect(values.map(item => item.value)).toEqual(['5', '5', '5'])
    expect(new Set(values.map(item => item.detail)).size).toBe(1)
    expect(values.every(item => item.kind === 'position' && item.spark === undefined)).toBe(true)
  })

  it('calcula a variação da posição desde o início do período usando wonAt/lostAt', () => {
    const leads = [
      ...periodLeads(),
      lead('F', ago(20), { status: 'won', wonAt: ago(3) }),
    ]
    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'opportunities')

    // Há 7 dias estavam abertos D, E e F (3); hoje A..E (5).
    expect(week.value).toBe('5')
    expect(week.delta).toEqual({ text: '+2 (+67%)', tone: 'good' })
    expect(week.comparison).toBe('vs. 7 dias antes')
  })

  it('não exibe variação de posição quando falta data de fechamento', () => {
    const leads = [...periodLeads(), lead('F', ago(20), { status: 'won' })]
    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'opportunities')

    expect(week.delta).toBeUndefined()
    expect(week.comparison).toBeUndefined()
  })

  it('conversão considera só leads fechados na janela e compara com a janela anterior', () => {
    const leads = [
      lead('w1', ago(30), { status: 'won', wonAt: ago(2) }),
      lead('l1', ago(30), { status: 'lost', lostAt: ago(3) }),
      lead('w2', ago(30), { status: 'won', wonAt: ago(4) }),
      lead('w3', ago(30), { status: 'won', wonAt: ago(5) }),
      lead('p1', ago(30), { status: 'won', wonAt: ago(9) }),
      lead('p2', ago(30), { status: 'lost', lostAt: ago(10) }),
      lead('p3', ago(30), { status: 'lost', lostAt: ago(11) }),
      lead('p4', ago(30), { status: 'lost', lostAt: ago(12) }),
    ]
    const week = metric(buildPortalDashboardModel(crmInput(leads, '7 dias')), 'conversion')

    expect(week.kind).toBe('period')
    expect(week.value).toBe('75%')
    expect(week.detail).toBe('3 ganhos de 4 fechados')
    // anterior: 1 ganho de 4 = 25% -> +50 p.p.
    expect(week.delta).toEqual({ text: '+50 p.p.', tone: 'good' })

    const today = metric(buildPortalDashboardModel(crmInput(leads, 'Hoje')), 'conversion')
    expect(today.value).toBe('Sem dados')
    expect(today.delta).toBeUndefined()
  })

  it('respeita "quanto maior, pior" nas variações (aprovações pendentes)', () => {
    const approval = (id: string, submittedAt: string, status: ApprovalRequest['status'], decidedAt?: string) => ({
      id,
      projectId: 'p-1',
      targetType: 'deliverable',
      targetId: id,
      title: id,
      status,
      isClientVisible: true,
      submittedAt,
      decidedAt,
      createdAt: submittedAt,
      updatedAt: decidedAt || submittedAt,
    }) as unknown as ApprovalRequest

    const model = buildPortalDashboardModel(baseInput({
      windowLabel: '7 dias',
      now: NOW,
      enabledModuleKeys: ['projects'],
      focusOverride: 'delivery',
      approvals: [
        approval('old-pending', ago(20), 'pending'),
        approval('old-done', ago(20), 'approved', ago(2)),
        approval('new-1', ago(3), 'pending'),
        approval('new-2', ago(1), 'pending'),
      ],
    }))
    const approvals = metric(model, 'approvals')

    // início do período: old-pending + old-done (2); agora: old-pending + new-1 + new-2 (3)
    expect(approvals.higherIsBetter).toBe(false)
    expect(approvals.value).toBe('3')
    expect(approvals.delta).toEqual({ text: '+1 (+50%)', tone: 'bad' })

    const fewer = buildPortalDashboardModel(baseInput({
      windowLabel: '7 dias',
      now: NOW,
      enabledModuleKeys: ['projects'],
      focusOverride: 'delivery',
      approvals: [
        approval('a', ago(20), 'approved', ago(2)),
        approval('b', ago(20), 'approved', ago(1)),
        approval('c', ago(20), 'pending'),
      ],
    }))
    // início: a, b, c pendentes (3); agora: só c (1)
    expect(metric(fewer, 'approvals').delta).toEqual({ text: '-2 (-67%)', tone: 'good' })
  })

  it('follow-ups vencidos usam o "agora" injetado e são "quanto maior, pior"', () => {
    const model = buildPortalDashboardModel(baseInput({
      windowLabel: '7 dias',
      now: NOW,
      crm: {
        leads: [],
        tasks: [
          { id: 't1', organizationId: 'org-1', leadId: 'l', title: 'a', status: 'pending', dueAt: ago(1) },
          { id: 't2', organizationId: 'org-1', leadId: 'l', title: 'b', status: 'pending', dueAt: new Date(NOW.getTime() + 86_400_000).toISOString() },
        ],
        loading: false,
        error: null,
      },
    }))
    const followups = metric(model, 'followups')

    expect(followups.higherIsBetter).toBe(false)
    expect(followups.kind).toBe('position')
    expect(followups.value).toBe('1')
    expect(followups.detail).toBe('de 2 pendentes')
  })

  it('campanhas acumuladas ficam como posição, sem variação nem série', () => {
    const model = buildPortalDashboardModel(baseInput({
      windowLabel: '7 dias',
      now: NOW,
      enabledModuleKeys: ['campaigns'],
      marketing: {
        campaigns: [{ id: 'c1', leads: 10, spend: 500, mroi: 2, lifecycleStatus: 'active' } as never],
        contents: [],
        reviews: [],
        creativeSuggestions: [],
        workflowRuns: [],
        loading: false,
        error: null,
      },
    }))

    expect(model.pulse.every(item => item.kind === 'position' && !item.delta && !item.spark)).toBe(true)
  })

  it('rótulo de atualização usa o horário real da carga', () => {
    const fresh = buildPortalDashboardModel(baseInput({ now: NOW, loadedAt: new Date(NOW.getTime() - 3 * 60_000) }))
    expect(fresh.generatedAtLabel).toBe('Dados atualizados há 3 min')

    const justNow = buildPortalDashboardModel(baseInput({ now: NOW, loadedAt: NOW }))
    expect(justNow.generatedAtLabel).toBe('Dados atualizados agora')

    const unknown = buildPortalDashboardModel(baseInput({ now: NOW }))
    expect(unknown.generatedAtLabel).toBe('Atualizando dados')
    expect(buildPortalDashboardModel(baseInput({ now: NOW, loadedAt: null })).generatedAtLabel).toBe('Atualizando dados')
  })
})

// ---------------------------------------------------------------------------
// Visão geral: Sua vez, Pulso por foco, Resultado, Atenção, Atividade
// ---------------------------------------------------------------------------

const approvalOf = (id: string, submittedAt: string, projectId = 'p-1', status: ApprovalRequest['status'] = 'pending') => ({
  id,
  projectId,
  targetType: 'deliverable',
  targetId: id,
  title: `Aprovação ${id}`,
  status,
  isClientVisible: true,
  submittedAt,
  createdAt: submittedAt,
  updatedAt: submittedAt,
}) as unknown as ApprovalRequest

const invoiceOf = (id: string, dueInDays: number, overrides: Record<string, unknown> = {}) => ({
  id,
  invoiceNumber: id.toUpperCase(),
  status: 'issued',
  dueDate: new Date(NOW.getTime() + dueInDays * 86_400_000).toISOString().slice(0, 10),
  totalAmount: 4800,
  paidAmount: 0,
  items: [],
  ...overrides,
}) as never

const emptyMarketing = { campaigns: [], contents: [], reviews: [], creativeSuggestions: [], workflowRuns: [], loading: false, error: null }

describe('buildYourTurn', () => {
  const allModules = ['projects', 'finance', 'marketing_studio', 'crm']

  it('ordena por urgência (fatura vencida primeiro, depois o que espera há mais tempo) e limita a 3 cartões', () => {
    const turn = buildYourTurn(baseInput({
      now: NOW,
      enabledModuleKeys: allModules,
      approvals: [
        approvalOf('recente', ago(1)),
        approvalOf('antiga', ago(6)),
        approvalOf('media', ago(3)),
      ],
      invoices: [invoiceOf('inv-1', -2), invoiceOf('inv-2', 20)],
    }))

    expect(turn.total).toBe(4)
    expect(turn.items).toHaveLength(3)
    expect(turn.items[0]).toMatchObject({ kind: 'invoice', tone: 'crit', wait: 'venceu há 2 dias' })
    expect(turn.items.slice(1).map(item => item.title)).toEqual(['Aprovação antiga', 'Aprovação media'])
    expect(turn.approvalCount).toBe(3)
  })

  it('aponta cada aprovação para o projeto e a aba de aprovações', () => {
    const turn = buildYourTurn(baseInput({
      now: NOW,
      enabledModuleKeys: ['projects'],
      approvals: [approvalOf('a', ago(2), 'proj 1')],
    }))

    expect(turn.items[0].primary).toEqual({
      label: 'Revisar e aprovar',
      href: '/portal/projetos/projetos?projectId=proj%201&tab=approvals',
    })
    expect(turn.items[0].wait).toBe('há 2 dias')
    expect(turn.items[0].moduleLabel).toBe('Projetos · aprovação')
  })

  it('inclui só faturas vencidas ou que vencem em até 7 dias, com Pagar fatura pendente', () => {
    const turn = buildYourTurn(baseInput({
      now: NOW,
      enabledModuleKeys: ['finance'],
      invoices: [
        invoiceOf('longe', 30),
        invoiceOf('perto', 3),
        invoiceOf('paga', 1, { status: 'paid', paidAmount: 4800 }),
        invoiceOf('cancelada', -3, { status: 'cancelled' }),
      ],
    }))

    expect(turn.items).toHaveLength(1)
    expect(turn.items[0]).toMatchObject({ kind: 'invoice', tone: 'warn', payInvoice: true, wait: 'vence em 3 dias' })
    expect(turn.items[0].title).toContain('Fatura nº PERTO')
    expect(turn.items[0].primary.href).toBe('/portal/financeiro')
  })

  it('conteúdos aguardando revisão só entram com o Marketing Studio contratado', () => {
    const review = { id: 'r1', contentItemId: 'c1', status: 'pending', createdAt: ago(2) } as never
    const content = { id: 'c1', title: 'Post de outubro', status: 'in_review', createdAt: ago(3), updatedAt: ago(2) } as never
    const marketing = { ...emptyMarketing, contents: [content], reviews: [review] }

    const without = buildYourTurn(baseInput({ now: NOW, enabledModuleKeys: ['crm'], marketing }))
    expect(without.items).toEqual([])

    const withStudio = buildYourTurn(baseInput({ now: NOW, enabledModuleKeys: ['marketing_studio'], marketing }))
    expect(withStudio.items[0]).toMatchObject({ kind: 'content', title: 'Post de outubro', wait: 'há 2 dias' })
    expect(withStudio.items[0].primary.href).toBe('/portal/marketing/conteudo')
  })

  it('sem nada pendente devolve lista vazia e total zero', () => {
    const turn = buildYourTurn(baseInput({ now: NOW, enabledModuleKeys: allModules }))
    expect(turn).toEqual({ items: [], total: 0, approvalCount: 0 })
  })
})

describe('saudação e frase-resumo', () => {
  it('usa Bom dia, Boa tarde e Boa noite pelo horário e só o primeiro nome', () => {
    expect(buildGreeting(new Date(2026, 9, 17, 9), 'Mariana Souza')).toBe('Bom dia, Mariana.')
    expect(buildGreeting(new Date(2026, 9, 17, 12), 'Mariana')).toBe('Boa tarde, Mariana.')
    expect(buildGreeting(new Date(2026, 9, 17, 17, 59), 'Mariana')).toBe('Boa tarde, Mariana.')
    expect(buildGreeting(new Date(2026, 9, 17, 18), 'Mariana')).toBe('Boa noite, Mariana.')
    expect(buildGreeting(new Date(2026, 9, 17, 3), 'Mariana')).toBe('Boa noite, Mariana.')
    expect(buildGreeting(new Date(2026, 9, 17, 9), null)).toBe('Bom dia.')
  })

  it('tem variantes para zero, uma e várias decisões', () => {
    expect(buildLeadSentence(0)).toMatchObject({ accent: 'nenhuma decisão' })
    expect(buildLeadSentence(1)).toEqual({ before: 'Você tem ', accent: '1 decisão', after: ' esperando. O restante a YUX está acompanhando.' })
    expect(buildLeadSentence(3).accent).toBe('3 decisões')
  })

  it('o modelo usa a contagem de Sua vez na frase', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['projects'],
      userName: 'Ana Lima',
      approvals: [approvalOf('a', ago(1)), approvalOf('b', ago(2))],
    }))
    expect(model.greeting).toBe('Boa tarde, Ana.')
    expect(model.lead.accent).toBe('2 decisões')
    expect(model.periodCaption).toBe('Comparando com os 7 dias anteriores')
  })
})

describe('pulso por foco', () => {
  const ids = (model: ReturnType<typeof buildPortalDashboardModel>) => model.pulse.map(item => item.id)

  it('comercial: 6 indicadores reais, sem inventar 1ª resposta nem atendidos pela IA', () => {
    const model = buildPortalDashboardModel(crmInput(periodLeads(), '7 dias'))

    expect(ids(model)).toEqual(['new-leads', 'opportunities', 'pipeline-value', 'conversion', 'followups', 'won'])
    expect(model.pulse.map(item => item.label).join(' ')).not.toMatch(/resposta|IA/)
    expect(metric(model, 'pipeline-value').value).toBe('R$ 5 mil')
    expect(metric(model, 'followups').higherIsBetter).toBe(false)
  })

  it('comercial sem o módulo CRM não mostra indicador algum', () => {
    const model = buildPortalDashboardModel(baseInput({ enabledModuleKeys: ['whatsapp_ai'], now: NOW }))
    expect(model.focus).toBe('commercial')
    expect(model.pulse).toEqual([])
  })

  it('marketing omite indicadores sem fonte e ajusta a grade (5 viram 4)', () => {
    const campaign = { id: 'c1', name: 'Implantes', leads: 10, spend: 500, mroi: 2, lifecycleStatus: 'active' } as never
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['campaigns'],
      marketing: { ...emptyMarketing, campaigns: [campaign] },
    }))

    // Sem Marketing Studio não há "conteúdos publicados"; leads, investimento, CPL, MROI e ativas = 5 -> 4.
    expect(ids(model)).toEqual(['leads', 'spend', 'cpl', 'mroi'])
    expect(metric(model, 'cpl').value.replace(/\s/g, ' ')).toBe('R$ 50,00')
  })

  it('marketing com Studio inclui conteúdos publicados no período (com variação)', () => {
    const campaign = { id: 'c1', name: 'Implantes', leads: 10, spend: 500, mroi: 2, lifecycleStatus: 'active' } as never
    const published = { id: 'p1', title: 'Post', status: 'published', publishedAt: ago(1), createdAt: ago(5), updatedAt: ago(1) } as never
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['campaigns', 'marketing_studio'],
      marketing: { ...emptyMarketing, campaigns: [campaign], contents: [published] },
    }))

    expect(model.pulse).toHaveLength(6)
    const item = metric(model, 'published')
    expect(item.kind).toBe('period')
    expect(item.value).toBe('1')
    expect(item.delta?.tone).toBe('good')
  })

  it('entregas: omite chamados (sem fonte) e fecha em 4 indicadores', () => {
    const project = (id: string, overrides: Record<string, unknown> = {}) => ({
      id, name: `Projeto ${id}`, status: 'ACTIVE', progress: 40, createdAt: ago(30), updatedAt: ago(1),
      expectedEndDate: new Date(NOW.getTime() + 5 * 86_400_000).toISOString().slice(0, 10), ...overrides,
    }) as never
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['projects'],
      projects: [project('a'), project('b', { expectedEndDate: '2026-01-01' }), project('c', { status: 'COMPLETED', actualEndDate: ago(2) })],
    }))

    expect(ids(model)).toEqual(['projects', 'approvals', 'on-time', 'completed'])
    expect(metric(model, 'projects').value).toBe('2')
    expect(metric(model, 'on-time').value).toBe('1 de 2')
    expect(metric(model, 'completed').value).toBe('1')
    expect(model.pulse.some(item => /chamado/i.test(item.label))).toBe(false)
  })

  it('executivo: um indicador de cada área contratada por vez', () => {
    const model = buildPortalDashboardModel(crmInput(periodLeads(), '7 dias', {
      enabledModuleKeys: ['crm', 'projects', 'finance'],
    }))

    expect(model.focus).toBe('executive')
    expect(ids(model).slice(0, 3)).toEqual(['new-leads', 'projects', 'invoices'])
    expect([2, 3, 4, 6]).toContain(model.pulse.length)
  })

  it('uma fonte com falha não gera zeros inventados: seus indicadores somem e a seção sinaliza erro', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['crm'],
      crm: { leads: [], tasks: [], loading: false, error: 'falha' },
    }))

    expect(model.pulse).toEqual([])
    expect(model.sections.pulse.error).toBe(true)
    expect(model.dataStatus).toBe('Com falha')
  })
})

describe('resultado principal', () => {
  const stage = (id: string, orderIndex: number, extra: Record<string, unknown> = {}) => ({
    id, pipelineId: 'pipeline-1', key: id, name: `Etapa ${id}`, color: '#000', orderIndex, isWon: false, isLost: false, isActive: true, ...extra,
  })
  const pipeline = {
    id: 'pipeline-1', organizationId: 'org-1', name: 'Vendas', isDefault: true, isActive: true,
    stages: [stage('a', 0), stage('b', 1), stage('c', 2), stage('d', 3), stage('won', 4, { isWon: true })],
  } as never
  const inStage = (id: string, stageId: string, value = 1000, extra: Partial<CrmLead> = {}) => lead(id, ago(10), { stageId, value, ...extra })

  it('monta o funil por etapa com leads que chegaram, conversão, gargalo e vendas ganhas do período', () => {
    const leads = [
      ...Array.from({ length: 10 }, (_, i) => inStage(`a${i}`, 'a')),
      ...Array.from({ length: 6 }, (_, i) => inStage(`b${i}`, 'b')),
      inStage('c0', 'c'),
      inStage('w1', 'won', 5000, { status: 'won', wonAt: ago(2) }),
    ]
    const model = buildPortalDashboardModel(crmInput(leads, '7 dias', { crm: { leads, tasks: [], pipelines: [pipeline], loading: false, error: null } }))
    const result = model.mainResult

    expect(result.kind).toBe('funnel')
    // O ganho passou por todas as etapas em andamento: a(18) b(8) c(2) d(1).
    expect(result.funnel?.stages.map(item => item.reached)).toEqual([18, 8, 2, 1])
    expect(result.funnel?.stages[1].conv).toBe('44% avançam de Etapa a')
    expect(result.funnel?.stages[0].display).toBe('18 · R$ 22 mil')
    // c/b = 25% (base 8 >= 5) é a menor taxa com base suficiente; d/c tem base 2 e é ignorada.
    expect(result.funnel?.bottleneckIndex).toBe(2)
    expect(result.narrative).toContain('"Etapa b" e "Etapa c"')
    expect(result.narrative).toContain('25%')
    expect(result.won).toEqual({ text: 'R$ 5 mil ganhos em 1 venda nos últimos 7 dias', hasWins: true })
    expect(result.headline).toBe('R$ 17 mil')
    expect(result.ctaHref).toBe('/portal/comercial/funis')
  })

  it('sem base suficiente não aponta gargalo', () => {
    const leads = [inStage('x1', 'a'), inStage('x2', 'b')]
    const model = buildPortalDashboardModel(crmInput(leads, '7 dias', { crm: { leads, tasks: [], pipelines: [pipeline], loading: false, error: null } }))
    expect(model.mainResult.funnel?.bottleneckIndex).toBeUndefined()
    expect(model.mainResult.narrative).toContain('poucos leads')
  })

  it('sem leads, o resultado comercial é um estado vazio', () => {
    const model = buildPortalDashboardModel(crmInput([], '7 dias'))
    expect(model.mainResult.kind).toBe('empty')
    expect(model.mainResult.emptyTitle).toBe('Ainda não há leads no funil')
  })

  it('marketing: barras de leads por campanha em ordem decrescente', () => {
    const campaigns = [
      { id: 'c1', name: 'Pequena', leads: 5, lifecycleStatus: 'active' },
      { id: 'c2', name: 'Grande', leads: 15, lifecycleStatus: 'active' },
      { id: 'c3', name: 'Sem leads', leads: 0, lifecycleStatus: 'active' },
    ] as never[]
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['campaigns'],
      marketing: { ...emptyMarketing, campaigns: campaigns as never },
    }))

    expect(model.mainResult.kind).toBe('bars')
    expect(model.mainResult.bars?.map(item => [item.label, item.value])).toEqual([['Grande', 15], ['Pequena', 5]])
    expect(model.mainResult.narrative).toBe('A campanha "Grande" gerou 75% dos leads.')
  })

  it('entregas: progresso por projeto ativo, aguardando você primeiro', () => {
    const projects = [
      { id: 'p1', name: 'Site', status: 'ACTIVE', progress: 65, expectedEndDate: '2026-11-05', createdAt: ago(40), updatedAt: ago(1) },
      { id: 'p2', name: 'CRM', status: 'ACTIVE', progress: 80, expectedEndDate: '2026-10-24', createdAt: ago(40), updatedAt: ago(1) },
      { id: 'p3', name: 'Antigo', status: 'COMPLETED', progress: 100, createdAt: ago(90), updatedAt: ago(30) },
    ] as never[]
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['projects'],
      projects: projects as never,
      approvals: [approvalOf('a', ago(1), 'p1')],
    }))

    expect(model.mainResult.kind).toBe('progress')
    expect(model.mainResult.progress?.map(row => [row.title, row.status.label])).toEqual([
      ['Site', 'Aguardando você'],
      ['CRM', 'No prazo'],
    ])
    expect(model.deliveries.map(item => item.title)).toEqual(['Site', 'CRM'])
  })

  it('executivo escolhe a primeira área contratada que tem dados', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['crm', 'projects'],
      projects: [{ id: 'p1', name: 'Site', status: 'ACTIVE', progress: 10, createdAt: ago(5), updatedAt: ago(1) } as never],
    }))
    expect(model.focus).toBe('executive')
    expect(model.mainResult.kind).toBe('progress')
  })
})

describe('pontos de atenção', () => {
  const action = (id: string, priority: 'critical' | 'high' | 'normal', kind: 'commercial' | 'project' | 'marketing' | 'approval' | 'finance', since?: string) => ({
    id, priority, kind, title: `Item ${id}`, description: 'desc', href: '/portal/x', since,
  })

  it('ordena por prioridade e depois por tempo de espera, com rótulos e responsáveis', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      actions: [
        action('normal-novo', 'normal', 'project', ago(1)),
        action('alta-nova', 'critical', 'commercial', ago(1)),
        action('alta-antiga', 'critical', 'commercial', ago(4)),
        action('media', 'high', 'approval', ago(2)),
      ],
    }))

    expect(model.attentionItems.map(item => item.id)).toEqual(['alta-antiga', 'alta-nova', 'media', 'normal-novo'])
    expect(model.attentionItems.map(item => item.priority)).toEqual(['high', 'high', 'medium', 'low'])
    expect(model.attentionItems[0]).toMatchObject({ owner: 'Equipe comercial', ownerIsYux: false, wait: 'há 4 dias', actionLabel: 'Retomar' })
    expect(model.attentionItems[3]).toMatchObject({ ownerIsYux: true, owner: undefined })
    expect(model.attentionItems[2].owner).toBe('Você')
  })

  it('não repete o que já aparece em Sua vez nem inventa tempo de espera sem data', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      actions: [
        action('project-approvals', 'critical', 'approval', ago(2)),
        action('finance-due', 'critical', 'finance', ago(2)),
        action('content-reviews', 'high', 'marketing', ago(2)),
        action('crm-overdue', 'critical', 'commercial'),
      ],
    }))

    expect(model.attentionItems.map(item => item.id)).toEqual(['crm-overdue'])
    expect(model.attentionItems[0].wait).toBeUndefined()
  })

  it('sem itens, a lista fica vazia', () => {
    expect(buildPortalDashboardModel(baseInput({ now: NOW })).attentionItems).toEqual([])
  })
})

describe('executado pela YUX', () => {
  it('ordena do mais recente ao mais antigo, só com datas reais dentro do período, no máximo 4', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      windowLabel: '30 dias',
      enabledModuleKeys: ['projects', 'marketing_studio', 'campaigns'],
      projects: [
        { id: 'p1', name: 'Site', status: 'ACTIVE', progress: 40, createdAt: ago(60), updatedAt: ago(3) } as never,
        { id: 'p2', name: 'Fora do período', status: 'ACTIVE', progress: 10, createdAt: ago(90), updatedAt: ago(45) } as never,
      ],
      approvals: [approvalOf('a', ago(0, 2))],
      marketing: {
        ...emptyMarketing,
        campaigns: [{ id: 'c1', name: 'Implantes', createdAt: ago(9), leads: 0 } as never],
        contents: [{ id: 'k1', title: 'Post', status: 'published', publishedAt: ago(1), createdAt: ago(20), updatedAt: ago(1) } as never],
        workflowRuns: [
          { id: 'w1', status: 'succeeded', runType: 'scheduled', createdAt: ago(5), completedAt: ago(5), resultPayload: {}, inputPayload: {} } as never,
          { id: 'w2', status: 'failed', runType: 'manual', createdAt: ago(1), resultPayload: {}, inputPayload: {} } as never,
        ],
      },
    }))

    expect(model.yuxActivity.map(item => item.id)).toEqual(['approval-a', 'content-k1', 'project-p1', 'workflow-w1'])
    expect(model.yuxActivity[0].when).toBe('Hoje 13:00')
    expect(model.yuxActivity[1].when).toBe('Ontem 15:00')
    expect(model.yuxActivity[3].title).toBe('Fluxo de marketing concluído')
    expect(model.yuxActivity.length).toBeLessThanOrEqual(4)
  })

  it('o link de histórico só existe quando algum item vem de projetos', () => {
    const onlyMarketing = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['marketing_studio'],
      marketing: {
        ...emptyMarketing,
        contents: [{ id: 'k1', title: 'Post', status: 'published', publishedAt: ago(1), createdAt: ago(2), updatedAt: ago(1) } as never],
      },
    }))
    expect(onlyMarketing.yuxActivity).toHaveLength(1)
    expect(onlyMarketing.activityHistoryHref).toBeUndefined()

    const withProject = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['projects'],
      projects: [{ id: 'p1', name: 'Site', status: 'ACTIVE', progress: 40, createdAt: ago(60), updatedAt: ago(1) } as never],
    }))
    expect(withProject.activityHistoryHref).toBe('/portal/projetos/projetos')
  })

  it('sem atividade no período a lista fica vazia', () => {
    const model = buildPortalDashboardModel(baseInput({ now: NOW, windowLabel: 'Hoje', enabledModuleKeys: ['projects'] }))
    expect(model.yuxActivity).toEqual([])
    expect(model.activityHistoryHref).toBeUndefined()
  })
})

describe('módulos, sugestão e estados', () => {
  it('um cartão por módulo contratado, com nome correto e um dado real', () => {
    const model = buildPortalDashboardModel(crmInput(periodLeads(), '7 dias', {
      enabledModuleKeys: ['crm', 'finance', 'bi_reports'],
      invoices: [invoiceOf('inv-9', 3)],
    }))
    const byKey = Object.fromEntries(model.activeModules.map(item => [item.moduleKey, item]))

    expect(byKey.crm).toMatchObject({ title: 'CRM e funis', signal: '5 oportunidades abertas', statusLabel: 'Ativo' })
    expect(byKey.finance).toMatchObject({ title: 'Financeiro', signal: 'Próxima fatura vence em 3 dias' })
    expect(byKey.bi_reports.title).toBe('Relatórios')
    expect(model.activeModules).toHaveLength(3)
  })

  it('a sugestão é única, ligada a um sinal real e leva a Missões', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['crm'],
      crm: {
        leads: [],
        tasks: [{ id: 't1', organizationId: 'o', leadId: 'l', title: 'a', status: 'pending', dueAt: ago(2) }],
        loading: false,
        error: null,
      },
    }))

    expect(model.expansionSuggestions).toHaveLength(1)
    expect(model.expansionSuggestions[0]).toMatchObject({ moduleKey: 'automations', href: '/portal/missoes' })
    expect(model.expansionSuggestions[0].reason).toContain('1 follow-up venceu')

    const none = buildPortalDashboardModel(baseInput({ now: NOW, enabledModuleKeys: ['crm'] }))
    expect(none.expansionSuggestions).toEqual([])
  })

  it('a grade de módulos usa colunas que a lista preenche', () => {
    expect(getModuleGridColumns(8)).toContain('min-[1180px]:grid-cols-4')
    expect(getModuleGridColumns(6)).toContain('min-[1180px]:grid-cols-3')
    expect(getModuleGridColumns(4)).toContain('min-[1180px]:grid-cols-4')
    expect(getModuleGridColumns(1)).toBe('grid-cols-1 min-[1180px]:grid-cols-1')
  })

  it('cada seção sabe se está carregando ou com erro, conforme suas fontes', () => {
    const model = buildPortalDashboardModel(baseInput({
      now: NOW,
      enabledModuleKeys: ['crm', 'projects'],
      actionLoading: true,
      crm: { leads: [], tasks: [], loading: false, error: 'falha' },
    }))

    expect(model.sections.deliveries).toEqual({ loading: true, error: false })
    // O resultado principal executivo cai no vazio comercial (CRM), então herda o erro do CRM.
    expect(model.sections.mainResult.error).toBe(true)
    expect(model.sections.pulse).toEqual({ loading: true, error: true })
  })
})
