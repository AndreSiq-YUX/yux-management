import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, CalendarClock, CheckCircle2, CheckSquare, Link2, Lock, Plus, Radar, Search, ShieldCheck, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StrategyContextPanel } from '@/components/strategy-engine/StrategyContextPanel'
import { ProspectingPlanPanel } from '@/components/radar/ProspectingPlanPanel'
import { RadarPlacePreviewPanel } from '@/components/radar/RadarPlacePreviewPanel'
import {
  canConvertRadarOpportunity,
  canShowRadarNavigation,
  getRadarCampaignStatusLabel,
  getRadarCompanyDisplayName,
  getRadarOpportunityStatusLabel,
  getRadarScoreTone,
} from '@/lib/radar/radarRules'
import { buildRadarPlaceSearchDefaults, getCsvPreviewRows, getRadarSourceBlockedReason, isSmallBatch, splitLines } from '@/lib/radar/radarSourceRules'
import { awaitCurrentRadarPlacePreview } from '@/lib/radar/radarPlacePreviewGuard'
import { radarService } from '@/services/radarService'
import { usePlatformContext } from '@/stores/platformStore'
import type { RadarCandidateRecord, RadarCampaign, RadarDataSource, RadarDuplicateCandidate, RadarEnrichmentRun, RadarImportSummary, RadarMetrics, RadarOpportunity, RadarPlacePreview, RadarSourceType } from '@/types/radar'

const initialForm = {
  name: '',
  campaignType: 'local_niche' as 'local_niche' | 'recently_opened' | 'regional_b2b',
  targetSegment: '',
  targetCity: '',
  targetState: '',
  targetStates: ['MG', 'SP', 'PR'] as string[],
  productFocus: '',
  offerType: 'Diagnostico YUX 48h',
  dailyLimit: 5,
}

type BraveSuggestion = { name: string; address: string; sourceUrl: string; websiteUrl?: string; phone?: string }

function getBraveSuggestions(payload: Record<string, unknown>): BraveSuggestion[] {
  if (payload.braveMatchStatus !== 'review' || !Array.isArray(payload.braveSuggestions)) return []
  return payload.braveSuggestions.filter((value): value is BraveSuggestion =>
    typeof value === 'object' && value !== null
    && typeof value.name === 'string' && typeof value.address === 'string'
    && typeof value.sourceUrl === 'string')
}

