# Dashboard Interno Mesa De Comando Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard` with the approved YUX manager command center: executive pulse, two decision lanes, portfolio map, and contextual shortcuts.

**Architecture:** Keep this first implementation frontend-focused and backed by the endpoints the page already uses. Add a small rules layer that converts `getDashboardStats()` and `getAdminHubSummary()` into command-center view models, then keep `DashboardPage.tsx` responsible for loading state and rendering only. A later backend aggregate endpoint can replace the adapter without changing the visual components.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, lucide-react, Vitest.

---

## File Structure

- Create: `frontend/src/lib/dashboard/commandCenterRules.ts`
  - Defines command-center types and pure functions for formatting money, deriving pulse metrics, risks, opportunities, portfolio rows, contextual shortcuts, and status labels from existing dashboard data.
- Create: `frontend/src/lib/dashboard/commandCenterRules.test.ts`
  - Unit tests for risk derivation, opportunity derivation, portfolio rows, and fallback behavior.
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`
  - Replace the current generic stats/cards layout with the Mesa de Comando UI.
  - Keep the existing data requests to `backendDataService.getDashboardStats()` and `adminPlatformService.getAdminHubSummary()`.
- Create: `frontend/src/pages/dashboard/DashboardPage.test.tsx`
  - Render-level test that mocks current services and verifies the new content hierarchy.
- Use existing: `docs/superpowers/specs/2026-07-03-dashboard-interno-mesa-comando-design.md`
  - Source of approved product/content requirements.

## Implementation Scope

This pass implements the approved UI and content model using available data. It does not add the future backend endpoint `GET /platform/internal-command-center`. The rules file is intentionally shaped so that future endpoint data can replace local derivation later.

## Task 1: Add Command Center Rules

**Files:**
- Create: `frontend/src/lib/dashboard/commandCenterRules.ts`
- Create: `frontend/src/lib/dashboard/commandCenterRules.test.ts`

- [ ] **Step 1: Write the failing rules tests**

Create `frontend/src/lib/dashboard/commandCenterRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCommandCenterModel } from './commandCenterRules'

