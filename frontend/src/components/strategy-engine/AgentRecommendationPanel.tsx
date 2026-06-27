interface AgentRecommendationPanelProps {
  recommendations: Array<Record<string, any>>
}

export function AgentRecommendationPanel({ recommendations }: AgentRecommendationPanelProps) {
  if (recommendations.length === 0) {
    return <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-500">Nenhuma recomendacao estrategica registrada.</div>
  }

  return (
    <div className="space-y-2">
      {recommendations.map(recommendation => (
        <article key={recommendation.id} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{recommendation.objective}</h3>
            <span className="rounded-full bg-yux-50 px-2 py-0.5 text-xs font-semibold text-yux-700">{recommendation.profile_key}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{recommendation.action}</p>
          <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-4">
            <span>Publico: {recommendation.audience}</span>
            <span>Etapa: {recommendation.stage}</span>
            <span>Metrica: {recommendation.metric}</span>
            <span>Status: {recommendation.status}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
