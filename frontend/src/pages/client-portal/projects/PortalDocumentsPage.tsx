import { FolderArchive } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalDocumentsPage() {
  return (
    <PortalJourneyPage
      eyebrow="Projetos"
      title="Documentos"
      description="Centraliza contratos, propostas, relatórios, arquivos de campanha, manuais, materiais enviados e documentos da empresa."
      icon={FolderArchive}
      metrics={[
        { label: 'Comercial', value: 'Contratos', detail: 'Propostas e acordos.' },
        { label: 'Entrega', value: 'Materiais', detail: 'Arquivos de projeto e campanha.' },
        { label: 'Permissões', value: 'Acesso', detail: 'Documentos por papel.' },
      ]}
      capabilities={[
        'Consultar contratos, propostas, relatórios e documentos de projeto.',
        'Organizar arquivos de campanha, manuais, materiais enviados e documentos da empresa.',
        'Separar documentos visíveis ao cliente de materiais internos da YUX.',
        'Preparar permissões por papel para financeiro, marketing, comercial e visualizadores.',
      ]}
      secondaryActions={[
        { label: 'Projetos', href: '/portal/projetos/projetos' },
        { label: 'Aprovações', href: '/portal/projetos/aprovacoes' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
    />
  )
}