describe('commandCenterRules', () => {
  it('builds resolve-now items from failing providers, near limits, contracts, and blocked projects', () => {
    const model = buildCommandCenterModel({
      dashboardStats: {
        overview: {
          totalClients: 12,
          totalProjects: 9,
          totalLeads: 0,
          totalCampaigns: 0,
          activeProjects: 4,
          qualifiedLeads: 0,
        },
        financial: {
          totalBudget: 120000,
          totalCampaignSpent: 86000,
          budgetUtilization: 71.6,
        },
        marketing: {
          totalImpressions: 0,
          totalClicks: 0,
          ctr: 2.41,
          avgROAS: 3.8,
        },
        recent: {
          projects: [
            { id: 'p1', name: 'CRM RevOps', client: 'Cliente Beta', status: 'Em risco', progress: 32 },
          ],
        },
      },
      adminSummary: {
        clientCount: 12,
        activeContractCount: 0,
        activeModuleCount: 6,
        failingProviderCount: 2,
        nearLimitCount: 4,
      },
      userName: 'Andre',
      hasPartialError: false,
    })

    expect(model.resolveNow.map(item => item.title)).toEqual([
      '2 provedores exigem revisao',
      'Nenhum contrato ativo',
      '4 limites perto do bloqueio',
      'CRM RevOps precisa de atencao',
    ])
    expect(model.resolveNow[0].impactLabel).toBe('Operacao interna em risco')
    expect(model.pulse[0]).toMatchObject({ label: 'Riscos abertos', value: '4', detail: '2 criticos' })
  })

  it('builds explicit opportunities from ROAS, budget, project volume, and AI cost signals', () => {
    const model = buildCommandCenterModel({
      dashboardStats: {
        overview: {
          totalClients: 18,
          totalProjects: 20,
          totalLeads: 0,
          totalCampaigns: 0,
          activeProjects: 10,
          qualifiedLeads: 0,
        },
        financial: {
          totalBudget: 140000,
          totalCampaignSpent: 90000,
          budgetUtilization: 64.2,
        },
        marketing: {
          totalImpressions: 0,
          totalClicks: 0,
          ctr: 2.41,
          avgROAS: 4.8,
        },
        recent: {
          projects: [],
        },
      },
      adminSummary: {
        clientCount: 18,
        activeContractCount: 8,
        activeModuleCount: 12,
        failingProviderCount: 0,
        nearLimitCount: 0,
      },
      userName: 'Andre',
      hasPartialError: false,
    })

    expect(model.opportunities.map(item => item.title)).toContain('Carteira com ROAS 4.8x')
    expect(model.opportunities.map(item => item.title)).toContain('10 projetos ativos com potencial de automacao')
    expect(model.opportunities[0].impactLabel).toMatch(/R\$/)
    expect(model.pulse.some(metric => metric.label === 'Oportunidades estimadas')).toBe(true)
  })

  it('marks the data status as partial when one source fails', () => {
    const model = buildCommandCenterModel({
      dashboardStats: null,
      adminSummary: {
        clientCount: 4,
        activeContractCount: 2,
        activeModuleCount: 3,
        failingProviderCount: 1,
        nearLimitCount: 0,
      },
      userName: 'Andre',
      hasPartialError: true,
    })

    expect(model.dataStatus).toBe('Parcial')
    expect(model.unavailableSources).toContain('Indicadores de workspace')
    expect(model.resolveNow[0].title).toBe('1 provedor exige revisao')
  })
})
```

- [ ] **Step 2: Run the rules test and confirm it fails**

Run:

```powershell
npm test -- commandCenterRules.test.ts
```

Working directory:

```text
C:\Users\andre\Documents\Sites\APP - Portal YUX\frontend
```

Expected: FAIL because `frontend/src/lib/dashboard/commandCenterRules.ts` does not exist.

- [ ] **Step 3: Implement the command center rules**

Create `frontend/src/lib/dashboard/commandCenterRules.ts`:

```ts
import type { AdminHubSummary } from '@/types/adminPlatform'

export interface DashboardStatsForCommandCenter {
  overview?: {
    totalClients: number
    totalProjects: number
    totalLeads: number
    totalCampaigns: number
    activeProjects: number
    qualifiedLeads: number
  }
  financial?: {
    totalBudget: number
    totalCampaignSpent: number
    budgetUtilization: number
  }
  marketing?: {
    totalImpressions: number
    totalClicks: number
    ctr: number
    avgROAS: number
  }
  recent?: {
    projects: Array<{
      id: string
      name: string
      client: string
      status: string
      progress: number
    }>
  }
  recentActivity?: DashboardStatsForCommandCenter['recent']
}

export interface CommandCenterInput {
  dashboardStats: DashboardStatsForCommandCenter | null
  adminSummary: AdminHubSummary | null
  userName?: string
  hasPartialError: boolean
}

export interface PulseMetric {
  label: string
  value: string
  detail: string
  tone: 'risk' | 'opportunity' | 'neutral' | 'warning'
}

export interface CommandCenterItem {
  id: string
  lane: 'resolve_now' | 'opportunity'
  category: string
  title: string
  affectedEntityLabel: string
  impactLabel: string
  confidenceLabel?: string
  urgencyLabel: string
  ownerLabel: string
  evidence: string
  actionLabel: string
  href: string
  tone: 'critical' | 'warning' | 'opportunity' | 'efficiency' | 'neutral'
}

export interface PortfolioMapRow {
  id: string
  client: string
  health: string
  contract: string
  project: string
  performance: string
  risk: string
  opportunity: string
  owner: string
  nextAction: string
}

export interface ContextualShortcut {
  id: string
  label: string
  detail: string
  href: string
  tone: 'risk' | 'opportunity' | 'neutral' | 'warning'
}

