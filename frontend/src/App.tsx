import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'

// Layout components
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { DashboardLayout } from '@/components/layouts/DashboardLayout'

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { SetPasswordPage } from '@/pages/auth/SetPasswordPage'
import { PublicProposalPage } from '@/pages/public/PublicProposalPage'
import { WebchatWidgetPage } from '@/pages/webchat/WebchatWidgetPage'

// Dashboard pages
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ClientsPage } from '@/pages/clients/ClientsPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { CampaignsPage } from '@/pages/campaigns/CampaignsPage'
import { LeadsPage } from '@/pages/leads/LeadsPage'
import { ProposalsPage } from '@/pages/proposals/ProposalsPage'
import { OmnichannelPage } from '@/pages/omnichannel/OmnichannelPage'
import { FinancePage } from '@/pages/finance/FinancePage'
import { LandingPagesPage } from '@/pages/landing-pages/LandingPagesPage'
import { SupportPage } from '@/pages/support/SupportPage'
import { AutomationsPage } from '@/pages/automations/AutomationsPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { MarketingStudioPage } from '@/pages/marketing-studio/MarketingStudioPage'

// Client workspace pages
import { ClientWorkspaceLayout } from '@/pages/client-workspaces/ClientWorkspaceLayout'
import { ClientWorkspaceSelectorPage } from '@/pages/client-workspaces/ClientWorkspaceSelectorPage'

// Client portal pages
import { PortalDashboardPage } from '@/pages/client-portal/PortalDashboardPage'
import { PortalCampaignsPage } from '@/pages/client-portal/PortalCampaignsPage'
import { PortalConnectedChannelsPage } from '@/pages/client-portal/PortalConnectedChannelsPage'
import { PortalProjectsPage } from '@/pages/client-portal/PortalProjectsPage'
import { PortalFinancePage } from '@/pages/client-portal/PortalFinancePage'
import { PortalLandingPagesPage } from '@/pages/client-portal/PortalLandingPagesPage'
import { PortalExternalLeadFormsPage } from '@/pages/client-portal/PortalExternalLeadFormsPage'
import { PortalMarketingStudioPage } from '@/pages/client-portal/PortalMarketingStudioPage'
import { PortalReportsPage } from '@/pages/client-portal/PortalReportsPage'
import { PortalSupportPage } from '@/pages/client-portal/PortalSupportPage'
import { PortalAccountSettingsPage } from '@/pages/client-portal/PortalAccountSettingsPage'
import { PortalApprovalsPage } from '@/pages/client-portal/PortalApprovalsPage'
import { PortalEmailTemplatesPage } from '@/pages/client-portal/PortalEmailTemplatesPage'
import { PortalSafeStatePage } from '@/pages/client-portal/PortalSafeStatePage'
import { PortalCommercialAccountsPage } from '@/pages/client-portal/commercial/PortalCommercialAccountsPage'
import { PortalCommercialFunnelsPage } from '@/pages/client-portal/commercial/PortalCommercialFunnelsPage'
import { PortalCommercialLeadsPage } from '@/pages/client-portal/commercial/PortalCommercialLeadsPage'
import { PortalCommercialRadarPage } from '@/pages/client-portal/commercial/PortalCommercialRadarPage'
import { PortalCommercialTasksPage } from '@/pages/client-portal/commercial/PortalCommercialTasksPage'
import { PortalLeadScoringPage } from '@/pages/client-portal/commercial/PortalLeadScoringPage'
import { PortalBrandVoicePage } from '@/pages/client-portal/company/PortalBrandVoicePage'
import { PortalCompanyIntegrationsPage } from '@/pages/client-portal/company/PortalCompanyIntegrationsPage'
import { PortalCompanyProfilePage } from '@/pages/client-portal/company/PortalCompanyProfilePage'
import { PortalCompanyUsersPage } from '@/pages/client-portal/company/PortalCompanyUsersPage'
import { PortalKnowledgeBasePage } from '@/pages/client-portal/company/PortalKnowledgeBasePage'
import { PortalCreativeAssetsPage } from '@/pages/client-portal/marketing/PortalCreativeAssetsPage'
import { PortalEditorialCalendarPage } from '@/pages/client-portal/marketing/PortalEditorialCalendarPage'
import { PortalOrganicContentPage } from '@/pages/client-portal/marketing/PortalOrganicContentPage'
import { PortalDocumentsPage } from '@/pages/client-portal/projects/PortalDocumentsPage'
import { PortalAiAgentPage } from '@/pages/client-portal/service-ai/PortalAiAgentPage'
import { PortalHandoffQueuesPage } from '@/pages/client-portal/service-ai/PortalHandoffQueuesPage'
import { PortalServiceConversationsPage } from '@/pages/client-portal/service-ai/PortalServiceConversationsPage'
import { BlueprintsPage } from '@/pages/platform/BlueprintsPage'
import { AdminHubPage } from '@/pages/platform/AdminHubPage'
import { AdminAiPage } from '@/pages/platform/AdminAiPage'
import { AdminChannelsPage } from '@/pages/platform/AdminChannelsPage'
import { AdminEmailPage } from '@/pages/platform/AdminEmailPage'
import { AdminSystemEmailTemplatesPage } from '@/pages/platform/AdminSystemEmailTemplatesPage'
import { AdminHealthPage } from '@/pages/platform/AdminHealthPage'
import { AdminIntegrationsPage } from '@/pages/platform/AdminIntegrationsPage'
import { AdminModuleGovernancePage } from '@/pages/platform/AdminModuleGovernancePage'
import { AdminLimitsPage } from '@/pages/platform/AdminLimitsPage'
import { StrategyEnginePage } from '@/pages/platform/StrategyEnginePage'
import { ClientConversionsPage } from '@/pages/platform/ClientConversionsPage'
import { ContractsPage } from '@/pages/platform/ContractsPage'
import { CrmGovernancePage } from '@/pages/platform/CrmGovernancePage'
import { ModuleSurfacePage } from '@/pages/platform/ModuleSurfacePage'
import { ModulesPage } from '@/pages/platform/ModulesPage'
import { PackagesPage } from '@/pages/platform/PackagesPage'

