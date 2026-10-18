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
  const visibleQuestions = questions.slice(0, 3)
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(
    visibleQuestions.map(question => [question.key, question.defaultValue ?? '']),
  ))
  const complete = visibleQuestions.every(question => {
    const value = answers[question.key]
    return typeof value === 'boolean' || (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number'
  })
  return (
    <section className="border border-yx-warn-line bg-yx-warn-soft p-5">
      <div className="flex items-start gap-3"><HelpCircle className="mt-0.5 h-5 w-5 text-yx-warn" /><div><h2 className="text-base font-semibold text-yx-fg">O agente precisa de uma decisão</h2><p className="mt-1 text-sm leading-6 text-yx-fg-2">As perguntas foram limitadas ao necessário para produzir um plano seguro.</p></div></div>
      <div className="mt-5 grid gap-4">{visibleQuestions.map(question => <label key={question.key} className="space-y-2"><span className="block text-sm font-semibold text-yx-fg">{question.label}</span><span className="block text-xs text-yx-fg-2">{question.whyNeeded}</span>{question.defaultSourceId ? <span className="block text-xs font-medium text-yx-warn">Sugerido a partir do Contexto da Empresa. Você pode alterar.</span> : null}{question.answerType === 'boolean' ? <select className="h-10 w-full border border-yx-warn-line bg-yx-surface px-3 text-sm" value={String(answers[question.key] ?? '')} onChange={event => setAnswers(current => ({ ...current, [question.key]: event.target.value === 'true' }))}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select> : <input className="h-10 w-full border border-yx-warn-line bg-yx-surface px-3 text-sm outline-none focus:border-yx-blue" type={['number','currency'].includes(question.answerType) ? 'number' : question.answerType === 'date' ? 'date' : 'text'} value={String(answers[question.key] ?? '')} onChange={event => setAnswers(current => ({ ...current, [question.key]: event.target.value }))} />}</label>)}</div>
      {context?.sources.length ? <div className="mt-4 border-t border-yx-warn-line pt-4"><p className="text-[10px] font-bold uppercase tracking-wide text-yx-fg-3">Fontes consideradas</p><div className="mt-2 flex flex-wrap gap-2">{context.sources.map(source => <span key={`${source.category}:${source.id}`} className="border border-yx-warn-line bg-yx-surface px-2 py-1 text-xs text-yx-fg-2">{source.title}</span>)}</div></div> : null}
      {canWrite ? <button type="button" disabled={busy || !complete} onClick={() => onSubmit(answers)} className="mt-5 inline-flex h-10 items-center bg-yx-blue px-4 text-sm font-semibold text-white hover:bg-yx-blue-ink disabled:opacity-50">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar respostas</button> : <p className="mt-4 text-sm text-yx-warn">Você pode visualizar as perguntas, mas seu perfil não pode respondê-las.</p>}
    </section>
  )
}
