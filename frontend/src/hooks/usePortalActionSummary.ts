import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInvoicePaymentState } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { projectDeliveryService } from '@/services/projectDeliveryService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalFinanceInvoice } from '@/types/finance'
import type { ApprovalRequest, Project } from '@/types/project'
import { usePortalCrmContext } from './usePortalCrmContext'
import { usePortalMarketingContext, type PortalMarketingContextResource } from './usePortalMarketingContext'

export type PortalActionKind = 'approval' | 'commercial' | 'finance' | 'project' | 'marketing'
export type PortalActionPriority = 'critical' | 'high' | 'normal'

export interface PortalNextAction {
  id: string
  kind: PortalActionKind
  priority: PortalActionPriority
  title: string
  description: string
  href: string
  /** Desde quando o item espera (ISO), quando existe uma data real. */
  since?: string
}

interface ProjectActionState {
  projects: Project[]
  approvals: ApprovalRequest[]
  invoices: PortalFinanceInvoice[]
  loading: boolean
  error: string | null
}

const emptyProjectActionState: ProjectActionState = {
  projects: [],
  approvals: [],
  invoices: [],
  loading: true,
  error: null,
}

/** Data mais antiga de uma lista (ISO), ignorando valores vazios ou inválidos. */
const oldest = (dates: Array<string | undefined>) => {
  const valid = dates.filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value as string).getTime()))
  return valid.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
}

const byPriority = (action: PortalNextAction) => {
  if (action.priority === 'critical') return 0
  if (action.priority === 'high') return 1
  return 2
}

