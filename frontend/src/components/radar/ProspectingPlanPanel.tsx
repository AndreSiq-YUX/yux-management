import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { crmService } from '@/services/crmService'
import { prospectingService, type ProspectingPlan } from '@/services/prospectingService'
import type { CrmSequence } from '@/types/crm'
import type { RadarOpportunity } from '@/types/radar'

type Props = {
  organizationId?: string
  opportunity: RadarOpportunity | null
}

const reasonLabels: Record<string, string> = {
  prospecting_policy_missing: 'Politica de prospeccao ainda nao configurada',
  prospecting_policy_disabled: 'Prospeccao desativada',
  prospecting_kill_switch_active: 'Pausa geral ativada',
  prospecting_legal_review_required: 'Revisao legal pendente',
  prospecting_quiet_hours: 'Fora do horario permitido',
  channel_permission_required: 'Permissao do canal nao registrada',
  whatsapp_connection_required: 'WhatsApp nao conectado',
  prospecting_whatsapp_template_required: 'Primeiro passo precisa usar template aprovado',
}

export function ProspectingPlanPanel({ organizationId, opportunity }: Props) {
  const [sequences, setSequences] = useState<CrmSequence[]>([])
  const [selectedSequenceId, setSelectedSequenceId] = useState('')
  const [plan, setPlan] = useState<ProspectingPlan | null>(null)
  const [policyReady, setPolicyReady] = useState(false)
  const [legalConfirmed, setLegalConfirmed] = useState(false)
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const opportunityId = opportunity?.id

  useEffect(() => {
    if (!organizationId || !opportunityId) return
    Promise.all([
      crmService.getSequences(organizationId),
      prospectingService.getPolicy(organizationId),
      prospectingService.listPlans(organizationId, opportunityId),
    ]).then(([nextSequences, policy, plans]) => {
      const activeSequences = nextSequences.filter(sequence => sequence.isActive && ['email', 'whatsapp'].includes(sequence.steps?.[0]?.actionType || ''))
      setSequences(activeSequences)
      setSelectedSequenceId(current => current || activeSequences[0]?.id || '')
      setPolicyReady(Boolean(policy?.enabled && !policy.killSwitch && policy.legalReviewedAt))
      setPlan(plans[0] || null)
    }).catch(error => console.error('Erro ao carregar plano de prospeccao:', error))
  }, [organizationId, opportunityId])

  if (!opportunity) return null
  if (!opportunity.convertedLeadId) {
    return <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">Aprove a oportunidade e crie o lead para liberar o plano de prospeccao.</p>
  }

  const selectedSequence = sequences.find(sequence => sequence.id === selectedSequenceId)
  const primaryChannel = selectedSequence?.steps?.[0]?.actionType === 'whatsapp' ? 'whatsapp' : 'email'
  const address = primaryChannel === 'whatsapp' ? opportunity.company?.phoneRaw : opportunity.company?.emailRaw

  const activatePolicy = async () => {
    if (!organizationId || !legalConfirmed || loading) return
    try {
      setLoading(true)
      await prospectingService.activatePolicy(organizationId)
      setPolicyReady(true)
      toast.success('Politica de prospeccao ativada')
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel ativar a politica')
    } finally { setLoading(false) }
  }

  const preparePlan = async () => {
    if (!organizationId || !selectedSequence || !address || !permissionConfirmed || loading) return
    try {
      setLoading(true)
      await prospectingService.recordPermission({
        organizationId,
        leadId: opportunity.convertedLeadId,
        channel: primaryChannel,
        address,
      })
      const created = await prospectingService.createPlan({
        organizationId,
        radarOpportunityId: opportunity.id,
        sequenceId: selectedSequence.id,
        primaryChannel,
      })
      setPlan(created)
      toast.success('Plano preparado para aprovacao')
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel preparar o plano')
    } finally { setLoading(false) }
  }

  const approveOrStart = async () => {
    if (!plan || loading) return
    try {
      setLoading(true)
      const next = plan.status === 'draft' || plan.status === 'blocked'
        ? await prospectingService.approvePlan(plan.id)
        : await prospectingService.startPlan(plan.id)
      setPlan(next)
      toast.success(next.status === 'active' ? 'Prospeccao iniciada' : 'Plano aprovado; confirme o inicio')
    } catch (error) {
      console.error(error)
      toast.error('Acao bloqueada pelas regras de prospeccao')
    } finally { setLoading(false) }
  }

  return (
    <section className="rounded-md border bg-white p-4">
      <h2 className="font-semibold text-slate-950">Plano de prospeccao</h2>
      {!policyReady ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">A prospeccao permanece pausada ate a confirmacao das regras internas.</p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={legalConfirmed} onChange={event => setLegalConfirmed(event.target.checked)} />
            Confirmo que limites, horario, base legal e procedimento de opt-out foram revisados para esta operacao.
          </label>
          <Button type="button" disabled={!legalConfirmed || loading} onClick={activatePolicy}>Ativar com limites seguros</Button>
        </div>
      ) : plan?.status === 'active' ? (
        <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Prospeccao ativa e acompanhada pela trilha do Radar.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-sm text-slate-700">
            Sequencia aprovada
            <select className="mt-1 w-full rounded-md border px-3 py-2" value={selectedSequenceId} onChange={event => setSelectedSequenceId(event.target.value)} disabled={Boolean(plan)}>
              {sequences.map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
            </select>
          </label>
          {!plan && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={permissionConfirmed} onChange={event => setPermissionConfirmed(event.target.checked)} />
              Confirmo que existe evidencia de permissao para contato por {primaryChannel === 'whatsapp' ? 'WhatsApp' : 'e-mail'} em {address || 'endereco nao informado'}.
            </label>
          )}
          {plan?.blockedReasons.length ? <p className="text-sm text-amber-700">{plan.blockedReasons.map(reason => reasonLabels[reason] || reason).join('; ')}</p> : null}
          {!plan ? (
            <Button type="button" disabled={!selectedSequence || !address || !permissionConfirmed || loading} onClick={preparePlan}>Preparar plano</Button>
          ) : (
            <Button type="button" disabled={loading} onClick={approveOrStart}>{plan.status === 'approved' ? 'Iniciar prospeccao' : 'Aprovar plano'}</Button>
          )}
        </div>
      )}
    </section>
  )
}
