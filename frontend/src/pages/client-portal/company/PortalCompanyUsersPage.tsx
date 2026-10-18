import { PortalPage } from '@/components/client-portal/PortalPage'
import { CrmMembersPanel } from '@/components/crm-governance/CrmMembersPanel'
import { CrmSeatUsagePanel } from '@/components/crm-governance/CrmSeatUsagePanel'
import { CrmTeamsPanel } from '@/components/crm-governance/CrmTeamsPanel'
import { PendingSection } from '@/components/portal-ui'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalCompanyUsersPage() {
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const hasCrm = enabledModuleKeys.includes('crm')

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Equipe"
      description="Quem da sua empresa acessa o portal e o que cada pessoa pode fazer."
      help={[
        'Convidar, desativar e revisar as pessoas da empresa que usam o portal.',
        'Definir papéis, como administrador, gestor comercial, atendente, marketing, financeiro e visualizador.',
        'Limitar o acesso por área contratada, como atendimento, financeiro, campanhas e relatórios.',
        'Consultar o último acesso de cada pessoa.',
      ]}
      related={[
        { label: 'Minha conta', href: '/portal/configuracoes/conta' },
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
    >
      {hasCrm ? (
        <div className="space-y-5">
          <CrmMembersPanel />
          <CrmTeamsPanel />
          <CrmSeatUsagePanel />
        </div>
      ) : (
        <PendingSection
          code="B4"
          title="Gestão da equipe"
          description="Aqui você vai convidar pessoas, definir papéis e desativar acessos da sua empresa."
        />
      )}
    </PortalPage>
  )
}
