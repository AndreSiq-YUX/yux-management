import { useState } from 'react'
import { Check, Copy, Download, ExternalLink, FileText, Loader2, Share2, X } from 'lucide-react'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionPlan, SimulationReportShare } from '@/types/actionEngine'

export function MissionSimulationShareDialog({ open, mission, plan, onOpenChange }: {
  open: boolean
  mission: ActionMission
  plan: MissionPlan
  onOpenChange: (open: boolean) => void
}) {
  const [days, setDays] = useState(7)
  const [share, setShare] = useState<SimulationReportShare | null>(null)
  const [busy, setBusy] = useState<'create' | 'revoke'>()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null
  const publicUrl = share ? `${window.location.origin}${share.url}` : ''

  async function create() {
    setBusy('create'); setError(null)
    try { setShare(await actionEngineService.createSimulationReport(mission, plan.id, days)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o relatório.') }
    finally { setBusy(undefined) }
  }
  async function copy() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
  }
  async function revoke() {
    if (!share) return
    setBusy('revoke'); setError(null)
    try { await actionEngineService.revokeSimulationReport(mission.organizationId, share.id); setShare(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível revogar o link.') }
    finally { setBusy(undefined) }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="simulation-share-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Modo shadow</p><h2 id="simulation-share-title" className="mt-1 text-lg font-semibold text-slate-950">Compartilhar relatório de simulação</h2><p className="mt-2 text-sm leading-6 text-slate-600">O relatório é uma fotografia imutável e redigida. Nenhum efeito será executado.</p></div><button type="button" aria-label="Fechar" onClick={() => onOpenChange(false)} className="p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="space-y-5 p-5">{error ? <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{!share ? <><label className="block text-sm font-medium text-slate-800">Validade do link<select value={days} onChange={event => setDays(Number(event.target.value))} className="mt-2 h-10 w-full border border-slate-300 bg-white px-3"><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option></select></label><button type="button" disabled={busy === 'create'} onClick={() => void create()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Gerar link seguro</button></> : <><div className="border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Check className="h-4 w-4" /> Relatório pronto</p><p className="mt-1 text-xs text-emerald-800">Expira em {new Date(share.expiresAt).toLocaleString('pt-BR')}.</p></div><label className="block text-xs font-semibold text-slate-600">Link de revisão<input readOnly value={publicUrl} className="mt-2 h-10 w-full border border-slate-300 bg-slate-50 px-3 text-sm" /></label><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center justify-center gap-2 border border-slate-300 text-sm font-semibold text-slate-700"><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar link'}</button><a href={actionEngineService.simulationPdfHref(share.token)} className="inline-flex min-h-10 items-center justify-center gap-2 border border-slate-300 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" /> Baixar PDF</a><a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 border border-slate-300 text-sm font-semibold text-slate-700"><ExternalLink className="h-4 w-4" /> Abrir revisão</a><button type="button" disabled={busy === 'revoke'} onClick={() => void revoke()} className="inline-flex min-h-10 items-center justify-center gap-2 border border-red-200 text-sm font-semibold text-red-700"><FileText className="h-4 w-4" /> Revogar link</button></div></>}</div></section></div>
}