export function usePortalActionSummary() {
  const organizationId = usePlatformStore(state => state.organization?.id)
  const activeContract = usePlatformStore(state => state.activeContract)
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const crm = usePortalCrmContext()
  // Campanhas, conteúdos e execuções só são pedidos quando o módulo correspondente está contratado.
  const marketingResources = useMemo(() => {
    const resources: PortalMarketingContextResource[] = ['reviews', 'creativeSuggestions']
    if (enabledModuleKeys.includes('campaigns')) resources.push('campaigns')
    if (enabledModuleKeys.includes('marketing_studio')) resources.push('contents', 'workflowRuns')
    return resources
  }, [enabledModuleKeys])
  const marketing = usePortalMarketingContext({ resources: marketingResources })
  const [projectState, setProjectState] = useState<ProjectActionState>(emptyProjectActionState)
  const [projectRefreshKey, setProjectRefreshKey] = useState(0)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  const reload = useCallback(() => {
    void crm.reload()
    void marketing.reload()
    setProjectRefreshKey(current => current + 1)
  }, [crm, marketing])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isPlatformLoading) {
        setProjectState({ ...emptyProjectActionState, loading: true })
        return
      }

      if (!organizationId) {
        setProjectState({ ...emptyProjectActionState, loading: false })
        return
      }

      setProjectState({ ...emptyProjectActionState, loading: true })

      try {
        const [projectsResponse, approvalsResponse, invoices] = await Promise.all([
          enabledModuleKeys.includes('projects') ? projectDeliveryService.list(organizationId) : Promise.resolve({ projects: [] }),
          enabledModuleKeys.includes('projects') ? projectDeliveryService.approvals(organizationId) : Promise.resolve({ approvals: [] }),
          activeContract && enabledModuleKeys.includes('finance') ? financeService.getPortalInvoices(activeContract.id) : Promise.resolve([]),
        ])
        const projects: Project[] = projectsResponse.projects || []
        const approvals: ApprovalRequest[] = approvalsResponse.approvals

        if (!cancelled) {
          setProjectState({
            projects,
            approvals,
            invoices,
            loading: false,
            error: null,
          })
        }
      } catch (error) {
        console.error('Erro ao carregar proximas acoes do portal:', error)
        if (!cancelled) {
          setProjectState({
            projects: [],
            approvals: [],
            invoices: [],
            loading: false,
            error: 'Nao foi possivel carregar todas as proximas acoes.',
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [organizationId, activeContract, enabledModuleKeys, isPlatformLoading, projectRefreshKey])

  const actions = useMemo<PortalNextAction[]>(() => {
    const pendingProjectApprovals = projectState.approvals.filter(approval => approval.status === 'pending')
    const pendingContentReviews = marketing.reviews.filter(review => review.status === 'pending')
    const pendingCampaignCreatives = marketing.creativeSuggestions.filter(suggestion => (
      suggestion.status === 'in_review' || (suggestion.approvalRequired && suggestion.status === 'draft')
    ))
    const overdueTasks = crm.tasks.filter(task => task.status === 'pending' && new Date(task.dueAt).getTime() < Date.now())
    const dueSoonInvoices = projectState.invoices.filter(invoice => {
      const state = getInvoicePaymentState(invoice)
      return state === 'overdue' || state === 'partial_overdue' || state === 'due_soon'
    })
    const reviewProjects = projectState.projects.filter(project => project.status === 'REVIEW')

    return [
      pendingProjectApprovals.length > 0 ? {
        id: 'project-approvals',
        kind: 'approval',
        priority: 'critical',
        title: `${pendingProjectApprovals.length} ${pendingProjectApprovals.length > 1 ? 'aprovações de projeto pendentes' : 'aprovação de projeto pendente'}`,
        description: 'Entregáveis e documentos aguardando a sua decisão.',
        href: '/portal/projetos/projetos?tab=approvals',
        since: oldest(pendingProjectApprovals.map(approval => approval.submittedAt)),
      } : null,
      pendingContentReviews.length > 0 ? {
        id: 'content-reviews',
        kind: 'marketing',
        priority: 'high',
        title: `${pendingContentReviews.length} ${pendingContentReviews.length > 1 ? 'conteúdos aguardando revisão' : 'conteúdo aguardando revisão'}`,
        description: 'Conteúdos do Marketing Studio precisam de aprovação ou ajustes.',
        href: '/portal/marketing/studio',
        since: oldest(pendingContentReviews.map(review => review.createdAt)),
      } : null,
      pendingCampaignCreatives.length > 0 ? {
        id: 'campaign-creatives',
        kind: 'approval',
        priority: 'high',
        title: `${pendingCampaignCreatives.length} ${pendingCampaignCreatives.length > 1 ? 'criativos em aprovação' : 'criativo em aprovação'}`,
        description: 'Sugestões de campanha aguardam revisão antes da publicação.',
        href: '/portal/marketing/criativos',
        since: oldest(pendingCampaignCreatives.map(suggestion => suggestion.updatedAt || suggestion.createdAt)),
      } : null,
      overdueTasks.length > 0 ? {
        id: 'crm-overdue',
        kind: 'commercial',
        priority: 'critical',
        title: `${overdueTasks.length} ${overdueTasks.length > 1 ? 'follow-ups atrasados' : 'follow-up atrasado'}`,
        description: 'Tarefas comerciais passaram do prazo e precisam de ação.',
        href: '/portal/comercial/tarefas',
        since: oldest(overdueTasks.map(task => task.dueAt)),
      } : null,
      dueSoonInvoices.length > 0 ? {
        id: 'finance-due',
        kind: 'finance',
        priority: dueSoonInvoices.some(invoice => ['overdue', 'partial_overdue'].includes(getInvoicePaymentState(invoice))) ? 'critical' : 'normal',
        title: `${dueSoonInvoices.length} ${dueSoonInvoices.length > 1 ? 'faturas para acompanhar' : 'fatura para acompanhar'}`,
        description: 'Existe vencimento próximo ou valor em aberto no financeiro.',
        href: '/portal/financeiro',
        since: oldest(dueSoonInvoices.map(invoice => invoice.dueDate)),
      } : null,
      reviewProjects.length > 0 ? {
        id: 'projects-review',
        kind: 'project',
        priority: 'normal',
        title: `${reviewProjects.length} ${reviewProjects.length > 1 ? 'projetos em revisão' : 'projeto em revisão'}`,
        description: 'Confira andamento, entregáveis e linha do tempo dos projetos.',
        href: '/portal/projetos/projetos',
        since: oldest(reviewProjects.map(project => project.updatedAt)),
      } : null,
    ].filter(Boolean).sort((a, b) => byPriority(a as PortalNextAction) - byPriority(b as PortalNextAction)) as PortalNextAction[]
  }, [crm.tasks, marketing.creativeSuggestions, marketing.reviews, projectState.approvals, projectState.invoices, projectState.projects])

  const loading = crm.loading || marketing.loading || projectState.loading
  const error = crm.error || marketing.error || projectState.error

  // Registra o momento da última carga concluída sem erro; em falha mantém o horário anterior.
  useEffect(() => {
    if (!loading && !error) setLoadedAt(new Date())
  }, [loading, error])

  return {
    actions,
    pendingApprovalCount: actions.filter(action => action.kind === 'approval').length,
    loading,
    error,
    loadedAt,
    projectsLoading: projectState.loading,
    projectsError: projectState.error,
    projects: projectState.projects,
    approvals: projectState.approvals,
    invoices: projectState.invoices,
    crm,
    marketing,
    reload,
  }
}
