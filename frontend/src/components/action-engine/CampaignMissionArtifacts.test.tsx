import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CampaignMissionArtifacts } from './CampaignMissionArtifacts'
import { MissionGuardrailsPanel } from './MissionGuardrailsPanel'
import { MissionMetricsPanel, metricDefinitions } from './MissionMetricsPanel'
import type { MissionArtifact, MissionMetricSpec, MissionMetrics } from '@/types/actionEngine'

const technicalHash = 'a'.repeat(64)
const base = { status: 'draft' as const, contentHash: 'b'.repeat(64), staleApproval: false, proposedVersion: { status: 'proposed' as const, contentHash: 'b'.repeat(64) }, citations: [], complianceWarnings: [] }
const artifacts: MissionArtifact[] = [
  { ...base, key: 'brief', kind: 'campaign_brief', title: 'Imóveis SP', data: { name: 'Imóveis SP', objective: 'lead_generation', offer: 'Consultoria imobiliária', platform: 'meta', dailyBudgetBrl: '50', totalBudgetBrl: '500', startsAt: '2026-09-01T00:00:00.000Z' } },
  { ...base, key: 'audience', kind: 'campaign_audience', title: 'Público', data: { rationale: 'ICP publicado', targeting: { region: 'São Paulo', intent: 'Comprar imóvel' }, exclusions: ['clientes atuais'] } },
  { ...base, key: 'creative_1', kind: 'campaign_creative', title: 'Encontre seu imóvel', data: { format: 'image', headline: 'Encontre seu próximo imóvel', body: 'Converse com um especialista.' } },
  { ...base, key: 'landing', kind: 'campaign_landing_page', title: 'Landing Imóveis SP', entityId: 'landing-1', data: { previewUrl: 'https://preview.example.com/imoveis-sp' } },
  { ...base, key: 'form', kind: 'campaign_lead_form', title: 'Formulário Interesse', entityId: 'form-1', data: {} },
  { ...base, key: 'tracking', kind: 'campaign_tracking', title: 'Tracking', data: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'imoveis_sp', conversion_event: 'lead' } },
  { ...base, key: 'provider', kind: 'campaign_provider', title: 'Meta Ads', data: { provider: 'meta', providerState: 'provider_paused', providerReference: 'meta-campaign-123', totalBudgetBrl: '500', dailyBudgetBrl: '50', activationApprovalStatus: 'pending', activationSubjectHash: technicalHash } },
]

const metricSpec: MissionMetricSpec = {
  primary: [
    { key: 'leads', unit: 'count', group: 'primary' },
    { key: 'attributed_revenue_brl', unit: 'BRL', group: 'primary', attributionPolicy: { version: 1, model: 'last_touch', windowDays: 30 }, attributionPolicyHash: technicalHash },
  ],
  leading: ['impressions', 'clicks', 'ctr'], economics: ['spend_brl', 'cpl_brl', 'mroi'],
  guardrails: ['total_budget_brl', 'daily_budget_brl', 'consent_blocks', 'tracking_failure', 'complaint_rate'],
}

const metrics: MissionMetrics = {
  leads: { kind: 'known', value: '5', unit: 'count' },
  attributed_revenue_brl: { kind: 'unknown', reason: 'attribution_identity_unresolved', unit: 'BRL' },
  impressions: { kind: 'known', value: '1000', unit: 'count' }, clicks: { kind: 'known', value: '100', unit: 'count' },
  ctr: { kind: 'known', value: '0.1', unit: 'ratio' }, spend_brl: { kind: 'known', value: '510', unit: 'BRL' },
  total_budget_brl: { kind: 'known', value: '500', unit: 'BRL' }, daily_budget_brl: { kind: 'known', value: '50', unit: 'BRL' },
  consent_blocks: { kind: 'known', value: '0', unit: 'count' }, tracking_failure: { kind: 'known', value: '1', unit: 'count' },
  complaint_rate: { kind: 'not_applicable', reason: 'zero_denominator', unit: 'ratio' }, cpl_brl: { kind: 'known', value: '102', unit: 'BRL' },
  mroi: { kind: 'unknown', reason: 'attribution_identity_unresolved', unit: 'ratio' },
}

afterEach(() => { document.body.innerHTML = '' })

describe('Campaign Mission cockpit', () => {
  it('shows brief, audience, creatives, acquisition, tracking and paused provider review to clients', async () => {
    const { root } = await render(<CampaignMissionArtifacts artifacts={artifacts} canWrite={false} showTechnicalProof={false} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Consultoria imobiliária')
    expect(text).toContain('São Paulo')
    expect(text).toContain('Encontre seu próximo imóvel')
    expect(text).toContain('Landing Imóveis SP')
    expect(text).toContain('Formulário Interesse')
    expect(text).toContain('Plano de mensuração validado')
    expect(text).toContain('Criada e pausada')
    expect(text).toContain('Aguardando sua decisão')
    expect(text).toContain('R$ 500,00')
    expect(text).toContain('somente leitura')
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://preview.example.com/imoveis-sp"]')).not.toBeNull()
    expect(text).not.toContain(technicalHash)
    act(() => root.unmount())
  })

  it('shows exact activation and attribution hashes only in technical proof', async () => {
    const { root } = await render(<><CampaignMissionArtifacts artifacts={artifacts} canWrite showTechnicalProof /><MissionMetricsPanel metrics={metrics} metricSpec={metricSpec} showTechnicalProof /></>)
    expect(document.body.textContent).toContain(technicalHash)
    expect(document.body.textContent).toContain('Atribuição: Last touch · 30 dias · v1')
    act(() => root.unmount())
  })

  it('renders pack-driven metrics with unknown semantics and guardrail pause', async () => {
    expect(metricDefinitions(metricSpec).map(item => item.key)).toEqual(['leads', 'attributed_revenue_brl', 'impressions', 'clicks', 'ctr', 'spend_brl', 'cpl_brl', 'mroi'])
    const { root } = await render(<><MissionMetricsPanel metrics={metrics} metricSpec={metricSpec} /><MissionGuardrailsPanel metrics={metrics} metricSpec={metricSpec} status="paused" /></>)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Receita atribuída')
    expect(text).toContain('Desconhecido')
    expect(text).toContain('identidade entre campanha, lead e receita')
    expect(text).toContain('A missão foi pausada')
    expect(text).toContain('Falhas de tracking')
    expect(text).toContain('Limite acionado')
    act(() => root.unmount())
  })
})

async function render(element: ReactNode): Promise<{ root: Root }> {
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container)
  await act(async () => { root.render(element) }); return { root }
}
