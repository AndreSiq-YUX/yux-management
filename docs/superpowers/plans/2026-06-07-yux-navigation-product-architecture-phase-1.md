# YUX Navigation Product Architecture Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a navegação e as rotas do YUX Hub / Portal YUX em torno das jornadas aprovadas, preservando telas atuais e rotas legadas.

**Architecture:** A Fase 1 concentra a mudança em uma camada explícita de navegação, rotas novas e páginas transitórias seguras. As chaves comerciais de módulo continuam iguais para não quebrar contratos/permissões; mudam labels, grupos, rotas de portal e redirecionamentos.

**Tech Stack:** React 18, TypeScript, Vite, React Router, Vitest, Tailwind, lucide-react.

---

## Scope

Implementar apenas a Fase 1 da spec `docs/superpowers/specs/2026-06-07-yux-navigation-product-architecture-design.md`.

Dentro do escopo:

- Novo menu interno YUX por jornada:
  - Visão Geral
  - Comercial YUX
  - Clientes & Contratos
  - Operação
  - Operação dos Clientes
  - Administração da Plataforma
  - Financeiro
- Novo menu do Portal por jornada:
  - Visão Geral
  - Empresa
  - Comercial
  - Atendimento & IA
  - Marketing
  - Automações
  - Projetos
  - Relatórios
  - Suporte
  - Financeiro
  - Configurações da Conta
- Rotas novas para o portal, reaproveitando telas existentes onde possível.
- Redirecionamentos legados com `<Navigate replace />`.
- Página transitória segura para áreas ainda sem implementação real.
- Atalho de pendências de aprovação no dashboard do cliente.
- Testes de navegação.

Fora do escopo desta fase:

- Implementar banco/tabelas novas.
- Criar CRUD real de Empresa, Usuários, Base de Conhecimento, Marca/Tom de Voz ou Integrações.
- Reescrever CRM, Omnichannel, Automations ou Marketing Studio.
- Refatorar layout mobile completo.
- Corrigir mojibake global fora das telas tocadas.

## Current Files

- `frontend/src/App.tsx`
  - Define rotas públicas, internas e portal.
  - Hoje usa rotas antigas como `/portal/crm`, `/portal/omnichannel`, `/portal/campaigns`.

- `frontend/src/lib/platform/navigation.ts`
  - Define `NavigationItem`, `NavigationGroup`, grupos internos e portal.
  - Hoje o portal é um grupo único chamado `Portal`.

- `frontend/src/lib/platform/navigation.test.ts`
  - Testa grupos e rotas atuais.
  - Deve ser atualizado antes da implementação.

- `frontend/src/lib/platform/moduleRegistry.ts`
  - Define chaves de módulos e `portalRoute`.
  - Deve preservar chaves, mas atualizar rotas de portal para as novas jornadas.

- `frontend/src/components/navigation/Sidebar.tsx`
  - Renderiza grupos internos com label, mas no portal hoje esconde label de grupo.
  - Precisa renderizar grupos também no portal.

