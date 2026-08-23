import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MissionReadiness } from '@/types/actionEngine'

export function MissionReadinessBlockers({ readiness }: { readiness: MissionReadiness }) {
  const visible = readiness.checks.filter(check => check.status !== 'pass')
  if (!visible.length) return <section className="border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Missão pronta para operar</p></section>
  return <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Prontidão operacional</h2><p className="mt-1 text-xs text-slate-500">Corrija bloqueios antes da próxima execução.</p></div><div className="divide-y divide-slate-200">{visible.map(check => <div key={`${check.code}:${check.capabilityKey ?? ''}`} className="flex items-start gap-3 p-4"><AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${check.status === 'block' ? 'text-red-600' : 'text-amber-600'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-900">{check.message}</p>{check.fixHref ? <Link to={check.fixHref} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Corrigir agora <ArrowRight className="h-3 w-3" /></Link> : null}</div></div>)}</div></section>
}