export interface CommandCenterModel {
  userName?: string
  dataStatus: 'Completo' | 'Parcial' | 'Com falha'
  unavailableSources: string[]
  generatedAtLabel: string
  windowLabel: string
  pulse: PulseMetric[]
  resolveNow: CommandCenterItem[]
  opportunities: CommandCenterItem[]
  portfolioRows: PortfolioMapRow[]
  shortcuts: ContextualShortcut[]
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function formatBRL(value: number) {
  return brl.format(Math.max(0, Math.round(value))).replace(/\s/g, ' ')
}

function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue
}

function defaultOverview(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalClients: 0,
    totalProjects: 0,
    totalLeads: 0,
    totalCampaigns: 0,
    activeProjects: 0,
    qualifiedLeads: 0,
    ...stats?.overview,
  }
}

function defaultFinancial(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalBudget: 0,
    totalCampaignSpent: 0,
    budgetUtilization: 0,
    ...stats?.financial,
  }
}

function defaultMarketing(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalImpressions: 0,
    totalClicks: 0,
    ctr: 0,
    avgROAS: 0,
    ...stats?.marketing,
  }
}

function recentProjects(stats: DashboardStatsForCommandCenter | null) {
  return stats?.recent?.projects ?? stats?.recentActivity?.projects ?? []
}

function buildResolveNow(input: CommandCenterInput): CommandCenterItem[] {
  const items: CommandCenterItem[] = []
  const projects = recentProjects(input.dashboardStats)

  if (input.adminSummary && input.adminSummary.failingProviderCount > 0) {
    const count = input.adminSummary.failingProviderCount
    items.push({
      id: 'failing-providers',
      lane: 'resolve_now',
      category: 'Critico · Incidente',
      title: `${count} ${plural(count, 'provedor exige', 'provedores exigem')} revisao`,
      affectedEntityLabel: 'Admin / Health',
      impactLabel: 'Operacao interna em risco',
      urgencyLabel: 'Agora',
      ownerLabel: 'Admin',
      evidence: 'Provedores globais, IA, canais ou email reportaram falha.',
      actionLabel: 'Ver saude',
      href: '/admin/health',
      tone: 'critical',
    })
  }

  if (input.adminSummary && input.adminSummary.activeContractCount === 0) {
    items.push({
      id: 'no-active-contracts',
      lane: 'resolve_now',
      category: 'Critico · Receita',
      title: 'Nenhum contrato ativo',
      affectedEntityLabel: 'Contratos',
      impactLabel: 'Portal e modulos sem liberacao comercial',
      urgencyLabel: 'Hoje',
      ownerLabel: 'Financeiro / CS',
      evidence: 'A base comercial precisa de contratos ativos para liberar modulos.',
      actionLabel: 'Abrir contratos',
      href: '/contracts',
      tone: 'critical',
    })
  }

  if (input.adminSummary && input.adminSummary.nearLimitCount > 0) {
    const count = input.adminSummary.nearLimitCount
    items.push({
      id: 'near-limits',
      lane: 'resolve_now',
      category: 'Alto · Limites',
      title: `${count} ${plural(count, 'limite perto', 'limites perto')} do bloqueio`,
      affectedEntityLabel: 'Limites de modulos',
      impactLabel: `${count} ${plural(count, 'recurso pode bloquear', 'recursos podem bloquear')} execucao`,
      urgencyLabel: 'Hoje',
      ownerLabel: 'Admin / Operacao',
      evidence: 'Uso de modulos aproximando cotas contratadas.',
      actionLabel: 'Ver limites',
      href: '/admin/limits',
      tone: 'warning',
    })
  }

  const attentionProject = projects.find(project => {
    const status = project.status.toLowerCase()
    return status.includes('risco') || status.includes('atras') || status.includes('parad') || project.progress < 40
  })

  if (attentionProject) {
    items.push({
      id: `project-${attentionProject.id}`,
      lane: 'resolve_now',
      category: 'Alto · Entrega',
      title: `${attentionProject.name} precisa de atencao`,
      affectedEntityLabel: attentionProject.client || 'Cliente nao informado',
      impactLabel: `${attentionProject.progress}% de progresso`,
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Operacao / CS',
      evidence: `Projeto recente marcado como ${attentionProject.status}.`,
      actionLabel: 'Abrir projetos',
      href: '/projects',
      tone: 'warning',
    })
  }

  return items.slice(0, 5)
}

