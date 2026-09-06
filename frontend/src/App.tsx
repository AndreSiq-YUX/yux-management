import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'

// Layout components
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { DashboardLayout } from '@/components/layouts/DashboardLayout'
import { RouteLoadBoundary } from '@/components/routing/RouteLoadBoundary'

import { ClientWorkspaceLayout } from '@/pages/client-workspaces/ClientWorkspaceLayout'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(module => ({ default: module.LoginPage })))
const SetPasswordPage = lazy(() => import('@/pages/auth/SetPasswordPage').then(module => ({ default: module.SetPasswordPage })))
const PublicProposalPage = lazy(() => import('@/pages/public/PublicProposalPage').then(module => ({ default: module.PublicProposalPage })))
const WebchatWidgetPage = lazy(() => import('@/pages/webchat/WebchatWidgetPage').then(module => ({ default: module.WebchatWidgetPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })))
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage').then(module => ({ default: module.ClientsPage })))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage').then(module => ({ default: module.ProjectsPage })))
const CampaignsPage = lazy(() => import('@/pages/campaigns/CampaignsPage').then(module => ({ default: module.CampaignsPage })))
const LeadsPage = lazy(() => import('@/pages/leads/LeadsPage').then(module => ({ default: module.LeadsPage })))
const ProposalsPage = lazy(() => import('@/pages/proposals/ProposalsPage').then(module => ({ default: module.ProposalsPage })))
const OmnichannelPage = lazy(() => import('@/pages/omnichannel/OmnichannelPage').then(module => ({ default: module.OmnichannelPage })))
const FinancePage = lazy(() => import('@/pages/finance/FinancePage').then(module => ({ default: module.FinancePage })))
const LandingPagesPage = lazy(() => import('@/pages/landing-pages/LandingPagesPage').then(module => ({ default: module.LandingPagesPage })))
const SupportPage = lazy(() => import('@/pages/support/SupportPage').then(module => ({ default: module.SupportPage })))
const AutomationsPage = lazy(() => import('@/pages/automations/AutomationsPage').then(module => ({ default: module.AutomationsPage })))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then(module => ({ default: module.ReportsPage })))
const MarketingStudioPage = lazy(() => import('@/pages/marketing-studio/MarketingStudioPage').then(module => ({ default: module.MarketingStudioPage })))
const ClientWorkspaceSelectorPage = lazy(() => import('@/pages/client-workspaces/ClientWorkspaceSelectorPage').then(module => ({ default: module.ClientWorkspaceSelectorPage })))
const PortalDashboardPage = lazy(() => import('@/pages/client-portal/PortalDashboardPage').then(module => ({ default: module.PortalDashboardPage })))
const PortalCampaignsPage = lazy(() => import('@/pages/client-portal/PortalCampaignsPage').then(module => ({ default: module.PortalCampaignsPage })))
const PortalConnectedChannelsPage = lazy(() => import('@/pages/client-portal/PortalConnectedChannelsPage').then(module => ({ default: module.PortalConnectedChannelsPage })))
const PortalProjectsPage = lazy(() => import('@/pages/client-portal/PortalProjectsPage').then(module => ({ default: module.PortalProjectsPage })))
const PortalFinancePage = lazy(() => import('@/pages/client-portal/PortalFinancePage').then(module => ({ default: module.PortalFinancePage })))
const PortalLandingPagesPage = lazy(() => import('@/pages/client-portal/PortalLandingPagesPage').then(module => ({ default: module.PortalLandingPagesPage })))
const PortalExternalLeadFormsPage = lazy(() => import('@/pages/client-portal/PortalExternalLeadFormsPage').then(module => ({ default: module.PortalExternalLeadFormsPage })))
const PortalMarketingStudioPage = lazy(() => import('@/pages/client-portal/PortalMarketingStudioPage').then(module => ({ default: module.PortalMarketingStudioPage })))
const PortalReportsPage = lazy(() => import('@/pages/client-portal/PortalReportsPage').then(module => ({ default: module.PortalReportsPage })))
const PortalSupportPage = lazy(() => import('@/pages/client-portal/PortalSupportPage').then(module => ({ default: module.PortalSupportPage })))
const PortalAccountSettingsPage = lazy(() => import('@/pages/client-portal/PortalAccountSettingsPage').then(module => ({ default: module.PortalAccountSettingsPage })))
const PortalApprovalsPage = lazy(() => import('@/pages/client-portal/PortalApprovalsPage').then(module => ({ default: module.PortalApprovalsPage })))
const PortalAutomationsPage = lazy(() => import('@/pages/client-portal/PortalAutomationsPage').then(module => ({ default: module.PortalAutomationsPage })))
const PortalEmailTemplatesPage = lazy(() => import('@/pages/client-portal/PortalEmailTemplatesPage').then(module => ({ default: module.PortalEmailTemplatesPage })))
const PortalCommercialAccountsPage = lazy(() => import('@/pages/client-portal/commercial/PortalCommercialAccountsPage').then(module => ({ default: module.PortalCommercialAccountsPage })))
const PortalCommercialFunnelsPage = lazy(() => import('@/pages/client-portal/commercial/PortalCommercialFunnelsPage').then(module => ({ default: module.PortalCommercialFunnelsPage })))
const PortalCommercialLeadsPage = lazy(() => import('@/pages/client-portal/commercial/PortalCommercialLeadsPage').then(module => ({ default: module.PortalCommercialLeadsPage })))
const PortalCommercialRadarPage = lazy(() => import('@/pages/client-portal/commercial/PortalCommercialRadarPage').then(module => ({ default: module.PortalCommercialRadarPage })))
const PortalCommercialTasksPage = lazy(() => import('@/pages/client-portal/commercial/PortalCommercialTasksPage').then(module => ({ default: module.PortalCommercialTasksPage })))
const PortalLeadScoringPage = lazy(() => import('@/pages/client-portal/commercial/PortalLeadScoringPage').then(module => ({ default: module.PortalLeadScoringPage })))
const PortalBrandVoicePage = lazy(() => import('@/pages/client-portal/company/PortalBrandVoicePage').then(module => ({ default: module.PortalBrandVoicePage })))
const PortalCompanyIntegrationsPage = lazy(() => import('@/pages/client-portal/company/PortalCompanyIntegrationsPage').then(module => ({ default: module.PortalCompanyIntegrationsPage })))
const PortalCompanyProfilePage = lazy(() => import('@/pages/client-portal/company/PortalCompanyProfilePage').then(module => ({ default: module.PortalCompanyProfilePage })))
const PortalCompanyUsersPage = lazy(() => import('@/pages/client-portal/company/PortalCompanyUsersPage').then(module => ({ default: module.PortalCompanyUsersPage })))
const PortalKnowledgeBasePage = lazy(() => import('@/pages/client-portal/company/PortalKnowledgeBasePage').then(module => ({ default: module.PortalKnowledgeBasePage })))
const PortalCreativeAssetsPage = lazy(() => import('@/pages/client-portal/marketing/PortalCreativeAssetsPage').then(module => ({ default: module.PortalCreativeAssetsPage })))
const PortalEditorialCalendarPage = lazy(() => import('@/pages/client-portal/marketing/PortalEditorialCalendarPage').then(module => ({ default: module.PortalEditorialCalendarPage })))
const PortalOrganicContentPage = lazy(() => import('@/pages/client-portal/marketing/PortalOrganicContentPage').then(module => ({ default: module.PortalOrganicContentPage })))
const PortalDocumentsPage = lazy(() => import('@/pages/client-portal/projects/PortalDocumentsPage').then(module => ({ default: module.PortalDocumentsPage })))
const PortalAiAgentPage = lazy(() => import('@/pages/client-portal/service-ai/PortalAiAgentPage').then(module => ({ default: module.PortalAiAgentPage })))
const PortalHandoffQueuesPage = lazy(() => import('@/pages/client-portal/service-ai/PortalHandoffQueuesPage').then(module => ({ default: module.PortalHandoffQueuesPage })))
const PortalServiceConversationsPage = lazy(() => import('@/pages/client-portal/service-ai/PortalServiceConversationsPage').then(module => ({ default: module.PortalServiceConversationsPage })))
const BlueprintsPage = lazy(() => import('@/pages/platform/BlueprintsPage').then(module => ({ default: module.BlueprintsPage })))
const AdminHubPage = lazy(() => import('@/pages/platform/AdminHubPage').then(module => ({ default: module.AdminHubPage })))
const AdminAiPage = lazy(() => import('@/pages/platform/AdminAiPage').then(module => ({ default: module.AdminAiPage })))
const AdminChannelsPage = lazy(() => import('@/pages/platform/AdminChannelsPage').then(module => ({ default: module.AdminChannelsPage })))
const AdminEmailPage = lazy(() => import('@/pages/platform/AdminEmailPage').then(module => ({ default: module.AdminEmailPage })))
const AdminSystemEmailTemplatesPage = lazy(() => import('@/pages/platform/AdminSystemEmailTemplatesPage').then(module => ({ default: module.AdminSystemEmailTemplatesPage })))
const AdminHealthPage = lazy(() => import('@/pages/platform/AdminHealthPage').then(module => ({ default: module.AdminHealthPage })))
const AdminIntegrationsPage = lazy(() => import('@/pages/platform/AdminIntegrationsPage').then(module => ({ default: module.AdminIntegrationsPage })))
const AdminModuleGovernancePage = lazy(() => import('@/pages/platform/AdminModuleGovernancePage').then(module => ({ default: module.AdminModuleGovernancePage })))
const AdminLimitsPage = lazy(() => import('@/pages/platform/AdminLimitsPage').then(module => ({ default: module.AdminLimitsPage })))
const StrategyEnginePage = lazy(() => import('@/pages/platform/StrategyEnginePage').then(module => ({ default: module.StrategyEnginePage })))
const ClientConversionsPage = lazy(() => import('@/pages/platform/ClientConversionsPage').then(module => ({ default: module.ClientConversionsPage })))
const ContractsPage = lazy(() => import('@/pages/platform/ContractsPage').then(module => ({ default: module.ContractsPage })))
const CrmGovernancePage = lazy(() => import('@/pages/platform/CrmGovernancePage').then(module => ({ default: module.CrmGovernancePage })))
const ModulesPage = lazy(() => import('@/pages/platform/ModulesPage').then(module => ({ default: module.ModulesPage })))
const PackagesPage = lazy(() => import('@/pages/platform/PackagesPage').then(module => ({ default: module.PackagesPage })))

