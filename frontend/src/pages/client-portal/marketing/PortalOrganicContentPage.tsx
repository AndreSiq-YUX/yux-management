import { FileText } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import type { MarketingContentType } from '@/types/marketingStudio'

const organicTypes = new Set<MarketingContentType>([
  'social_post',
  'blog_article',
  'newsletter',
  'email',
  'video_script',
  'carousel_text',
])

export function PortalOrganicContentPage() {
  const {
    loading,
    error,
    contents,
    reviews,
    brandProfile,
  } = usePortalMarketingContext()

  const organicContents = contents.filter(content => organicTypes.has(content.contentType))
  const pendingReviews = reviews.filter(review => review.status === 'pending')

  return (
    <PortalJourneyPage
      eyebrow="Marketing"
      title="Conteudo Organico"
      description="Organiza posts, artigos, roteiros, newsletters, ideias, aprovacoes, publicacao e performance."
      icon={FileText}
      metrics={[
        { label: 'Conteudos', value: String(organicContents.length), detail: `${countItems(organicContents, item => item.status === 'published')} publicados.` },
        { label: 'Aprovacao', value: String(pendingReviews.length), detail: 'Revisoes pendentes no Marketing Studio.' },
        { label: 'Marca', value: brandProfile ? 'Com tom' : 'Pendente', detail: brandProfile?.toneOfVoice || 'Tom de voz ainda nao definido.' },
      ]}
      capabilities={[
        'Ver conteudos por canal, formato, status e etapa de aprovacao.',
        'Acompanhar ideias, versoes, CTA, notas e performance.',
        'Aprovar, pedir ajustes ou comentar conteudos.',
        'Conectar conteudo com Base de Conhecimento, tom de voz e calendario editorial.',
      ]}
      primaryAction={{ label: 'Abrir Marketing Studio', href: '/portal/marketing/studio' }}
      secondaryActions={[
        { label: 'Calendario Editorial', href: '/portal/marketing/calendario' },
        { label: 'Criativos e Assets', href: '/portal/marketing/criativos' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Fila de conteudo</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Carregando conteudos...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {organicContents.slice(0, 8).map(content => (
              <article key={content.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{content.title}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(content.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {statusLabel(content.contentType)} - {content.channel} - atualizado em {formatPortalDate(content.updatedAt)}
                </p>
                {content.cta && <p className="mt-2 text-xs text-yux-800">CTA: {content.cta}</p>}
              </article>
            ))}
            {!organicContents.length && (
              <p className="text-sm text-gray-600">Nenhum conteudo organico cadastrado para este contrato.</p>
            )}
          </div>
        )}
      </section>
    </PortalJourneyPage>
  )
}