function buildOpportunities(input: CommandCenterInput): CommandCenterItem[] {
  const overview = defaultOverview(input.dashboardStats)
  const financial = defaultFinancial(input.dashboardStats)
  const marketing = defaultMarketing(input.dashboardStats)
  const items: CommandCenterItem[] = []

  if (marketing.avgROAS >= 3 && financial.totalBudget > 0) {
    const potential = financial.totalBudget * 0.15
    items.push({
      id: 'roas-expansion',
      lane: 'opportunity',
      category: 'Expansao',
      title: `Carteira com ROAS ${marketing.avgROAS.toFixed(1)}x`,
      affectedEntityLabel: 'Marketing / Growth',
      impactLabel: `+${formatBRL(potential)} potencial`,
      confidenceLabel: marketing.avgROAS >= 4 ? 'Confianca alta' : 'Confianca media',
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Growth / CS',
      evidence: `${marketing.ctr.toFixed(2)}% CTR e verba ativa na carteira.`,
      actionLabel: 'Revisar escala',
      href: '/reports',
      tone: 'opportunity',
    })
  }

  if (overview.activeProjects >= 3) {
    const hours = Math.max(6, Math.round(overview.activeProjects * 1.4))
    items.push({
      id: 'automation-efficiency',
      lane: 'opportunity',
      category: 'Eficiencia',
      title: `${overview.activeProjects} projetos ativos com potencial de automacao`,
      affectedEntityLabel: 'Operacao',
      impactLabel: `${hours}h/semana poupadas`,
      confidenceLabel: 'Confianca media',
      urgencyLabel: 'Este mes',
      ownerLabel: 'Operacao / IA',
      evidence: 'Volume de projetos ativos sugere tarefas recorrentes para padronizar.',
      actionLabel: 'Revisar automacoes',
      href: '/portal/automacoes',
      tone: 'efficiency',
    })
  }

  if (financial.budgetUtilization >= 60 && financial.totalCampaignSpent > 0) {
    const avoidable = financial.totalCampaignSpent * 0.04
    items.push({
      id: 'cost-optimization',
      lane: 'opportunity',
      category: 'Reducao de custo',
      title: 'Verba consumida pede revisao de eficiencia',
      affectedEntityLabel: 'Financeiro / Growth',
      impactLabel: `${formatBRL(avoidable)} economizaveis`,
      confidenceLabel: 'Confianca media',
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Financeiro / Growth',
      evidence: `${financial.budgetUtilization.toFixed(1)}% da verba ja consumida.`,
      actionLabel: 'Abrir financeiro',
      href: '/finance',
      tone: 'opportunity',
    })
  }

  return items.slice(0, 5)
}

