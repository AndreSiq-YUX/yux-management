import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, ApiClientError } from '@/lib/apiClient'
import { usePlatformStore } from '@/stores/platformStore'

type Recommendation = { id: string; rationale: string; packageId: string; catalogVersion: string; createdAt: string }

export function StrategyRecommendationImport({ organizationId, leadId }: { organizationId: string; leadId: string }) {
  const packages = usePlatformStore(state => state.packages)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [pendingId, setPendingId] = useState('')
  const [draftId, setDraftId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<Recommendation[]>(`/proposals/strategy-recommendations/${leadId}?organizationId=${organizationId}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setRecommendations(data) })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível consultar as recomendações do estrategista.') })
    return () => controller.abort()
  }, [organizationId, leadId])

  async function approve(recommendation: Recommendation) {
    setPendingId(recommendation.id)
    setError('')
    try {
      const draft = await apiRequest<{ id: string }>(`/proposals/strategy-recommendations/${recommendation.id}/import`, {
        method: 'POST',
        body: { organizationId, leadId, expectedCatalogVersion: recommendation.catalogVersion },
      })
      setDraftId(draft.id)
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 409
        ? 'O catálogo ou o escopo mudou. Revise a oportunidade no estrategista antes de importar.'
        : 'Não foi possível criar o rascunho da proposta.')
    } finally {
      setPendingId('')
    }
  }

  if (!recommendations.length && !error) return null
  return (
    <section className="space-y-3 rounded-md border p-3 text-sm">
      <h3 className="font-semibold">Recomendações do estrategista</h3>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {draftId && <Link to={`/proposals?proposal=${draftId}`} className="font-medium text-yux-700 underline">Revisar rascunho criado</Link>}
      {recommendations.map(item => (
        <article className="space-y-2 border-t pt-3" key={item.id}>
          <h4 className="font-medium">{packages.find(pack => pack.id === item.packageId)?.name || 'Pacote recomendado'}</h4>
          <p className="whitespace-pre-wrap">{item.rationale}</p>
          <p className="text-xs text-gray-600">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
          <button type="button" disabled={Boolean(pendingId)} onClick={() => approve(item)} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
            {item.id === pendingId ? 'Criando rascunho…' : 'Aprovar recomendação e criar rascunho'}
          </button>
        </article>
      ))}
    </section>
  )
}
