import { ArrowRight, Boxes, Link2, LockKeyhole } from 'lucide-react'
import type { MissionPlan } from '@/types/actionEngine'

type PackManifest = { key: string; semanticVersion: string; contentHash: string; optional?: boolean; order?: number }
type ArtifactBinding = { fromPack: string; artifactKey: string; toPack: string; inputKey: string; schemaVersion: number }

export function CompositeMissionPlan({ plan, technical = false }: { plan: MissionPlan; technical?: boolean }) {
  const packs = readArray<PackManifest>(plan.compiledPayload?.packs)
  const bindings = readArray<ArtifactBinding>(plan.compiledPayload?.artifactBindings)
  if (packs.length < 2) return null
  return <section aria-label="Plano composto" className="border border-yx-line bg-yx-surface">
    <div className="border-b border-yx-line px-5 py-4"><div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-yx-blue" /><h2 className="font-semibold text-yx-fg">Missão composta</h2></div><p className="mt-1 text-xs text-yx-fg-3">Um objetivo, {packs.length} fluxos publicados e dependências explícitas.</p></div>
    <div className="space-y-4 p-5">
      <div className="grid gap-3 lg:grid-cols-2">{packs.sort((a,b)=>(a.order??0)-(b.order??0)).map(pack => {
        const prefix = `${pack.key}.`; const steps = (plan.steps ?? []).filter(step => step.stepKey.startsWith(prefix))
        return <article key={pack.key} className="border border-yx-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-yx-fg">{label(pack.key)}</p><p className="mt-1 text-xs text-yx-fg-3">{pack.semanticVersion}{pack.optional ? ' · opcional' : ' · necessário'}</p></div><LockKeyhole className="h-4 w-4 text-yx-blue" /></div><ol className="mt-4 space-y-2">{steps.map(step => <li key={step.stepKey} className="flex items-center justify-between gap-3 text-xs"><span className="text-yx-fg-2">{label(step.stepKey.slice(prefix.length).replace('pack.',''))}</span>{step.approvalRequired ? <span className="font-semibold text-yx-warn">aprovação</span> : null}</li>)}</ol>{technical ? <p className="mt-4 break-all font-mono text-[10px] text-yx-fg-3">{pack.contentHash}</p> : null}</article>
      })}</div>
      {bindings.length ? <div className="border border-yx-line-strong bg-yx-blue-soft p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-yx-blue"><Link2 className="h-3.5 w-3.5" /> Dependências entre fluxos</div><ul className="mt-3 space-y-2">{bindings.map(binding => <li key={`${binding.fromPack}:${binding.artifactKey}:${binding.toPack}:${binding.inputKey}`} className="flex flex-wrap items-center gap-2 text-xs text-yx-fg-2"><span className="font-semibold">{label(binding.fromPack)}</span><ArrowRight className="h-3.5 w-3.5 text-yx-blue" /><span>{label(binding.artifactKey)} v{binding.schemaVersion}</span><ArrowRight className="h-3.5 w-3.5 text-yx-blue" /><span className="font-semibold">{label(binding.toPack)}</span></li>)}</ul></div> : null}
    </div>
  </section>
}

export function isCompositeMissionPlan(plan: MissionPlan | null): boolean { return readArray(plan?.compiledPayload?.packs).length > 1 }
function readArray<T>(value: unknown): T[] { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as T[] : [] }
function label(value:string){return value.split(/[._]/).filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ')}
