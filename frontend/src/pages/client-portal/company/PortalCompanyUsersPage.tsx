import { Users } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCompanyUsersPage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Usuários e Equipe"
      description="Organiza quem acessa o portal, quais papéis existem e quais módulos cada pessoa pode usar."
      icon={Users}
      metrics={[
        { label: 'Papéis', value: '6 perfis', detail: 'Administrador, comercial, atendimento, marketing, financeiro e visualizador.' },
        { label: 'Permissões', value: 'Por módulo', detail: 'Acesso separado por área contratada.' },
        { label: 'Segurança', value: 'Acesso', detail: 'Último acesso e desativação de usuários.' },
      ]}
      capabilities={[
        'Convidar, remover, desativar e revisar usuários da empresa.',
        'Definir papéis como administrador, gestor comercial, atendente, marketing, financeiro e visualizador.',
        'Limitar acesso ao chat, financeiro, campanhas, relatórios e demais módulos.',
        'Consultar último acesso e separar permissões de usuário das configurações globais da empresa.',
      ]}
      secondaryActions={[
        { label: 'Configurações da Conta', href: '/portal/configuracoes/conta' },
        { label: 'Atendimento & IA', href: '/portal/atendimento/conversas' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
      note="A implementação persistente de convites e permissões entra na próxima fase; esta página fixa a jornada correta no portal."
    />
  )
}
