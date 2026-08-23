import { useEffect, useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { actionEngineService } from '@/services/actionEngineService'
import { formatBrl } from '@/lib/action-engine/missionRules'
import type { PublicSimulationReport } from '@/types/actionEngine'

export function MissionSimulationReviewPage() {
  const { token = '' } = useParams()
  const [report, setReport] = useState<PublicSimulationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewerName, setReviewerName] = useState('')
  const [decision, setDecision] = useState<'support' | 'request_changes' | 'reject'>('support')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => { let active = true; actionEngineService.getPublicSimulationReport(token).then(value => { if (active) setReport(value) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Link inválido ou expirado.') }); return () => { active = false } }, [token])
  async function submit() {
    setBusy(true); setError(null)
    try { await actionEngineService.submitSimulationFeedback(token, { reviewerName, decision, comment: comment || undefined }); setSubmitted(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o parecer.') }
    finally { setBusy(false) }
  }
  if (error && !report) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="max-w-md border border-red-200 bg-white p-6 text-center"><h1 className="font-semibold text-slate-950">Relatório indisponível</h1><p className="mt-2 text-sm text-slate-600">{error}</p></div></main>
  if (!report) return <main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></main>
  const snapshot = report.snapshot
  return <main className="min-h-screen bg-slate-100 py-8"><article className="mx-auto max-w-4xl bg-white shadow-sm"><header className="border-t-8 border-blue-600 px-6 py-8 sm:px-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">YUX Missions · Simulação</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{snapshot.missionTitle}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{snapshot.objective}</p><div className="mt-6 border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">Simulação — nenhum efeito executado.</div></header><div className="space-y-8 px-6 pb-10 sm:px-10"><section><h2 className="font-semibold text-slate-950">O que será alterado</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{snapshot.changes.map((change, index) => <div key={`${change.label}:${index}`} className="border border-slate-200 p-4"><p className="text-2xl font-semibold text-blue-700">{change.quantity}</p><p className="mt-1 text-sm text-slate-700">{change.label}</p></div>)}</div></section><section className="grid gap-3 sm:grid-cols-3"><Fact label="Contatos atuais" value={String(snapshot.contactImpact.existingContacts)} /><Fact label="Custo estimado" value={formatBrl(snapshot.economics.estimatedCostBrl)} /><Fact label="Teto máximo" value={formatBrl(snapshot.economics.maximumCostBrl)} /></section>{snapshot.irreversibleEffects.length ? <section className="border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Efeitos irreversíveis previstos</h2><ul className="mt-2 space-y-1 text-sm text-amber-900">{snapshot.irreversibleEffects.map((effect, index) => <li key={index}>• {effect.description}</li>)}</ul></section> : null}<section className="border-t border-slate-200 pt-8"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h2 className="font-semibold text-slate-950">Registrar parecer</h2><p className="mt-1 text-sm text-slate-600">Este parecer não aprova execução. Um usuário autorizado da YUX deverá realizar a aprovação final.</p></div></div>{submitted ? <p className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Parecer registrado. Obrigado.</p> : <div className="mt-5 grid gap-4"><label className="text-sm font-medium text-slate-700">Seu nome<input value={reviewerName} onChange={event => setReviewerName(event.target.value)} className="mt-2 h-10 w-full border border-slate-300 px-3" /></label><label className="text-sm font-medium text-slate-700">Parecer<select value={decision} onChange={event => setDecision(event.target.value as typeof decision)} className="mt-2 h-10 w-full border border-slate-300 px-3"><option value="support">Apoio a proposta</option><option value="request_changes">Solicito mudanças</option><option value="reject">Não apoio</option></select></label><label className="text-sm font-medium text-slate-700">Comentário<textarea value={comment} onChange={event => setComment(event.target.value)} className="mt-2 min-h-24 w-full border border-slate-300 p-3" /></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button type="button" disabled={busy || reviewerName.trim().length < 2} onClick={() => void submit()} className="inline-flex min-h-11 items-center justify-center bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-fit">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Enviar parecer</button></div>}</section><a href={actionEngineService.simulationPdfHref(token)} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><Download className="h-4 w-4" /> Baixar PDF desta revisão</a></div></article></main>
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div> }