function buildPortfolioRows(input: CommandCenterInput): PortfolioMapRow[] {
  const marketing = defaultMarketing(input.dashboardStats)
  const projects = recentProjects(input.dashboardStats)
  const rows = projects.slice(0, 3).map((project, index) => {
    const status = project.status.toLowerCase()
    const risky = status.includes('risco') || status.includes('atras') || status.includes('parad') || project.progress < 40
    return {
      id: project.id,
      client: project.client || 'Cliente nao informado',
      health: risky ? 'Atencao' : 'Saudavel',
      contract: index === 0 && input.adminSummary?.activeContractCount === 0 ? 'Sem contrato' : 'Ativo',
      project: risky ? 'Em risco' : 'Em dia',
      performance: marketing.avgROAS > 0 ? `ROAS ${marketing.avgROAS.toFixed(1)}x` : 'Sem dados',
      risk: risky ? `${project.name} requer revisao` : 'Sem risco critico',
      opportunity: marketing.avgROAS >= 3 ? 'Escalar performance' : 'Nenhuma',
      owner: risky ? 'Operacao' : 'Growth',
      nextAction: risky ? 'Abrir projeto' : 'Revisar escala',
    }
  })

  if (rows.length > 0) return rows

  return [
    {
      id: 'portfolio-empty',
      client: input.adminSummary && input.adminSummary.clientCount > 0 ? `${input.adminSummary.clientCount} clientes` : 'Sem clientes',
      health: input.adminSummary && input.adminSummary.failingProviderCount > 0 ? 'Atencao' : 'Saudavel',
      contract: input.adminSummary && input.adminSummary.activeContractCount > 0 ? 'Ativo' : 'Sem contrato',
      project: 'Sem projetos recentes',
      performance: marketing.avgROAS > 0 ? `ROAS ${marketing.avgROAS.toFixed(1)}x` : 'Sem dados',
      risk: input.adminSummary && input.adminSummary.failingProviderCount > 0 ? 'Provedor em falha' : 'Sem risco critico',
      opportunity: marketing.avgROAS >= 3 ? 'Escalar performance' : 'Aguardando dados',
      owner: 'Gestor',
      nextAction: 'Revisar carteira',
    },
  ]
}

function buildShortcuts(resolveNow: CommandCenterItem[], opportunities: CommandCenterItem[]): ContextualShortcut[] {
  return [
    ...resolveNow.slice(0, 3).map(item => ({
      id: `shortcut-${item.id}`,
      label: item.title,
      detail: item.actionLabel,
      href: item.href,
      tone: item.tone === 'critical' ? 'risk' as const : 'warning' as const,
    })),
    ...opportunities.slice(0, 2).map(item => ({
      id: `shortcut-${item.id}`,
      label: item.impactLabel,
      detail: item.title,
      href: item.href,
      tone: 'opportunity' as const,
    })),
  ].slice(0, 5)
}

export function buildCommandCenterModel(input: CommandCenterInput): CommandCenterModel {
  const overview = defaultOverview(input.dashboardStats)
  const marketing = defaultMarketing(input.dashboardStats)
  const resolveNow = buildResolveNow(input)
  const opportunities = buildOpportunities(input)
  const criticalCount = resolveNow.filter(item => item.tone === 'critical').length
  const dataStatus = input.hasPartialError
    ? input.dashboardStats || input.adminSummary ? 'Parcial' : 'Com falha'
    : 'Completo'
  const unavailableSources = input.hasPartialError
    ? [
      ...(input.dashboardStats ? [] : ['Indicadores de workspace']),
      ...(input.adminSummary ? [] : ['Resumo administrativo']),
    ]
    : []

  return {
    userName: input.userName,
    dataStatus,
    unavailableSources,
    generatedAtLabel: 'Atualizado agora',
    windowLabel: '7 dias',
    pulse: [
      { label: 'Riscos abertos', value: String(resolveNow.length), detail: `${criticalCount} criticos`, tone: criticalCount > 0 ? 'risk' : 'neutral' },
      { label: 'Oportunidades estimadas', value: String(opportunities.length), detail: opportunities[0]?.impactLabel ?? 'Sem impacto estimado', tone: 'opportunity' },
      { label: 'Clientes em atencao', value: String(input.adminSummary?.clientCount ?? overview.totalClients), detail: 'com sinal ativo', tone: 'neutral' },
      { label: 'Projetos ativos', value: String(overview.activeProjects), detail: `${overview.totalProjects} projetos no total`, tone: 'neutral' },
      { label: 'Performance media', value: marketing.avgROAS > 0 ? `${marketing.avgROAS.toFixed(1)}x` : 'Sem dados', detail: `${marketing.ctr.toFixed(2)}% CTR`, tone: marketing.avgROAS >= 3 ? 'opportunity' : 'warning' },
    ],
    resolveNow,
    opportunities,
    portfolioRows: buildPortfolioRows(input),
    shortcuts: buildShortcuts(resolveNow, opportunities),
  }
}
```

- [ ] **Step 4: Run the rules test and confirm it passes**

Run:

```powershell
npm test -- commandCenterRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add frontend/src/lib/dashboard/commandCenterRules.ts frontend/src/lib/dashboard/commandCenterRules.test.ts
git commit -m "feat: add dashboard command center rules"
```

## Task 2: Replace Dashboard Page With Mesa De Comando UI

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Replace imports and load partial data independently**

In `DashboardPage.tsx`, keep React state but load the two services with `Promise.allSettled` so one failing source does not destroy the page:

```ts
const [statsResult, summaryResult] = await Promise.allSettled([
  backendDataService.getDashboardStats(),
  adminPlatformService.getAdminHubSummary(),
])

