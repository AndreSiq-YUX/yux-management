import { Image } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalCreativeAssetsPage() {
  const {
    loading,
    error,
    campaigns,
    creativeSuggestions,
    brandProfile,
  } = usePortalMarketingContext({ includeCampaigns: true, includeOperations: true })

  const campaignCreatives = campaigns.flatMap(campaign => campaign.creatives || [])
  const approvedSuggestions = countItems(creativeSuggestions, suggestion => suggestion.status === 'approved')

  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Criativos e Assets"
      description="Biblioteca de imagens, videos, copies, variacoes de anuncios, pecas aprovadas e arquivos da marca."
      icon={Image}
      metrics={[
        { label: 'Criativos', value: String(campaignCreatives.length), detail: 'Pecas ligadas a campanhas.' },
        { label: 'Sugestoes IA', value: String(creativeSuggestions.length), detail: `${approvedSuggestions} aprovadas.` },
        { label: 'Marca', value: brandProfile?.visualGuidelines ? 'Com guia' : 'Pendente', detail: 'Diretrizes visuais para criacao.' },
      ]}
      capabilities={[
        'Organizar imagens, videos, copies e variacoes de anuncios.',
        'Separar pecas aprovadas, em revisao e com ajuste solicitado.',
        'Conectar arquivos da marca com campanhas, landing pages e conteudo organico.',
        'Apoiar comentarios e aprovacoes em materiais visuais.',
      ]}
      primaryAction={{ label: 'Abrir Campanhas', href: '/portal/marketing/campanhas' }}
      secondaryActions={[
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Conteudo Organico', href: '/portal/marketing/conteudo' },
        { label: 'Landing Pages', href: '/portal/marketing/landing-pages' },
      ]}
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Criativos de campanhas</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando criativos...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {campaignCreatives.slice(0, 6).map(creative => (
                <div key={creative.id} className="rounded-md border bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{creative.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{creative.format} - atualizado em {formatPortalDate(creative.updatedAt)}</p>
                  {creative.headline && <p className="mt-2 text-xs text-gray-700">{creative.headline}</p>}
                </div>
              ))}
              {!campaignCreatives.length && (
                <p className="text-sm text-gray-600">Nenhum criativo de campanha cadastrado para este contrato.</p>
              )}
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Sugestoes de criativos</h2>
          <div className="mt-4 space-y-3">
            {creativeSuggestions.slice(0, 6).map(suggestion => (
              <div key={suggestion.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{suggestion.title}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(suggestion.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{suggestion.provider} - {statusLabel(suggestion.funnelStage)}</p>
                <p className="mt-2 line-clamp-2 text-xs text-gray-700">{suggestion.angle}</p>
              </div>
            ))}
            {!creativeSuggestions.length && (
              <p className="text-sm text-gray-600">Nenhuma sugestao de criativo gerada pelo Marketing Studio.</p>
            )}
          </div>
        </article>
      </section>
    </PortalJourneyPage>
  )
}
