import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

// Layout components
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { DashboardLayout } from '@/components/layouts/DashboardLayout'

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage'
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

// Client portal pages
import { PortalDashboardPage } from '@/pages/client-portal/PortalDashboardPage'
import { PortalCampaignsPage } from '@/pages/client-portal/PortalCampaignsPage'
import { PortalOmnichannelPage } from '@/pages/client-portal/PortalOmnichannelPage'
import { PortalProjectsPage } from '@/pages/client-portal/PortalProjectsPage'
import { PortalProposalsPage } from '@/pages/client-portal/PortalProposalsPage'
import { PortalFinancePage } from '@/pages/client-portal/PortalFinancePage'
import { PortalLandingPagesPage } from '@/pages/client-portal/PortalLandingPagesPage'
import { PortalReportsPage } from '@/pages/client-portal/PortalReportsPage'
import { PortalSupportPage } from '@/pages/client-portal/PortalSupportPage'
import { PortalCrmSettingsPage } from '@/pages/client-portal/PortalCrmSettingsPage'
import { BlueprintsPage } from '@/pages/platform/BlueprintsPage'
import { AdminHubPage } from '@/pages/platform/AdminHubPage'
import { ContractsPage } from '@/pages/platform/ContractsPage'
import { CrmGovernancePage } from '@/pages/platform/CrmGovernancePage'
import { ModuleSurfacePage } from '@/pages/platform/ModuleSurfacePage'
import { ModulesPage } from '@/pages/platform/ModulesPage'
import { PackagesPage } from '@/pages/platform/PackagesPage'

function App() {
  const { isAuthenticated, user } = useAuthStore()

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route index element={<Navigate to="/auth/login" replace />} />
      </Route>
      <Route path="/proposal/review/:token" element={<PublicProposalPage />} />
      <Route path="/webchat/session/:sessionToken" element={<WebchatWidgetPage />} />

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
        {user?.role !== 'client' && (
          <>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="admin" element={<AdminHubPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="packages" element={<PackagesPage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="crm-governance" element={<CrmGovernancePage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="proposals" element={<ProposalsPage />} />
            <Route path="omnichannel" element={<OmnichannelPage />} />
            <Route path="whatsapp-ai" element={<Navigate to="/omnichannel" replace />} />
            <Route path="landing-pages" element={<LandingPagesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="blueprints" element={<BlueprintsPage />} />
          </>
        )}

        {/* Client portal route */}
        {user?.role === 'client' && (
          <>
            <Route path="portal" element={<PortalDashboardPage />} />
            <Route path="portal/projects" element={<PortalProjectsPage />} />
            <Route path="portal/proposals" element={<PortalProposalsPage />} />
            <Route path="portal/crm" element={<LeadsPage />} />
            <Route path="portal/crm/settings" element={<PortalCrmSettingsPage />} />
            <Route path="portal/omnichannel" element={<PortalOmnichannelPage />} />
            <Route path="portal/whatsapp-ai" element={<Navigate to="/portal/omnichannel" replace />} />
            <Route path="portal/landing-pages" element={<PortalLandingPagesPage />} />
            <Route path="portal/campaigns" element={<PortalCampaignsPage />} />
            <Route path="portal/reports" element={<PortalReportsPage />} />
            <Route path="portal/support" element={<PortalSupportPage />} />
            <Route path="portal/finance" element={<PortalFinancePage />} />
          </>
        )}
      </Route>

      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
