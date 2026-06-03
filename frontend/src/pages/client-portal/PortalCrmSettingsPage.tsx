import { CrmMembersPanel } from '@/components/crm-governance/CrmMembersPanel'
import { CrmConfigurationDraftPanel } from '@/components/crm-governance/CrmConfigurationDraftPanel'
import { CrmPublicationWizard } from '@/components/crm-governance/CrmPublicationWizard'
import { CrmSeatUsagePanel } from '@/components/crm-governance/CrmSeatUsagePanel'
import { CrmTeamsPanel } from '@/components/crm-governance/CrmTeamsPanel'

export function PortalCrmSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-gray-900">Configuracoes do CRM</h1>
        <p className="mt-1 text-sm text-gray-600">
          Gerencie usuarios, equipes e operacao comercial dentro do contrato ativo.
        </p>
      </div>
      <CrmSeatUsagePanel />
      <CrmMembersPanel />
      <CrmTeamsPanel />
      <CrmConfigurationDraftPanel />
      <CrmPublicationWizard impactedOpenLeadCount={0} selectedStrategy="keep_existing" />
    </div>
  )
}
