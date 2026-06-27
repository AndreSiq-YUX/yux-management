import { useState } from 'react'
import { CheckCircle2, Pause, RefreshCw, Send, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignBuilder } from './CampaignBuilder'
import { CampaignCreativePanel } from './CampaignCreativePanel'
import { CampaignMetricsPanel } from './CampaignMetricsPanel'
import { CampaignPlanDetail } from '@/components/growth-workspace/CampaignPlanDetail'
import { CampaignPlanWizard } from '@/components/growth-workspace/CampaignPlanWizard'
import { GrowthTemplateLibrary } from '@/components/growth-workspace/GrowthTemplateLibrary'
import { createCampaignPlanDraft, updateCampaignPlanStepStatuses } from '@/lib/growth-workspace/campaignPlanRules'
import type { AdProviderConnection, Campaign, CreateCampaignDraftInput } from '@/types/campaign'
import type { CampaignPlan, CampaignPlanStep, GrowthTemplateFilter } from '@/types/growthWorkspace'

interface CampaignsWorkspaceProps {
  campaigns: Campaign[]
  providerConnections: AdProviderConnection[]
  defaultOrganizationId?: string
  defaultClientId?: string
  defaultContractId?: string
  campaignPlans?: CampaignPlan[]
  onRefresh: () => void
  onCreateDraft: (input: CreateCampaignDraftInput) => void
  onCreateCampaignPlan?: (plan: CampaignPlan) => Promise<CampaignPlan | void> | CampaignPlan | void
  onUpdateCampaignPlanStep?: (
    stepId: string,
    patch: Partial<Pick<CampaignPlanStep, 'status' | 'ownerId' | 'dueAt' | 'completedAt' | 'blockedReason'>>
  ) => Promise<CampaignPlanStep | void> | CampaignPlanStep | void
  onSubmitApproval: (campaignId: string) => void
  onApprove: (campaignId: string) => void
  onCreateProvider?: (campaignId: string) => void
  onSyncMetrics: (campaignId: string) => void
  onPause: (campaignId: string) => void
}

