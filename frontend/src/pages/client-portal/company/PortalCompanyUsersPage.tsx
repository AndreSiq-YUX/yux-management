import { PortalPage } from '@/components/client-portal/PortalPage'
import { ClientUsersManager } from '@/components/clients/ClientUsersManager'
import { CrmMembersPanel } from '@/components/crm-governance/CrmMembersPanel'
import { CrmSeatUsagePanel } from '@/components/crm-governance/CrmSeatUsagePanel'
import { CrmTeamsPanel } from '@/components/crm-governance/CrmTeamsPanel'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalCompanyUsersPage() {
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const organization = usePlatformStore(state => state.organization)
  const isLoading = usePlatformStore(state => state.isLoading)
  const hasCrm = enabledModuleKeys.includes('crm')

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Equipe"
      description="Quem da sua empresa acessa o portal e o que cada pessoa pode fazer."
      help={[
        'Convidar pessoas por e-mail para criar a própria senha e entrar na conta da empresa.',
        'Definir o perfil de administrador da conta ou membro com acesso limitado.',
        'Consultar o último acesso, reenviar convites e desativar ou reativar usuários.',
        'Os papéis comerciais, as equipes e as vagas do CRM mantêm seus controles próprios.',
      ]}
      related={[
        { label: 'Minha conta', href: '/portal/configuracoes/conta' },
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
    >
      <div className="rounded-lg border bg-white p-4 sm:p-6">
        {isLoading ? (
          <p role="status" className="text-sm text-gray-500">Carregando a conta…</p>
        ) : organization?.clientId ? (
          <ClientUsersManager clientId={organization.clientId} />
        ) : (
          <p className="text-sm text-gray-600">Selecione uma conta de cliente para gerenciar os usuários.</p>
        )}
      </div>
      {hasCrm && (
        <div className="space-y-5">
          <CrmMembersPanel />
          <CrmTeamsPanel />
          <CrmSeatUsagePanel />
        </div>
      )}
    </PortalPage>
  )
}
