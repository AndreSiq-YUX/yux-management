import { Bot } from 'lucide-react'
import type { MissionPlan } from '@/types/actionEngine'

type TraceSummary = { profile: string; status: string; cacheHit?: boolean; artifactCount?: number }
export function MissionSpecialistTrace({ plan }: { plan: MissionPlan }) {
  const value = plan.proposedPayload?.specialistTraceSummaries
  const summaries = Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as TraceSummary[] : []
  if (!summaries.length) return null
  return <section aria-label="Especialistas consultados" className="border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-600" /><h2 className="font-semibold text-slate-950">Especialistas consultados</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{summaries.map(item => <div key={item.profile} className="border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-800">{item.profile.split('_').join(' ')}</p><p className="mt-1 text-xs text-slate-500">{item.status}{item.cacheHit ? ' · cache reutilizado' : ''}{typeof item.artifactCount === 'number' ? ` · ${item.artifactCount} artefato(s)` : ''}</p></div>)}</div><p className="mt-3 text-xs text-slate-500">A visualização mostra somente resumos operacionais; prompts internos e conteúdo sensível não são exibidos.</p></section>
}
