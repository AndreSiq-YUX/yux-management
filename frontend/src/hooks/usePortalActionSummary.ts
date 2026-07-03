import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInvoicePaymentState } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { backendDataService } from '@/services/backendDataService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalFinanceInvoice } from '@/types/finance'
import type { ApprovalRequest, Project } from '@/types/project'
import { usePortalCrmContext } from './usePortalCrmContext'
import { usePortalMarketingContext } from './usePortalMarketingContext'

export type PortalActionKind = 'approval' | 'commercial' | 'finance' | 'project' | 'marketing'
export type PortalActionPriority = 'critical' | 'high' | 'normal'

export interface PortalNextAction {
  id: string
  kind: PortalActionKind
  priority: PortalActionPriority
  title: string
  description: string
  href: string
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

const byPriority = (action: PortalNextAction) => {
  if (action.priority === 'critical') return 0
  if (action.priority === 'high') return 1
  return 2
}

export function usePortalActionSummary() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const crm = usePortalCrmContext()
  const marketing = usePortalMarketingContext({ includeCampaigns: true, includeOperations: true })
  const [projectState, setProjectState] = useState<ProjectActionState>(emptyProjectActionState)
  const [projectRefreshKey, setProjectRefreshKey] = useState(0)

  const reload = useCallback(() => {
    void crm.reload()
    void marketing.reload()
    setProjectRefreshKey(current => current + 1)
  }, [crm, marketing])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isPlatformLoading) {
        setProjectState(current => ({ ...current, loading: true, error: null }))
        return
      }

      if (!activeContract) {
        setProjectState({ ...emptyProjectActionState, loading: false })
        return
      }

      setProjectState(current => ({ ...current, loading: true, error: null }))

      try {
        const [projectsResponse, invoices] = await Promise.all([
          enabledModuleKeys.includes('projects') ? backendDataService.getProjects({ limit: 50 }) : Promise.resolve({ projects: [] }),
          enabledModuleKeys.includes('finance') ? financeService.getPortalInvoices(activeContract.id) : Promise.resolve([]),
        ])
        const projects: Project[] = projectsResponse.projects || []
        const approvalResponses = await Promise.all(projects.slice(0, 20).map(project => backendDataService.getProjectApprovalRequests(project.id)))
        const approvals: ApprovalRequest[] = approvalResponses
          .flatMap(response => response.approvals as ApprovalRequest[])
          .filter(approval => approval.isClientVisible)

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
  }, [activeContract, enabledModuleKeys, isPlatformLoading, projectRefreshKey])

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
        title: `${pendingProjectApprovals.length} aprovacao de projeto pendente${pendingProjectApprovals.length > 1 ? 's' : ''}`,
        description: 'Entregaveis e documentos aguardando decisao do cliente.',
        href: '/portal/projetos/aprovacoes',
      } : null,
      pendingContentReviews.length > 0 ? {
        id: 'content-reviews',
        kind: 'marketing',
        priority: 'high',
        title: `${pendingContentReviews.length} conteudo${pendingContentReviews.length > 1 ? 's' : ''} aguardando revisao`,
        description: 'Conteudos do Marketing Studio precisam de aprovacao ou ajustes.',
        href: '/portal/marketing/studio',
      } : null,
      pendingCampaignCreatives.length > 0 ? {
        id: 'campaign-creatives',
        kind: 'approval',
        priority: 'high',
        title: `${pendingCampaignCreatives.length} criativo${pendingCampaignCreatives.length > 1 ? 's' : ''} em aprovacao`,
        description: 'Sugestoes de campanha aguardam revisao antes da publicacao.',
        href: '/portal/marketing/criativos',
      } : null,
      overdueTasks.length > 0 ? {
        id: 'crm-overdue',
        kind: 'commercial',
        priority: 'critical',
        title: `${overdueTasks.length} follow-up${overdueTasks.length > 1 ? 's' : ''} atrasado${overdueTasks.length > 1 ? 's' : ''}`,
        description: 'Tarefas comerciais passaram do prazo e precisam de acao.',
        href: '/portal/comercial/tarefas',
      } : null,
      dueSoonInvoices.length > 0 ? {
        id: 'finance-due',
        kind: 'finance',
        priority: dueSoonInvoices.some(invoice => ['overdue', 'partial_overdue'].includes(getInvoicePaymentState(invoice))) ? 'critical' : 'normal',
        title: `${dueSoonInvoices.length} fatura${dueSoonInvoices.length > 1 ? 's' : ''} para acompanhar`,
        description: 'Existe vencimento proximo ou valor em aberto no financeiro.',
        href: '/portal/financeiro',
      } : null,
      reviewProjects.length > 0 ? {
        id: 'projects-review',
        kind: 'project',
        priority: 'normal',
        title: `${reviewProjects.length} projeto${reviewProjects.length > 1 ? 's' : ''} em revisao`,
        description: 'Confira andamento, entregaveis e timeline dos projetos.',
        href: '/portal/projetos/projetos',
      } : null,
    ].filter(Boolean).sort((a, b) => byPriority(a as PortalNextAction) - byPriority(b as PortalNextAction)) as PortalNextAction[]
  }, [crm.tasks, marketing.creativeSuggestions, marketing.reviews, projectState.approvals, projectState.invoices, projectState.projects])

  return {
    actions,
    pendingApprovalCount: actions.filter(action => action.kind === 'approval').length,
    loading: crm.loading || marketing.loading || projectState.loading,
    error: crm.error || marketing.error || projectState.error,
    projects: projectState.projects,
    approvals: projectState.approvals,
    invoices: projectState.invoices,
    crm,
    marketing,
    reload,
  }
}