const MissionsPage = lazy(() => import('@/pages/action-engine/MissionsPage').then(module => ({ default: module.MissionsPage })))
const MissionDetailPage = lazy(() => import('@/pages/action-engine/MissionDetailPage').then(module => ({ default: module.MissionDetailPage })))
const PortalMissionsPage = lazy(() => import('@/pages/client-portal/PortalMissionsPage').then(module => ({ default: module.PortalMissionsPage })))
const PortalMissionDetailPage = lazy(() => import('@/pages/client-portal/PortalMissionDetailPage').then(module => ({ default: module.PortalMissionDetailPage })))
const MissionSimulationReviewPage = lazy(() => import('@/pages/public/MissionSimulationReviewPage').then(module => ({ default: module.MissionSimulationReviewPage })))
const MissionLearningPage = lazy(() => import('@/pages/platform/MissionLearningPage').then(module => ({ default: module.MissionLearningPage })))

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="grid min-h-64 place-items-center text-sm text-slate-500">Carregando missões...</main>}>{children}</Suspense>
}

function RequireRole({ roles, children }: { roles: Array<'admin' | 'manager' | 'client'>; children: ReactNode }) {
  const { user } = useAuthStore()
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  const { isAuthenticated, user, isSessionResolved, initialize } = useAuthStore()

  useEffect(() => {
    if (!isSessionResolved) {
      void initialize()
    }
  }, [initialize, isSessionResolved])

  if (!isSessionResolved) {
    return (
      <main className="grid min-h-screen place-items-center bg-gray-50 p-6" aria-live="polite">
        <p className="text-sm text-gray-600">Validando sessao...</p>
      </main>
    )
  }

  const safePortalPage = (title: string, description: string, capabilities: string[]) => (
    <PortalSafeStatePage title={title} description={description} capabilities={capabilities} />
  )

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="set-password" element={<SetPasswordPage />} />
        <Route index element={<Navigate to="/auth/login" replace />} />
      </Route>
      <Route path="/proposal/review/:token" element={<PublicProposalPage />} />
      <Route path="/mission-simulation/review/:token" element={<LazyPage><MissionSimulationReviewPage /></LazyPage>} />
      <Route path="/webchat/session" element={<WebchatWidgetPage />} />

      {/* Protected routes */}
      <Route 
        path="/" 
        element={
          isAuthenticated ? (
            <DashboardLayout />
          ) : (
            <Navigate to="/auth/login" replace />
          )
        }
      >
        <Route index element={<Navigate to={user?.role === 'client' ? '/portal' : '/dashboard'} replace />} />
        
        {/* Admin/Manager routes */}
        {['admin', 'manager'].includes(user?.role || '') && (
          <>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="admin" element={<RequireRole roles={['admin']}><AdminHubPage /></RequireRole>} />
            <Route path="admin/integrations" element={<RequireRole roles={['admin']}><AdminIntegrationsPage /></RequireRole>} />
            <Route path="admin/channels" element={<RequireRole roles={['admin']}><AdminChannelsPage /></RequireRole>} />
            <Route path="admin/email" element={<RequireRole roles={['admin']}><AdminEmailPage /></RequireRole>} />
            <Route path="admin/email/templates" element={<RequireRole roles={['admin']}><AdminSystemEmailTemplatesPage /></RequireRole>} />
            <Route path="admin/ai" element={<RequireRole roles={['admin']}><AdminAiPage /></RequireRole>} />
            <Route path="admin/strategy-engine" element={<RequireRole roles={['admin']}><StrategyEnginePage /></RequireRole>} />
            <Route path="admin/health" element={<RequireRole roles={['admin']}><AdminHealthPage /></RequireRole>} />
            <Route path="admin/modules-governance" element={<RequireRole roles={['admin']}><AdminModuleGovernancePage /></RequireRole>} />
            <Route path="admin/limits" element={<RequireRole roles={['admin']}><AdminLimitsPage /></RequireRole>} />
            <Route path="admin/mission-learning" element={<RequireRole roles={['admin']}><LazyPage><MissionLearningPage /></LazyPage></RequireRole>} />
            <Route path="contracts" element={<RequireRole roles={['admin']}><ContractsPage /></RequireRole>} />
            <Route path="client-conversions" element={<RequireRole roles={['admin']}><ClientConversionsPage /></RequireRole>} />
            <Route path="packages" element={<RequireRole roles={['admin']}><PackagesPage /></RequireRole>} />
            <Route path="modules" element={<RequireRole roles={['admin']}><ModulesPage /></RequireRole>} />
            <Route path="crm-governance" element={<RequireRole roles={['admin']}><CrmGovernancePage /></RequireRole>} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="proposals" element={<ProposalsPage />} />
            <Route path="omnichannel" element={<OmnichannelPage />} />
            <Route path="whatsapp-ai" element={<Navigate to="/omnichannel" replace />} />
            <Route path="landing-pages" element={<LandingPagesPage />} />
            <Route path="marketing-studio" element={<MarketingStudioPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="missions" element={<LazyPage><MissionsPage /></LazyPage>} />
            <Route path="missions/:missionId" element={<LazyPage><MissionDetailPage /></LazyPage>} />
            <Route path="blueprints" element={<RequireRole roles={['admin']}><BlueprintsPage /></RequireRole>} />

            <Route path="client-workspaces" element={<ClientWorkspaceSelectorPage />} />
            <Route path="client-workspaces/:organizationId" element={<ClientWorkspaceLayout />}>
              <Route index element={<PortalDashboardPage />} />

              <Route path="empresa/perfil" element={<PortalCompanyProfilePage />} />
              <Route path="empresa/usuarios" element={<PortalCompanyUsersPage />} />
              <Route path="empresa/conhecimento" element={<PortalKnowledgeBasePage />} />
              <Route path="empresa/marca" element={<PortalBrandVoicePage />} />
              <Route path="empresa/integracoes" element={<PortalCompanyIntegrationsPage />} />

              <Route path="comercial/leads" element={<PortalCommercialLeadsPage />} />
              <Route path="comercial/contas" element={<PortalCommercialAccountsPage />} />
              <Route path="comercial/funis" element={<PortalCommercialFunnelsPage />} />
              <Route path="comercial/tarefas" element={<PortalCommercialTasksPage />} />
              <Route path="comercial/scoring" element={<PortalLeadScoringPage />} />
              <Route path="comercial/radar" element={<PortalCommercialRadarPage />} />

              <Route path="atendimento/conversas" element={<PortalServiceConversationsPage />} />
              <Route path="atendimento/agente-ia" element={<PortalAiAgentPage />} />
              <Route path="atendimento/canais" element={<PortalConnectedChannelsPage />} />
              <Route path="atendimento/filas-handoff" element={<PortalHandoffQueuesPage />} />

              <Route path="marketing/landing-pages" element={<PortalLandingPagesPage />} />
              <Route path="marketing/formularios" element={<PortalExternalLeadFormsPage />} />
              <Route path="marketing/campanhas" element={<PortalCampaignsPage />} />
              <Route path="marketing/studio" element={<PortalMarketingStudioPage />} />
              <Route path="marketing/conteudo" element={<PortalOrganicContentPage />} />
              <Route path="marketing/calendario" element={<PortalEditorialCalendarPage />} />
              <Route path="marketing/criativos" element={<PortalCreativeAssetsPage />} />

              <Route path="automacoes/fluxos" element={safePortalPage('Fluxos de Automacao', 'Fluxos ativos, editor visual, gatilhos, condicoes e acoes.', ['Fluxos ativos', 'Editor visual', 'Pausar', 'Duplicar'])} />
              <Route path="automacoes/templates" element={safePortalPage('Templates de Automacao', 'Modelos prontos para ativar automacoes por jornada.', ['Templates por setor', 'Criar a partir de modelo', 'Preview de fluxo'])} />
              <Route path="automacoes/execucoes" element={safePortalPage('Execucoes de Automacao', 'Historico de execucoes, erros e consumo.', ['Execucoes', 'Erros', 'Creditos consumidos', 'Historico'])} />
              <Route path="automacoes/logs" element={safePortalPage('Logs de Automacao', 'Rastreamento operacional das automacoes contratadas.', ['Logs', 'Falhas', 'Tentativas', 'Diagnostico'])} />

              <Route path="projetos/projetos" element={<PortalProjectsPage />} />
              <Route path="projetos/aprovacoes" element={<PortalApprovalsPage />} />
              <Route path="projetos/documentos" element={<PortalDocumentsPage />} />
              <Route path="missoes" element={<LazyPage><PortalMissionsPage /></LazyPage>} />
              <Route path="missoes/:missionId" element={<LazyPage><PortalMissionDetailPage /></LazyPage>} />

              <Route path="relatorios" element={<PortalReportsPage />} />
              <Route path="suporte" element={<PortalSupportPage />} />
              <Route path="financeiro" element={<PortalFinancePage />} />
              <Route path="configuracoes/conta" element={<PortalAccountSettingsPage />} />
            </Route>
          </>
        )}

        {/* Client portal route */}
        {user?.role === 'client' && (
          <>
            <Route path="portal" element={<PortalDashboardPage />} />

            <Route path="portal/empresa/perfil" element={<PortalCompanyProfilePage />} />
            <Route path="portal/empresa/usuarios" element={<PortalCompanyUsersPage />} />
            <Route path="portal/empresa/conhecimento" element={<PortalKnowledgeBasePage />} />
            <Route path="portal/empresa/marca" element={<PortalBrandVoicePage />} />
            <Route path="portal/empresa/integracoes" element={<PortalCompanyIntegrationsPage />} />

            <Route path="portal/comercial/leads" element={<PortalCommercialLeadsPage />} />
            <Route path="portal/comercial/contas" element={<PortalCommercialAccountsPage />} />
            <Route path="portal/comercial/funis" element={<PortalCommercialFunnelsPage />} />
            <Route path="portal/comercial/tarefas" element={<PortalCommercialTasksPage />} />
            <Route path="portal/comercial/scoring" element={<PortalLeadScoringPage />} />

            <Route path="portal/atendimento/conversas" element={<PortalServiceConversationsPage />} />
            <Route path="portal/atendimento/agente-ia" element={<PortalAiAgentPage />} />
            <Route path="portal/atendimento/canais" element={<PortalConnectedChannelsPage />} />
            <Route path="portal/atendimento/filas-handoff" element={<PortalHandoffQueuesPage />} />

            <Route path="portal/marketing/landing-pages" element={<PortalLandingPagesPage />} />
            <Route path="portal/marketing/formularios" element={<PortalExternalLeadFormsPage />} />
            <Route path="portal/marketing/campanhas" element={<PortalCampaignsPage />} />
            <Route path="portal/marketing/studio" element={<PortalMarketingStudioPage />} />
            <Route path="portal/marketing/conteudo" element={<PortalOrganicContentPage />} />
            <Route path="portal/marketing/calendario" element={<PortalEditorialCalendarPage />} />
            <Route path="portal/marketing/criativos" element={<PortalCreativeAssetsPage />} />

            <Route path="portal/automacoes/fluxos" element={safePortalPage('Fluxos de Automacao', 'Fluxos ativos, editor visual, gatilhos, condicoes e acoes.', ['Fluxos ativos', 'Editor visual', 'Pausar', 'Duplicar'])} />
            <Route path="portal/automacoes/templates" element={safePortalPage('Templates de Automacao', 'Modelos prontos para ativar automacoes por jornada.', ['Templates por setor', 'Criar a partir de modelo', 'Preview de fluxo'])} />
            <Route path="portal/automacoes/execucoes" element={safePortalPage('Execucoes de Automacao', 'Historico de execucoes, erros e consumo.', ['Execucoes', 'Erros', 'Creditos consumidos', 'Historico'])} />
            <Route path="portal/automacoes/logs" element={safePortalPage('Logs de Automacao', 'Rastreamento operacional das automacoes contratadas.', ['Logs', 'Falhas', 'Tentativas', 'Diagnostico'])} />

            <Route path="portal/projetos/projetos" element={<PortalProjectsPage />} />
            <Route path="portal/projetos/aprovacoes" element={<PortalApprovalsPage />} />
            <Route path="portal/projetos/documentos" element={<PortalDocumentsPage />} />
            <Route path="portal/missoes" element={<LazyPage><PortalMissionsPage /></LazyPage>} />
            <Route path="portal/missoes/:missionId" element={<LazyPage><PortalMissionDetailPage /></LazyPage>} />

            <Route path="portal/relatorios" element={<PortalReportsPage />} />
            <Route path="portal/suporte" element={<PortalSupportPage />} />
            <Route path="portal/financeiro" element={<PortalFinancePage />} />
            <Route path="portal/configuracoes/conta" element={<PortalAccountSettingsPage />} />
            <Route path="portal/configuracoes/emails" element={<PortalEmailTemplatesPage />} />

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
        )}
      </Route>

      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
