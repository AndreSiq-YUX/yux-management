import { useEffect, useState } from 'react'
import { Loader2, UserCheck, X } from 'lucide-react'
import type { MissionActionRun } from '@/types/actionEngine'

export function HumanTaskResolutionDialog({ action, busy, onCancel, onConfirm }: {
  action: MissionActionRun | null; busy: boolean; onCancel: () => void; onConfirm: (actualMinutes: number) => void
}) {
  const [minutes, setMinutes] = useState('')
  useEffect(() => { if (action) setMinutes('') }, [action])
  if (!action) return null
  const parsed = Number(minutes)
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= 1440
  return <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div role="dialog" aria-modal="true" aria-labelledby="human-task-title" className="w-full max-w-md border border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 id="human-task-title" className="font-semibold text-slate-950">Concluir tarefa humana</h2><p className="mt-1 text-xs text-slate-500">O tempo real alimenta o custo e a margem da missão.</p></div><button type="button" aria-label="Fechar" onClick={onCancel} disabled={busy} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button></div><div className="p-5"><label htmlFor="actual-minutes" className="text-xs font-semibold text-slate-700">Minutos efetivamente trabalhados</label><input id="actual-minutes" type="number" min={1} max={1440} step={1} value={minutes} onChange={event => setMinutes(event.target.value)} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" placeholder="Ex.: 25" />{minutes && !valid ? <p className="mt-2 text-xs text-red-600">Informe um número inteiro entre 1 e 1.440 minutos.</p> : null}</div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={onCancel} disabled={busy} className="h-9 border border-slate-300 px-3 text-xs font-semibold text-slate-700">Cancelar</button><button type="button" onClick={() => valid && onConfirm(parsed)} disabled={!valid || busy} className="inline-flex h-9 items-center gap-2 bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Registrar e concluir</button></div></div></div>
}
