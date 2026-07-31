# Dashboard Cliente Cockpit Adaptativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the client dashboard as an adaptive executive cockpit that follows the refined internal dashboard visual system.

**Architecture:** Add a focused model/rules module that converts the current portal data sources into a `PortalExecutiveDashboardModel`, then render that model in `PortalDashboardPage`. Keep the first implementation frontend-derived from existing hooks/services, with typed extension points for a future backend aggregate and Admin focus override.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, lucide-react, Vitest, existing Portal YUX stores/hooks/services.

---

## File Structure

- Create `frontend/src/lib/client-portal/portalDashboardRules.ts`
  - Owns dashboard focus detection, pulse metrics, main result, attention items, YUX activity, module summaries, and expansion suggestions.
- Create `frontend/src/lib/client-portal/portalDashboardRules.test.ts`
  - Covers commercial/marketing/delivery/executive focus, module visibility, expansion suggestions, and partial data states.
- Modify `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
  - Replaces the current generic contract/module dashboard with the adaptive cockpit UI.
  - Keeps existing data hooks: `usePortalActionSummary`, `usePortalCrmContext`, `usePortalMarketingContext`, onboarding/project/finance data already exposed by action summary.
- Modify or add `frontend/src/pages/client-portal/PortalDashboardPage.test.tsx`
  - Verifies the rendered hierarchy: header, pulse, result principal, pontos de atencao, trabalho da YUX, recomendacoes, modulos contratados, expansao recomendada.

## Task 1: Dashboard Model Rules

**Files:**
- Create: `frontend/src/lib/client-portal/portalDashboardRules.ts`
- Test: `frontend/src/lib/client-portal/portalDashboardRules.test.ts`

- [ ] **Step 1: Write failing tests for focus and hierarchy**

Test cases:

```ts
expect(buildPortalDashboardModel(inputWithCrm).focus).toBe('commercial')
expect(buildPortalDashboardModel(inputWithMarketing).focus).toBe('marketing')
expect(buildPortalDashboardModel(inputWithProjectsOnly).focus).toBe('delivery')
expect(buildPortalDashboardModel(inputWithMultipleModules).focus).toBe('executive')
expect(model.activeModules.every(module => input.enabledModuleKeys.includes(module.moduleKey))).toBe(true)
expect(model.expansionSuggestions).toHaveLength(2)
```

- [ ] **Step 2: Implement typed model builder**

Create:

```ts
export type PortalDashboardFocus = 'commercial' | 'marketing' | 'delivery' | 'executive'

export interface PortalExecutiveDashboardModel {
  focus: PortalDashboardFocus
  focusLabel: string
  dataStatus: 'Completo' | 'Parcial' | 'Com falha'
  unavailableSources: string[]
  generatedAtLabel: string
  pulse: PortalPulseMetric[]
  mainResult: PortalMainResult
  attentionItems: PortalAttentionItem[]
  yuxActivity: PortalYuxActivityItem[]
  recommendations: PortalRecommendationItem[]
  activeModules: PortalModuleSummary[]
  expansionSuggestions: PortalExpansionSuggestion[]
}
```

Use existing data only: contract, organization, enabled modules, portal action summary, CRM context, marketing context, projects/approvals/invoices from action summary.

- [ ] **Step 3: Run focused rule tests**

Run:

```bash
npm test -- portalDashboardRules.test.ts
```

Expected: PASS.

## Task 2: Portal Dashboard UI

**Files:**
- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
- Test: `frontend/src/pages/client-portal/PortalDashboardPage.test.tsx`

- [ ] **Step 1: Replace the current layout with cockpit sections**

Render these sections in order:

1. Header executivo.
2. Pulso executivo adaptativo.
3. Resultado principal.
4. Pontos de atencao.
5. Trabalho da YUX e recomendacoes.
6. Modulos contratados e expansao recomendada.

Use the internal dashboard visual tokens:

```ts
bg-[#f4f4f4]
text-[#141821]
rounded-sm
border border-slate-300
border-l-2 / border-t-2 for accents
primary #2563EB
label text-[11px] uppercase
```

- [ ] **Step 2: Keep controls honest**

The time window toggle must update local state. Buttons that are not connected must either be real links or visually disabled with `title="Em breve"` and `aria-label`.

- [ ] **Step 3: Add UI tests**

Assert visible text:

```ts
Visao Geral do Cliente
Pulso Executivo
Resultado comercial
Pontos de atencao
Trabalho da YUX
Modulos contratados
Expansao recomendada
```

- [ ] **Step 4: Run focused page tests**

Run:

```bash
npm test -- PortalDashboardPage.test.tsx portalDashboardRules.test.ts
```

Expected: PASS.

## Task 3: Browser QA And Build

**Files:**
- No source files unless QA reveals visual issues.

- [ ] **Step 1: Type-check and build**

Run:

```bash
npm run type-check
npm run build
```

Expected: both pass. Build may keep existing chunk-size warnings.

- [ ] **Step 2: Browser validation**

Validate in the in-app browser:

- `/portal` when logged as client, if available;
- `/client-workspaces/:organizationId` when an internal workspace is available;
- no horizontal overflow;
- sidebar logo remains in sidebar;
- dashboard content has no logo in main content;
- time window state changes;
- no framework overlay.

- [ ] **Step 3: Commit and push**

Stage only the plan, rules, tests, and page changes:

```bash
git add docs/superpowers/plans/2026-07-03-dashboard-cliente-cockpit-adaptativo-implementation-plan.md \
  frontend/src/lib/client-portal/portalDashboardRules.ts \
  frontend/src/lib/client-portal/portalDashboardRules.test.ts \
  frontend/src/pages/client-portal/PortalDashboardPage.tsx \
  frontend/src/pages/client-portal/PortalDashboardPage.test.tsx
git commit -m "feat: implement adaptive client dashboard cockpit"
git push origin codex/strategy-packs-workspace
```

## Self-Review

- Spec coverage: the plan covers adaptive contract focus, executive pulse, main result, attention points, YUX work/recommendations, active modules, expansion suggestions, data states, and visual standards.
- Placeholder scan: no unresolved implementation placeholders are required for the first version.
- Scope check: Admin override and backend aggregate remain intentionally out of implementation scope for this pass, with frontend extension points kept in the model.
