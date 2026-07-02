import { FormEvent, useEffect, useState } from 'react'
import { Building2, Plus, Radar, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StrategyContextPanel } from '@/components/strategy-engine/StrategyContextPanel'
import {
  canConvertRadarOpportunity,
  canShowRadarNavigation,
  getRadarCampaignStatusLabel,
  getRadarCompanyDisplayName,
  getRadarOpportunityStatusLabel,
  getRadarScoreTone,
} from '@/lib/radar/radarRules'
import { radarService } from '@/services/radarService'
import { usePlatformContext } from '@/stores/platformStore'
import type { RadarCampaign, RadarMetrics, RadarOpportunity } from '@/types/radar'

const initialForm = {
  name: '',
  targetSegment: 'Clinicas',
  targetCity: 'Londrina',
  targetState: 'PR',
  offerType: 'Diagnostico YUX 48h',
  dailyLimit: 5,
}

const initialCompanyForm = {
  tradeName: '',
  legalName: '',
  city: '',
  state: '',
  websiteUrl: '',
  emailRaw: '',
  phoneRaw: '',
}

export function RadarWorkspace() {
  const context = usePlatformContext()
  const organizationId = context.organization?.id
  const [campaigns, setCampaigns] = useState<RadarCampaign[]>([])
  const [form, setForm] = useState(initialForm)
  const [companyForm, setCompanyForm] = useState(initialCompanyForm)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<RadarOpportunity[]>([])
  const [metrics, setMetrics] = useState<RadarMetrics | null>(null)
  const [selectedOpportunity, setSelectedOpportunity] = useState<RadarOpportunity | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [addingCompany, setAddingCompany] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const canAccess = canShowRadarNavigation(context)

  useEffect(() => {
    if (!organizationId || !canAccess) return

    setLoading(true)
    radarService.getCampaigns(organizationId)
      .then(setCampaigns)
      .catch(error => {
        console.error('Erro ao carregar Radar:', error)
        toast.error('Erro ao carregar Radar Comercial')
      })
      .finally(() => setLoading(false))
  }, [organizationId, canAccess])

  useEffect(() => {
    if (!selectedCampaignId || !canAccess) return

    Promise.all([
      radarService.getOpportunities(selectedCampaignId),
      radarService.getMetrics(selectedCampaignId),
    ])
      .then(([nextOpportunities, nextMetrics]) => {
        setOpportunities(nextOpportunities)
        setMetrics(nextMetrics)
        setSelectedOpportunity(current => current ?? nextOpportunities[0] ?? null)
      })
      .catch(error => {
        console.error('Erro ao carregar oportunidades Radar:', error)
        toast.error('Erro ao carregar oportunidades')
      })
  }, [selectedCampaignId, canAccess])

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || creating) return

    try {
      setCreating(true)
      const campaign = await radarService.createCampaign({
        organizationId,
        ...form,
        targetKeywords: [form.targetSegment],
        targetCnaes: [],
      })

      setCampaigns(current => [campaign, ...current])
      setSelectedCampaignId(campaign.id)
      setOpportunities([])
      setMetrics(null)
      setSelectedOpportunity(null)
      setForm(initialForm)
      toast.success('Campanha Radar criada')
    } catch (error) {
      console.error('Erro ao criar campanha Radar:', error)
      toast.error('Erro ao criar campanha Radar')
    } finally {
      setCreating(false)
    }
  }

  const addCompany = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || addingCompany) return

    try {
      setAddingCompany(true)
      const result = await radarService.addCompany(selectedCampaignId, {
        organizationId,
        tradeName: companyForm.tradeName || undefined,
        legalName: companyForm.legalName || undefined,
        city: companyForm.city || undefined,
        state: companyForm.state || undefined,
        websiteUrl: companyForm.websiteUrl || undefined,
        emailRaw: companyForm.emailRaw || undefined,
        phoneRaw: companyForm.phoneRaw || undefined,
      })

      setOpportunities(current => [result.opportunity, ...current.filter(opportunity => opportunity.id !== result.opportunity.id)])
      setSelectedOpportunity(result.opportunity)
      setCompanyForm(initialCompanyForm)
      toast.success('Empresa adicionada ao Radar')
      if (selectedCampaignId) {
        radarService.getMetrics(selectedCampaignId).then(setMetrics).catch(() => undefined)
      }
    } catch (error) {
      console.error('Erro ao adicionar empresa ao Radar:', error)
      toast.error('Erro ao adicionar empresa')
    } finally {
      setAddingCompany(false)
    }
  }

  const runOpportunityAction = async (
    actionKey: string,
    action: () => Promise<RadarOpportunity>,
    successMessage?: string,
  ) => {
    if (actionLoading) return

    try {
      setActionLoading(actionKey)
      const opportunity = await action()
      setSelectedOpportunity(opportunity)
      setOpportunities(current => current.map(item => item.id === opportunity.id ? opportunity : item))
      if (successMessage) toast.success(successMessage)
    } catch (error) {
      console.error('Erro ao atualizar oportunidade Radar:', error)
      toast.error('Erro ao atualizar oportunidade')
    } finally {
      setActionLoading(null)
    }
  }

  const convertSelectedOpportunity = async () => {
    if (!selectedOpportunity || actionLoading) return

    try {
      setActionLoading('convert')
      const result = await radarService.convertToLead(selectedOpportunity.id)
      setSelectedOpportunity(result.opportunity)
      setOpportunities(current => current.map(item => item.id === result.opportunity.id ? result.opportunity : item))
      toast.success('Lead criado no CRM')
    } catch (error) {
      console.error('Erro ao criar lead pelo Radar:', error)
      toast.error('Erro ao criar lead no CRM')
    } finally {
      setActionLoading(null)
    }
  }

  if (!canAccess) {
    return (
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          Radar Comercial indisponivel
        </div>
        <p className="mt-2 text-sm text-slate-600">Este modulo e interno da YUX e nao fica disponivel para clientes nesta fase.</p>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar Comercial</h1>
          <p className="text-sm text-gray-600">Captacao ativa consultiva integrada ao Strategy Engine, harness, RAG e CRM.</p>
        </div>
      </div>

      <StrategyContextPanel
        organizationId={organizationId || ''}
        moduleKey="crm"
        recordType="radar"
        recordTitle="Radar Comercial"
        contextSummary="Use o Strategy Engine para orientar Analise da oportunidade, oferta recomendada, riscos, evidencias e proxima acao antes de qualquer conversao para lead."
      />

      <section className="rounded-md border bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">Nova campanha local por nicho</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-6" onSubmit={createCampaign}>
          <Input className="md:col-span-2" placeholder="Nome" value={form.name} required onChange={event => setForm({ ...form, name: event.target.value })} />
          <Input placeholder="Nicho" value={form.targetSegment} required onChange={event => setForm({ ...form, targetSegment: event.target.value })} />
          <Input placeholder="Cidade" value={form.targetCity} required onChange={event => setForm({ ...form, targetCity: event.target.value })} />
          <Input placeholder="UF" value={form.targetState} required maxLength={2} onChange={event => setForm({ ...form, targetState: event.target.value.toUpperCase() })} />
          <Input type="number" min="1" max="10" placeholder="Limite" value={form.dailyLimit} required onChange={event => setForm({ ...form, dailyLimit: Number(event.target.value) })} />
          <Button type="submit" disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Criando...' : 'Criar'}
          </Button>
        </form>
      </section>

      <section className="rounded-md border bg-white">
        <div className="border-b p-4">
          <h2 className="font-semibold text-slate-950">Campanhas</h2>
          <p className="text-sm text-slate-500">Mensagens continuam em revisao humana obrigatoria; nenhum envio automatico e permitido no MVP.</p>
        </div>
        {loading && <p className="p-4 text-sm text-slate-500">Carregando campanhas...</p>}
        {!loading && campaigns.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma campanha criada.</p>}
        {campaigns.map(campaign => (
          <div key={campaign.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr_120px]">
            <div className="flex items-start gap-2">
              <Radar className="mt-0.5 h-4 w-4 text-yux-700" />
              <div>
                <p className="font-medium text-slate-950">{campaign.name}</p>
                <p className="text-sm text-slate-500">{campaign.targetSegment} em {campaign.targetCity}/{campaign.targetState}</p>
              </div>
            </div>
            <div className="text-sm text-slate-600">
              <Building2 className="mr-1 inline h-4 w-4" />
              Oferta: {campaign.offerType}
            </div>
            <div className="text-sm text-slate-600">Limite diario: {campaign.dailyLimit}</div>
            <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
              <span>{getRadarCampaignStatusLabel(campaign.status)}</span>
              <Button type="button" size="sm" variant={selectedCampaignId === campaign.id ? 'default' : 'outline'} onClick={() => {
                setSelectedCampaignId(campaign.id)
                setSelectedOpportunity(null)
              }}>
                Abrir
              </Button>
            </div>
          </div>
        ))}
      </section>

      {selectedCampaignId && (
        <section className="rounded-md border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Empresas e oportunidades</h2>
              <p className="text-sm text-slate-500">
                {metrics ? `${metrics.opportunities} oportunidades, ${metrics.reviewPending} em revisao, custo estimado R$ ${metrics.estimatedCost.toFixed(2)}` : 'Cadastre empresas manualmente para o MVP.'}
              </p>
            </div>
          </div>
          <form className="mt-3 grid gap-3 md:grid-cols-6" onSubmit={addCompany}>
            <Input className="md:col-span-2" placeholder="Nome fantasia" value={companyForm.tradeName} required onChange={event => setCompanyForm({ ...companyForm, tradeName: event.target.value })} />
            <Input className="md:col-span-2" placeholder="Razao social" value={companyForm.legalName} onChange={event => setCompanyForm({ ...companyForm, legalName: event.target.value })} />
            <Input placeholder="Cidade" value={companyForm.city} onChange={event => setCompanyForm({ ...companyForm, city: event.target.value })} />
            <Input placeholder="UF" value={companyForm.state} maxLength={2} onChange={event => setCompanyForm({ ...companyForm, state: event.target.value.toUpperCase() })} />
            <Input className="md:col-span-2" placeholder="Site" value={companyForm.websiteUrl} onChange={event => setCompanyForm({ ...companyForm, websiteUrl: event.target.value })} />
            <Input className="md:col-span-2" placeholder="Email publico" value={companyForm.emailRaw} onChange={event => setCompanyForm({ ...companyForm, emailRaw: event.target.value })} />
            <Input placeholder="Telefone" value={companyForm.phoneRaw} onChange={event => setCompanyForm({ ...companyForm, phoneRaw: event.target.value })} />
            <Button type="submit" disabled={addingCompany}>
              <Plus className="mr-2 h-4 w-4" />
              {addingCompany ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </form>
          <div className="mt-4 divide-y rounded-md border">
            {opportunities.length === 0 && <p className="p-3 text-sm text-slate-500">Nenhuma oportunidade nesta campanha.</p>}
            {opportunities.map(opportunity => (
              <button
                key={opportunity.id}
                type="button"
                className={`flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-slate-50 ${selectedOpportunity?.id === opportunity.id ? 'bg-slate-50' : ''}`}
                onClick={() => setSelectedOpportunity(opportunity)}
              >
                <span>
                  <span className="block font-medium text-slate-950">{getRadarCompanyDisplayName(opportunity.company)}</span>
                  <span className="block text-xs text-slate-500">{getRadarOpportunityStatusLabel(opportunity.status)}</span>
                </span>
                <span className="text-xs text-slate-500">Score {opportunity.latestScore?.totalScore ?? '-'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <OpportunityReviewPanel
        opportunity={selectedOpportunity}
        actionLoading={actionLoading}
        onRunAnalysis={opportunity => runOpportunityAction('analysis', () => radarService.runAnalysis(opportunity.id), 'Analise da oportunidade gerada')}
        onApprove={opportunity => runOpportunityAction('approve', () => radarService.reviewOpportunity(opportunity.id, 'approved'), 'Oportunidade aprovada')}
        onReject={opportunity => runOpportunityAction('reject', () => radarService.reviewOpportunity(opportunity.id, 'rejected'), 'Oportunidade rejeitada')}
        onOptOut={opportunity => runOpportunityAction('opt-out', () => radarService.optOutOpportunity(opportunity.id), 'Opt-out registrado')}
        onConvert={convertSelectedOpportunity}
      />
    </div>
  )
}

function OpportunityReviewPanel({
  opportunity,
  actionLoading,
  onRunAnalysis,
  onApprove,
  onReject,
  onOptOut,
  onConvert,
}: {
  opportunity: RadarOpportunity | null
  actionLoading: string | null
  onRunAnalysis: (opportunity: RadarOpportunity) => void
  onApprove: (opportunity: RadarOpportunity) => void
  onReject: (opportunity: RadarOpportunity) => void
  onOptOut: (opportunity: RadarOpportunity) => void
  onConvert: () => void
}) {
  const scoreTone = getRadarScoreTone(opportunity?.latestScore?.totalScore)
  const scoreToneClass = scoreTone === 'high'
    ? 'text-emerald-700'
    : scoreTone === 'medium'
      ? 'text-amber-700'
      : scoreTone === 'low'
        ? 'text-red-700'
        : 'text-slate-500'
  const canConvert = opportunity ? canConvertRadarOpportunity(opportunity) : false

  return (
    <section className="rounded-md border bg-white p-4">
      <h2 className="font-semibold text-slate-950">Revisao da oportunidade</h2>
      {!opportunity && (
        <p className="mt-2 text-sm text-slate-500">
          Selecione uma oportunidade gerada pela campanha para revisar analise, score, evidencia e mensagem.
        </p>
      )}
      {opportunity && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-950">{getRadarCompanyDisplayName(opportunity.company)}</p>
              <p className="text-xs text-slate-500">{getRadarOpportunityStatusLabel(opportunity.status)}</p>
            </div>
            <p className={`text-sm font-medium ${scoreToneClass}`}>Score: {opportunity.latestScore?.totalScore ?? 'sem score'}</p>
          </div>
          <p className="text-sm text-slate-700">{opportunity.latestDiagnostic?.summary || 'Analise ainda nao gerada.'}</p>
          <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
            {opportunity.latestMessageSuggestion?.body || 'Mensagem ainda nao gerada.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={Boolean(actionLoading)} onClick={() => onRunAnalysis(opportunity)}>
              {actionLoading === 'analysis' ? 'Rodando...' : 'Rodar analise'}
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(actionLoading)} onClick={() => onApprove(opportunity)}>
              Aprovar
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(actionLoading)} onClick={() => onReject(opportunity)}>
              Rejeitar
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(actionLoading)} onClick={() => onOptOut(opportunity)}>
              Opt-out
            </Button>
            <Button type="button" disabled={!canConvert || Boolean(actionLoading)} onClick={onConvert}>
              {actionLoading === 'convert' ? 'Criando...' : 'Criar lead'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