- `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
  - Dashboard inicial do cliente.
  - Deve incluir atalho fixo para pendências de aprovação.

## New Files

- `frontend/src/pages/client-portal/PortalSafeStatePage.tsx`
  - Página transitória segura para rotas já planejadas, mas ainda sem funcionalidade real.
  - Não acessa dados sensíveis.
  - Mostra título, descrição e lista de capacidades planejadas.

- `frontend/src/pages/client-portal/PortalApprovalsPage.tsx`
  - Wrapper inicial de pendências de aprovação.
  - Pode começar com estado seguro e links para páginas que já têm aprovações embutidas.

- `frontend/src/pages/client-portal/PortalAccountSettingsPage.tsx`
  - Configurações da Conta restritas a preferências pessoais, segurança, idioma, sessões e dados do usuário.
  - Nesta fase, estado seguro sem persistência.

## Route Mapping

### Portal new routes

- `/portal` -> `PortalDashboardPage`
- `/portal/empresa/perfil` -> `PortalSafeStatePage`
- `/portal/empresa/usuarios` -> `PortalSafeStatePage`
- `/portal/empresa/conhecimento` -> `PortalSafeStatePage`
- `/portal/empresa/marca` -> `PortalSafeStatePage`
- `/portal/empresa/integracoes` -> `PortalSafeStatePage`
- `/portal/comercial/leads` -> `LeadsPage`
- `/portal/comercial/contas` -> `PortalSafeStatePage`
- `/portal/comercial/funis` -> `LeadsPage`
- `/portal/comercial/tarefas` -> `PortalSafeStatePage`
- `/portal/atendimento/conversas` -> `PortalOmnichannelPage`
- `/portal/atendimento/agente-ia` -> `PortalSafeStatePage`
- `/portal/atendimento/canais` -> `PortalConnectedChannelsPage`
- `/portal/atendimento/filas-handoff` -> `PortalSafeStatePage`
- `/portal/marketing/landing-pages` -> `PortalLandingPagesPage`
- `/portal/marketing/campanhas` -> `PortalCampaignsPage`
- `/portal/marketing/studio` -> `PortalMarketingStudioPage`
- `/portal/marketing/conteudo` -> `PortalMarketingStudioPage`
- `/portal/marketing/calendario` -> `PortalMarketingStudioPage`
- `/portal/marketing/criativos` -> `PortalMarketingStudioPage`
- `/portal/automacoes/fluxos` -> `PortalSafeStatePage`
- `/portal/automacoes/templates` -> `PortalSafeStatePage`
- `/portal/automacoes/execucoes` -> `PortalSafeStatePage`
- `/portal/automacoes/logs` -> `PortalSafeStatePage`
- `/portal/projetos/projetos` -> `PortalProjectsPage`
- `/portal/projetos/aprovacoes` -> `PortalApprovalsPage`
- `/portal/projetos/documentos` -> `PortalSafeStatePage`
- `/portal/relatorios` -> `PortalReportsPage`
- `/portal/suporte` -> `PortalSupportPage`
- `/portal/financeiro` -> `PortalFinancePage`
- `/portal/configuracoes/conta` -> `PortalAccountSettingsPage`

### Portal legacy redirects

- `/portal/projects` -> `/portal/projetos/projetos`
- `/portal/proposals` -> `/portal/projetos/aprovacoes`
- `/portal/crm` -> `/portal/comercial/leads`
- `/portal/crm/settings` -> `/portal/empresa/usuarios`
- `/portal/omnichannel` -> `/portal/atendimento/conversas`
- `/portal/omnichannel/channels` -> `/portal/atendimento/canais`
- `/portal/whatsapp-ai` -> `/portal/atendimento/conversas`
- `/portal/landing-pages` -> `/portal/marketing/landing-pages`
- `/portal/marketing-studio` -> `/portal/marketing/studio`
- `/portal/campaigns` -> `/portal/marketing/campanhas`
- `/portal/reports` -> `/portal/relatorios`
- `/portal/support` -> `/portal/suporte`
- `/portal/finance` -> `/portal/financeiro`

### Internal route labels

Fase 1 não precisa alterar todas as URLs internas, só agrupar e renomear o menu. Rotas internas existentes continuam válidas:

- `/dashboard`
- `/clients`
- `/contracts`
- `/packages`
- `/modules`
- `/projects`
- `/support`
- `/leads`
- `/omnichannel`
- `/campaigns`
- `/landing-pages`
- `/marketing-studio`
- `/automations`
- `/reports`
- `/admin/*`
- `/finance`

---

### Task 1: Update Navigation Contract Tests

**Files:**
- Modify: `frontend/src/lib/platform/navigation.test.ts`
- Later implementation: `frontend/src/lib/platform/navigation.ts`

- [ ] **Step 1: Replace internal group expectations**

Update the grouped internal test to expect the new group labels:

```ts
expect(groups.map(group => group.label)).toEqual([
  'Visao Geral',
  'Comercial YUX',
  'Clientes & Contratos',
  'Operacao',
  'Operacao dos Clientes',
  'Administracao da Plataforma',
  'Financeiro',
])
```

Use ASCII labels in code/tests to match the repository's current text style.

- [ ] **Step 2: Add portal journey groups test**

Add a test that checks the portal groups for a client with all major modules enabled:

```ts
it('builds portal navigation by client journeys', () => {
  const groups = buildNavigationGroups({
    ...internalContext,
    mode: 'portal',
    role: {
      key: 'client_admin',
      name: 'Client Admin',
      scope: 'client',
      permissions: [
        'crm.read',
        'leads.read',
        'omnichannel.read',
        'landing_pages.read',
        'campaigns.read',
        'marketing_studio.read',
        'reports.read',
        'projects.read',
        'support.read',
        'finance.read',
      ],
    },
    enabledModuleKeys: [
      'crm',
      'whatsapp_ai',
      'landing_pages',
      'campaigns',
      'marketing_studio',
      'bi_reports',
      'projects',
      'support',
      'finance',
    ],
  })

  expect(groups.map(group => group.label)).toEqual([
    'Visao Geral',
    'Empresa',
    'Comercial',
    'Atendimento & IA',
    'Marketing',
    'Automacoes',
    'Projetos',
    'Relatorios',
    'Suporte',
    'Financeiro',
    'Configuracoes da Conta',
  ])
  expect(groups.find(group => group.label === 'Comercial')?.items).toEqual(expect.arrayContaining([
    { label: 'Leads', href: '/portal/comercial/leads', moduleKey: 'crm' },
    { label: 'Funis', href: '/portal/comercial/funis', moduleKey: 'crm' },
  ]))
  expect(groups.find(group => group.label === 'Atendimento & IA')?.items).toEqual(expect.arrayContaining([
    { label: 'Conversas', href: '/portal/atendimento/conversas', moduleKey: 'whatsapp_ai' },
    { label: 'Canais', href: '/portal/atendimento/canais', moduleKey: 'whatsapp_ai' },
  ]))
  expect(groups.find(group => group.label === 'Marketing')?.items).toEqual(expect.arrayContaining([
    { label: 'Landing Pages', href: '/portal/marketing/landing-pages', moduleKey: 'landing_pages' },
    { label: 'Campanhas', href: '/portal/marketing/campanhas', moduleKey: 'campaigns' },
    { label: 'Marketing Studio', href: '/portal/marketing/studio', moduleKey: 'marketing_studio' },
  ]))
})
```

- [ ] **Step 3: Add portal technical-label regression test**

Add a test to keep technical labels out of portal group names:

```ts
it('does not expose technical module labels as portal groups', () => {
  const groups = buildNavigationGroups({
    ...internalContext,
    mode: 'portal',
    role: {
      key: 'client_admin',
      name: 'Client Admin',
      scope: 'client',
      permissions: ['omnichannel.read', 'crm.read', 'leads.read'],
    },
    enabledModuleKeys: ['whatsapp_ai', 'crm'],
  })

  expect(groups.map(group => group.label)).not.toEqual(expect.arrayContaining([
    'Omnichannel',
    'CRM Governance',
    'Knowledge Source',
  ]))
})
```

- [ ] **Step 4: Run navigation tests and verify they fail**

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
```

Expected: FAIL because `navigation.ts` still returns old groups/routes.

- [ ] **Step 5: Commit failing test**

```bash
git add frontend/src/lib/platform/navigation.test.ts
git commit -m "test: define journey navigation architecture"
```

---

### Task 2: Implement Journey-Based Navigation Builders

**Files:**
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Test: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Extend portal route mapping in module registry**

In `frontend/src/lib/platform/moduleRegistry.ts`, update only `portalRoute` values for existing module keys:

```ts
{
  key: 'crm',
  name: 'CRM & Funis',
  base: false,
  internalRoute: '/leads',
  portalRoute: '/portal/comercial/leads',
  requiredPermissions: ['crm.read', 'leads.read'],
},
{
  key: 'projects',
  name: 'Projetos e Entregas',
  base: true,
  internalRoute: '/projects',
  portalRoute: '/portal/projetos/projetos',
  requiredPermissions: ['projects.read'],
},
{
  key: 'proposals',
  name: 'Propostas',
  base: false,
  internalRoute: '/proposals',
  portalRoute: '/portal/projetos/aprovacoes',
  requiredPermissions: ['proposals.read'],
},
{
  key: 'whatsapp_ai',
  name: 'Conversas IA',
  base: false,
  internalRoute: '/omnichannel',
  portalRoute: '/portal/atendimento/conversas',
  requiredPermissions: ['omnichannel.read'],
},
{
  key: 'landing_pages',
  name: 'Landing Pages',
  base: false,
  internalRoute: '/landing-pages',
  portalRoute: '/portal/marketing/landing-pages',
  requiredPermissions: ['landing_pages.read'],
},
{
  key: 'campaigns',
  name: 'Campanhas',
  base: false,
  internalRoute: '/campaigns',
  portalRoute: '/portal/marketing/campanhas',
  requiredPermissions: ['campaigns.read'],
},
{
  key: 'marketing_studio',
  name: 'Marketing Studio',
  base: false,
  internalRoute: '/marketing-studio',
  portalRoute: '/portal/marketing/studio',
  requiredPermissions: ['marketing_studio.read'],
},
{
  key: 'bi_reports',
  name: 'Relatorios & ROI',
  base: false,
  internalRoute: '/reports',
  portalRoute: '/portal/relatorios',
  requiredPermissions: ['reports.read'],
},
{
  key: 'support',
  name: 'Suporte',
  base: true,
  internalRoute: '/support',
  portalRoute: '/portal/suporte',
  requiredPermissions: ['support.read'],
},
{
  key: 'finance',
  name: 'Financeiro',
  base: false,
  internalRoute: '/finance',
  portalRoute: '/portal/financeiro',
  requiredPermissions: ['finance.read'],
},
```

- [ ] **Step 2: Replace internal group definitions**

In `navigation.ts`, replace `internalModuleGroups` with:

```ts
const internalModuleGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Visao Geral',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    label: 'Comercial YUX',
    items: [
      { label: 'Leads YUX', href: '/leads', moduleKey: 'crm' },
      { label: 'Diagnosticos', href: '/leads', moduleKey: 'crm' },
      { label: 'Propostas', href: '/proposals', moduleKey: 'proposals' },
      { label: 'Follow-ups', href: '/leads', moduleKey: 'crm' },
    ],
  },
  {
    label: 'Clientes & Contratos',
    items: [
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos Contratados', href: '/modules' },
      { label: 'Creditos e Limites', href: '/admin/limits' },
    ],
  },
  {
    label: 'Operacao',
    items: [
      { label: 'Projetos', href: '/projects', moduleKey: 'projects' },
      { label: 'Entregaveis', href: '/projects', moduleKey: 'projects' },
      { label: 'Aprovacoes', href: '/projects', moduleKey: 'projects' },
      { label: 'Suporte', href: '/support', moduleKey: 'support' },
    ],
  },
  {
    label: 'Operacao dos Clientes',
    items: [
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Conversas', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Agente IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/marketing-studio', moduleKey: 'marketing_studio' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Relatorios', href: '/reports', moduleKey: 'bi_reports' },
    ],
  },
  {
    label: 'Administracao da Plataforma',
    items: [
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Catalogo de Modulos', href: '/admin/modules-governance' },
      { label: 'Integracoes Globais', href: '/admin/integrations' },
      { label: 'IA / Modelos / Custos', href: '/admin/ai' },
      { label: 'Canais', href: '/admin/channels' },
      { label: 'Email', href: '/admin/email' },
      { label: 'Saude da Plataforma', href: '/admin/health' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Faturas', href: '/finance', moduleKey: 'finance' },
      { label: 'Cobrancas', href: '/finance', moduleKey: 'finance' },
      { label: 'Receita', href: '/finance', moduleKey: 'finance' },
    ],
  },
]
```

- [ ] **Step 3: Add helper for module access**

In `navigation.ts`, add:

```ts
function canAccessModuleKey(moduleKey: string, context: PlatformContext) {
  const module = PLATFORM_MODULES.find(platformModule => platformModule.key === moduleKey)
  return Boolean(module && canAccessModule(module, context.role, context.enabledModuleKeys))
}
```

Keep `filterNavigationItem` using the same helper.

- [ ] **Step 4: Replace portal navigation builder**

Replace `buildPortalNavigationGroup` with `buildPortalNavigationGroups`:

```ts
function moduleItem(context: PlatformContext, item: NavigationItem): NavigationItem[] {
  if (!item.moduleKey) return [item]
  return canAccessModuleKey(item.moduleKey, context) ? [item] : []
}

function buildPortalNavigationGroups(context: PlatformContext): NavigationGroup[] {
  const groups: NavigationGroup[] = [
    {
      label: 'Visao Geral',
      items: [{ label: 'Visao Geral', href: '/portal' }],
    },
    {
      label: 'Empresa',
      items: [
        { label: 'Perfil da Empresa', href: '/portal/empresa/perfil' },
        { label: 'Usuarios e Equipe', href: '/portal/empresa/usuarios' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Integracoes', href: '/portal/empresa/integracoes' },
      ],
    },
    {
      label: 'Comercial',
      items: [
        ...moduleItem(context, { label: 'Leads', href: '/portal/comercial/leads', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Empresas / Contas', href: '/portal/comercial/contas', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Funis', href: '/portal/comercial/funis', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas', moduleKey: 'crm' }),
      ],
    },
    {
      label: 'Atendimento & IA',
      items: [
        ...moduleItem(context, { label: 'Conversas', href: '/portal/atendimento/conversas', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Agente IA', href: '/portal/atendimento/agente-ia', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Canais', href: '/portal/atendimento/canais', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Filas e Handoff', href: '/portal/atendimento/filas-handoff', moduleKey: 'whatsapp_ai' }),
      ],
    },
    {
      label: 'Marketing',
      items: [
        ...moduleItem(context, { label: 'Landing Pages', href: '/portal/marketing/landing-pages', moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Campanhas', href: '/portal/marketing/campanhas', moduleKey: 'campaigns' }),
        ...moduleItem(context, { label: 'Marketing Studio', href: '/portal/marketing/studio', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Conteudo Organico', href: '/portal/marketing/conteudo', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Calendario Editorial', href: '/portal/marketing/calendario', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Criativos e Assets', href: '/portal/marketing/criativos', moduleKey: 'marketing_studio' }),
      ],
    },
    {
      label: 'Automacoes',
      items: [
        ...moduleItem(context, { label: 'Fluxos', href: '/portal/automacoes/fluxos', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Templates', href: '/portal/automacoes/templates', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Execucoes', href: '/portal/automacoes/execucoes', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Logs', href: '/portal/automacoes/logs', moduleKey: 'automations' }),
      ],
    },
    {
      label: 'Projetos',
      items: [
        ...moduleItem(context, { label: 'Projetos', href: '/portal/projetos/projetos', moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Aprovacoes', href: '/portal/projetos/aprovacoes', moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Documentos', href: '/portal/projetos/documentos', moduleKey: 'projects' }),
      ],
    },
    {
      label: 'Relatorios',
      items: moduleItem(context, { label: 'Relatorios', href: '/portal/relatorios', moduleKey: 'bi_reports' }),
    },
    {
      label: 'Suporte',
      items: moduleItem(context, { label: 'Suporte', href: '/portal/suporte', moduleKey: 'support' }),
    },
    {
      label: 'Financeiro',
      items: moduleItem(context, { label: 'Financeiro', href: '/portal/financeiro', moduleKey: 'finance' }),
    },
    {
      label: 'Configuracoes da Conta',
      items: [{ label: 'Conta', href: '/portal/configuracoes/conta' }],
    },
  ]

  return groups.filter(group => group.items.length > 0)
}
```

- [ ] **Step 5: Use portal group builder**

Update `buildNavigationGroups`:

```ts
export function buildNavigationGroups(context: PlatformContext): NavigationGroup[] {
  if (context.mode === 'portal') {
    return buildPortalNavigationGroups(context)
  }

  return internalModuleGroups.map(group => ({
    label: group.label,
    items: group.items.flatMap(item => {
      const filteredItem = filterNavigationItem(item, context)
      return filteredItem ? [filteredItem] : []
    }),
  }))
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/moduleRegistry.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: organize navigation by user journeys"
```

---

### Task 3: Render Portal Navigation Groups in Sidebar

**Files:**
- Modify: `frontend/src/components/navigation/Sidebar.tsx`
- Test manually after dev server/browser verification in final task.

- [ ] **Step 1: Add href icons for new route prefixes**

Add imports:

```ts
import {
  Building2,
  CheckCircle2,
  MessageCircle,
  UserCog,
} from 'lucide-react'
```

Add route icons:

```ts
const iconByHref: Record<string, LucideIcon> = {
  '/admin': ShieldCheck,
  '/admin/integrations': Settings,
  '/admin/email': Mail,
  '/admin/ai': Bot,
  '/admin/health': Activity,
  '/contracts': FileCheck2,
  '/packages': Boxes,
  '/modules': LayoutDashboard,
  '/crm-governance': ShieldCheck,
  '/portal': LayoutDashboard,
  '/portal/empresa/perfil': Building2,
  '/portal/empresa/usuarios': Users,
  '/portal/empresa/conhecimento': BookOpen,
  '/portal/empresa/marca': FileText,
  '/portal/empresa/integracoes': Settings,
  '/portal/comercial/contas': Building2,
  '/portal/comercial/tarefas': CheckCircle2,
  '/portal/atendimento/agente-ia': Bot,
  '/portal/atendimento/filas-handoff': MessageCircle,
  '/portal/projetos/aprovacoes': CheckCircle2,
  '/portal/configuracoes/conta': UserCog,
}
```

If `BookOpen` is not already imported, import it from `lucide-react`.

- [ ] **Step 2: Show group labels for portal too**

Replace:

```tsx
{platformContext.mode === 'internal' && (
  <p className="mb-2 truncate px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
    {group.label}
  </p>
)}
```

with:

```tsx
<p className="mb-2 truncate px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
  {group.label}
</p>
```

- [ ] **Step 3: Adjust spacing so portal groups are readable**

Replace:

```tsx
<div className={platformContext.mode === 'internal' ? 'space-y-5' : 'space-y-1'}>
```

with:

```tsx
<div className="space-y-5">
```

- [ ] **Step 4: Make active state work for nested routes**

Update the `NavLink` `className` callback to consider prefix matches for sections:

```tsx
className={({ isActive }) =>
  `group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'border-r-2 border-yux-600 bg-yux-50 text-yux-700'
      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  }`
}
```

Keep exact `NavLink` matching for now. Do not add custom prefix matching in Fase 1 because duplicate wrappers may share components; route exactness is safer.

- [ ] **Step 5: Run TypeScript**

Run:

```bash
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/navigation/Sidebar.tsx
git commit -m "feat: show journey groups in sidebar"
```

---

### Task 4: Add Safe Portal State Pages

**Files:**
- Create: `frontend/src/pages/client-portal/PortalSafeStatePage.tsx`
- Create: `frontend/src/pages/client-portal/PortalApprovalsPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalAccountSettingsPage.tsx`

- [ ] **Step 1: Create `PortalSafeStatePage.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PortalSafeStatePageProps {
  title: string
  description: string
  capabilities: string[]
  backTo?: string
}

export function PortalSafeStatePage({
  title,
  description,
  capabilities,
  backTo = '/portal',
}: PortalSafeStatePageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{description}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-yux-50 p-2 text-yux-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Area planejada para este modulo</h2>
            <p className="mt-1 text-sm text-gray-600">
              Esta tela ja esta posicionada na nova arquitetura do portal. Na Fase 1 ela nao exibe dados internos nem configuracoes sensiveis.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {capabilities.map(capability => (
            <div key={capability} className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {capability}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create `PortalApprovalsPage.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Megaphone, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'

const approvalLinks = [
  {
    label: 'Landing Pages',
    description: 'Revisar previews, aprovar publicacao ou pedir ajustes.',
    href: '/portal/marketing/landing-pages',
    icon: MousePointerClick,
  },
  {
    label: 'Campanhas',
    description: 'Acompanhar criativos, status e aprovacoes de campanha.',
    href: '/portal/marketing/campanhas',
    icon: Megaphone,
  },
  {
    label: 'Propostas',
    description: 'Consultar propostas e decisoes comerciais pendentes.',
    href: '/portal/projetos/aprovacoes',
    icon: FileText,
  },
]

export function PortalApprovalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aprovacoes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pendencias recorrentes do cliente para aprovar, comentar ou solicitar alteracoes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {approvalLinks.map(item => {
          const Icon = item.icon
          return (
            <Link key={item.href} to={item.href} className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50">
              <Icon className="h-5 w-5 text-yux-700" />
              <h2 className="mt-3 font-semibold text-gray-900">{item.label}</h2>
              <p className="mt-2 text-sm text-gray-600">{item.description}</p>
            </Link>
          )
        })}
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-yux-700" />
          <div>
            <h2 className="font-semibold text-gray-900">Fila consolidada</h2>
            <p className="mt-1 text-sm text-gray-600">
              A fila consolidada de aprovacoes entra nas proximas fases. Por enquanto, use os atalhos acima para revisar cada modulo.
            </p>
          </div>
        </div>
        <Button className="mt-4" asChild>
          <Link to="/portal">Voltar para Visao Geral</Link>
        </Button>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Create `PortalAccountSettingsPage.tsx`**

```tsx
import { ShieldCheck, UserCog } from 'lucide-react'

const sections = [
  'Notificacoes',
  'Preferencias pessoais',
  'Seguranca',
  'Idioma',
  'Sessoes',
  'Dados do usuario',
]

export function PortalAccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuracoes da Conta</h1>
        <p className="mt-1 text-sm text-gray-600">
          Preferencias pessoais do usuario. Dados da empresa, equipe, integracoes e base de conhecimento ficam na area Empresa.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <UserCog className="mt-0.5 h-5 w-5 text-yux-700" />
          <div>
            <h2 className="font-semibold text-gray-900">Escopo desta area</h2>
            <p className="mt-1 text-sm text-gray-600">
              Esta pagina nao gerencia a empresa. Ela concentra apenas preferencias e seguranca do usuario logado.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sections.map(section => (
            <div key={section} className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {section}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4" />
          <p>
            Preferencias persistentes serao implementadas nas proximas fases, respeitando permissoes e seguranca por usuario.
          </p>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run TypeScript**

Run:

```bash
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/client-portal/PortalSafeStatePage.tsx frontend/src/pages/client-portal/PortalApprovalsPage.tsx frontend/src/pages/client-portal/PortalAccountSettingsPage.tsx
git commit -m "feat: add safe portal transition pages"
```

---

### Task 5: Add New Portal Routes and Legacy Redirects

**Files:**
- Modify: `frontend/src/App.tsx`
- Uses: new pages from Task 4

- [ ] **Step 1: Import new portal pages**

Add:

```ts
import { PortalAccountSettingsPage } from '@/pages/client-portal/PortalAccountSettingsPage'
import { PortalApprovalsPage } from '@/pages/client-portal/PortalApprovalsPage'
import { PortalSafeStatePage } from '@/pages/client-portal/PortalSafeStatePage'
```

- [ ] **Step 2: Add small route helper inside `App`**

Inside `App`, before `return`, add:

```tsx
  const safePortalPage = (title: string, description: string, capabilities: string[]) => (
    <PortalSafeStatePage title={title} description={description} capabilities={capabilities} />
  )
```

- [ ] **Step 3: Replace client portal routes**

Replace the current client portal route block with:

```tsx
<>
  <Route path="portal" element={<PortalDashboardPage />} />

  <Route path="portal/empresa/perfil" element={safePortalPage('Perfil da Empresa', 'Dados institucionais, segmento, canais, regioes atendidas e diferenciais.', ['Dados da empresa', 'Produtos e servicos', 'Horarios de atendimento', 'Regioes atendidas'])} />
  <Route path="portal/empresa/usuarios" element={safePortalPage('Usuarios e Equipe', 'Gestao de usuarios, papeis e permissoes por modulo.', ['Convidar usuarios', 'Definir papeis', 'Limitar acesso por modulo', 'Ver ultimo acesso'])} />
  <Route path="portal/empresa/conhecimento" element={safePortalPage('Base de Conhecimento', 'Fonte compartilhada para IA, Marketing Studio, respostas sugeridas, campanhas, landing pages, FAQ e suporte.', ['Enviar documentos', 'Cadastrar FAQs', 'Importar site', 'Aprovar conhecimento para IA'])} />
  <Route path="portal/empresa/marca" element={safePortalPage('Marca e Tom de Voz', 'Diretrizes de comunicacao, restricoes, personas e assets da marca.', ['Tom da marca', 'Palavras proibidas', 'Personas', 'Assets da marca'])} />
  <Route path="portal/empresa/integracoes" element={safePortalPage('Integracoes da Empresa', 'Conexoes do cliente com canais, midia, calendario, planilhas e webhooks.', ['WhatsApp', 'Meta Ads', 'Google Ads', 'WordPress'])} />

  <Route path="portal/comercial/leads" element={<LeadsPage />} />
  <Route path="portal/comercial/contas" element={safePortalPage('Empresas / Contas', 'Cadastro de empresas prospectadas e oportunidades B2B.', ['Contatos vinculados', 'Potencial', 'Historico', 'Oportunidades'])} />
  <Route path="portal/comercial/funis" element={<LeadsPage />} />
  <Route path="portal/comercial/tarefas" element={safePortalPage('Tarefas e Follow-ups', 'Central de atividades comerciais por lead, empresa e responsavel.', ['Tarefas atrasadas', 'Criar tarefa', 'Reagendar', 'Alertas automaticos'])} />

  <Route path="portal/atendimento/conversas" element={<PortalOmnichannelPage />} />
  <Route path="portal/atendimento/agente-ia" element={safePortalPage('Agente IA', 'Configuracao e acompanhamento do agente de atendimento.', ['Testar agente', 'Perguntas sem resposta', 'Fontes usadas', 'Regras de handoff'])} />
  <Route path="portal/atendimento/canais" element={<PortalConnectedChannelsPage />} />
  <Route path="portal/atendimento/filas-handoff" element={safePortalPage('Filas e Handoff', 'Equipes, filas, horario comercial, SLA e regras de transferencia.', ['Equipes', 'Filas', 'Prioridade', 'SLA'])} />

  <Route path="portal/marketing/landing-pages" element={<PortalLandingPagesPage />} />
  <Route path="portal/marketing/campanhas" element={<PortalCampaignsPage />} />
  <Route path="portal/marketing/studio" element={<PortalMarketingStudioPage />} />
  <Route path="portal/marketing/conteudo" element={<PortalMarketingStudioPage />} />
  <Route path="portal/marketing/calendario" element={<PortalMarketingStudioPage />} />
  <Route path="portal/marketing/criativos" element={<PortalMarketingStudioPage />} />

  <Route path="portal/automacoes/fluxos" element={safePortalPage('Fluxos de Automacao', 'Fluxos ativos, editor visual, gatilhos, condicoes e acoes.', ['Fluxos ativos', 'Editor visual', 'Pausar', 'Duplicar'])} />
  <Route path="portal/automacoes/templates" element={safePortalPage('Templates de Automacao', 'Modelos prontos para ativar automacoes por jornada.', ['Templates por setor', 'Criar a partir de modelo', 'Preview de fluxo'])} />
  <Route path="portal/automacoes/execucoes" element={safePortalPage('Execucoes de Automacao', 'Historico de execucoes, erros e consumo.', ['Execucoes', 'Erros', 'Creditos consumidos', 'Historico'])} />
  <Route path="portal/automacoes/logs" element={safePortalPage('Logs de Automacao', 'Rastreamento operacional das automacoes contratadas.', ['Logs', 'Falhas', 'Tentativas', 'Diagnostico'])} />

  <Route path="portal/projetos/projetos" element={<PortalProjectsPage />} />
  <Route path="portal/projetos/aprovacoes" element={<PortalApprovalsPage />} />
  <Route path="portal/projetos/documentos" element={safePortalPage('Documentos', 'Contratos, propostas, relatorios, materiais e arquivos da empresa.', ['Contratos', 'Propostas', 'Relatorios', 'Materiais enviados'])} />

  <Route path="portal/relatorios" element={<PortalReportsPage />} />
  <Route path="portal/suporte" element={<PortalSupportPage />} />
  <Route path="portal/financeiro" element={<PortalFinancePage />} />
  <Route path="portal/configuracoes/conta" element={<PortalAccountSettingsPage />} />

  <Route path="portal/projects" element={<Navigate to="/portal/projetos/projetos" replace />} />
  <Route path="portal/proposals" element={<Navigate to="/portal/projetos/aprovacoes" replace />} />
  <Route path="portal/crm" element={<Navigate to="/portal/comercial/leads" replace />} />
  <Route path="portal/crm/settings" element={<Navigate to="/portal/empresa/usuarios" replace />} />
  <Route path="portal/omnichannel" element={<Navigate to="/portal/atendimento/conversas" replace />} />
  <Route path="portal/omnichannel/channels" element={<Navigate to="/portal/atendimento/canais" replace />} />
  <Route path="portal/whatsapp-ai" element={<Navigate to="/portal/atendimento/conversas" replace />} />
  <Route path="portal/landing-pages" element={<Navigate to="/portal/marketing/landing-pages" replace />} />
  <Route path="portal/marketing-studio" element={<Navigate to="/portal/marketing/studio" replace />} />
  <Route path="portal/campaigns" element={<Navigate to="/portal/marketing/campanhas" replace />} />
  <Route path="portal/reports" element={<Navigate to="/portal/relatorios" replace />} />
  <Route path="portal/support" element={<Navigate to="/portal/suporte" replace />} />
  <Route path="portal/finance" element={<Navigate to="/portal/financeiro" replace />} />
</>
```

- [ ] **Step 4: Run TypeScript**

Run:

```bash
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add journey portal routes"
```

---

### Task 6: Add Approval Shortcut to Portal Dashboard

**Files:**
- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`

- [ ] **Step 1: Add fixed approval shortcut summary**

After the contract summary card and before module summary cards, add:

```tsx
      <Link
        to="/portal/projetos/aprovacoes"
        className="flex flex-col gap-3 rounded-lg border border-yux-200 bg-yux-50 p-4 transition-colors hover:border-yux-400 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p className="text-xs font-medium uppercase text-yux-700">Pendencias de aprovacao</p>
          <h2 className="mt-1 font-semibold text-gray-900">Revise aprovacoes recorrentes do portal</h2>
          <p className="mt-1 text-sm text-gray-600">
            Landing pages, campanhas, propostas, criativos, documentos e entregaveis ficam centralizados neste atalho.
          </p>
        </div>
        <span className="text-sm font-medium text-yux-700">Abrir aprovacoes</span>
      </Link>
```

- [ ] **Step 2: Update module summaries to new routes**

In `summaryByModule`, update route-driven wording where necessary:

```ts
const summaryByModule: Record<string, { title: string; value: string; detail: string }> = {
  crm: { title: 'Comercial', value: 'Leads & Funis', detail: 'Pipeline, oportunidades e proximas acoes.' },
  whatsapp_ai: { title: 'Atendimento & IA', value: 'Conversas IA', detail: 'Atendimentos, handoff e contexto comercial.' },
  landing_pages: { title: 'Marketing', value: 'Landing Pages', detail: 'Versoes, ajustes e publicacoes.' },
  campaigns: { title: 'Marketing', value: 'Campanhas', detail: 'Spend, leads, CPL e recomendacoes.' },
  proposals: { title: 'Aprovacoes', value: 'Propostas', detail: 'Aprovacoes e conversoes.' },
  support: { title: 'Suporte', value: 'Tickets e SLA', detail: 'Status de chamados e prioridade.' },
  finance: { title: 'Financeiro', value: 'Faturas e saldo', detail: 'Resumo financeiro contratado.' },
  bi_reports: { title: 'Relatorios', value: 'ROI consolidado', detail: 'Indicadores comerciais seguros.' },
}
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/client-portal/PortalDashboardPage.tsx
git commit -m "feat: highlight portal approval queue"
```

---

### Task 7: Full Validation

**Files:**
- No code edits expected unless validation finds a bug.

- [ ] **Step 1: Run navigation test**

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```bash
cd frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start dev server**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Expected: Vite starts and prints a local URL.

- [ ] **Step 5: Browser smoke test**

Open the local URL and validate:

- unauthenticated user lands at `/auth/login`;
- internal user menu labels show the new YUX journeys;
- client user menu labels show portal journeys;
- `/portal/crm` redirects to `/portal/comercial/leads`;
- `/portal/omnichannel` redirects to `/portal/atendimento/conversas`;
- `/portal/campaigns` redirects to `/portal/marketing/campanhas`;
- `/portal/projetos/aprovacoes` renders the approval wrapper;
- `/portal/configuracoes/conta` renders account settings scope, not company settings.

- [ ] **Step 6: Fix issues if found**

If validation finds route/import/test failures, fix only the touched navigation/route files and rerun:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
npm run type-check
npm run build
```

- [ ] **Step 7: Commit validation fixes**

Only if fixes were needed:

```bash
git add frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/moduleRegistry.ts frontend/src/components/navigation/Sidebar.tsx frontend/src/pages/client-portal
git commit -m "fix: stabilize journey navigation rollout"
```

---

## Final Acceptance Checklist

- [ ] Internal menu uses `Clientes & Contratos`, `Operacao dos Clientes`, and `Administracao da Plataforma`.
- [ ] Portal menu uses `Configuracoes da Conta`, not generic `Configuracoes`.
- [ ] Portal dashboard has fixed `Pendencias de aprovacao` shortcut.
- [ ] Base de Conhecimento route and page copy state that it feeds Agente IA, Marketing Studio, respostas sugeridas, campanhas, landing pages, FAQ and suporte.
- [ ] Old portal URLs redirect to new journey URLs.
- [ ] Contract/module filtering still hides unavailable module groups/items.
- [ ] Current screens remain reachable through new routes.
- [ ] `npm test -- src/lib/platform/navigation.test.ts` passes from `frontend/`.
- [ ] `npm run type-check` passes from `frontend/`.
- [ ] `npm run build` passes from `frontend/`.

## Execution Order

1. Task 1: tests first.
2. Task 2: navigation builders and module routes.
3. Task 3: sidebar group rendering.
4. Task 4: safe transition pages.
5. Task 5: new routes and legacy redirects.
6. Task 6: dashboard approvals shortcut.
7. Task 7: full validation and browser smoke test.
