import { Users } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCompanyUsersPage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Usuarios e Equipe"
      description="Organiza quem acessa o portal, quais papeis existem e quais modulos cada pessoa pode usar."
      icon={Users}
      metrics={[
        { label: 'Papeis', value: '6 perfis', detail: 'Administrador, comercial, atendimento, marketing, financeiro e visualizador.' },
        { label: 'Permissoes', value: 'Por modulo', detail: 'Acesso separado por area contratada.' },
        { label: 'Seguranca', value: 'Acesso', detail: 'Ultimo acesso e desativacao de usuarios.' },
      ]}
      capabilities={[
        'Convidar, remover, desativar e revisar usuarios da empresa.',
        'Definir papeis como administrador, gestor comercial, atendente, marketing, financeiro e visualizador.',
        'Limitar acesso ao chat, financeiro, campanhas, relatorios e demais modulos.',
        'Consultar ultimo acesso e separar permissoes de usuario das configuracoes globais da empresa.',
      ]}
      secondaryActions={[
        { label: 'Configuracoes da Conta', href: '/portal/configuracoes/conta' },
        { label: 'Atendimento & IA', href: '/portal/atendimento/conversas' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
      note="Convites, desativacoes e mudancas de permissao devem ser executados por administradores autorizados para manter rastreabilidade de acesso."
    />
  )
}
