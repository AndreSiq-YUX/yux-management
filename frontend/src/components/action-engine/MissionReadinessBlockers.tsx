import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MissionReadiness } from '@/types/actionEngine'
import { resolveCorrectionTarget } from '@/lib/workspace/correctionTargets'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'

export function MissionReadinessBlockers({ readiness }: { readiness: MissionReadiness }) {
  const portalPath = usePortalWorkspacePath()
  const visible = readiness.checks.filter(check => check.status !== 'pass')
  if (!visible.length) return <section className="border border-yx-ok-line bg-yx-ok-soft p-4"><p className="flex items-center gap-2 text-sm font-semibold text-yx-ok"><CheckCircle2 className="h-4 w-4" /> Missão pronta para operar</p></section>
  return <section className="border border-yx-line bg-yx-surface"><div className="border-b border-yx-line px-5 py-4"><h2 className="font-semibold text-yx-fg">Prontidão operacional</h2><p className="mt-1 text-xs text-yx-fg-3">Corrija bloqueios antes da próxima execução.</p></div><div className="divide-y divide-yx-line">{visible.map(check => { const target = check.correctionTarget ? resolveCorrectionTarget(check.correctionTarget) : null; const path = target?.path ? portalPath(target.path) : null; return <div key={`${check.code}:${check.capabilityKey ?? ''}`} className="flex items-start gap-3 p-4"><AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${check.status === 'block' ? 'text-yx-crit' : 'text-yx-warn'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-yx-fg">{check.message}</p>{path ? <Link to={path} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-yx-blue">Corrigir agora <ArrowRight className="h-3 w-3" /></Link> : null}</div></div> })}</div></section>
}