const MissionsPage = lazy(() => import('@/pages/action-engine/MissionsPage').then(module => ({ default: module.MissionsPage })))
const MissionDetailPage = lazy(() => import('@/pages/action-engine/MissionDetailPage').then(module => ({ default: module.MissionDetailPage })))
const MissionConversationPage = lazy(() => import('@/pages/action-engine/MissionConversationPage').then(module => ({ default: module.MissionConversationPage })))
const PortalMissionsPage = lazy(() => import('@/pages/client-portal/PortalMissionsPage').then(module => ({ default: module.PortalMissionsPage })))
const PortalMissionDetailPage = lazy(() => import('@/pages/client-portal/PortalMissionDetailPage').then(module => ({ default: module.PortalMissionDetailPage })))
const PortalMissionConversationPage = lazy(() => import('@/pages/client-portal/PortalMissionConversationPage').then(module => ({ default: module.PortalMissionConversationPage })))
const MissionSimulationReviewPage = lazy(() => import('@/pages/public/MissionSimulationReviewPage').then(module => ({ default: module.MissionSimulationReviewPage })))
const MissionLearningPage = lazy(() => import('@/pages/platform/MissionLearningPage').then(module => ({ default: module.MissionLearningPage })))

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

  return (
    <RouteLoadBoundary label="Abrindo aplicacao...">
      <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="set-password" element={<SetPasswordPage />} />
        <Route index element={<Navigate to="/auth/login" replace />} />
      </Route>
      <Route path="/proposal/review/:token" element={<PublicProposalPage />} />
      <Route path="/mission-simulation/review/:token" element={<MissionSimulationReviewPage />} />
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
            <Route path="admin/mission-learning" element={<RequireRole roles={['admin']}><MissionLearningPage /></RequireRole>} />
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
            <Route path="missions" element={<MissionsPage />} />
            <Route path="missions/conversations/:conversationId" element={<MissionConversationPage />} />
            <Route path="missions/:missionId" element={<MissionDetailPage />} />
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

              <Route path="automacoes/fluxos" element={<PortalAutomationsPage section="Automacoes" />} />
              <Route path="automacoes/templates" element={<PortalAutomationsPage section="Templates" />} />
              <Route path="automacoes/execucoes" element={<PortalAutomationsPage section="Execucoes" />} />
              <Route path="automacoes/logs" element={<PortalAutomationsPage section="Execucoes" />} />

              <Route path="projetos/projetos" element={<PortalProjectsPage />} />
              <Route path="projetos/aprovacoes" element={<PortalApprovalsPage />} />
              <Route path="projetos/documentos" element={<PortalDocumentsPage />} />
              <Route path="missoes" element={<PortalMissionsPage />} />
              <Route path="missoes/conversas/:conversationId" element={<PortalMissionConversationPage />} />
              <Route path="missoes/:missionId" element={<PortalMissionDetailPage />} />

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

            <Route path="portal/automacoes/fluxos" element={<PortalAutomationsPage section="Automacoes" />} />
            <Route path="portal/automacoes/templates" element={<PortalAutomationsPage section="Templates" />} />
            <Route path="portal/automacoes/execucoes" element={<PortalAutomationsPage section="Execucoes" />} />
            <Route path="portal/automacoes/logs" element={<PortalAutomationsPage section="Execucoes" />} />

            <Route path="portal/projetos/projetos" element={<PortalProjectsPage />} />
            <Route path="portal/projetos/aprovacoes" element={<PortalApprovalsPage />} />
            <Route path="portal/projetos/documentos" element={<PortalDocumentsPage />} />
            <Route path="portal/missoes" element={<PortalMissionsPage />} />
            <Route path="portal/missoes/conversas/:conversationId" element={<PortalMissionConversationPage />} />
            <Route path="portal/missoes/:missionId" element={<PortalMissionDetailPage />} />

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
    </RouteLoadBoundary>
  )
}

export default App
