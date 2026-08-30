import { GitBranch, LockKeyhole, ShieldCheck } from 'lucide-react'
import { MissionStatusBadge } from './MissionStatusBadge'
import { planStatusLabel } from '@/lib/action-engine/missionRules'
import type { MissionPlan } from '@/types/actionEngine'
import { CompositeMissionPlan, isCompositeMissionPlan } from './CompositeMissionPlan'

export function MissionPlanPanel({ plan, technical = false }: { plan: MissionPlan | null; technical?: boolean }) {
  if (!plan) return <Empty title="Plano ainda não gerado" text="Qualifique a missão e peça ao planner para compilar o Revenue Recovery Pack v0." />
  if (isCompositeMissionPlan(plan)) return <CompositeMissionPlan plan={plan} technical={technical} />
  return (
    <section className="border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#2563EB]" /><h2 className="font-semibold text-slate-950">Plano de execução protegido</h2></div><p className="mt-1 text-xs text-slate-500">Revisão {plan.revision} · topologia imutável, parâmetros versionados</p></div><MissionStatusBadge label={planStatusLabel[plan.status] ?? plan.status} tone={plan.status === 'active' || plan.status === 'approved' ? 'success' : plan.status.includes('pending') ? 'warning' : 'neutral'} /></div>
      <div className="overflow-x-auto p-5"><div className="flex min-w-[720px] items-start">{(plan.steps ?? []).map((step, index) => <div key={step.stepKey} className="flex flex-1 items-start"><div className="min-w-28 flex-1 text-center"><span className={`mx-auto grid h-9 w-9 place-items-center rounded-full border-2 ${step.protected ? 'border-blue-600 bg-blue-600 text-white' : 'border-violet-400 bg-violet-50 text-violet-700'}`}>{step.protected ? <LockKeyhole className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}</span><p className="mt-3 text-xs font-semibold text-slate-800">{step.stepKey.replace('pack.', '').split('_').join(' ')}</p>{technical ? <><p className="mt-1 text-[10px] font-mono text-slate-500">{step.capabilityKey}@{step.capabilityVersion}</p><p className="mt-1 text-[10px] text-slate-400">depende de: {step.dependsOn.length ? step.dependsOn.join(', ') : 'início'}</p></> : null}{step.approvalRequired && <span className="mt-2 inline-block text-[10px] font-semibold text-amber-700">aprovação</span>}</div>{index < (plan.steps?.length ?? 0) - 1 && <span className="mt-4 h-px w-8 bg-slate-300" />}</div>)}</div></div>
      {plan.deviations?.length > 0 && <div className="border-t border-slate-200 bg-violet-50/50 px-5 py-3 text-xs text-violet-800">{plan.deviations.length} adaptação(ões) aprovada(s) em extension points.</div>}
    </section>
  )
}

function Empty({ title, text }: { title: string; text: string }) { return <section className="border border-dashed border-slate-300 bg-white p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-500">{text}</p></section> }
