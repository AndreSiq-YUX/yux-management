import { AlertTriangle, ArrowLeftRight, Check } from 'lucide-react'
import type { MissionArtifactVersion } from '@/types/actionEngine'

export function ArtifactDiff({ proposed, current, stale }: { proposed: MissionArtifactVersion; current?: MissionArtifactVersion; stale: boolean }) {
  const unchanged = !current || proposed.contentHash === current.contentHash
  return (
    <div className={`mt-4 border px-3 py-3 ${stale ? 'border-yx-warn-line bg-yx-warn-soft' : 'border-yx-line bg-yx-surface-2'}`}>
      <div className="flex items-start gap-2">
        {stale ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yx-warn" /> : unchanged ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-yx-ok" /> : <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-yx-blue" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-yx-fg">{stale ? 'A versão em execução difere da revisão' : current ? 'Versão materializada pela missão' : 'Versão proposta, ainda não materializada'}</p>
          <Version label="Proposta" version={proposed} />
          {current ? <Version label="Atual" version={current} /> : null}
        </div>
      </div>
    </div>
  )
}

function Version({ label, version }: { label: string; version: MissionArtifactVersion }) {
  return <p className="mt-1 break-all font-mono text-[10px] leading-4 text-yx-fg-3"><span className="font-sans font-semibold text-yx-fg-2">{label} · {version.status}:</span> {version.contentHash}</p>
}
