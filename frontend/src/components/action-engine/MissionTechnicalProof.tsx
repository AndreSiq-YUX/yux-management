import { ChevronDown, FileCheck2, GitBranch, ShieldCheck } from 'lucide-react'
import { MissionPlanPanel } from './MissionPlanPanel'
import type { MissionDecisionSummary, MissionPlan } from '@/types/actionEngine'

export function MissionTechnicalProof({ summary, plan }: { summary: MissionDecisionSummary; plan: MissionPlan | null }) {
  return (
    <details className="group border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-blue-600" /> Prova técnica</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-200 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Proof label="Revisão" value={String(summary.technicalProof.planRevision)} />
          <Proof label="Fontes registradas" value={String(summary.technicalProof.sourceCount)} />
          <Proof label="Hash da decisão" value={summary.decisionSubjectHash} mono />
          <Proof label="Hash do plano" value={summary.technicalProof.planHash} mono />
          <Proof label="Hash do manifesto" value={summary.technicalProof.manifestHash} mono />
        </div>
        <div className="border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p>Claims e permissões serão revalidados no preflight final. A reconciliação ainda não se aplica porque o plano não foi executado.</p></div>
        </div>
        {plan?.capabilityManifest?.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><GitBranch className="h-4 w-4 text-violet-600" /> Manifesto de capabilities</h3><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Capability</th><th className="px-3 py-2">Efeito</th><th className="px-3 py-2">Recuperação</th></tr></thead><tbody className="divide-y divide-slate-100">{plan.capabilityManifest.map(item => <tr key={`${item.key}@${item.version}`}><td className="px-3 py-2 font-mono">{item.key}@{item.version}</td><td className="px-3 py-2">{item.effect}</td><td className="px-3 py-2">{item.recoveryKind}</td></tr>)}</tbody></table></div></div> : null}
        <MissionPlanPanel plan={plan} technical />
      </div>
    </details>
  )
}

function Proof({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 truncate text-xs text-slate-700 ${mono ? 'font-mono' : 'font-semibold'}`} title={value}>{value}</p></div>
}
