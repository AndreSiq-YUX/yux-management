import { Building2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCommercialAccountsPage() {
  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Empresas / Contas"
      description="Área para clientes B2B acompanharem empresas prospectadas, contatos, potencial e oportunidades vinculadas."
      icon={Building2}
      metrics={[
        { label: 'Modelo', value: 'B2B', detail: 'Contas e empresas prospectadas.' },
        { label: 'Relacionamento', value: 'Contatos', detail: 'Pessoas vinculadas a cada conta.' },
        { label: 'Histórico', value: 'Comercial', detail: 'Conversas, tarefas e propostas.' },
      ]}
      capabilities={[
        'Cadastrar empresas prospectadas com segmento, porte, potencial, CNPJ e site.',
        'Vincular contatos, responsável comercial, oportunidades e propostas.',
        'Consultar histórico de interações, conversas, tarefas e follow-ups por conta.',
        'Separar vendas B2B estruturadas da lista simples de leads.',
      ]}
      secondaryActions={[
        { label: 'Leads', href: '/portal/comercial/leads' },
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    />
  )
}
