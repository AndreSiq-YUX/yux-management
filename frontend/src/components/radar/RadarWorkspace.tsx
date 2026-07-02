import { FormEvent, useEffect, useState } from 'react'
import { Building2, CheckCircle2, Link2, Lock, Plus, Radar, Search, ShieldCheck, Upload } from 'lucide-react'
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
import { getCsvPreviewRows, getRadarSourceBlockedReason, isSmallBatch, splitLines } from '@/lib/radar/radarSourceRules'
import { radarService } from '@/services/radarService'
import { usePlatformContext } from '@/stores/platformStore'
import type { RadarCandidateRecord, RadarCampaign, RadarDataSource, RadarEnrichmentRun, RadarMetrics, RadarOpportunity, RadarSourceType } from '@/types/radar'

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
  cnpj: '',
  cnaeMain: '',
  city: '',
  state: '',
  websiteUrl: '',
  emailRaw: '',
  phoneRaw: '',
  sourceUrl: '',
  notes: '',
}

const initialSearchForm = {
  query: '',
  city: '',
  state: '',
  sourceType: 'jina_search' as 'jina_search' | 'web_search',
  limit: 5,
}

const fallbackSources: RadarDataSource[] = [
  {
    id: 'fallback-manual',
    sourceKey: 'manual',
    sourceType: 'manual',
    displayName: 'Cadastro manual',
    enabled: true,
    isPaid: false,
    requiresSecret: false,
    termsNotes: 'Entrada humana revisada.',
    defaultCostPerUnit: 0,
    rateLimitPerDay: 10,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-csv',
    sourceKey: 'csv',
    sourceType: 'csv',
    displayName: 'CSV',
    enabled: true,
    isPaid: false,
    requiresSecret: false,
    termsNotes: 'Importacao local com lote pequeno.',
    defaultCostPerUnit: 0,
    rateLimitPerDay: 10,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-jina-reader',
    sourceKey: 'jina_reader',
    sourceType: 'jina_reader',
    displayName: 'URL/site',
    enabled: false,
    isPaid: false,
    requiresSecret: false,
    termsNotes: 'Depende de fonte habilitada no catalogo.',
    defaultCostPerUnit: 0,
    rateLimitPerDay: 10,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-jina-search',
    sourceKey: 'jina_search',
    sourceType: 'jina_search',
    displayName: 'Busca assistida',
    enabled: false,
    isPaid: false,
    requiresSecret: false,
    termsNotes: 'Depende de fonte habilitada no catalogo.',
    defaultCostPerUnit: 0,
    rateLimitPerDay: 10,
    createdAt: '',
    updatedAt: '',
  },
]

