import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { LeadProposalRecommendation } from '@/types/crmClosing'
import type { PackageDefinition } from '@/types/platform'

interface ProposalRecommendationPanelProps {
  recommendations: LeadProposalRecommendation[]
  packages: PackageDefinition[]
}

export function ProposalRecommendationPanel({ recommendations, packages }: ProposalRecommendationPanelProps) {
  const packageById = new Map(packages.map(item => [item.id, item]))

  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Sparkles className="h-4 w-4 text-cyan-700" />
        <h3 className="font-medium text-slate-950">Recomendacoes comerciais</h3>
      </div>
      <div className="space-y-2 p-3">
        {recommendations.slice(0, 3).map(item => (
          <div key={item.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-950">{packageById.get(item.packageId)?.name || item.packageId}</span>
              <Badge variant="secondary">{Math.round(item.score)} pts</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.moduleKeys.map(moduleKey => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
            </div>
          </div>
        ))}
        {recommendations.length === 0 && <p className="text-sm text-slate-500">Nenhuma recomendacao persistida ainda.</p>}
      </div>
    </section>
  )
}
