import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { MissionConversationMissingContext } from '@/types/actionEngine'
import type { ResolvedCorrectionTarget } from '@/lib/workspace/correctionTargets'

export function MissionInlineCorrectionPanel({ missing, target, busy, onCancel, onSave }: {
  missing: MissionConversationMissingContext
  target: ResolvedCorrectionTarget
  busy: boolean
  onCancel: () => void
  onSave: (message: string) => Promise<void> | void
}) {
  const fields = target.fields.length ? target.fields : [{ key: missing.key, label: 'Informação solicitada' }]
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => setValues({}), [missing.key])
  const complete = fields.every(field => values[field.key]?.trim())
  return (
    <section className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Corrigir informação da missão">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-950">Completar briefing</p><p className="mt-1 text-xs leading-5 text-slate-600">{missing.reason} A resposta será salva somente nesta missão.</p></div>
        <button type="button" aria-label="Fechar correção" className="rounded-full p-1 text-slate-500 hover:bg-white" onClick={onCancel}><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(field => <label className="space-y-1" key={field.key}><span className="text-xs font-semibold text-slate-700">{field.label}</span><input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div>
      <button type="button" disabled={busy || !complete} className="mt-3 inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void onSave(`Atualize somente o briefing desta missão com:\n${fields.map(field => `${field.label}: ${values[field.key].trim()}`).join('\n')}`)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar e revalidar</button>
    </section>
  )
}