const candidateStatusLabels: Record<string, string> = {
  pending_review: 'Revisao pendente',
  imported: 'Importado',
  discarded: 'Descartado',
  duplicate: 'Duplicado',
  failed: 'Falhou',
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
  const [dataSources, setDataSources] = useState<RadarDataSource[]>([])
  const [candidates, setCandidates] = useState<RadarCandidateRecord[]>([])
  const [runs, setRuns] = useState<RadarEnrichmentRun[]>([])
  const [csvText, setCsvText] = useState('')
  const [urlText, setUrlText] = useState('')
  const [searchForm, setSearchForm] = useState(initialSearchForm)
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

    radarService.getDataSources(organizationId)
      .then(setDataSources)
      .catch(error => {
        console.error('Erro ao carregar fontes Radar:', error)
        setDataSources([])
      })
  }, [organizationId, canAccess])

  useEffect(() => {
    if (!selectedCampaignId || !canAccess) return

    Promise.allSettled([
      radarService.getOpportunities(selectedCampaignId),
      radarService.getMetrics(selectedCampaignId),
      radarService.getCandidates(selectedCampaignId),
      radarService.getRuns(selectedCampaignId),
    ])
      .then(([opportunitiesResult, metricsResult, candidatesResult, runsResult]) => {
        if (opportunitiesResult.status === 'fulfilled') {
          setOpportunities(opportunitiesResult.value)
          setSelectedOpportunity(current => current ?? opportunitiesResult.value[0] ?? null)
        } else {
          console.error('Erro ao carregar oportunidades Radar:', opportunitiesResult.reason)
          toast.error('Erro ao carregar oportunidades')
        }

        if (metricsResult.status === 'fulfilled') {
          setMetrics(metricsResult.value)
        }

        if (candidatesResult.status === 'fulfilled') {
          setCandidates(candidatesResult.value)
        }

        if (runsResult.status === 'fulfilled') {
          setRuns(runsResult.value)
        }
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
      setCandidates([])
      setRuns([])
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
        cnpj: companyForm.cnpj || undefined,
        cnaeMain: companyForm.cnaeMain || undefined,
        city: companyForm.city || undefined,
        state: companyForm.state || undefined,
        websiteUrl: companyForm.websiteUrl || undefined,
        emailRaw: companyForm.emailRaw || undefined,
        phoneRaw: companyForm.phoneRaw || undefined,
        sourceType: 'manual',
        sourceUrl: companyForm.sourceUrl || undefined,
        notes: companyForm.notes || undefined,
      })

      setOpportunities(current => [result.opportunity, ...current.filter(opportunity => opportunity.id !== result.opportunity.id)])
      setSelectedOpportunity(result.opportunity)
      setCompanyForm(initialCompanyForm)
      toast.success('Empresa adicionada ao Radar')
      refreshCampaignSidebars()
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

  const workspaceSources = mergeRadarSources(dataSources)
  const jinaReaderSource = findSource(workspaceSources, 'jina_reader')
  const searchSource = findSource(workspaceSources, searchForm.sourceType)
  const csvPreviewRows = getCsvPreviewRows(csvText, 4)

  const refreshCampaignSidebars = () => {
    if (!selectedCampaignId) return
    radarService.getMetrics(selectedCampaignId).then(setMetrics).catch(() => undefined)
    radarService.getCandidates(selectedCampaignId).then(setCandidates).catch(() => undefined)
    radarService.getRuns(selectedCampaignId).then(setRuns).catch(() => undefined)
  }

  const importCsv = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || actionLoading) return

    const rows = splitLines(csvText)
    const dataRowCount = Math.max(0, rows.length - 1)
    if (!isSmallBatch(dataRowCount)) {
      toast.error('Use no maximo 10 linhas por importacao CSV.')
      return
    }

    try {
      setActionLoading('csv')
      const result = await radarService.importCsv(selectedCampaignId, { organizationId, csv: csvText })
      setOpportunities(current => mergeOpportunities(result.imported, current))
      setSelectedOpportunity(current => result.imported[0] ?? current)
      setCsvText('')
      toast.success(`${result.imported.length} empresas importadas`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao importar CSV Radar:', error)
      toast.error('Erro ao importar CSV')
    } finally {
      setActionLoading(null)
    }
  }

  const importUrls = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || actionLoading) return

    const blockedReason = getSourceBlockedReason(jinaReaderSource)
    if (blockedReason) {
      toast.error(blockedReason)
      return
    }

    const urls = splitLines(urlText)
    if (!isSmallBatch(urls.length)) {
      toast.error('Use no maximo 10 URLs por lote.')
      return
    }

    try {
      setActionLoading('urls')
      const result = await radarService.importUrls(selectedCampaignId, { organizationId, urls })
      setOpportunities(current => mergeOpportunities(result.imported, current))
      setSelectedOpportunity(current => result.imported[0] ?? current)
      setUrlText('')
      toast.success(`${result.imported.length} URLs processadas`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao importar URLs Radar:', error)
      toast.error('Erro ao processar URLs')
    } finally {
      setActionLoading(null)
    }
  }

  const searchWeb = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || actionLoading) return

    const blockedReason = getSourceBlockedReason(searchSource)
    if (blockedReason) {
      toast.error(blockedReason)
      return
    }

    if (!isSmallBatch(searchForm.limit)) {
      toast.error('Use no maximo 10 resultados por busca.')
      return
    }

    try {
      setActionLoading('search')
      const result = await radarService.searchWeb(selectedCampaignId, {
        organizationId,
        query: searchForm.query,
        city: searchForm.city || undefined,
        state: searchForm.state || undefined,
        sourceType: searchForm.sourceType,
        limit: searchForm.limit,
      })
      setCandidates(current => mergeCandidates(result.candidates, current))
      toast.success(`${result.candidates.length} candidatos encontrados`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro na busca assistida Radar:', error)
      toast.error('Erro ao executar busca assistida')
    } finally {
      setActionLoading(null)
    }
  }

  const importCandidate = async (candidateId: string) => {
    if (actionLoading) return

    try {
      setActionLoading(`candidate-import-${candidateId}`)
      const result = await radarService.importCandidate(candidateId)
      setCandidates(current => current.map(candidate => candidate.id === candidateId ? result.candidate : candidate))
      setOpportunities(current => mergeOpportunities([result.opportunity], current))
      setSelectedOpportunity(result.opportunity)
      toast.success('Candidato importado')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao importar candidato Radar:', error)
      toast.error('Erro ao importar candidato')
    } finally {
      setActionLoading(null)
    }
  }

  const discardCandidate = async (candidateId: string) => {
    if (actionLoading) return

    try {
      setActionLoading(`candidate-discard-${candidateId}`)
      const candidate = await radarService.discardCandidate(candidateId)
      setCandidates(current => current.map(item => item.id === candidate.id ? candidate : item))
      toast.success('Candidato descartado')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao descartar candidato Radar:', error)
      toast.error('Erro ao descartar candidato')
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
        <>
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-base font-semibold text-slate-950">Fontes da campanha</h2>
            <p className="mt-1 text-sm text-slate-500">Fontes governadas aparecem bloqueadas ate o catalogo permitir uso operacional.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              {workspaceSources.map(source => {
                const blockedReason = getSourceBlockedReason(source)
                return (
                  <div key={source.id} className={`rounded-md border p-3 ${blockedReason ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50/40'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-950">{source.displayName}</p>
                      {blockedReason ? <Lock className="h-4 w-4 text-slate-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{blockedReason || 'Disponivel para esta campanha.'}</p>
                    <p className="mt-2 text-xs text-slate-600">Limite diario: {source.rateLimitPerDay}</p>
                    {source.termsNotes && <p className="mt-1 text-xs text-slate-500">{source.termsNotes}</p>}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Fontes de entrada</h2>
                <p className="text-sm text-slate-500">Importe lotes pequenos e mantenha revisao humana antes de qualquer conversao.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <form className="rounded-md border p-3" onSubmit={addCompany}>
                <div className="mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">Cadastro manual</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder="Nome fantasia" value={companyForm.tradeName} required onChange={event => setCompanyForm({ ...companyForm, tradeName: event.target.value })} />
                  <Input placeholder="Razao social" value={companyForm.legalName} onChange={event => setCompanyForm({ ...companyForm, legalName: event.target.value })} />
                  <Input placeholder="CNPJ" value={companyForm.cnpj} onChange={event => setCompanyForm({ ...companyForm, cnpj: event.target.value })} />
                  <Input placeholder="CNAE" value={companyForm.cnaeMain} onChange={event => setCompanyForm({ ...companyForm, cnaeMain: event.target.value })} />
                  <Input placeholder="Cidade" value={companyForm.city} onChange={event => setCompanyForm({ ...companyForm, city: event.target.value })} />
                  <Input placeholder="UF" value={companyForm.state} maxLength={2} onChange={event => setCompanyForm({ ...companyForm, state: event.target.value.toUpperCase() })} />
                  <Input placeholder="Site" value={companyForm.websiteUrl} onChange={event => setCompanyForm({ ...companyForm, websiteUrl: event.target.value })} />
                  <Input placeholder="Email publico" value={companyForm.emailRaw} onChange={event => setCompanyForm({ ...companyForm, emailRaw: event.target.value })} />
                  <Input placeholder="Telefone" value={companyForm.phoneRaw} onChange={event => setCompanyForm({ ...companyForm, phoneRaw: event.target.value })} />
                  <Input placeholder="URL da fonte" value={companyForm.sourceUrl} onChange={event => setCompanyForm({ ...companyForm, sourceUrl: event.target.value })} />
                  <Input className="md:col-span-2" placeholder="Observacao operacional" value={companyForm.notes} onChange={event => setCompanyForm({ ...companyForm, notes: event.target.value })} />
                  <Button type="submit" disabled={addingCompany}>
                    {addingCompany ? 'Adicionando...' : 'Adicionar empresa'}
                  </Button>
                </div>
              </form>

              <form className="rounded-md border p-3" onSubmit={importCsv}>
                <div className="mb-3 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">CSV</h3>
                </div>
                <textarea
                  className="min-h-32 w-full rounded-md border p-3 text-sm"
                  value={csvText}
                  onChange={event => setCsvText(event.target.value)}
                  placeholder="trade_name,city,state,website_url"
                />
                {csvPreviewRows.length > 0 && (
                  <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                    {csvPreviewRows.map((row, index) => <p key={`${index}-${row}`} className="truncate">{row}</p>)}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Maximo 10 linhas de dados por importacao.</p>
                  <Button type="submit" disabled={!csvText.trim() || actionLoading === 'csv'}>
                    {actionLoading === 'csv' ? 'Importando...' : 'Importar CSV'}
                  </Button>
                </div>
              </form>

              <form className="rounded-md border p-3" onSubmit={importUrls}>
                <div className="mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">URL/site</h3>
                </div>
                <textarea
                  className="min-h-28 w-full rounded-md border p-3 text-sm"
                  value={urlText}
                  onChange={event => setUrlText(event.target.value)}
                  placeholder="https://empresa.com.br"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">{getSourceBlockedReason(jinaReaderSource) || 'Ate 10 URLs por lote.'}</p>
                  <Button type="submit" disabled={!urlText.trim() || Boolean(getSourceBlockedReason(jinaReaderSource)) || actionLoading === 'urls'}>
                    {actionLoading === 'urls' ? 'Processando...' : 'Processar URLs'}
                  </Button>
                </div>
              </form>

              <form className="rounded-md border p-3" onSubmit={searchWeb}>
                <div className="mb-3 flex items-center gap-2">
                  <Search className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">Busca assistida</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  <Input className="md:col-span-2" placeholder="Nicho ou termo" value={searchForm.query} required onChange={event => setSearchForm({ ...searchForm, query: event.target.value })} />
                  <Input placeholder="Cidade" value={searchForm.city} onChange={event => setSearchForm({ ...searchForm, city: event.target.value })} />
                  <Input placeholder="UF" value={searchForm.state} maxLength={2} onChange={event => setSearchForm({ ...searchForm, state: event.target.value.toUpperCase() })} />
                  <Input type="number" min="1" max="10" value={searchForm.limit} onChange={event => setSearchForm({ ...searchForm, limit: Number(event.target.value) })} />
                  <select
                    className="md:col-span-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={searchForm.sourceType}
                    onChange={event => setSearchForm({ ...searchForm, sourceType: event.target.value as 'jina_search' | 'web_search' })}
                  >
                    <option value="jina_search">Jina Search</option>
                    <option value="web_search">Web search</option>
                  </select>
                  <div className="md:col-span-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{getSourceBlockedReason(searchSource) || 'Resultados ficam como candidatos em revisao.'}</p>
                    <Button type="submit" disabled={!searchForm.query.trim() || Boolean(getSourceBlockedReason(searchSource)) || actionLoading === 'search'}>
                      {actionLoading === 'search' ? 'Buscando...' : 'Buscar'}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Candidatos e oportunidades</h2>
                <p className="text-sm text-slate-500">
                  {metrics ? `${metrics.opportunities} oportunidades, ${metrics.reviewPending} em revisao, custo estimado R$ ${metrics.estimatedCost.toFixed(2)}` : 'Selecione fontes para captar candidatos e empresas.'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
              <div className="rounded-md border">
                <div className="border-b p-3">
                  <h3 className="text-sm font-semibold text-slate-950">Candidatos</h3>
                </div>
                <div className="divide-y">
                  {candidates.length === 0 && <p className="p-3 text-sm text-slate-500">Nenhum candidato pendente nesta campanha.</p>}
                  {candidates.map(candidate => (
                    <div key={candidate.id} className="flex items-start justify-between gap-3 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-950">{candidate.title}</p>
                        <p className="text-xs text-slate-500">{candidate.sourceType} - {candidateStatusLabels[candidate.status] || candidate.status}</p>
                        {candidate.snippet && <p className="mt-1 text-sm text-slate-600">{candidate.snippet}</p>}
                        {candidate.errorMessage && <p className="mt-1 text-xs text-red-600">{candidate.errorMessage}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={candidate.status !== 'pending_review' || Boolean(actionLoading)} onClick={() => importCandidate(candidate.id)}>Importar</Button>
                        <Button type="button" size="sm" variant="outline" disabled={candidate.status !== 'pending_review' || Boolean(actionLoading)} onClick={() => discardCandidate(candidate.id)}>Descartar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b p-3">
                  <h3 className="text-sm font-semibold text-slate-950">Oportunidades</h3>
                </div>
                <div className="divide-y">
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
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border bg-white p-4">
              <h2 className="text-base font-semibold text-slate-950">Metricas por fonte</h2>
              <div className="mt-3 divide-y rounded-md border">
                {(!metrics?.sourceBreakdown || metrics.sourceBreakdown.length === 0) && <p className="p-3 text-sm text-slate-500">Sem metricas por fonte nesta campanha.</p>}
                {metrics?.sourceBreakdown?.map(source => (
                  <div key={source.sourceType} className="grid gap-2 p-3 text-sm md:grid-cols-5">
                    <p className="font-medium text-slate-950">{source.sourceType}</p>
                    <p className="text-slate-600">Empresas {source.companies}</p>
                    <p className="text-slate-600">Oportunidades {source.opportunities}</p>
                    <p className="text-slate-600">Candidatos {source.candidates}</p>
                    <p className="text-slate-600">R$ {source.estimatedCost.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-white p-4">
              <h2 className="text-base font-semibold text-slate-950">Runs recentes</h2>
              <div className="mt-3 space-y-2">
                {runs.length === 0 && <p className="text-sm text-slate-500">Nenhum run registrado nesta campanha.</p>}
                {runs.slice(0, 5).map(run => (
                  <div key={run.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium text-slate-950">{run.provider} - {run.status}</p>
                    <p className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString('pt-BR')}</p>
                    {run.errorMessage && <p className="mt-1 text-xs text-red-600">{run.errorMessage}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
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

function mergeRadarSources(dataSources: RadarDataSource[]) {
  const byType = new Map<RadarSourceType, RadarDataSource>()
  fallbackSources.forEach(source => byType.set(source.sourceType, source))
  dataSources.forEach(source => byType.set(source.sourceType, source))
  return Array.from(byType.values())
}

function findSource(sources: RadarDataSource[], sourceType: RadarSourceType) {
  return sources.find(source => source.sourceType === sourceType)
}

function getSourceBlockedReason(source?: RadarDataSource) {
  if (!source) return 'Fonte ainda nao cadastrada no catalogo do Radar.'
  return getRadarSourceBlockedReason(source)
}

function mergeOpportunities(next: RadarOpportunity[], current: RadarOpportunity[]) {
  const byId = new Map<string, RadarOpportunity>()
  next.forEach(opportunity => byId.set(opportunity.id, opportunity))
  current.forEach(opportunity => {
    if (!byId.has(opportunity.id)) byId.set(opportunity.id, opportunity)
  })
  return Array.from(byId.values())
}

function mergeCandidates(next: RadarCandidateRecord[], current: RadarCandidateRecord[]) {
  const byId = new Map<string, RadarCandidateRecord>()
  next.forEach(candidate => byId.set(candidate.id, candidate))
  current.forEach(candidate => {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate)
  })
  return Array.from(byId.values())
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
