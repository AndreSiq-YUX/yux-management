import { useState } from 'react'
import { AlertTriangle, PauseCircle, ShieldCheck, ShieldOff } from 'lucide-react'
import { MissionOperationalControls } from './MissionOperationalControls'
import type { ActionMission, MissionAutonomyGrant, MissionCapabilityControl, MissionOperationalControls as Controls } from '@/types/actionEngine'

type Props = {
  mission: ActionMission
  controls: Controls
  canWrite: boolean
  busy?: string
  onPause: () => void
  onRequestGrant: () => void
  onApproveGrant: (grant: MissionAutonomyGrant) => void
  onRevokeGrant: (grant: MissionAutonomyGrant, reason: string) => void
  onCapabilityControl: (capability: MissionCapabilityControl, disabled: boolean, reason: string) => void
}

export function AutonomyControlCenter({ mission, controls, canWrite, busy, onPause, onRequestGrant, onApproveGrant, onRevokeGrant, onCapabilityControl }: Props) {
  const [revokeGrant, setRevokeGrant] = useState<MissionAutonomyGrant | null>(null)
  const [reason, setReason] = useState('')
  const activeGrant = controls.autonomy.grants.find(item => item.status === 'active')
  const pendingGrant = controls.autonomy.grants.find(item => item.status === 'pending')
  const latestGrant = activeGrant ?? pendingGrant ?? controls.autonomy.grants[0]
  const canManage = canWrite && controls.canManagePolicy
  const remaining = controls.autonomy.remaining

  return <section className="space-y-5 border border-slate-200 bg-slate-50 p-5" aria-label="Centro de controle de autonomia">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">Operação segura</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Centro de controle de autonomia</h2><p className="mt-1 text-sm text-slate-600">Limites, autorização, saúde e interrupção da missão em um único lugar.</p></div>
      <div className="flex flex-wrap gap-2">
        {canWrite && mission.status === 'active' ? <button disabled={busy === 'pause'} onClick={onPause} className="inline-flex h-9 items-center gap-2 border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:opacity-50"><PauseCircle className="h-4 w-4" />Pausar missão</button> : null}
        {canManage && !activeGrant && !pendingGrant ? <button disabled={busy === 'grant:request'} onClick={onRequestGrant} className="inline-flex h-9 items-center gap-2 bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Solicitar autonomia</button> : null}
      </div>
    </div>

    <Health status={controls.autonomy.health.status} warnings={controls.autonomy.health.warnings} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Orçamento restante" value={remaining ? formatBrl(remaining.costBrl) : 'Sem grant'} />
      <Metric label="Tempo humano restante" value={remaining ? `${formatMinutes(remaining.humanMinutes)}` : 'Sem grant'} />
      <Metric label="Contatos restantes" value={remaining ? String(remaining.externalContacts) : 'Sem grant'} />
      <Metric label="Tempo restante" value={remaining ? formatDuration(remaining.seconds) : 'Sem grant'} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <article className="border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Envelope autorizado</h3><GrantStatus status={latestGrant?.status} /></div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <EnvelopeItem label="Modo" value={mission.autonomyEnvelope.mode} />
          <EnvelopeItem label="Expira em" value={new Date(mission.autonomyEnvelope.expiresAt).toLocaleString('pt-BR')} />
          <EnvelopeItem label="Custo máximo" value={formatBrl(mission.autonomyEnvelope.maxTotalCostBrl)} />
          <EnvelopeItem label="Horas humanas" value={`${mission.autonomyEnvelope.maxHumanHours} h`} />
          <EnvelopeItem label="Contatos externos" value={String(mission.autonomyEnvelope.maxExternalContacts ?? 0)} />
          <EnvelopeItem label="Capacidades" value={`${mission.autonomyEnvelope.allowedCapabilityKeys.length} permitidas`} />
        </dl>
        {latestGrant ? <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Hash exato da autorização</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{latestGrant.envelopeHash}</p></div> : null}
        {canManage && pendingGrant ? <button disabled={busy === `grant:${pendingGrant.id}:approve`} onClick={() => onApproveGrant(pendingGrant)} className="mt-4 inline-flex h-9 items-center gap-2 bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Aprovar este hash</button> : null}
        {canManage && activeGrant ? <button disabled={busy === `grant:${activeGrant.id}:revoke`} onClick={() => { setRevokeGrant(activeGrant); setReason('') }} className="mt-4 inline-flex h-9 items-center gap-2 border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"><ShieldOff className="h-4 w-4" />Revogar autonomia</button> : null}
        {!canManage ? <p className="mt-4 text-xs text-slate-500">Visualização somente leitura. Alterações de política exigem permissão administrativa.</p> : null}
      </article>
      <article className="border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-900">Uso acumulado</h3><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><EnvelopeItem label="Custo consumido" value={formatBrl(controls.autonomy.usage.costBrl)} /><EnvelopeItem label="Tempo humano" value={formatMinutes(controls.autonomy.usage.humanMinutes)} /><EnvelopeItem label="Contatos externos" value={String(controls.autonomy.usage.externalContacts)} /><EnvelopeItem label="Efeitos em reconciliação" value={String(controls.autonomy.usage.unresolvedExternalEffects)} /></dl></article>
    </div>

    {revokeGrant ? <div className="border border-red-200 bg-red-50 p-4"><label className="text-xs font-semibold text-red-900">Motivo da revogação<textarea aria-label="Motivo da revogação" value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-20 w-full border border-red-200 bg-white p-2 text-slate-900" /></label><div className="mt-2 flex gap-2"><button disabled={reason.trim().length < 3} onClick={() => onRevokeGrant(revokeGrant, reason.trim())} className="h-8 bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Confirmar revogação</button><button onClick={() => setRevokeGrant(null)} className="h-8 px-3 text-xs font-semibold text-slate-600">Cancelar</button></div></div> : null}

    <MissionOperationalControls controls={controls} busyCapability={busy?.replace('capability:', '')} onCapabilityControl={onCapabilityControl} />
  </section>
}

function Health({ status, warnings }: { status: Controls['autonomy']['health']['status']; warnings: Controls['autonomy']['health']['warnings'] }) {
  if (status === 'healthy') return <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck className="h-4 w-4" />Executor e provedores sem degradação detectada.</div>
  return <div className={`border p-3 text-sm ${status === 'blocked' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{status === 'blocked' ? 'Autonomia bloqueada' : 'Operação degradada'}</p><ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map(item => <li key={item.code}>{item.message}</li>)}</ul></div>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-900">{value}</p></div> }
function EnvelopeItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd></div> }
function GrantStatus({ status }: { status?: MissionAutonomyGrant['status'] }) { const labels = { pending: 'Aguardando aprovação', active: 'Ativa', revoked: 'Revogada', expired: 'Expirada' }; return <span className="inline-flex rounded-full border bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{status ? labels[status] : 'Não solicitada'}</span> }
function formatBrl(value: string) { return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function formatMinutes(value: string) { const minutes = Math.max(0, Number(value)); return minutes >= 60 ? `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : `${Math.floor(minutes)} min` }
function formatDuration(seconds: number) { if (seconds <= 0) return 'Expirado'; const hours = Math.floor(seconds / 3600); const days = Math.floor(hours / 24); return days > 0 ? `${days} d ${hours % 24} h` : `${hours} h` }
