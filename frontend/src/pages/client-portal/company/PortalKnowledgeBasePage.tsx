import { BookOpen } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalKnowledgeBasePage() {
  const {
    loading,
    error,
    knowledgeDocuments,
    knowledgeMatches,
    productsServices,
  } = usePortalMarketingContext()

  const publishedCount = countItems(knowledgeDocuments, document => document.status === 'published')
  const indexedCount = countItems(knowledgeDocuments, document => document.status === 'indexed')
  const activeProducts = productsServices.filter(product => product.status === 'active')

  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Base de Conhecimento"
      description="Fonte compartilhada da empresa para IA, marketing, respostas sugeridas, campanhas, landing pages, FAQ e suporte."
      icon={BookOpen}
      metrics={[
        { label: 'Documentos', value: String(knowledgeDocuments.length), detail: `${publishedCount} publicados e ${indexedCount} indexados.` },
        { label: 'Ofertas', value: String(activeProducts.length), detail: 'Produtos e servicos ativos para contexto comercial.' },
        { label: 'Busca IA', value: String(knowledgeMatches.length), detail: 'Trechos recuperados pela busca semantica.' },
      ]}
      capabilities={[
        'Enviar documentos, cadastrar FAQs, produtos, servicos, politicas, precos e objecoes.',
        'Importar site, ver paginas lidas e revisar conhecimento extraido.',
        'Aprovar conhecimento para Agente IA, respostas sugeridas e Marketing Studio.',
        'Marcar conteudo como publico ou interno e acompanhar lacunas detectadas pela IA.',
      ]}
      secondaryActions={[
        { label: 'Agente IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
      ]}
      note="A regra de produto e evitar bases duplicadas por modulo. Esta pagina representa a fonte unica de conhecimento da empresa."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Documentos recentes</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando base de conhecimento...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {knowledgeDocuments.slice(0, 6).map(document => (
                <div key={document.id} className="rounded-md border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{document.title}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(document.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {statusLabel(document.documentType)} - atualizado em {formatPortalDate(document.updatedAt)}
                  </p>
                  {document.summary && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{document.summary}</p>}
                </div>
              ))}
              {!knowledgeDocuments.length && (
                <p className="text-sm text-gray-600">Nenhum documento de conhecimento cadastrado para este contrato.</p>
              )}
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Alimenta outras areas</h2>
          <div className="mt-4 grid gap-2 text-sm text-gray-700">
            {['Agente IA', 'Marketing Studio', 'Respostas sugeridas', 'Campanhas', 'Landing pages', 'FAQ e suporte'].map(area => (
              <div key={area} className="rounded-md border bg-gray-50 px-3 py-2">{area}</div>
            ))}
          </div>
          {knowledgeMatches.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-900">Trechos encontrados pela IA</h3>
              <div className="mt-3 space-y-2">
                {knowledgeMatches.map(match => (
                  <p key={match.chunkId} className="rounded-md bg-yux-50 p-3 text-xs text-yux-900">
                    {match.title ? `${match.title}: ` : ''}{match.body}
                  </p>
                ))}
              </div>
            </div>
          )}
        </article>
      </section>
    </PortalJourneyPage>
  )
}
