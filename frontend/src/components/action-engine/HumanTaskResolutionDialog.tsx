import { useEffect, useState } from 'react'
import { Loader2, UserCheck, X } from 'lucide-react'
import type { MissionActionRun } from '@/types/actionEngine'

export function HumanTaskResolutionDialog({ action, busy, onCancel, onConfirm }: {
  action: MissionActionRun | null; busy: boolean; onCancel: () => void; onConfirm: (actualMinutes: number, evidence: string) => void
}) {
  const [minutes, setMinutes] = useState('')
  const [evidence, setEvidence] = useState('')
  useEffect(() => { if (action) { setMinutes(''); setEvidence('') } }, [action])
  if (!action) return null
  const parsed = Number(minutes)
  const validMinutes = Number.isInteger(parsed) && parsed > 0 && parsed <= 1440
  const valid = validMinutes && evidence.trim().length > 0
  return <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div role="dialog" aria-modal="true" aria-labelledby="human-task-title" className="w-full max-w-md border border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 id="human-task-title" className="font-semibold text-slate-950">Concluir tarefa humana</h2><p className="mt-1 text-xs text-slate-500">A evidência e o tempo real preservam a rastreabilidade e alimentam o custo da missão.</p></div><button type="button" aria-label="Fechar" onClick={onCancel} disabled={busy} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label htmlFor="human-task-evidence" className="block text-xs font-semibold text-slate-700">Evidência da conclusão<textarea id="human-task-evidence" value={evidence} onChange={event => setEvidence(event.target.value)} rows={3} className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" placeholder="Descreva o resultado, link ou confirmação obtida" /></label><div><label htmlFor="actual-minutes" className="text-xs font-semibold text-slate-700">Minutos efetivamente trabalhados</label><input id="actual-minutes" type="number" min={1} max={1440} step={1} value={minutes} onChange={event => setMinutes(event.target.value)} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" placeholder="Ex.: 25" />{minutes && !validMinutes ? <p className="mt-2 text-xs text-red-600">Informe um número inteiro entre 1 e 1.440 minutos.</p> : null}</div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={onCancel} disabled={busy} className="h-9 border border-slate-300 px-3 text-xs font-semibold text-slate-700">Cancelar</button><button type="button" onClick={() => valid && onConfirm(parsed, evidence.trim())} disabled={!valid || busy} className="inline-flex h-9 items-center gap-2 bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Registrar e concluir</button></div></div></div>
}
