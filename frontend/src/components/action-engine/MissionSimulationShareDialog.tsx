import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, Copy, Download, ExternalLink, FileText, Loader2, Share2, X } from 'lucide-react'
import { actionEngineService } from '@/services/actionEngineService'
import { useDialogFocusReturn } from '@/components/portal-ui/useDialogFocusReturn'
import type { ActionMission, MissionPlan, SimulationReportShare } from '@/types/actionEngine'

export function MissionSimulationShareDialog({ open, mission, plan, onOpenChange }: {
  open: boolean
  mission: ActionMission
  plan: MissionPlan
  onOpenChange: (open: boolean) => void
}) {
  const focusReturn = useDialogFocusReturn()
  const [days, setDays] = useState(7)
  const [share, setShare] = useState<SimulationReportShare | null>(null)
  const [busy, setBusy] = useState<'create' | 'revoke'>()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50" /><DialogPrimitive.Content {...focusReturn} aria-describedby="simulation-share-description" className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-yx-surface shadow-2xl focus-visible:outline-none"><header className="flex items-start justify-between border-b border-yx-line p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-yx-blue">Modo de simulação</p><DialogPrimitive.Title className="mt-1 text-lg font-semibold text-yx-fg">Compartilhar relatório de simulação</DialogPrimitive.Title><DialogPrimitive.Description id="simulation-share-description" className="mt-2 text-sm leading-6 text-yx-fg-2">O relatório é uma fotografia imutável e redigida. Nenhum efeito será executado.</DialogPrimitive.Description></div><DialogPrimitive.Close aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center text-yx-fg-3 hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"><X aria-hidden="true" className="h-4 w-4" /></DialogPrimitive.Close></header><div className="space-y-5 p-5">{error ? <p role="alert" className="border border-yx-crit-line bg-yx-crit-soft p-3 text-sm text-yx-crit">{error}</p> : null}{!share ? <><label className="block text-sm font-medium text-yx-fg">Validade do link<select value={days} onChange={event => setDays(Number(event.target.value))} className="mt-2 h-10 w-full border border-yx-line-strong bg-yx-surface px-3"><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option></select></label><button type="button" disabled={busy === 'create'} onClick={() => void create()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-yx-blue px-4 text-sm font-semibold text-white hover:bg-yx-blue-ink disabled:opacity-50">{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Gerar link seguro</button></> : <><div className="border border-yx-ok-line bg-yx-ok-soft p-4"><p className="flex items-center gap-2 text-sm font-semibold text-yx-ok"><Check className="h-4 w-4" /> Relatório pronto</p><p className="mt-1 text-xs text-yx-ok">Expira em {new Date(share.expiresAt).toLocaleString('pt-BR')}.</p></div><label className="block text-xs font-semibold text-yx-fg-2">Link de revisão<input readOnly value={publicUrl} className="mt-2 h-10 w-full border border-yx-line-strong bg-yx-surface-2 px-3 text-sm" /></label><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center justify-center gap-2 border border-yx-line-strong text-sm font-semibold text-yx-fg-2"><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar link'}</button><a href={actionEngineService.simulationPdfHref(share.token)} className="inline-flex min-h-10 items-center justify-center gap-2 border border-yx-line-strong text-sm font-semibold text-yx-fg-2"><Download className="h-4 w-4" /> Baixar PDF</a><a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 border border-yx-line-strong text-sm font-semibold text-yx-fg-2"><ExternalLink className="h-4 w-4" /> Abrir revisão</a><button type="button" disabled={busy === 'revoke'} onClick={() => void revoke()} className="inline-flex min-h-10 items-center justify-center gap-2 border border-yx-crit-line text-sm font-semibold text-yx-crit"><FileText className="h-4 w-4" /> Revogar link</button></div></>}</div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
}
