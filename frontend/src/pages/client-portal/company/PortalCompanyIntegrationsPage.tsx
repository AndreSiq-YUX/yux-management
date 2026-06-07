import { PlugZap } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalCompanyIntegrationsPage() {
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const {
    loading,
    error,
    campaigns,
    publishingConnections,
  } = usePortalMarketingContext({ includeCampaigns: true, includeOperations: true })

  const connectedPublishing = publishingConnections.filter(connection => connection.status === 'connected')
  const campaignProviders = new Set(campaigns.map(campaign => campaign.provider))
  const channelModules = [
    { label: 'WhatsApp / Atendimento', enabled: enabledModuleKeys.includes('whatsapp_ai') },
    { label: 'Campanhas Meta ou Google', enabled: enabledModuleKeys.includes('campaigns') || campaignProviders.size > 0 },
    { label: 'Landing Pages', enabled: enabledModuleKeys.includes('landing_pages') },
    { label: 'Marketing Studio', enabled: enabledModuleKeys.includes('marketing_studio') },
  ]

  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Integracoes da Empresa"
      description="Conexoes do cliente com canais, midia, publicacao, calendario, planilhas e automacoes externas."
      icon={PlugZap}
      metrics={[
        { label: 'Modulos', value: String(channelModules.filter(module => module.enabled).length), detail: 'Areas contratadas que dependem de integracao.' },
        { label: 'Publicacao', value: String(connectedPublishing.length), detail: 'Conexoes conectadas para conteudo.' },
        { label: 'Campanhas', value: String(campaignProviders.size), detail: 'Provedores usados em campanhas.' },
      ]}
      capabilities={[
        'WhatsApp, Instagram, Facebook Messenger, Meta Ads, Google Ads e WordPress.',
        'Google Calendar, Google Sheets e webhooks para fluxos operacionais.',
        'Status da conexao, reconexao, permissoes e ultima sincronizacao.',
        'Logs basicos do cliente, sem expor provedores ou segredos globais da plataforma.',
      ]}
      secondaryActions={[
        { label: 'Canais de Atendimento', href: '/portal/atendimento/canais' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
        { label: 'Landing Pages', href: '/portal/marketing/landing-pages' },
      ]}
      note="Integracoes globais, provedores e custos continuam restritos a Administracao da Plataforma."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Conexoes de publicacao</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando integracoes...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {publishingConnections.map(connection => (
                <div key={connection.id} className="rounded-md border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{connection.name}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(connection.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {connection.provider} - ultima verificacao {formatPortalDateTime(connection.lastVerifiedAt || connection.lastHealthCheckAt)}
                  </p>
                </div>
              ))}
              {!publishingConnections.length && (
                <p className="text-sm text-gray-600">Nenhuma conexao de publicacao configurada para este contrato.</p>
              )}
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Disponibilidade por area</h2>
          <div className="mt-4 space-y-2">
            {channelModules.map(module => (
              <div key={module.label} className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{module.label}</span>
                <span className={module.enabled ? 'text-emerald-700' : 'text-gray-500'}>
                  {module.enabled ? 'ativo' : 'nao contratado'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </PortalJourneyPage>
  )
}
