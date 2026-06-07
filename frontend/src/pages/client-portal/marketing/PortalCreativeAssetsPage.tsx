import { Image } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCreativeAssetsPage() {
  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Criativos e Assets"
      description="Biblioteca de imagens, vídeos, copies, variações de anúncios, peças aprovadas e arquivos da marca."
      icon={Image}
      metrics={[
        { label: 'Biblioteca', value: 'Assets', detail: 'Arquivos e referências.' },
        { label: 'Criativos', value: 'Anúncios', detail: 'Variações e copies.' },
        { label: 'Aprovação', value: 'Peças', detail: 'Comentários e decisões.' },
      ]}
      capabilities={[
        'Organizar imagens, vídeos, copies e variações de anúncios.',
        'Separar peças aprovadas, em revisão e com ajuste solicitado.',
        'Conectar arquivos da marca com campanhas, landing pages e conteúdo orgânico.',
        'Apoiar comentários e aprovações em materiais visuais.',
      ]}
      primaryAction={{ label: 'Abrir Campanhas', href: '/portal/marketing/campanhas' }}
      secondaryActions={[
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Conteúdo Orgânico', href: '/portal/marketing/conteudo' },
        { label: 'Landing Pages', href: '/portal/marketing/landing-pages' },
      ]}
    />
  )
}
