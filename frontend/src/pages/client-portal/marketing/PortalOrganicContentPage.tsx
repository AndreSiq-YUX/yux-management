import { FileText } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalOrganicContentPage() {
  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Conteúdo Orgânico"
      description="Organiza posts, artigos, roteiros, newsletters, ideias, aprovações, publicação e performance."
      icon={FileText}
      metrics={[
        { label: 'Formatos', value: 'Posts', detail: 'Artigos, newsletters e roteiros.' },
        { label: 'Status', value: 'Aprovação', detail: 'Aguardando, aprovado, publicado.' },
        { label: 'Canais', value: 'Orgânico', detail: 'Social, blog e newsletter.' },
      ]}
      capabilities={[
        'Ver conteúdos por canal, formato, status e etapa de aprovação.',
        'Acompanhar ideias, versões, CTA, notas e performance.',
        'Aprovar, pedir ajustes ou comentar conteúdos.',
        'Conectar conteúdo com Base de Conhecimento, tom de voz e calendário editorial.',
      ]}
      primaryAction={{ label: 'Abrir Marketing Studio', href: '/portal/marketing/studio' }}
      secondaryActions={[
        { label: 'Calendário Editorial', href: '/portal/marketing/calendario' },
        { label: 'Criativos e Assets', href: '/portal/marketing/criativos' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
      ]}
    />
  )
}
