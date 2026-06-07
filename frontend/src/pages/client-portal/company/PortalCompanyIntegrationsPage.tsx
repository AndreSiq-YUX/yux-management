import { PlugZap } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalCompanyIntegrationsPage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Integrações da Empresa"
      description="Conexões do cliente com canais, mídia, publicação, calendário, planilhas e automações externas."
      icon={PlugZap}
      metrics={[
        { label: 'Canais', value: 'WhatsApp', detail: 'Atendimento e conversas.' },
        { label: 'Mídia', value: 'Meta/Google', detail: 'Campanhas e métricas.' },
        { label: 'Publicação', value: 'WordPress', detail: 'Conteúdo e landing pages.' },
      ]}
      capabilities={[
        'WhatsApp, Instagram, Facebook Messenger, Meta Ads, Google Ads e WordPress.',
        'Google Calendar, Google Sheets e webhooks para fluxos operacionais.',
        'Status da conexão, reconexão, permissões e última sincronização.',
        'Logs básicos do cliente, sem expor provedores ou segredos globais da plataforma.',
      ]}
      secondaryActions={[
        { label: 'Canais de Atendimento', href: '/portal/atendimento/canais' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
        { label: 'Landing Pages', href: '/portal/marketing/landing-pages' },
      ]}
      note="Integrações globais, provedores e custos continuam restritos à Administração da Plataforma."
    />
  )
}