if (!active) return

if (statsResult.status === 'fulfilled') {
  setDashboardStats(statsResult.value as DashboardStats)
}
if (summaryResult.status === 'fulfilled') {
  setAdminSummary(summaryResult.value)
}
if (statsResult.status === 'rejected' || summaryResult.status === 'rejected') {
  setError('Indicadores carregados parcialmente.')
}
```

- [ ] **Step 2: Build the command center model**

After loading state, replace local `criticalItems`, `stats`, and `recentProjects` derivations with:

```ts
const commandCenter = useMemo(() => buildCommandCenterModel({
  dashboardStats,
  adminSummary,
  userName: user?.name,
  hasPartialError: Boolean(error),
}), [adminSummary, dashboardStats, error, user?.name])
```

- [ ] **Step 3: Replace the JSX with the command center layout**

Use the following structure:

```tsx
return (
  <div className="space-y-5 bg-[#f6f3ee] text-slate-950">
    <header className="rounded-lg border border-slate-200 bg-[#fbfaf7] p-5">
      ...
    </header>
    <section aria-label="Pulso Executivo" className="grid gap-2 md:grid-cols-5">
      ...
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
      <CommandLane title="Resolver agora" ... />
      <CommandLane title="Aproveitar oportunidade" ... />
      <ContextualShortcuts shortcuts={commandCenter.shortcuts} />
    </section>
    <PortfolioMap rows={commandCenter.portfolioRows} />
  </div>
)
```

Define small local helper components at the bottom of the same file:

```tsx
function CommandLane({ title, subtitle, items, emptyTitle, emptyDescription }: { ... }) { ... }
function CommandItemCard({ item }: { item: CommandCenterItem }) { ... }
function ContextualShortcuts({ shortcuts }: { shortcuts: ContextualShortcut[] }) { ... }
function PortfolioMap({ rows }: { rows: PortfolioMapRow[] }) { ... }
```

Use Tailwind classes that match the prototype direction:

- shell: `bg-[#f6f3ee]`, `border-slate-200`, `text-slate-950`;
- risk lane: thin red/amber left rails;
- opportunity lane: emerald/blue left rails;
- cards: `rounded-lg`, `border`, no heavy shadows;
- metadata: small uppercase labels and compact rows;
- action buttons: understated bordered buttons.

- [ ] **Step 4: Keep empty states useful**

Render these exact empty titles when the lane has no items:

```text
Nenhum risco operacional relevante
Nenhuma oportunidade com impacto estimado suficiente
```

Use descriptions from the spec so empty states do not look like missing product.

- [ ] **Step 5: Run TypeScript**

Run:

```powershell
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add frontend/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat: redesign internal dashboard command center"
```

## Task 3: Add Dashboard Render Test

**Files:**
- Create: `frontend/src/pages/dashboard/DashboardPage.test.tsx`

- [ ] **Step 1: Write the render test**

Create `frontend/src/pages/dashboard/DashboardPage.test.tsx`:

```tsx
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { name: 'Andre' },
  }),
}))

vi.mock('@/services/backendDataService', () => ({
  backendDataService: {
    getDashboardStats: vi.fn(async () => ({
      overview: {
        totalClients: 18,
        totalProjects: 20,
        totalLeads: 0,
        totalCampaigns: 0,
        activeProjects: 10,
        qualifiedLeads: 0,
      },
      financial: {
        totalBudget: 140000,
        totalCampaignSpent: 90000,
        budgetUtilization: 64.2,
      },
      marketing: {
        totalImpressions: 0,
        totalClicks: 0,
        ctr: 2.41,
        avgROAS: 4.8,
      },
      recent: {
        projects: [
          { id: 'p1', name: 'CRM RevOps', client: 'Cliente Beta', status: 'Em risco', progress: 32 },
        ],
      },
    })),
  },
}))

vi.mock('@/services/adminPlatformService', () => ({
  adminPlatformService: {
    getAdminHubSummary: vi.fn(async () => ({
      clientCount: 18,
      activeContractCount: 0,
      activeModuleCount: 12,
      failingProviderCount: 2,
      nearLimitCount: 4,
    })),
  },
}))

describe('DashboardPage', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders the manager command center hierarchy', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Visao Geral YUX')
    expect(container.textContent).toContain('Mesa de comando para riscos, oportunidades e operacao interna.')
    expect(container.textContent).toContain('Pulso Executivo')
    expect(container.textContent).toContain('Resolver agora')
    expect(container.textContent).toContain('Aproveitar oportunidade')
    expect(container.textContent).toContain('2 provedores exigem revisao')
    expect(container.textContent).toContain('Nenhum contrato ativo')
    expect(container.textContent).toContain('Carteira com ROAS 4.8x')
    expect(container.textContent).toContain('Mapa da Carteira')
    expect(container.textContent).toContain('Cliente Beta')
  })
})
```

- [ ] **Step 2: Run the render test and confirm it passes**

Run:

```powershell
npm test -- DashboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit Task 3**

```powershell
git add frontend/src/pages/dashboard/DashboardPage.test.tsx
git commit -m "test: cover dashboard command center"
```

## Task 4: Verify Build And Visual Runtime

**Files:**
- No planned source edits unless verification finds a real issue.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- commandCenterRules.test.ts DashboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full frontend type/build gate**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start local dev server**

Run:

```powershell
npm run dev -- --host 0.0.0.0 --port 5173
```

Working directory:

```text
C:\Users\andre\Documents\Sites\APP - Portal YUX\frontend
```

Expected: Vite serves the app at `http://localhost:5173/`.

- [ ] **Step 4: Browser-check `/dashboard`**

Open:

```text
http://localhost:5173/dashboard
```

Expected visual result:

- page loads without console errors;
- header shows `Visao Geral YUX`;
- `Pulso Executivo` strip is compact;
- `Resolver agora` and `Aproveitar oportunidade` are side by side on desktop;
- cards show impact, owner, evidence, and action;
- `Mapa da Carteira` is a compact table;
- text does not overlap at desktop or mobile widths.

- [ ] **Step 5: Commit verification fixes if needed**

If visual or build fixes were needed:

```powershell
git add frontend/src/pages/dashboard/DashboardPage.tsx frontend/src/lib/dashboard/commandCenterRules.ts frontend/src/pages/dashboard/DashboardPage.test.tsx
git commit -m "fix: polish dashboard command center"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Header operacional: Task 2.
- Pulso Executivo: Task 1 and Task 2.
- Two lanes `Resolver agora` and `Aproveitar oportunidade`: Task 1 and Task 2.
- Explicit impact, confidence, owner, evidence, and action: Task 1 and Task 2.
- Portfolio map: Task 1 and Task 2.
- Contextual shortcuts: Task 1 and Task 2.
- Partial and empty states: Task 1 and Task 2.
- Tests and runtime verification: Task 3 and Task 4.

Known implementation boundary:

- The future backend aggregate endpoint from the spec is not implemented in this pass. This plan intentionally ships the approved UX using current dashboard/admin endpoints, with the rules layer acting as the swappable adapter.

Placeholder scan:

- No `TBD`, `TODO`, or ambiguous implementation placeholders are intentionally left in this plan.

Type consistency:

- `CommandCenterItem`, `PulseMetric`, `PortfolioMapRow`, and `ContextualShortcut` are defined in Task 1 and imported by the page in Task 2.
