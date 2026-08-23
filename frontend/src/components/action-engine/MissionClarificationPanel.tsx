import { useState } from 'react'
import { HelpCircle, Loader2 } from 'lucide-react'
import type { MissionClarificationQuestion, MissionContextPreview } from '@/types/actionEngine'

export function MissionClarificationPanel({ questions, context, canWrite, busy, onSubmit }: {
  questions: MissionClarificationQuestion[]
  context: MissionContextPreview | null
  canWrite: boolean
  busy: boolean
  onSubmit: (answers: Record<string, unknown>) => void
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(
    questions.map(question => [question.key, question.defaultValue ?? '']),
  ))
  const complete = questions.every(question => {
    const value = answers[question.key]
    return typeof value === 'boolean' || (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number'
  })
  return (
    <section className="border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3"><HelpCircle className="mt-0.5 h-5 w-5 text-amber-700" /><div><h2 className="text-base font-semibold text-slate-950">O agente precisa de uma decisão</h2><p className="mt-1 text-sm leading-6 text-slate-700">As perguntas foram limitadas ao necessário para produzir um plano seguro.</p></div></div>
      <div className="mt-5 grid gap-4">{questions.map(question => <label key={question.key} className="space-y-2"><span className="block text-sm font-semibold text-slate-900">{question.label}</span><span className="block text-xs text-slate-600">{question.whyNeeded}</span>{question.answerType === 'boolean' ? <select className="h-10 w-full border border-amber-300 bg-white px-3 text-sm" value={String(answers[question.key] ?? '')} onChange={event => setAnswers(current => ({ ...current, [question.key]: event.target.value === 'true' }))}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select> : <input className="h-10 w-full border border-amber-300 bg-white px-3 text-sm outline-none focus:border-blue-500" type={['number','currency'].includes(question.answerType) ? 'number' : question.answerType === 'date' ? 'date' : 'text'} value={String(answers[question.key] ?? '')} onChange={event => setAnswers(current => ({ ...current, [question.key]: event.target.value }))} />}</label>)}</div>
      {context?.sources.length ? <div className="mt-4 border-t border-amber-200 pt-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Fontes consideradas</p><div className="mt-2 flex flex-wrap gap-2">{context.sources.map(source => <span key={`${source.category}:${source.id}`} className="border border-amber-200 bg-white px-2 py-1 text-xs text-slate-600">{source.title}</span>)}</div></div> : null}
      {canWrite ? <button type="button" disabled={busy || !complete} onClick={() => onSubmit(answers)} className="mt-5 inline-flex h-10 items-center bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar respostas</button> : <p className="mt-4 text-sm text-amber-900">Você pode visualizar as perguntas, mas seu perfil não pode respondê-las.</p>}
    </section>
  )
}
