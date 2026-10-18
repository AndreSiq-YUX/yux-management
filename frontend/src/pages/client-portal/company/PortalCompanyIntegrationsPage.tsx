import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Megaphone, MessageCircle, PlugZap, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { EmptyState, ErrorState, SkeletonCard, StatusChip, portalButtonClasses, type StatusChipVariant } from '@/components/portal-ui'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatRelativeTime, statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'
import type { MarketingPublishingConnectionStatus, MarketingPublishingProvider } from '@/types/marketingStudio'

const PUBLISHING_PROVIDER_LABELS: Record<MarketingPublishingProvider, string> = {
  wordpress: 'WordPress',
  meta_facebook: 'Facebook',
  meta_instagram: 'Instagram',
  google_business_profile: 'Perfil da empresa no Google',
}

const CAMPAIGN_PROVIDER_LABELS: Record<string, string> = {
  meta: 'Meta Ads (Facebook e Instagram)',
  google: 'Google Ads',
}

const CONNECTION_VARIANTS: Record<MarketingPublishingConnectionStatus, StatusChipVariant> = {
  connected: 'ok',
  needs_setup: 'warn',
  stale: 'warn',
  needs_reauth: 'warn',
  failed: 'crit',
  disabled: 'neutral',
}

interface ConnectionCardProps {
  icon: LucideIcon
  name: string
  kind: string
  status?: ReactNode
  detail: string
  href: string
  linkLabel: string
}

function ConnectionCard({ icon: Icon, name, kind, status, detail, href, linkLabel }: ConnectionCardProps) {
  const toWorkspace = usePortalWorkspacePath()
  return (
    <article className="flex flex-col gap-3 rounded-[10px] border border-yx-line bg-yx-surface p-4 text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04)] dark:shadow-none sm:flex-row sm:items-center">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-yx-blue-soft text-yx-blue">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-[15px] font-semibold leading-snug">{name}</h3>
          {status}
        </div>
        <p className="mt-0.5 text-xs text-yx-fg-3">{kind}</p>
        <p className="mt-1 text-[13px] text-yx-fg-2">{detail}</p>
      </div>
      <Link to={toWorkspace(href)} className={portalButtonClasses('ghost', 'shrink-0')}>
        {linkLabel}
        <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  )
}

export function PortalCompanyIntegrationsPage() {
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const {
    loading,
    error,
    campaigns,
    publishingConnections,
  } = usePortalMarketingContext({ resources: ['campaigns', 'publishingConnections'] })

  const connectedPublishing = publishingConnections.filter(connection => connection.status === 'connected')
  const campaignProviders = Array.from(new Set(campaigns.map(campaign => campaign.provider)))
  const hasChannels = enabledModuleKeys.includes('whatsapp_ai')
  const hasAnyConnection = publishingConnections.length > 0 || campaignProviders.length > 0 || hasChannels

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Conexões"
      description="Visão geral de todas as conexões da sua empresa: publicação de conteúdo, campanhas e canais de atendimento. Cada conexão é gerenciada na área a que pertence."
      metrics={[
        { label: 'Publicação conectada', value: String(connectedPublishing.length), detail: `De ${publishingConnections.length} conexões de publicação.` },
        { label: 'Provedores de campanha', value: String(campaignProviders.length), detail: 'Em uso nas suas campanhas.' },
      ]}
      help={[
        'Veja em um só lugar o que está conectado e quando foi a última verificação.',
        'Para conectar, reconectar ou desconectar, abra a área indicada em cada cartão.',
        'Canais de atendimento, como o WhatsApp, continuam sendo gerenciados em Atendimento.',
      ]}
      related={[
        ...(hasChannels ? [{ label: 'Canais de atendimento', href: '/portal/atendimento/canais' }] : []),
        ...(enabledModuleKeys.includes('campaigns') ? [{ label: 'Campanhas', href: '/portal/marketing/campanhas' }] : []),
        ...(enabledModuleKeys.includes('marketing_studio') ? [{ label: 'Marketing Studio', href: '/portal/marketing/studio' }] : []),
      ]}
    >
      {error ? (
        <ErrorState title="Não foi possível carregar as conexões." description={error} />
      ) : loading ? (
        <SkeletonCard lines={4} />
      ) : !hasAnyConnection ? (
        <EmptyState
          icon={PlugZap}
          title="Nenhuma conexão por aqui ainda"
          description="Quando você conectar um site, uma rede social, uma conta de anúncios ou um canal de atendimento, ele aparece aqui com o status e a última verificação."
        />
      ) : (
        <div className="space-y-3">
          {publishingConnections.map(connection => (
            <ConnectionCard
              key={connection.id}
              icon={Send}
              name={connection.name}
              kind={`Publicação de conteúdo · ${PUBLISHING_PROVIDER_LABELS[connection.provider] ?? connection.provider}`}
              status={<StatusChip variant={CONNECTION_VARIANTS[connection.status] ?? 'neutral'}>{statusLabel(connection.status)}</StatusChip>}
              detail={
                connection.lastVerifiedAt || connection.lastHealthCheckAt
                  ? `Última verificação ${formatRelativeTime(connection.lastVerifiedAt || connection.lastHealthCheckAt)}.`
                  : 'Ainda não verificada.'
              }
              href="/portal/marketing/studio"
              linkLabel="Gerenciar no Marketing Studio"
            />
          ))}
          {campaignProviders.map(provider => {
            const providerCampaigns = campaigns.filter(campaign => campaign.provider === provider)
            const latest = providerCampaigns.map(campaign => campaign.updatedAt).filter(Boolean).sort().at(-1)
            return (
              <ConnectionCard
                key={provider}
                icon={Megaphone}
                name={CAMPAIGN_PROVIDER_LABELS[provider] ?? provider}
                kind="Campanhas de anúncios"
                status={<StatusChip variant="ok">Em uso</StatusChip>}
                detail={`${providerCampaigns.length} ${providerCampaigns.length === 1 ? 'campanha' : 'campanhas'}${latest ? ` · última atualização ${formatRelativeTime(latest)}` : ''}.`}
                href="/portal/marketing/campanhas"
                linkLabel="Gerenciar em Campanhas"
              />
            )
          })}
          {hasChannels ? (
            <ConnectionCard
              icon={MessageCircle}
              name="Canais de atendimento"
              kind="WhatsApp e outros canais"
              detail="Conecte e acompanhe os canais de atendimento na área de Atendimento."
              href="/portal/atendimento/canais"
              linkLabel="Abrir canais de atendimento"
            />
          ) : null}
        </div>
      )}
    </PortalPage>
  )
}
