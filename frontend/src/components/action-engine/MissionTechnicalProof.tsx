import { ChevronDown, FileCheck2, GitBranch, ShieldCheck } from 'lucide-react'
import { MissionPlanPanel } from './MissionPlanPanel'
import type { MissionDecisionSummary, MissionPlan } from '@/types/actionEngine'

export function MissionTechnicalProof({ summary, plan }: { summary: MissionDecisionSummary; plan: MissionPlan | null }) {
  return (
    <details className="group border border-yx-line bg-yx-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-yx-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue">
        <span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-yx-blue" /> Prova técnica</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-yx-line p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Proof label="Revisão" value={String(summary.technicalProof.planRevision)} />
          <Proof label="Fontes registradas" value={String(summary.technicalProof.sourceCount)} />
          <Proof label="Hash da decisão" value={summary.decisionSubjectHash} mono />
          <Proof label="Hash do plano" value={summary.technicalProof.planHash} mono />
          <Proof label="Hash do manifesto" value={summary.technicalProof.manifestHash} mono />
        </div>
        <div className="border border-yx-line bg-yx-surface-2 p-4 text-xs text-yx-fg-2">
          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-yx-ok" /><p>Claims e permissões serão revalidados no preflight final. A reconciliação ainda não se aplica porque o plano não foi executado.</p></div>
        </div>
        {plan?.capabilityManifest?.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold text-yx-fg"><GitBranch className="h-4 w-4 text-brand-violet-500" /> Manifesto de capabilities</h3><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-yx-surface-2 text-yx-fg-3"><tr><th className="px-3 py-2">Capability</th><th className="px-3 py-2">Efeito</th><th className="px-3 py-2">Recuperação</th></tr></thead><tbody className="divide-y divide-yx-line">{plan.capabilityManifest.map(item => <tr key={`${item.key}@${item.version}`}><td className="px-3 py-2 font-mono">{item.key}@{item.version}</td><td className="px-3 py-2">{item.effect}</td><td className="px-3 py-2">{item.recoveryKind}</td></tr>)}</tbody></table></div></div> : null}
        <MissionPlanPanel plan={plan} technical />
      </div>
    </details>
  )
}

function Proof({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border border-yx-line p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-yx-fg-3">{label}</p><p className={`mt-1 truncate text-xs text-yx-fg-2 ${mono ? 'font-mono' : 'font-semibold'}`} title={value}>{value}</p></div>
}