export function CampaignsWorkspace({
  campaigns,
  providerConnections,
  defaultOrganizationId,
  defaultClientId,
  defaultContractId,
  campaignPlans,
  onRefresh,
  onCreateDraft,
  onCreateCampaignPlan,
  onUpdateCampaignPlanStep,
  onSubmitApproval,
  onApprove,
  onCreateProvider,
  onSyncMetrics,
  onPause,
}: CampaignsWorkspaceProps) {
  const unhealthyConnections = providerConnections.filter(connection => connection.status !== 'connected')
  const isControlledPlanList = Array.isArray(campaignPlans)
  const [localPlans, setLocalPlans] = useState<CampaignPlan[]>(() => {
    const campaign = campaigns[0]
    if (!campaign || !defaultOrganizationId) return []

    return [createCampaignPlanDraft({
      organizationId: defaultOrganizationId,
      contractId: defaultContractId,
      name: campaign.name,
      objective: campaign.objective === 'lead_generation' ? 'lead_generation' : 'offer_promotion',
    })]
  })
  const plans = isControlledPlanList ? campaignPlans : localPlans
  const [activePlanId, setActivePlanId] = useState<string | undefined>(() => plans[0]?.id)
  const [selectedTemplateLabel, setSelectedTemplateLabel] = useState<string>()
  const activePlan = plans.find(plan => plan.id === activePlanId) || plans[0] || null
  const templateFilters: GrowthTemplateFilter | undefined = activePlan ? {
    objectiveKey: activePlan.objective,
    campaignStepKey: updateCampaignPlanStepStatuses(activePlan).steps.find(step => !['completed', 'linked', 'skipped'].includes(step.status))?.key,
    portalVisibleOnly: true,
  } : undefined

  const handleCreatePlan = async (plan: CampaignPlan) => {
    if (onCreateCampaignPlan) {
      const createdPlan = await onCreateCampaignPlan(plan)
      if (createdPlan?.id) setActivePlanId(createdPlan.id)
      return
    }

    setLocalPlans(currentPlans => [plan, ...currentPlans])
    setActivePlanId(plan.id)
  }

  const handlePlanStepAction = async (step: CampaignPlanStep) => {
    if (!activePlan || step.status === 'blocked') return

    const completedAt = new Date().toISOString()
    if (onUpdateCampaignPlanStep) {
      await onUpdateCampaignPlanStep(step.id, {
        status: step.status === 'completed' || step.status === 'linked' ? step.status : 'completed',
        completedAt,
      })
      return
    }

    const updatedPlan = updateCampaignPlanStepStatuses({
      ...activePlan,
      steps: activePlan.steps.map(item => item.id === step.id
        ? {
            ...item,
            status: item.status === 'completed' || item.status === 'linked' ? item.status : 'completed',
            completedAt,
          }
        : item),
    })
    setLocalPlans(currentPlans => currentPlans.map(plan => plan.id === updatedPlan.id ? updatedPlan : plan))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Campanhas</h1>
          <p className="text-slate-600">Core API-first para Meta Ads, Google Ads, aprovacoes e ROI.</p>
        </div>
        <Button title="Atualizar campanhas" variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className={`rounded-md border p-4 ${unhealthyConnections.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4" />
          {unhealthyConnections.length
            ? `${unhealthyConnections.length} conexao(oes) exigem atencao`
            : 'Conexoes de midia sem pendencias criticas'}
        </div>
      </div>

      <CampaignPlanWizard
        organizationId={defaultOrganizationId}
        contractId={defaultContractId}
        onCreatePlan={handleCreatePlan}
      />

      {activePlan && (
        <>
          <CampaignPlanDetail
            plan={activePlan}
            onStepAction={handlePlanStepAction}
          />
          <GrowthTemplateLibrary
            key={`${activePlan.id}:${templateFilters?.campaignStepKey || 'all'}`}
            title="Templates para a campanha"
            description="Modelos filtrados pelo objetivo do plano e pela proxima etapa em aberto."
            compact
            initialFilters={templateFilters}
            onSelectTemplate={template => setSelectedTemplateLabel(template.label)}
          />
          {selectedTemplateLabel && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Template selecionado: {selectedTemplateLabel}. Vincule um ativo real na etapa correspondente do plano.
            </div>
          )}
        </>
      )}

      <CampaignMetricsPanel campaigns={campaigns} providerConnections={providerConnections} activeCampaignPlanId={activePlan?.id} />
      <CampaignBuilder
        defaultOrganizationId={defaultOrganizationId}
        defaultClientId={defaultClientId}
        defaultContractId={defaultContractId}
        onCreateDraft={onCreateDraft}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {campaigns.map(campaign => {
          const providerConnection = providerConnections.find(connection => connection.id === campaign.providerConnectionId)
          const canCreateInProvider = campaign.lifecycleStatus === 'approved'
            && Boolean(campaign.providerConnectionId)
            && Boolean(campaign.adAccountId)
            && Boolean(providerConnection && ['connected', 'stale'].includes(providerConnection.status))
          return (
          <article key={campaign.id} className="rounded-md border bg-white p-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <CampaignCreativePanel creatives={campaign.creatives} />
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{campaign.name}</h2>
                    <p className="text-sm text-slate-500">{campaign.provider} · {campaign.objective}</p>
                  </div>
                  <Badge variant={campaign.lifecycleStatus === 'active' ? 'default' : 'secondary'}>{campaign.lifecycleStatus}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <Info label="Budget/dia" value={campaign.dailyBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="Gasto" value={campaign.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Info label="Leads" value={campaign.leads.toString()} />
                  <Info label="MROI" value={`${campaign.mroi}x`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button title="Enviar para aprovacao" size="sm" variant="outline" onClick={() => onSubmitApproval(campaign.id)}>Aprovacao</Button>
                  <Button title="Aprovar campanha" size="sm" variant="outline" onClick={() => onApprove(campaign.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Aprovar local</Button>
                  <Button title="Criar campanha no provider" size="sm" variant="outline" disabled={!canCreateInProvider} onClick={() => onCreateProvider?.(campaign.id)}><Send className="mr-1 h-3.5 w-3.5" />Criar no provider</Button>
                  <Button title="Sincronizar metricas" size="sm" variant="outline" onClick={() => onSyncMetrics(campaign.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Sync</Button>
                  <Button title="Pausar campanha" size="sm" variant="outline" onClick={() => onPause(campaign.id)}><Pause className="mr-1 h-3.5 w-3.5" />Pausar</Button>
                </div>
                {providerConnection?.status === 'needs_reauth' && <p className="text-sm text-red-600">Provider precisa de reautenticacao antes de criar ou sincronizar.</p>}
                {!campaign.adAccountId && <p className="text-sm text-slate-500">Conta de anuncios pendente para ativacao provider.</p>}
                {(campaign.alerts?.length || 0) > 0 && <p className="text-sm text-amber-700">{campaign.alerts?.[0].title}</p>}
                {(campaign.recommendations?.length || 0) > 0 && <p className="text-sm text-slate-600">{campaign.recommendations?.[0].title}</p>}
              </div>
            </div>
          </article>
        )})}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