const initialCompanyForm = {
  tradeName: '',
  legalName: '',
  cnpj: '',
  cnaeMain: '',
  city: '',
  state: '',
  address: '',
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

const initialCnpjaForm = {
  query: '',
  city: '',
  state: '',
  cnae: '',
  openingFrom: recentDate(60),
  openingTo: '',
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
  {
    id: 'fallback-cnpja-advanced-search',
    sourceKey: 'cnpja_advanced_search',
    sourceType: 'cnpja_advanced_search',
    displayName: 'CNPJa - pesquisa avancada',
    enabled: false,
    isPaid: true,
    requiresSecret: true,
    termsNotes: 'Depende da API key CNPJa cadastrada no Admin e da fonte habilitada no catalogo.',
    defaultCostPerUnit: 0.0025,
    rateLimitPerDay: 50,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-osm-extract', sourceKey: 'osm_extract', sourceType: 'osm_extract',
    displayName: 'Dados abertos OSM (índice local)', enabled: false, isPaid: false,
    requiresSecret: false, termsNotes: 'Extrato municipal validado; fonte desligada por padrão.',
    defaultCostPerUnit: 0, rateLimitPerDay: 10, createdAt: '', updatedAt: '',
  },
  {
    id: 'fallback-serper-places', sourceKey: 'serper_places', sourceType: 'serper_places',
    displayName: 'Serper Places', enabled: false, isPaid: true, requiresSecret: true,
    termsNotes: 'Pré-visualização transitória; não salva resultados no CRM.',
    defaultCostPerUnit: 0, rateLimitPerDay: 10, createdAt: '', updatedAt: '',
  },
  {
    id: 'fallback-brave-place', sourceKey: 'brave_place_search', sourceType: 'brave_place_search',
    displayName: 'Brave Place Search', enabled: false, isPaid: true, requiresSecret: true,
    termsNotes: 'Pré-visualização transitória; plano padrão sem direito de retenção.',
    defaultCostPerUnit: 0, rateLimitPerDay: 10, createdAt: '', updatedAt: '',
  },
]

const candidateStatusLabels: Record<string, string> = {
  pending_review: 'Revisao pendente',
  imported: 'Importado',
  discarded: 'Descartado',
  duplicate: 'Duplicado',
  failed: 'Falhou',
}

const duplicateStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  dismissed: 'Ignorada',
  merged: 'Mesclada',
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
  const [osmReadiness, setOsmReadiness] = useState<Awaited<ReturnType<typeof radarService.getOsmReadiness>> | null>(null)
  const [osmReport, setOsmReport] = useState<Awaited<ReturnType<typeof radarService.getOsmReport>> | null>(null)
  const [candidates, setCandidates] = useState<RadarCandidateRecord[]>([])
  const [b2bProspects, setB2bProspects] = useState<Awaited<ReturnType<typeof radarService.getB2bProspects>>>([])
  const b2bProspectById = useMemo(() => new Map(b2bProspects.map(item => [item.id, item])), [b2bProspects])
  const [b2bManualReviews, setB2bManualReviews] = useState<Record<string, { url: string; note: string }>>({})
  const [b2bProgress, setB2bProgress] = useState<Awaited<ReturnType<typeof radarService.getB2bProgress>> | null>(null)
  const [duplicates, setDuplicates] = useState<RadarDuplicateCandidate[]>([])
  const [runs, setRuns] = useState<RadarEnrichmentRun[]>([])
  const [csvText, setCsvText] = useState('')
  const [urlText, setUrlText] = useState('')
  const [searchForm, setSearchForm] = useState(initialSearchForm)
  const [cnpjaForm, setCnpjaForm] = useState(initialCnpjaForm)
  const [placeForm, setPlaceForm] = useState({ query: '', city: '', state: '',
    sourceType: 'serper_places' as 'serper_places' | 'brave_place_search', limit: 5 })
  const [placePreview, setPlacePreview] = useState<{ places: RadarPlacePreview[]; attribution: string } | null>(null)
  const placeRequestSequence = useRef(0)
  const currentPlaceSelection = useRef('')
  currentPlaceSelection.current = `${organizationId ?? ''}:${selectedCampaignId ?? ''}:${placeForm.sourceType}`
  const [sourceCostDrafts, setSourceCostDrafts] = useState<Record<string, string>>({})
  const [sourceLimitDrafts, setSourceLimitDrafts] = useState<Record<string, string>>({})
  const [selectedOpportunityIds, setSelectedOpportunityIds] = useState<string[]>([])
  const [lastImportSummary, setLastImportSummary] = useState<RadarImportSummary | null>(null)
  const [analyzeAfterImport, setAnalyzeAfterImport] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [addingCompany, setAddingCompany] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regionalProgress, setRegionalProgress] = useState<Record<string, string>>({})

  const canAccess = canShowRadarNavigation(context)
  const hasPendingAnalysis = opportunities.some(opportunity => opportunity.status === 'diagnosing')
  const osmSourceEnabled = dataSources.find(source => source.sourceType === 'osm_extract')?.enabled

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
    placeRequestSequence.current += 1
    setPlacePreview(null)
  }, [organizationId])

  useEffect(() => {
    if (!selectedCampaignId || !canAccess) return

    Promise.allSettled([
      radarService.getOpportunities(selectedCampaignId),
      radarService.getMetrics(selectedCampaignId),
      radarService.getCandidates(selectedCampaignId),
      radarService.getDuplicates(selectedCampaignId),
      radarService.getRuns(selectedCampaignId),
    ])
      .then(([opportunitiesResult, metricsResult, candidatesResult, duplicatesResult, runsResult]) => {
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

        if (duplicatesResult.status === 'fulfilled') {
          setDuplicates(duplicatesResult.value)
        }

        if (runsResult.status === 'fulfilled') {
          setRuns(runsResult.value)
        }
      })
  }, [selectedCampaignId, canAccess])

  useEffect(() => {
    const campaign = campaigns.find(item => item.id === selectedCampaignId)
    if (!selectedCampaignId || !organizationId || campaign?.campaignType !== 'regional_b2b') {
      setB2bProgress(null)
      setB2bProspects([])
      return
    }
    let active = true
    const refresh = () => {
      radarService.getB2bProgress(selectedCampaignId, organizationId).then(result => { if (active) setB2bProgress(result) })
        .catch(error => console.error('Erro ao acompanhar o lote B2B:', error))
      radarService.getB2bProspects(selectedCampaignId, organizationId).then(result => { if (active) setB2bProspects(result) })
        .catch(error => console.error('Erro ao atualizar dossiês B2B:', error))
      radarService.getCandidates(selectedCampaignId).then(result => { if (active) setCandidates(result) })
        .catch(error => console.error('Erro ao atualizar candidatos B2B:', error))
    }
    refresh()
    const interval = window.setInterval(refresh, 8_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [selectedCampaignId, organizationId, campaigns])

  useEffect(() => {
    if (!selectedCampaignId || !organizationId || !canAccess) { setOsmReadiness(null); return }
    let active = true
    radarService.getOsmReadiness(selectedCampaignId, organizationId)
      .then(result => { if (active) setOsmReadiness(result) })
      .catch(() => { if (active) setOsmReadiness(null) })
    return () => { active = false }
  }, [selectedCampaignId, organizationId, canAccess, osmSourceEnabled])

  useEffect(() => {
    if (!selectedCampaignId || !organizationId || !canAccess) { setOsmReport(null); return }
    let active = true
    radarService.getOsmReport(selectedCampaignId, organizationId)
      .then(result => { if (active) setOsmReport(result) })
      .catch(() => { if (active) setOsmReport(null) })
    return () => { active = false }
  }, [selectedCampaignId, organizationId, canAccess])

  useEffect(() => {
    if (!selectedCampaignId || !canAccess || !hasPendingAnalysis) return

    const refreshAnalysis = () => {
      Promise.all([
        radarService.getOpportunities(selectedCampaignId),
        radarService.getRuns(selectedCampaignId),
      ]).then(([nextOpportunities, nextRuns]) => {
        setOpportunities(nextOpportunities)
        setRuns(nextRuns)
        setSelectedOpportunity(current => (
          current ? nextOpportunities.find(item => item.id === current.id) ?? current : nextOpportunities[0] ?? null
        ))
      }).catch(error => console.error('Erro ao acompanhar analise Radar:', error))
    }

    const interval = window.setInterval(refreshAnalysis, 3_000)
    return () => window.clearInterval(interval)
  }, [selectedCampaignId, canAccess, hasPendingAnalysis])

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || creating) return

    try {
      setCreating(true)
      const campaign = await radarService.createCampaign({
        organizationId,
        name: form.name,
        campaignType: form.campaignType,
        targetSegment: form.targetSegment,
        targetCity: form.campaignType === 'regional_b2b' ? undefined : form.targetCity,
        targetState: form.campaignType === 'regional_b2b' ? undefined : form.targetState,
        targetStates: form.campaignType === 'regional_b2b' ? form.targetStates : undefined,
        productFocus: form.campaignType === 'regional_b2b'
          ? form.productFocus.split(',').map(value => value.trim()).filter(Boolean) : undefined,
        offerType: form.offerType,
        dailyLimit: form.dailyLimit,
        targetKeywords: [form.targetSegment],
        targetCnaes: form.campaignType === 'regional_b2b' ? ['5620101'] : [],
      })

      setCampaigns(current => [campaign, ...current])
      setSelectedCampaignId(campaign.id)
      setOpportunities([])
      setMetrics(null)
      setSelectedOpportunity(null)
      setCandidates([])
      setDuplicates([])
      setRuns([])
      setSelectedOpportunityIds([])
      setLastImportSummary(null)
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
        address: companyForm.address || undefined,
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

  const queueOpportunityAnalysis = async (opportunity: RadarOpportunity) => {
    if (actionLoading || opportunity.status === 'diagnosing') return

    try {
      setActionLoading('analysis')
      const request = await radarService.runAnalysis(opportunity.id)
      setSelectedOpportunity(request.opportunity)
      setOpportunities(current => current.map(item => item.id === request.opportunity.id ? request.opportunity : item))
      toast.success(request.reused ? 'Analise ja estava em processamento' : 'Analise enviada para processamento')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao iniciar analise Radar:', error)
      toast.error('Erro ao iniciar analise')
    } finally {
      setActionLoading(null)
    }
  }

  const workspaceSources = mergeRadarSources(dataSources)
  const jinaReaderSource = findSource(workspaceSources, 'jina_reader')
  const searchSource = findSource(workspaceSources, searchForm.sourceType)
  const cnpjaSource = findSource(workspaceSources, 'cnpja_advanced_search')
  const braveSource = findSource(workspaceSources, 'brave_place_search')
  const placeSource = findSource(workspaceSources, placeForm.sourceType)
  const osmSource = findSource(workspaceSources, 'osm_extract')
  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId)

  const toggleOsmSource = async () => {
    if (!osmSource || osmSource.id.startsWith('fallback-') || context.role?.key !== 'yux_admin' || actionLoading) return
    try {
      setActionLoading('osm-source')
      const updated = await radarService.updateDataSource(osmSource.id, { enabled: !osmSource.enabled })
      setDataSources(current => current.map(source => source.id === updated.id ? updated : source))
      toast.success(updated.enabled ? 'Fonte OSM habilitada para o piloto' : 'Fonte OSM desabilitada')
    } catch (error) {
      console.error('Erro ao alterar fonte OSM:', error)
      toast.error('Não foi possível alterar a fonte OSM')
    } finally { setActionLoading(null) }
  }

  const changeManagedSource = async (source: RadarDataSource, patch: { enabled?: boolean; defaultCostPerUnit?: number; rateLimitPerDay?: number }) => {
    if (source.id.startsWith('fallback-') || context.role?.key !== 'yux_admin' || actionLoading) return
    if (patch.enabled === true && source.isPaid && !window.confirm('Esta fonte pode consumir créditos. Confirma a ativação para consultas manuais limitadas?')) return
    try {
      setActionLoading(`source-${source.id}`)
      const updated = await radarService.updateDataSource(source.id, patch)
      setDataSources(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(patch.enabled === undefined ? 'Limites e custo salvos' : updated.enabled ? 'Fonte ativada' : 'Fonte desativada')
    } catch (error) {
      console.error('Erro ao configurar fonte Radar:', error)
      toast.error('Não foi possível alterar a fonte; confira custo e permissões')
    } finally { setActionLoading(null) }
  }
  const csvPreviewRows = getCsvPreviewRows(csvText, 4)

  const refreshCampaignSidebars = () => {
    if (!selectedCampaignId) return
    radarService.getMetrics(selectedCampaignId).then(setMetrics).catch(() => undefined)
    radarService.getCandidates(selectedCampaignId).then(setCandidates).catch(() => undefined)
    radarService.getDuplicates(selectedCampaignId).then(setDuplicates).catch(() => undefined)
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
      const result = await radarService.importCsv(selectedCampaignId, { organizationId, csv: csvText, analyzeAfterImport })
      const updatedOpportunities = result.analyzed?.length ? result.analyzed : result.imported
      setOpportunities(current => mergeOpportunities(updatedOpportunities, current))
      setSelectedOpportunity(current => updatedOpportunities[0] ?? current)
      setCsvText('')
      setLastImportSummary({
        kind: 'csv',
        importedCount: result.imported.length,
        analyzedCount: result.analyzed?.length ?? 0,
        candidateCount: 0,
        issueCount: result.issues.length,
        issues: result.issues,
        runId: result.runId,
      })
      toast.success(result.analysisRequests?.length ? `${result.imported.length} empresas importadas; analises em processamento` : `${result.imported.length} empresas importadas`)
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
      const result = await radarService.importUrls(selectedCampaignId, { organizationId, urls, analyzeAfterImport })
      const updatedOpportunities = result.analyzed?.length ? result.analyzed : result.imported
      setOpportunities(current => mergeOpportunities(updatedOpportunities, current))
      setSelectedOpportunity(current => updatedOpportunities[0] ?? current)
      setUrlText('')
      setLastImportSummary({
        kind: 'urls',
        importedCount: result.imported.length,
        analyzedCount: result.analyzed?.length ?? 0,
        candidateCount: 0,
        issueCount: result.issues.length,
        issues: result.issues,
        runId: result.runId,
      })
      toast.success(result.analysisRequests?.length ? `${result.imported.length} URLs processadas; analises em processamento` : `${result.imported.length} URLs processadas`)
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
      setLastImportSummary({
        kind: 'search',
        importedCount: 0,
        candidateCount: result.candidates.length,
        issueCount: result.issues.length,
        issues: result.issues,
        runId: result.runId,
      })
      toast.success(`${result.candidates.length} candidatos encontrados`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro na busca assistida Radar:', error)
      toast.error('Erro ao executar busca assistida')
    } finally {
      setActionLoading(null)
    }
  }

  const searchOsm = async () => {
    if (!organizationId || !selectedCampaignId || actionLoading || !osmReadiness?.ready) return
    try {
      setActionLoading('osm')
      const result = await radarService.searchOsm(selectedCampaignId, { organizationId, limit: Math.min(10, selectedCampaign?.dailyLimit ?? 10) })
      setCandidates(current => mergeCandidates(result.candidates, current))
      setLastImportSummary({ kind: 'osm', importedCount: 0, candidateCount: result.candidates.length,
        issueCount: result.issues.length, issues: result.issues, runId: result.runId })
      if (result.issues.length) toast.error(result.issues[0].message)
      else toast.success(`${result.candidates.length} novos candidatos encontrados`)
      refreshCampaignSidebars()
      radarService.getOsmReport(selectedCampaignId, organizationId).then(setOsmReport).catch(() => undefined)
    } catch (error) {
      console.error('Erro na busca OSM Radar:', error)
      toast.error('Não foi possível executar a busca nos dados abertos')
    } finally { setActionLoading(null) }
  }

  const searchCnpja = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || actionLoading) return
    if (context.role?.key !== 'yux_admin') { toast.error('Somente o Admin pode executar a pesquisa CNPJa.'); return }

    const blockedReason = getSourceBlockedReason(cnpjaSource)
    if (blockedReason) {
      toast.error(blockedReason)
      return
    }

    if (!isSmallBatch(cnpjaForm.limit)) {
      toast.error('Use no maximo 10 resultados por pesquisa.')
      return
    }
    if (cnpjaForm.city.trim() && !/^[A-Z]{2}$/.test(cnpjaForm.state.trim().toUpperCase())) {
      toast.error('Informe a UF com duas letras para localizar a cidade no IBGE.')
      return
    }

    try {
      setActionLoading('cnpja')
      const result = await radarService.searchCnpja(selectedCampaignId, {
        organizationId,
        query: cnpjaForm.query || undefined,
        city: cnpjaForm.city || undefined,
        state: cnpjaForm.state || undefined,
        cnaes: cnpjaForm.cnae ? cnpjaForm.cnae.split(',').map(item => item.trim()).filter(Boolean) : undefined,
        openingFrom: cnpjaForm.openingFrom || undefined,
        openingTo: cnpjaForm.openingTo || undefined,
        limit: cnpjaForm.limit,
      })
      setCandidates(current => mergeCandidates(result.candidates, current))
      setLastImportSummary({
        kind: 'cnpja',
        importedCount: 0,
        candidateCount: result.candidates.length,
        issueCount: result.issues.length,
        issues: result.issues,
        runId: result.runId,
      })
      toast.success(`${result.candidates.length} empresas encontradas no CNPJa`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro na pesquisa CNPJa Radar:', error)
      toast.error('Erro ao pesquisar no CNPJa')
    } finally {
      setActionLoading(null)
    }
  }

  const searchRegionalCnpja = async (state: 'MG' | 'SP' | 'PR') => {
    if (!organizationId || !selectedCampaignId || actionLoading || context.role?.key !== 'yux_admin') return
    try {
      setActionLoading(`regional-${state}`)
      const result = await radarService.searchRegionalCnpja(selectedCampaignId, { organizationId, state, limit: 10 })
      setCandidates(current => mergeCandidates(result.candidates, current))
      setB2bProspects(await radarService.getB2bProspects(selectedCampaignId, organizationId))
      setRegionalProgress(current => ({ ...current, [state]: result.completed ? 'Busca concluída' : 'Há mais resultados; continuar' }))
      toast.success(`${result.candidates.length} candidatos de ${state} registrados`)
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro na pesquisa regional CNPJá:', error)
      toast.error('Não foi possível continuar esta busca. Confira fonte, limite e créditos.')
    } finally { setActionLoading(null) }
  }

  const previewPlaces = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId || !selectedCampaignId || actionLoading || !isSmallBatch(placeForm.limit)) return
    if (context.role?.key !== 'yux_admin') { toast.error('Somente o Admin pode consultar fontes locais pagas.'); return }
    const blockedReason = getSourceBlockedReason(placeSource)
    if (blockedReason) { toast.error(blockedReason); return }
    const requestKey = `${currentPlaceSelection.current}:${++placeRequestSequence.current}`
    const getCurrentKey = () => `${currentPlaceSelection.current}:${placeRequestSequence.current}`
    try {
      setActionLoading('place-preview')
      setPlacePreview(null)
      const result = await awaitCurrentRadarPlacePreview(
        radarService.previewPlaces(selectedCampaignId, { organizationId, ...placeForm }), requestKey, getCurrentKey)
      if (!result) return
      setPlacePreview({ places: result.places, attribution: result.attribution })
      toast.success(`${result.places.length} resultados exibidos temporariamente`)
    } catch (error) {
      console.error('Erro na prévia de busca local:', error)
      if (requestKey === getCurrentKey()) toast.error('Não foi possível consultar a fonte local; verifique chave, limite e orçamento')
    } finally { setActionLoading(null) }
  }

  const changePlaceForm = (patch: Partial<typeof placeForm>) => {
    placeRequestSequence.current += 1
    setPlacePreview(null)
    setPlaceForm(current => ({ ...current, ...patch }))
  }

  const importCandidate = async (candidateId: string) => {
    if (actionLoading) return

    try {
      setActionLoading(`candidate-import-${candidateId}`)
      const result = await radarService.importCandidate(candidateId, { analyzeAfterImport })
      setCandidates(current => current.map(candidate => candidate.id === candidateId ? result.candidate : candidate))
      setOpportunities(current => mergeOpportunities([result.opportunity], current))
      setSelectedOpportunity(result.opportunity)
      toast.success(result.analysisRequests?.length ? 'Candidato importado; analise em processamento' : 'Candidato importado')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao importar candidato Radar:', error)
      toast.error('Erro ao importar candidato')
    } finally {
      setActionLoading(null)
    }
  }

  const checkOsmSite = async (candidateId: string) => {
    if (actionLoading) return
    try {
      setActionLoading(`osm-site-${candidateId}`)
      const updated = await radarService.checkOsmSite(candidateId)
      setCandidates(current => current.map(candidate => candidate.id === candidateId ? updated : candidate))
      if (selectedCampaignId && organizationId) radarService.getOsmReport(selectedCampaignId, organizationId).then(setOsmReport).catch(() => undefined)
      toast.success('Verificação do site registrada')
    } catch (error) {
      console.error('Erro na verificação do site OSM:', error)
      toast.error('Não foi possível verificar o site')
    } finally { setActionLoading(null) }
  }

  const enrichCandidateWithBrave = async (candidateId: string) => {
    if (!organizationId || actionLoading) return
    try {
      setActionLoading(`brave-${candidateId}`)
      const result = await radarService.enrichCandidateWithBrave(candidateId, organizationId)
      if (result.candidate) setCandidates(current => current.map(item => item.id === candidateId ? result.candidate! : item))
      else if (selectedCampaignId) setCandidates(await radarService.getCandidates(selectedCampaignId))
      if (selectedCampaignId) setB2bProspects(await radarService.getB2bProspects(selectedCampaignId, organizationId))
      if (result.matched) toast.success('Dados da Brave vinculados com evidência à empresa')
      else toast('Nenhuma correspondência segura; revise as sugestões antes de associar')
    } catch (error) {
      console.error('Erro no enriquecimento Brave:', error)
      toast.error('Brave indisponível ou licença/chave de retenção ainda não confirmada no Admin')
    } finally { setActionLoading(null) }
  }

  const confirmBraveSuggestion = async (candidateId: string, sourceUrl: string) => {
    if (!organizationId || actionLoading || !window.confirm('Você verificou que este local corresponde à mesma empresa e cidade/UF?')) return
    try {
      setActionLoading(`brave-confirm-${candidateId}`)
      const result = await radarService.confirmBraveSuggestion(candidateId, organizationId, sourceUrl)
      setCandidates(current => current.map(item => item.id === candidateId ? result.candidate : item))
      if (selectedCampaignId) setB2bProspects(await radarService.getB2bProspects(selectedCampaignId, organizationId))
      toast.success('Local associado por revisão humana; verifique o site e a atividade antes de aprovar')
    } catch (error) {
      console.error('Erro ao confirmar local Brave:', error)
      toast.error('Não foi possível associar este local. Verifique a licença e a localidade.')
    } finally { setActionLoading(null) }
  }

  const inspectBusinessSite = async (candidateId: string) => {
    if (!organizationId || actionLoading) return
    try {
      setActionLoading(`b2b-site-${candidateId}`)
      const result = await radarService.inspectBusinessSite(candidateId, organizationId)
      const refreshed = await radarService.getCandidates(selectedCampaignId!)
      setCandidates(refreshed)
      setB2bProspects(await radarService.getB2bProspects(selectedCampaignId!, organizationId))
      toast.success(`Verificação concluída: ${result.review.kitchenStatus}. Revise as evidências antes de entregar a lista.`)
    } catch (error) {
      console.error('Erro na verificação de site B2B:', error)
      toast.error('Não foi possível verificar o site desta empresa')
    } finally { setActionLoading(null) }
  }

  const approveB2bProspect = async (candidateId: string, manual = false) => {
    if (!organizationId || !selectedCampaignId || actionLoading) return
    try {
      setActionLoading(`b2b-approve-${candidateId}`)
      const review = b2bManualReviews[candidateId]
      await radarService.approveB2bProspect(candidateId, organizationId, manual
        ? { manualEvidenceUrl: review?.url ?? '', manualReviewNote: review?.note ?? '' } : undefined)
      setB2bProspects(await radarService.getB2bProspects(selectedCampaignId, organizationId))
      toast.success('Empresa aprovada para a lista de contato telefônico manual')
    } catch (error) {
      console.error('Erro ao aprovar prospect B2B:', error)
      toast.error('Confirme a atividade pelo site ou informe uma fonte pública e justificativa para a revisão manual')
    } finally { setActionLoading(null) }
  }

  const runB2bBatch = async (kind: 'discovery' | 'verification') => {
    if (!organizationId || !selectedCampaignId || actionLoading) return
    const consent = kind === 'discovery'
      ? 'Este lote pode consumir até 9 consultas pagas da CNPJá (até 3 páginas por UF). Continuar?'
      : 'Este lote pode consumir até 10 consultas pagas da Brave licenciada para empresas sem site. Continuar?'
    if (!window.confirm(consent)) return
    try {
      setActionLoading(`b2b-${kind}`)
      await radarService.runB2bBatch(selectedCampaignId, organizationId, kind)
      toast.success(kind === 'discovery' ? 'Busca regional iniciada em segundo plano' : 'Verificação de até 10 empresas iniciada')
    } catch (error) {
      console.error('Erro ao iniciar lote B2B:', error)
      toast.error('Não foi possível iniciar o lote. Confira permissão, fonte e limites.')
    } finally { setActionLoading(null) }
  }

  const exportB2bProspects = async () => {
    if (!organizationId || !selectedCampaignId || actionLoading) return
    try {
      setActionLoading('b2b-export')
      const csv = await radarService.exportB2bProspects(selectedCampaignId, organizationId)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `radar-cozinhas-${selectedCampaignId}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Erro ao exportar prospectos B2B:', error)
      toast.error('Confira as permissões de entrega das fontes CNPJá e Brave no Admin antes de exportar')
    } finally { setActionLoading(null) }
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

  const toggleOpportunitySelection = (opportunityId: string) => {
    setSelectedOpportunityIds(current => {
      if (current.includes(opportunityId)) return current.filter(id => id !== opportunityId)
      if (current.length >= 10) {
        toast.error('Selecione no maximo 10 oportunidades por lote.')
        return current
      }
      return [...current, opportunityId]
    })
  }

  const runBatchAction = async (mode: 'enrich' | 'analyze') => {
    if (selectedOpportunityIds.length === 0 || actionLoading) return

    try {
      setActionLoading(`batch-${mode}`)
      const updated: RadarOpportunity[] = mode === 'enrich'
        ? (await radarService.batchEnrich(selectedOpportunityIds)).enriched
        : (await radarService.batchAnalyze(selectedOpportunityIds)).analyzed
      setOpportunities(current => mergeOpportunities(updated, current))
      setSelectedOpportunity(current => updated.find(item => item.id === current?.id) ?? updated[0] ?? current)
      setSelectedOpportunityIds([])
      toast.success(mode === 'enrich' ? 'Lote enriquecido' : 'Lote enviado para analise')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao executar lote Radar:', error)
      toast.error('Erro ao executar lote')
    } finally {
      setActionLoading(null)
    }
  }

  const updateDuplicate = async (duplicateId: string, status: 'confirmed' | 'dismissed' | 'merged') => {
    if (actionLoading) return

    try {
      setActionLoading(`duplicate-${duplicateId}`)
      const duplicate = await radarService.updateDuplicate(duplicateId, status)
      setDuplicates(current => current.map(item => getDuplicateId(item) === getDuplicateId(duplicate) ? duplicate : item))
      toast.success('Duplicidade atualizada')
      refreshCampaignSidebars()
    } catch (error) {
      console.error('Erro ao atualizar duplicidade Radar:', error)
      toast.error('Erro ao atualizar duplicidade')
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
        <h2 className="text-base font-semibold text-slate-950">Nova campanha de captacao</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-6" onSubmit={createCampaign}>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
            value={form.campaignType}
            onChange={event => setForm({ ...form, campaignType: event.target.value as typeof form.campaignType })}
          >
            <option value="local_niche">Radar local por nicho</option>
            <option value="recently_opened">Empresas recem-abertas</option>
            <option value="regional_b2b">Prospecção regional B2B</option>
          </select>
          <Input className="md:col-span-2" placeholder="Nome" value={form.name} required onChange={event => setForm({ ...form, name: event.target.value })} />
          <Input placeholder="Nicho" value={form.targetSegment} required onChange={event => setForm({ ...form, targetSegment: event.target.value })} />
          {form.campaignType === 'regional_b2b' ? <>
            <div className="flex items-center gap-2 md:col-span-2" aria-label="Estados da prospecção">
              {(['MG', 'SP', 'PR'] as const).map(state => <label key={state} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.targetStates.includes(state)} onChange={event => setForm(current => ({ ...current,
                  targetStates: event.target.checked ? [...current.targetStates, state] : current.targetStates.filter(value => value !== state) }))} />{state}
              </label>)}
            </div>
            <Input className="md:col-span-2" placeholder="Produtos separados por vírgula" value={form.productFocus} required
              onChange={event => setForm({ ...form, productFocus: event.target.value })} />
          </> : <>
            <Input placeholder="Cidade" value={form.targetCity} required onChange={event => setForm({ ...form, targetCity: event.target.value })} />
            <Input placeholder="UF" value={form.targetState} required maxLength={2} onChange={event => setForm({ ...form, targetState: event.target.value.toUpperCase() })} />
          </>}
          <Input className="md:col-span-2" placeholder="Oferta ou objetivo comercial" value={form.offerType} required
            onChange={event => setForm({ ...form, offerType: event.target.value })} />
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
                <p className="text-sm text-slate-500">{campaign.targetSegment} em {campaign.campaignType === 'regional_b2b'
                  ? campaign.targetStates.join(', ') : `${campaign.targetCity}/${campaign.targetState}`}</p>
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
                placeRequestSequence.current += 1
                setSelectedCampaignId(campaign.id)
                setCnpjaForm(current => ({ ...current, city: campaign.targetCity, state: campaign.targetState }))
                setPlaceForm(buildRadarPlaceSearchDefaults(campaign))
                setPlacePreview(null)
                setSelectedOpportunity(null)
                setSelectedOpportunityIds([])
                setLastImportSummary(null)
              }}>
                Abrir
              </Button>
            </div>
          </div>
        ))}
      </section>

      {selectedCampaignId && (
        <>
          {selectedCampaign?.campaignType === 'regional_b2b' && <section className="rounded-md border bg-white p-4">
            <h2 className="font-semibold text-slate-950">Descoberta regional de cozinhas industriais</h2>
            <p className="mt-1 text-sm text-slate-600">Busca CNPJá por CNAE 5620-1/01 principal ou secundário. Cada clique consulta até 10 estabelecimentos e consome uma unidade da fonte; os resultados ficam para verificação e contato telefônico manual.</p>
            <p className="mt-1 text-xs text-slate-500">Produtos: {selectedCampaign.productFocus.join(', ') || 'não informados'}. CNAE é pista, não confirmação de cozinha industrial.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading)
                || Boolean(getSourceBlockedReason(cnpjaSource))} onClick={() => runB2bBatch('discovery')}>
                Buscar em lote nos três estados</Button>
              <Button type="button" size="sm" variant="outline" disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading)}
                onClick={() => runB2bBatch('verification')}>Verificar até 10 empresas</Button>
            </div>
            {b2bProgress && <p className="mt-2 text-xs text-slate-600">{b2bProgress.candidates} candidatos · {b2bProgress.checked} empresas inspecionadas · {b2bProgress.confirmed} cozinhas confirmadas · {b2bProgress.approved} aprovadas. {b2bProgress.states.map(item => `${item.state}: ${item.pages} páginas${item.completed ? ' (concluído)' : ''}`).join(' · ')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCampaign.targetStates.filter((state): state is 'MG' | 'SP' | 'PR' => ['MG', 'SP', 'PR'].includes(state)).map(state =>
                <Button key={state} type="button" size="sm" variant="outline"
                  disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading) || regionalProgress[state] === 'Busca concluída'
                    || Boolean(getSourceBlockedReason(cnpjaSource))}
                  onClick={() => searchRegionalCnpja(state)}>
                  {actionLoading === `regional-${state}` ? `Buscando ${state}...` : `Buscar próximo lote — ${state}`}
                </Button>)}
            </div>
            {Object.entries(regionalProgress).map(([state, message]) => <p key={state} className="mt-1 text-xs text-slate-600">{state}: {message}</p>)}
            <div className="mt-3 flex items-center gap-3 border-t pt-3">
              <span className="text-sm text-slate-600">{b2bProspects.filter(item => item.approvedAt).length} empresas aprovadas para contato manual</span>
              <Button type="button" size="sm" variant="outline" disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading)}
                onClick={exportB2bProspects}>Exportar lista verificada</Button>
            </div>
          </section>}
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
                    <p className="mt-2 text-xs text-slate-600">Limite diário da fonte por organização: {source.rateLimitPerDay}</p>
                    <p className="mt-1 text-xs text-slate-600">{source.isPaid && source.defaultCostPerUnit === 0
                      ? 'Custo em R$ ainda não aprovado; fonte bloqueada.'
                      : `Custo estimado por chamada: R$ ${source.defaultCostPerUnit.toFixed(4)}`}</p>
                    {source.termsNotes && <p className="mt-1 text-xs text-slate-500">{source.termsNotes}</p>}
                    {context.organization?.isInternalGrowthWorkspace && context.role?.key === 'yux_admin'
                      && ['cnpja_advanced_search', 'serper_places', 'brave_place_search'].includes(source.sourceType)
                      && !source.id.startsWith('fallback-') && (
                        <div className="mt-3 space-y-2 border-t pt-2">
                          {source.isPaid && <label className="block text-xs text-slate-600">Custo estimado por consulta em R$
                            <Input type="number" min="0.000001" step="0.000001" value={sourceCostDrafts[source.id] ?? String(source.defaultCostPerUnit)}
                              onChange={event => setSourceCostDrafts(current => ({ ...current, [source.id]: event.target.value }))} />
                          </label>}
                          <label className="block text-xs text-slate-600">Máximo de consultas por dia na organização
                            <Input type="number" min="1" max="1000" step="1" value={sourceLimitDrafts[source.id] ?? String(source.rateLimitPerDay)}
                              onChange={event => setSourceLimitDrafts(current => ({ ...current, [source.id]: event.target.value }))} />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={Boolean(actionLoading)
                              || !Number.isInteger(Number(sourceLimitDrafts[source.id] ?? source.rateLimitPerDay))
                              || Number(sourceLimitDrafts[source.id] ?? source.rateLimitPerDay) < 1}
                              onClick={() => changeManagedSource(source, {
                                defaultCostPerUnit: Number(sourceCostDrafts[source.id] ?? source.defaultCostPerUnit),
                                rateLimitPerDay: Number(sourceLimitDrafts[source.id] ?? source.rateLimitPerDay),
                              })}>Salvar limites e custo</Button>
                            <Button type="button" size="sm" variant="outline" disabled={Boolean(actionLoading) || (!source.enabled && source.isPaid && source.defaultCostPerUnit <= 0)}
                              onClick={() => changeManagedSource(source, { enabled: !source.enabled })}>{source.enabled ? 'Desativar' : 'Ativar'}</Button>
                          </div>
                        </div>
                      )}
                  </div>
                )
              })}
            </div>
            {osmSource && context.organization?.isInternalGrowthWorkspace && context.role?.key === 'yux_admin' && !osmSource.id.startsWith('fallback-') && (
              <Button type="button" size="sm" variant="outline" className="mt-3" disabled={Boolean(actionLoading)} onClick={toggleOsmSource}>
                {osmSource.enabled ? 'Desativar piloto OSM' : 'Ativar piloto OSM'}
              </Button>
            )}
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Fontes de entrada</h2>
                <p className="text-sm text-slate-500">Importe lotes pequenos e mantenha revisao humana antes de qualquer conversao.</p>
              </div>
              <label className="flex items-start gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={analyzeAfterImport}
                  onChange={event => setAnalyzeAfterImport(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-slate-900">Analisar apos captar</span>
                  <span className="block text-xs text-slate-500">Gera analise, score e mensagem em lote pequeno. Envio continua bloqueado por revisao humana.</span>
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2"><Radar className="h-4 w-4 text-yux-700" /><h3 className="text-sm font-semibold text-slate-950">Busca automática em dados abertos</h3></div>
                <p className="text-sm text-slate-600">Usa a cidade, UF e segmento desta campanha. Gera candidatos para revisão; não envia mensagens.</p>
                <p className="mt-2 text-xs text-slate-500">{osmReadiness?.reason || (osmReadiness?.snapshot
                  ? `Extrato de ${new Date(osmReadiness.snapshot.extractedAt).toLocaleDateString('pt-BR')} · ${osmReadiness.snapshot.placeCount} estabelecimentos indexados · ${osmReadiness.snapshot.attribution}`
                  : 'Conferindo disponibilidade do índice municipal...')}</p>
                <Button type="button" className="mt-3" disabled={!osmReadiness?.ready || Boolean(actionLoading)} onClick={searchOsm}>
                  {actionLoading === 'osm' ? 'Buscando...' : 'Buscar automaticamente (dados abertos)'}
                </Button>
                {osmReport && <p className="mt-3 text-xs text-slate-600">Piloto: {osmReport.candidates} candidatos · {osmReport.withSite} com site informado · {osmReport.verifiedSites} sites confirmados · {osmReport.withPhone} com telefone · {osmReport.withEmail} com e-mail · {osmReport.imported} importados · API US$ 0 (infraestrutura à parte).</p>}
              </div>
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
                  <Input placeholder="Endereço público" value={companyForm.address} onChange={event => setCompanyForm({ ...companyForm, address: event.target.value })} />
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

              <form className="rounded-md border p-3" onSubmit={searchCnpja}>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">Empresas recem-abertas (CNPJa)</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-6">
                  <Input className="md:col-span-2" placeholder="Termo opcional" value={cnpjaForm.query} onChange={event => setCnpjaForm({ ...cnpjaForm, query: event.target.value })} />
                  <Input placeholder="Cidade" value={cnpjaForm.city} onChange={event => setCnpjaForm({ ...cnpjaForm, city: event.target.value })} />
                  <Input placeholder="UF" value={cnpjaForm.state} maxLength={2} onChange={event => setCnpjaForm({ ...cnpjaForm, state: event.target.value.toUpperCase() })} />
                  <Input className="md:col-span-2" placeholder="CNAEs separados por virgula" value={cnpjaForm.cnae} onChange={event => setCnpjaForm({ ...cnpjaForm, cnae: event.target.value })} />
                  <label className="space-y-1 text-xs text-slate-500">
                    Abertura desde
                    <Input type="date" value={cnpjaForm.openingFrom} onChange={event => setCnpjaForm({ ...cnpjaForm, openingFrom: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-xs text-slate-500">
                    Abertura ate
                    <Input type="date" value={cnpjaForm.openingTo} onChange={event => setCnpjaForm({ ...cnpjaForm, openingTo: event.target.value })} />
                  </label>
                  <Input type="number" min="1" max="10" value={cnpjaForm.limit} onChange={event => setCnpjaForm({ ...cnpjaForm, limit: Number(event.target.value) })} />
                  <div className="md:col-span-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{context.role?.key !== 'yux_admin' ? 'Pesquisa CNPJa reservada ao Admin.'
                      : getSourceBlockedReason(cnpjaSource) || 'Gera candidatos por CNPJ para revisao antes da importacao.'}</p>
                    <Button type="submit" disabled={context.role?.key !== 'yux_admin' || Boolean(getSourceBlockedReason(cnpjaSource)) || actionLoading === 'cnpja'}>
                      {actionLoading === 'cnpja' ? 'Pesquisando...' : 'Pesquisar CNPJa'}
                    </Button>
                  </div>
                </div>
              </form>
              <form className="rounded-md border p-3" onSubmit={previewPlaces}>
                <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-yux-700" />
                  <h3 className="text-sm font-semibold text-slate-950">Busca local (pré-visualização)</h3></div>
                <div className="grid gap-3 md:grid-cols-6">
                  <Input className="md:col-span-2" aria-label="Segmento ou termo da busca local" placeholder="Segmento ou termo" required value={placeForm.query}
                    onChange={event => changePlaceForm({ query: event.target.value })} />
                  <Input aria-label="Cidade da busca local" placeholder="Cidade" required value={placeForm.city}
                    onChange={event => changePlaceForm({ city: event.target.value })} />
                  <Input aria-label="UF da busca local" placeholder="UF" required maxLength={2} value={placeForm.state}
                    onChange={event => changePlaceForm({ state: event.target.value.toUpperCase() })} />
                  <Input aria-label="Limite de resultados da busca local" type="number" min="1" max="10" value={placeForm.limit}
                    onChange={event => changePlaceForm({ limit: Number(event.target.value) })} />
                  <select aria-label="Fonte da busca local" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={placeForm.sourceType} onChange={event => {
                      changePlaceForm({ sourceType: event.target.value as typeof placeForm.sourceType })
                    }}>
                    <option value="serper_places">Serper Places</option>
                    <option value="brave_place_search">Brave Place Search</option>
                  </select>
                  <div className="md:col-span-6 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{context.role?.key !== 'yux_admin' ? 'Consulta de fontes pagas reservada ao Admin.' : getSourceBlockedReason(placeSource)
                      || 'Uma consulta pode consumir crédito. Os resultados não serão salvos no Radar ou CRM.'}</p>
                    <Button type="submit" disabled={!placeForm.query.trim() || !placeForm.city.trim() || !placeForm.state.trim()
                      || context.role?.key !== 'yux_admin' || Boolean(getSourceBlockedReason(placeSource)) || Boolean(actionLoading)}>
                      {actionLoading === 'place-preview' ? 'Consultando...' : 'Consultar fonte'}</Button>
                  </div>
                </div>
              </form>
            </div>

            {placePreview && <RadarPlacePreviewPanel places={placePreview.places} attribution={placePreview.attribution} />}

            {lastImportSummary && (
              <div className="mt-4 rounded-md border bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">
                    Resultado: {getImportSummaryLabel(lastImportSummary.kind)}
                  </p>
                  {lastImportSummary.runId && <p className="text-xs text-slate-500">Run {lastImportSummary.runId}</p>}
                </div>
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-4">
                  <p className="text-slate-700">Importados: {lastImportSummary.importedCount}</p>
                  <p className="text-slate-700">Analisados: {lastImportSummary.analyzedCount ?? 0}</p>
                  <p className="text-slate-700">Candidatos: {lastImportSummary.candidateCount}</p>
                  <p className={lastImportSummary.issueCount > 0 ? 'text-amber-700' : 'text-emerald-700'}>Issues: {lastImportSummary.issueCount}</p>
                </div>
                {lastImportSummary.issues.length > 0 && (
                  <div className="mt-2 divide-y rounded-md border bg-white">
                    {lastImportSummary.issues.slice(0, 6).map((issue, index) => (
                      <p key={`${issue.code}-${index}`} className="p-2 text-xs text-slate-600">
                        {issue.rowNumber ? `Linha ${issue.rowNumber}: ` : ''}
                        {issue.url ? `${issue.url}: ` : ''}
                        {issue.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                        {candidate.sourceType === 'osm_extract' && candidate.sourceUrl && <a className="mt-1 block text-xs text-yux-700 underline" href={candidate.sourceUrl} target="_blank" rel="noreferrer">Ver elemento no OpenStreetMap</a>}
                        {candidate.sourceType === 'osm_extract' && <p className="mt-1 text-xs text-slate-500">Site: {getOsmSiteCheckLabel(candidate)}</p>}
                        {selectedCampaign?.campaignType === 'regional_b2b' && <div className="mt-1 space-y-1 text-xs text-slate-600">
                          <p>CNPJ: {String(candidate.normalizedPayload.cnpj ?? 'não identificado')} · {String(candidate.normalizedPayload.city ?? '')}/{String(candidate.normalizedPayload.state ?? '')}</p>
                          <p>Site: {typeof candidate.normalizedPayload.websiteUrl === 'string' ? <a className="text-yux-700 underline" href={candidate.normalizedPayload.websiteUrl} target="_blank" rel="noreferrer">{candidate.normalizedPayload.websiteUrl}</a> : 'ainda não encontrado'}</p>
                          <p>Telefone: {String(candidate.normalizedPayload.phoneRaw ?? 'não identificado')} · Fonte complementar: {String(candidate.normalizedPayload.braveSourceUrl ?? 'não consultada')}</p>
                          {getBraveSuggestions(candidate.normalizedPayload).map(suggestion =>
                            <div key={suggestion.sourceUrl} className="mt-2 rounded border border-sky-200 bg-sky-50 p-2">
                              <p className="font-medium">Sugestão Brave não associada: {suggestion.name}</p>
                              <p>{suggestion.address} · Site: {suggestion.websiteUrl ?? 'não informado'} · Tel.: {suggestion.phone ?? 'não informado'}</p>
                              <a className="text-yux-700 underline" href={suggestion.sourceUrl} target="_blank" rel="noreferrer">Conferir origem</a>
                              <Button type="button" size="sm" variant="outline" className="ml-2"
                                disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading)}
                                onClick={() => confirmBraveSuggestion(candidate.id, suggestion.sourceUrl)}>Associar após conferir</Button>
                            </div>)}
                          <p>Atividade: {b2bProspectById.get(candidate.id)?.kitchenStatus ?? 'aguardando verificação'} · Adequação: {b2bProspectById.get(candidate.id)?.productFit ?? 'desconhecida'}</p>
                          {Array.isArray(candidate.normalizedPayload.triageReasons) && candidate.normalizedPayload.triageReasons.map((reason, index) => <p key={index}>{String(reason)}</p>)}
                          {b2bProspectById.get(candidate.id)?.evidence.map((fact, index) =>
                            <p key={index}>{fact.kind}: {fact.value.slice(0, 180)} · <a className="text-yux-700 underline" href={fact.sourceUrl} target="_blank" rel="noreferrer">fonte</a></p>)}
                          {b2bProspectById.get(candidate.id)?.approvedAt &&
                            <p className="font-medium text-emerald-700">Aprovada por verificação {b2bProspectById.get(candidate.id)?.verificationMethod === 'manual' ? 'humana' : 'automatizada'}.</p>}
                          {candidate.status === 'pending_review' && context.role?.key === 'yux_admin'
                            && b2bProspectById.get(candidate.id)?.kitchenStatus
                            && b2bProspectById.get(candidate.id)?.kitchenStatus !== 'confirmed'
                            && !b2bProspectById.get(candidate.id)?.approvedAt && (
                            <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
                              <p className="font-medium">Confirmação humana quando o site não comprova a atividade</p>
                              <Input aria-label={`Fonte pública de ${candidate.title}`} placeholder="URL da fonte pública que comprova a atividade"
                                value={b2bManualReviews[candidate.id]?.url ?? ''}
                                onChange={event => setB2bManualReviews(current => ({ ...current,
                                  [candidate.id]: { url: event.target.value, note: current[candidate.id]?.note ?? '' } }))} />
                              <textarea aria-label={`Justificativa de ${candidate.title}`} className="w-full rounded border p-2"
                                placeholder="Explique o que confirmou que é uma cozinha industrial (mín. 20 caracteres)"
                                value={b2bManualReviews[candidate.id]?.note ?? ''}
                                onChange={event => setB2bManualReviews(current => ({ ...current,
                                  [candidate.id]: { url: current[candidate.id]?.url ?? '', note: event.target.value } }))} />
                              <Button type="button" size="sm" disabled={Boolean(actionLoading)
                                || !b2bManualReviews[candidate.id]?.url || (b2bManualReviews[candidate.id]?.note.length ?? 0) < 20}
                                onClick={() => approveB2bProspect(candidate.id, true)}>Confirmar e aprovar manualmente</Button>
                            </div>)}
                        </div>}
                        {candidate.errorMessage && <p className="mt-1 text-xs text-red-600">{candidate.errorMessage}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {candidate.sourceType === 'osm_extract' && typeof candidate.normalizedPayload.websiteUrl === 'string' && (
                          <Button type="button" size="sm" variant="outline" disabled={candidate.status !== 'pending_review' || Boolean(actionLoading)} onClick={() => checkOsmSite(candidate.id)}>Verificar site</Button>
                        )}
                        {selectedCampaign?.campaignType === 'regional_b2b' && candidate.sourceType === 'cnpja_advanced_search'
                          && candidate.status === 'pending_review' && <Button type="button" size="sm" variant="outline"
                            disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading) || !braveSource?.enabled}
                            onClick={() => enrichCandidateWithBrave(candidate.id)}>
                            {actionLoading === `brave-${candidate.id}` ? 'Consultando...' : 'Enriquecer com Brave licenciada'}
                          </Button>}
                        {selectedCampaign?.campaignType === 'regional_b2b' && candidate.status === 'pending_review'
                          && <Button type="button" size="sm" variant="outline" disabled={Boolean(actionLoading)}
                            onClick={() => inspectBusinessSite(candidate.id)}>
                            {actionLoading === `b2b-site-${candidate.id}` ? 'Verificando...' : 'Verificar site e atividade'}
                          </Button>}
                        {selectedCampaign?.campaignType === 'regional_b2b' && candidate.normalizedPayload.kitchenStatus === 'confirmed'
                          && candidate.normalizedPayload.websiteStatus === 'verified_present'
                          && !b2bProspectById.get(candidate.id)?.approvedAt
                          && <Button type="button" size="sm" disabled={context.role?.key !== 'yux_admin' || Boolean(actionLoading)}
                            onClick={() => approveB2bProspect(candidate.id)}>Aprovar para lista</Button>}
                        {selectedCampaign?.campaignType !== 'regional_b2b' && <Button type="button" size="sm" variant="outline" disabled={candidate.status !== 'pending_review' || Boolean(actionLoading)} onClick={() => importCandidate(candidate.id)}>Importar</Button>}
                        <Button type="button" size="sm" variant="outline" disabled={candidate.status !== 'pending_review' || Boolean(actionLoading)} onClick={() => discardCandidate(candidate.id)}>Descartar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Oportunidades</h3>
                    <p className="text-xs text-slate-500">{selectedOpportunityIds.length} selecionadas para lote</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={selectedOpportunityIds.length === 0 || Boolean(actionLoading)} onClick={() => runBatchAction('enrich')}>
                      {actionLoading === 'batch-enrich' ? 'Enriquecendo...' : 'Enriquecer'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={selectedOpportunityIds.length === 0 || Boolean(actionLoading)} onClick={() => runBatchAction('analyze')}>
                      {actionLoading === 'batch-analyze' ? 'Analisando...' : 'Analisar'}
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {opportunities.length === 0 && <p className="p-3 text-sm text-slate-500">Nenhuma oportunidade nesta campanha.</p>}
                  {opportunities.map(opportunity => (
                    <div key={opportunity.id} className={`flex items-center gap-3 p-3 text-sm hover:bg-slate-50 ${selectedOpportunity?.id === opportunity.id ? 'bg-slate-50' : ''}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selectedOpportunityIds.includes(opportunity.id)}
                        onChange={() => toggleOpportunitySelection(opportunity.id)}
                        aria-label={`Selecionar ${getRadarCompanyDisplayName(opportunity.company)}`}
                      />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                        onClick={() => setSelectedOpportunity(opportunity)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-950">{getRadarCompanyDisplayName(opportunity.company)}</span>
                          <span className="block text-xs text-slate-500">{getRadarOpportunityStatusLabel(opportunity.status)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">Score {opportunity.latestScore?.totalScore ?? '-'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-yux-700" />
              <h2 className="text-base font-semibold text-slate-950">Duplicatas para revisao</h2>
            </div>
            <div className="mt-3 divide-y rounded-md border">
              {duplicates.length === 0 && <p className="p-3 text-sm text-slate-500">Nenhuma duplicidade pendente nesta campanha.</p>}
              {duplicates.map(duplicate => {
                const duplicateId = getDuplicateId(duplicate)
                return (
                  <div key={duplicateId} className="grid gap-3 p-3 text-sm lg:grid-cols-[1fr_220px]">
                    <div>
                      <p className="font-medium text-slate-950">
                        {getDuplicateMatchType(duplicate)} - {getDuplicateConfidence(duplicate)}%
                      </p>
                      <p className="text-xs text-slate-500">{duplicateStatusLabels[duplicate.status] || duplicate.status}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Empresa {getDuplicateCompanyId(duplicate)} comparada com {getDuplicateOtherCompanyId(duplicate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={duplicate.status !== 'pending' || Boolean(actionLoading)} onClick={() => updateDuplicate(duplicateId, 'confirmed')}>Confirmar</Button>
                      <Button type="button" size="sm" variant="outline" disabled={duplicate.status !== 'pending' || Boolean(actionLoading)} onClick={() => updateDuplicate(duplicateId, 'dismissed')}>Ignorar</Button>
                      <Button type="button" size="sm" variant="outline" disabled={duplicate.status !== 'pending' || Boolean(actionLoading)} onClick={() => updateDuplicate(duplicateId, 'merged')}>Mesclar</Button>
                    </div>
                  </div>
                )
              })}
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
                    <p className="text-sm font-medium text-slate-950">{run.runKind === 'analysis' ? 'Analise IA' : run.provider} - {run.status}</p>
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
        onRunAnalysis={queueOpportunityAnalysis}
        onApprove={opportunity => runOpportunityAction('approve', () => radarService.reviewOpportunity(opportunity.id, 'approved'), 'Oportunidade aprovada')}
        onReject={opportunity => runOpportunityAction('reject', () => radarService.reviewOpportunity(opportunity.id, 'rejected'), 'Oportunidade rejeitada')}
        onOptOut={opportunity => runOpportunityAction('opt-out', () => radarService.optOutOpportunity(opportunity.id), 'Opt-out registrado')}
        onConvert={convertSelectedOpportunity}
      />
      <ProspectingPlanPanel organizationId={organizationId} opportunity={selectedOpportunity} />
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

function getImportSummaryLabel(kind: RadarImportSummary['kind']) {
  if (kind === 'csv') return 'CSV'
  if (kind === 'urls') return 'URL/site'
  if (kind === 'cnpja') return 'CNPJa'
  if (kind === 'osm') return 'Busca automática (dados abertos)'
  return 'Busca assistida'
}

function getOsmSiteCheckLabel(candidate: RadarCandidateRecord) {
  const check = candidate.rawPayload?.siteCheck as { status?: string } | undefined
  if (check?.status === 'verified_present') return 'confirmado por acesso HTTP'
  if (check?.status === 'blocked') return 'verificação bloqueada por segurança'
  if (check?.status === 'unknown') return 'não foi possível confirmar'
  return candidate.normalizedPayload.websiteUrl ? 'informado no OSM, ainda não verificado' : 'não informado no OSM; situação desconhecida'
}

function recentDate(daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

function getDuplicateId(duplicate: RadarDuplicateCandidate) {
  return duplicate.id
}

function getDuplicateMatchType(duplicate: RadarDuplicateCandidate) {
  return duplicate.matchType || duplicate.match_type || 'match'
}

function getDuplicateConfidence(duplicate: RadarDuplicateCandidate) {
  return duplicate.confidenceScore ?? duplicate.confidence_score ?? 0
}

function getDuplicateCompanyId(duplicate: RadarDuplicateCandidate) {
  return duplicate.companyRecordId || duplicate.company_record_id || '-'
}

function getDuplicateOtherCompanyId(duplicate: RadarDuplicateCandidate) {
  return duplicate.duplicateCompanyRecordId || duplicate.duplicate_company_record_id || '-'
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
  const isAnalyzing = opportunity?.status === 'diagnosing'
  const canReview = opportunity?.status === 'review_pending'

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
            <Button type="button" variant="outline" disabled={Boolean(actionLoading) || isAnalyzing} onClick={() => onRunAnalysis(opportunity)}>
              {isAnalyzing ? 'Analise em andamento' : actionLoading === 'analysis' ? 'Enviando...' : 'Rodar analise'}
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(actionLoading) || !canReview} onClick={() => onApprove(opportunity)}>
              Aprovar
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(actionLoading) || !canReview} onClick={() => onReject(opportunity)}>
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
