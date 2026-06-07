import { Building2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCompanyProfilePage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Perfil da Empresa"
      description="Centraliza dados institucionais e comerciais que orientam atendimento, marketing, campanhas e relatórios."
      icon={Building2}
      metrics={[
        { label: 'Cadastro', value: 'Empresa', detail: 'Dados do negócio e presença digital.' },
        { label: 'Atendimento', value: 'Horarios', detail: 'Regras de operação e regiões atendidas.' },
        { label: 'Ofertas', value: 'Produtos', detail: 'Produtos, serviços e diferenciais.' },
      ]}
      capabilities={[
        'Dados da empresa, segmento, descrição, site e redes sociais.',
        'Telefone, endereço, horários de atendimento e regiões atendidas.',
        'Produtos e serviços principais, diferenciais e posicionamento.',
        'Observações internas que ajudam a YUX e os agentes a contextualizar a operação.',
      ]}
      secondaryActions={[
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Integrações', href: '/portal/empresa/integracoes' },
      ]}
      note="Nesta fase, esta pagina define a responsabilidade de produto e evita misturar dados da empresa com Configuracoes da Conta."
    />
  )
}
